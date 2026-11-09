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

// Captures the app window for the promo cards in artifacts/promo: the welcome
// document with the AI Writing Assistant showing a score and a suggestion,
// rendered at 2× (run `npm run build` first). The cards scale it to 0.75 and
// show about the top 720 pixels, so the panel (as tall as the app allows) must
// fit the score and the whole suggestion above that line; the chat box and
// status bar fall below it. The sidebar is hidden to give the panel the width.
const output = path.resolve(
  process.env.INKSTONE_PROMO_IMAGES || "artifacts/promo/assets",
);
const width = 968;
const height = 820;
const visibleHeight = 720;
const panelHeight = 1200;
const languages = { en: "en", "zh-CN": "zh" };

await fs.mkdir(output, { recursive: true });
for (const [locale, scene] of Object.entries(welcomeAnalyses)) {
  const replay = await startAnalysisReplay(scene.analysis);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-promo-"));
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
      aiPanelHeight: panelHeight,
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
    await app.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setContentSize(
          size.width,
          size.height,
        ),
      { width, height },
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
    await page.evaluate(() => {
      const view = __inkstone.editor.view;
      view.contentDOM.blur();
      // Bring the document title to the top of the short editor area.
      const title = view.contentDOM.firstElementChild.getBoundingClientRect();
      view.scrollDOM.scrollTop +=
        title.top - view.scrollDOM.getBoundingClientRect().top - 14;
      document.querySelector(".ai-results")?.scrollTo(0, 0);
    });
    await page.mouse.move(0, 0);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    const layout = await page.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      title: document.title,
      sidebarHidden: document.body.classList.contains("sidebar-hidden"),
      suggestionBottom: Math.round(
        document.querySelector(".ai-suggestion").getBoundingClientRect().bottom,
      ),
      resultsBottom: Math.round(
        document.querySelector(".ai-results").getBoundingClientRect().bottom,
      ),
    }));
    assert.deepEqual(layout.viewport, [width, height]);
    assert.ok(
      layout.suggestionBottom <= visibleHeight &&
        layout.resultsBottom >= layout.suggestionBottom,
      `the suggestion must fit above ${visibleHeight}px without scrolling: ${JSON.stringify(layout)}`,
    );
    assert.deepEqual(errors, []);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    const name = `app-ai-${languages[locale]}@2x.png`;
    await fs.writeFile(path.join(output, name), Buffer.from(data, "base64"));
    console.log(`Captured ${name} ${JSON.stringify(layout)}`);
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    await replay.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
