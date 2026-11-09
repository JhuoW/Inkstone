import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import {
  welcomeAnalyses,
  startAnalysisReplay,
  analyzeWithReplay,
} from "./helpers/ai-replay.mjs";

// Captures the AI Writing Assistant for the README from the desktop app, with
// the recorded gemini-3.6-flash analyses replayed locally (see the helper).
const output = path.resolve(
  process.env.INKSTONE_README_IMAGES || "docs/images",
);
const files = { en: "AI-demo-en.png", "zh-CN": "AI-demo-cn.png" };

await fs.mkdir(output, { recursive: true });
for (const [locale, scene] of Object.entries(welcomeAnalyses)) {
  const replay = await startAnalysisReplay(scene.analysis);
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkstone-readme-ai-"),
  );
  const profile = path.join(directory, "profile");
  await fs.mkdir(profile);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale,
      theme: "light",
      firstRunComplete: true,
      defaultAppPrompted: true,
      autoSave: false,
      spellcheck: false,
      aiPanelOpen: true,
      aiPanelHeight: Number(process.env.INKSTONE_README_AI_HEIGHT) || 525,
    }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.INKSTONE_EXECUTABLE
    ? path.resolve(process.env.INKSTONE_EXECUTABLE)
    : undefined;
  let app;
  try {
    app = await electron.launch({
      executablePath,
      args: executablePath ? [] : [process.cwd()],
      env,
      chromiumSandbox: true,
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1675, 1075),
    );
    await page.waitForFunction(
      (title) =>
        window.__inkstone?.editor.getText().startsWith(title) &&
        !__inkstone.editor.view.state.readOnly,
      scene.title,
    );
    if (
      !(await page.evaluate(() =>
        document.body.classList.contains("sidebar-hidden"),
      ))
    )
      await page.evaluate(() => __inkstone.execute("sidebar"));
    await analyzeWithReplay(page, replay.endpoint, scene.analysis);
    await page.evaluate(async () => {
      await document.fonts.ready;
      __inkstone.editor.view.contentDOM.blur();
      __inkstone.editor.view.scrollDOM.scrollTop = 0;
      document.querySelector(".ai-results")?.scrollTo(0, 0);
    });
    await page.mouse.move(0, 0);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, files[locale]) });
    console.log(`Captured AI ${locale} from the desktop app`);
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    await replay.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
