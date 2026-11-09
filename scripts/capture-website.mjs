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

// Captures the website's product screenshots from the desktop app. Run
// `npm run build` first. Writes, for each language:
// - app-writing-<lang>-1280.png: the showcase window at 1280 × 900;
// - ai-review-<lang>@2x.png and ai-revision-<lang>@2x.png: the AI panel at 2×.
// Prints the showcase pin positions used by website/index.html and zh.html.
const output = path.resolve(
  process.env.INKSTONE_WEBSITE_IMAGES || "website/assets/screenshots",
);
const showcase = [
  "# A quieter place to think",
  "",
  "Good tools leave room for the work. Inkstone keeps **your words** at the centre — 从一个想法，到一篇完整的文章。",
  "",
  "## Notes in progress",
  "",
  "A useful equation, $\\frac{x^2}{2} + y$, belongs in the sentence. Every symbol can be edited in place.",
  "",
  "- [x] Keep the original Markdown intact",
  "- [x] Make everyday commands easy to find",
  "- [ ] Leave space for the next idea",
  "",
  "> Clarity comes from deciding what deserves attention.",
  "",
  "## Working with structure",
  "",
  "| Material | Purpose | Status |",
  "| --- | --- | :---: |",
  "| Notes 中文 | Capture an idea | Draft |",
  "| References | Keep the source | Ready |",
  "",
].join("\r\n");
const languages = { en: "en", "zh-CN": "zh" };

// prepare(directory) writes any files and returns the app arguments.
async function launch(locale, settings, prepare) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-site-"));
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
      ...settings,
    }),
  );
  const args = await prepare(directory);
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.INKSTONE_EXECUTABLE
    ? path.resolve(process.env.INKSTONE_EXECUTABLE)
    : undefined;
  const app = await electron.launch({
    executablePath,
    args: executablePath ? args : [process.cwd(), ...args],
    env,
    chromiumSandbox: true,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return {
    app,
    page,
    errors,
    async close() {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}
const settle = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });

async function captureShowcase(locale) {
  const session = await launch(locale, {}, async (directory) => {
    const workspace = path.join(directory, "Field notes");
    const file = path.join(workspace, "A quieter place.md");
    await fs.mkdir(path.join(workspace, "Research"), { recursive: true });
    await fs.mkdir(path.join(workspace, "assets"));
    await fs.writeFile(file, showcase);
    await fs.writeFile(
      path.join(workspace, "Research", "Writing rituals.md"),
      "# Writing rituals\r\n",
    );
    await fs.writeFile(
      path.join(workspace, "Reading list.md"),
      "# Reading list\r\n",
    );
    return [workspace, file];
  });
  const { app, page, errors } = session;
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1296, 965),
    );
    await page.waitForFunction(
      () =>
        window.__inkstone?.getDocument().path?.endsWith("A quieter place.md") &&
        !__inkstone.editor.view.state.readOnly,
    );
    await page
      .locator(".file-item", { hasText: "Writing rituals.md" })
      .waitFor();
    await page.locator(".katex").first().waitFor();
    await page.evaluate(() => {
      const editor = __inkstone.editor;
      editor.setSelection({
        anchor: editor.view.state.doc.toString().indexOf("Good tools"),
      });
      editor.view.contentDOM.blur();
      editor.view.scrollDOM.scrollTop = 0;
    });
    await page.mouse.move(0, 0);
    await settle(page);
    assert.deepEqual(
      await page.evaluate(() => [innerWidth, innerHeight]),
      [1280, 900],
    );
    // Pins sit in the gutter beside each item, centred on its first line.
    const pins = await page.evaluate(() => {
      const size = 24;
      const firstLine = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].find((rect) => rect.width > 0);
      };
      const line = (text) =>
        [...document.querySelectorAll(".cm-content > *")].find((element) =>
          element.textContent.includes(text),
        );
      const text = firstLine(line("Good tools"));
      const gutter = text.left - 41;
      const beside = (rect, x = gutter) => ({
        left: x,
        top: rect.top + (rect.height - size) / 2,
      });
      const file = document
        .querySelector(".file-item.current")
        .getBoundingClientRect();
      const launcher = document
        .querySelector(".ai-launcher")
        .getBoundingClientRect();
      const table = document
        .querySelector(".cm-content table tr")
        .getBoundingClientRect();
      const percent = ({ left, top }) => ({
        left: +((left / innerWidth) * 100).toFixed(5),
        top: +((top / innerHeight) * 100).toFixed(5),
      });
      return [
        beside(file, file.right - 34),
        beside(firstLine(line("A quieter place to think"))),
        beside(firstLine(line("A useful equation"))),
        beside(table),
        beside(launcher, launcher.left - size - 10),
      ].map(percent);
    });
    assert.deepEqual(errors, []);
    const name = `app-writing-${languages[locale]}-1280.png`;
    await page.screenshot({ path: path.join(output, name) });
    console.log(`Captured ${name}; pins ${JSON.stringify(pins)}`);
  } finally {
    await session.close();
  }
}

async function captureAI(locale) {
  const scene = welcomeAnalyses[locale];
  const replay = await startAnalysisReplay(scene.analysis);
  const session = await launch(
    locale,
    { aiPanelOpen: true, aiPanelHeight: 640 },
    async () => [],
  );
  const { app, page, errors } = session;
  try {
    // 1076 × 935 leaves the sidebar beside an 820-pixel AI panel.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1092, 1000),
    );
    await page.waitForFunction(
      (title) =>
        window.__inkstone?.editor.getText().startsWith(title) &&
        !__inkstone.editor.view.state.readOnly,
      scene.title,
    );
    await analyzeWithReplay(page, replay.endpoint, scene.analysis);
    await page.evaluate(() => {
      __inkstone.editor.view.contentDOM.blur();
      document.querySelector(".ai-results")?.scrollTo(0, 0);
    });
    await page.mouse.move(0, 0);
    // Render at twice the pixel density without resizing the window.
    const { width, height } = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await settle(page);
    const regions = await page.evaluate(() => {
      const box = (selector) =>
        document.querySelector(selector).getBoundingClientRect();
      const panel = box("#ai-assistant-host");
      const region = (top, bottom) => ({
        x: panel.left,
        y: top,
        width: panel.width,
        height: bottom - top,
      });
      return {
        review: region(panel.top, box(".ai-dimensions").bottom + 14),
        revision: region(
          box(".ai-suggestions-toolbar").top - 6,
          box(".ai-suggestion").bottom + 14,
        ),
      };
    });
    assert.ok(regions.revision.y + regions.revision.height <= height);
    assert.deepEqual(errors, []);
    for (const [kind, clip] of Object.entries(regions)) {
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
        clip: { ...clip, scale: 1 },
      });
      const name = `ai-${kind}-${languages[locale]}@2x.png`;
      await fs.writeFile(path.join(output, name), Buffer.from(data, "base64"));
      console.log(
        `Captured ${name} (${Math.round(clip.width)} × ${Math.round(clip.height)} CSS px)`,
      );
    }
  } finally {
    await session.close();
    await replay.close();
  }
}

await fs.mkdir(output, { recursive: true });
for (const locale of Object.keys(languages)) {
  await captureShowcase(locale);
  await captureAI(locale);
}
