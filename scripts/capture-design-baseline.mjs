/** Real Electron visual/function baseline. Run after npm run build; never writes user documents. */
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const stage = args[args.indexOf("--stage") + 1] || "before";
assert.ok(["before", "after"].includes(stage), "Use --stage before or after");
const root = process.cwd();
const output = path.join(root, "artifacts/ui-redesign", stage);
await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-design-"));
const folder = path.join(temp, "Field notes");
const profile = path.join(temp, "profile");
await fs.mkdir(folder);
await fs.mkdir(profile);
await fs.mkdir(path.join(folder, "Research"));
await fs.mkdir(path.join(folder, "assets"));
const source =
  '# A quieter place to think\r\n\r\nGood tools leave room for the work. Inkstone keeps **your words** at the centre — 从一个想法，到一篇完整的文章。\r\n\r\n## Notes in progress\r\n\r\nA useful equation, $\\frac{x^2}{2} + y$, belongs in the sentence. Every symbol can be edited in place.\r\n\r\n- [x] Keep the original Markdown intact\r\n- [x] Make everyday commands easy to find\r\n- [ ] Leave space for the next idea\r\n\r\n> Clarity comes from deciding what deserves attention.\r\n\r\n## Working with structure\r\n\r\n| Material | Purpose | Status |\r\n| :--- | :--- | :---: |\r\n| Notes 中文 | Capture an idea | Draft |\r\n| References | Keep the source | Ready |\r\n\r\n```javascript\r\nconst draft = { title: "A quieter place", local: true };\r\nawait notebook.save(draft);\r\n```\r\n\r\n## Thinking in systems\r\n\r\n$$\r\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\r\n$$\r\n\r\n```mermaid\r\nflowchart LR\r\nA[Capture] --> B[Arrange]\r\nB --> C[Write]\r\n```\r\n\r\n![Local sketch](assets/sketch.svg)\r\n\r\n## Next steps\r\n\r\nKeep writing. The file stays yours.\r\n';
const file = path.join(folder, "A quieter place.md");
await fs.writeFile(file, source);
await fs.writeFile(
  path.join(folder, "Reading list.md"),
  "# Reading list\n\nA few references to return to.\n",
);
await fs.writeFile(
  path.join(folder, "Research", "Writing rituals.md"),
  "# Writing rituals\n",
);
await fs.writeFile(
  path.join(folder, "assets", "sketch.svg"),
  '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80" viewBox="0 0 420 80"><rect x="1" y="1" width="418" height="78" rx="2" fill="#f4f0e6" stroke="#76717d"/><path d="M30 54L110 28L210 51L300 23L388 38" fill="none" stroke="#1c1a21" stroke-width="2"/><text x="28" y="20" font-family="sans-serif" font-size="11" fill="#76717d">LOCAL FIELD SKETCH</text></svg>',
);
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({
    locale: "en",
    firstRunComplete: true,
    theme: "light",
    autoSave: false,
    spellcheck: false,
  }),
);
await fs.writeFile(
  path.join(profile, "session.json"),
  JSON.stringify({ folder, path: file, mode: "live" }),
);
const env = {
  ...process.env,
  DISPLAY: process.env.DISPLAY || ":91",
  INKSTONE_USER_DATA: profile,
};
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [],
  screenshots = [],
  screenshotGeometry = [];
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const snapshotRoot =
  stage === "before" &&
  (await fs.stat(".tools/design-baseline-0.3").catch(() => null))
    ? ".tools/design-baseline-0.3"
    : ".";
const manifest = JSON.parse(
  await fs.readFile(path.join(snapshotRoot, "package.json"), "utf8"),
);
const appSource = await fs.readFile(
  path.join(snapshotRoot, "src/app.js"),
  "utf8",
);
const executeCommands = [
  ...new Set([...appSource.matchAll(/case "([^"]+)"\s*:/g)].map((m) => m[1])),
].sort();
const editorSource = await fs.readFile(
  path.join(snapshotRoot, "src/editor.js"),
  "utf8",
);
const editorCommands = [
  ...new Set(
    [...editorSource.matchAll(/case "([^"]+)"\s*:/g)].map((m) => m[1]),
  ),
].sort();
const nativeKeys = (items) =>
  items
    .flatMap((item) =>
      item.children?.length
        ? nativeKeys(item.children)
        : item.id
          ? ["id:" + item.id]
          : item.role
            ? ["role:" + item.role]
            : [],
    )
    .sort();
const paletteSource = appSource.slice(
  appSource.indexOf("function commandList()"),
  appSource.indexOf("async function historyDialog"),
);
const paletteCommands = [
  ...paletteSource.matchAll(
    /\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g,
  ),
].map(([, id, zh, en]) => ({ id, zh, en }));
for (let i = 1; i <= 6; i++)
  paletteCommands.push({
    id: "heading" + i,
    zh: "标题 " + i,
    en: "Heading " + i,
  });
const baseline =
  stage === "after"
    ? JSON.parse(
        await fs.readFile(
          path.join(root, "artifacts/ui-redesign/before/inventory.json"),
          "utf8",
        ),
      )
    : null;
const screenshot = async (page, name) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  // CDP screenshots can crop Electron zoomed pages to CSS-pixel bounds.
  // capturePage records the entire native webContents at its actual pixel size.
  const windowHandle = await app.browserWindow(page);
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    devicePixelRatio,
    sidebarWidth: document.querySelector("#sidebar").getBoundingClientRect()
      .width,
  }));
  const zoomFactor = await windowHandle.evaluate((window) =>
    window.webContents.getZoomFactor(),
  );
  if (name.includes("zoom150")) {
    assert.ok(Math.abs(zoomFactor - 1.5) < 0.01);
    assert.ok(geometry.width >= 852 && geometry.width <= 854);
  }
  screenshotGeometry.push({ name, ...geometry, zoomFactor });
  const png = await windowHandle.evaluate(async (window) =>
    (await window.webContents.capturePage()).toPNG().toString("base64"),
  );
  await fs.writeFile(
    path.join(output, name + ".png"),
    Buffer.from(png, "base64"),
  );
  screenshots.push(name + ".png");
};
const closeDialog = async (page) => {
  if (await page.locator("dialog[open]").count())
    await page.locator("dialog[open] .close").last().click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
};
try {
  const executablePath = process.env.INKSTONE_EXECUTABLE;
  app = await electron.launch({
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? [file] : [root, file],
    env,
    timeout: 30000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForFunction(
    () =>
      window.__inkstone?.getDocument().path?.endsWith("A quieter place.md") &&
      !__inkstone.editor.view.state.readOnly,
  );
  const bw = await app.browserWindow(page);
  await bw.evaluate((w) => w.setContentSize(1280, 900));
  const nativeMenu = await app.evaluate(({ Menu }) => {
    const walk = (items) =>
      items.map((i) => ({
        id: i.id,
        label: i.label,
        role: i.role || null,
        type: i.type,
        accelerator: i.accelerator || null,
        enabled: i.enabled,
        children: i.submenu ? walk(i.submenu.items) : [],
      }));
    return walk(Menu.getApplicationMenu()?.items || []);
  });
  const toolbarCommands = await page
    .locator("#app [data-command]")
    .evaluateAll((nodes) =>
      [...new Set(nodes.map((n) => n.dataset.command))].sort(),
    );
  const initial = await page.evaluate(() => ({
    text: __inkstone.editor.getText(),
    selection: __inkstone.editor.getSelection(),
    dirty: __inkstone.getDocument().dirty,
  }));
  assert.equal(initial.text, source);
  assert.equal(initial.dirty, false);
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.toString().indexOf("Good tools"),
    });
    e.view.dispatch({
      effects: e.view.constructor.scrollIntoView(0, { y: "start" }),
    });
    e.view.scrollDOM.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await screenshot(page, "writing-light-1280");
  await page.locator('[data-tab="outline"]').click();
  await screenshot(page, "outline-light-1280");
  await page.locator('[data-tab="files"]').click();
  await page.evaluate(() => __inkstone.execute("settings"));
  const preferences = await page
    .locator("dialog input[name], dialog select[name], dialog textarea[name]")
    .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.name))].sort());
  await screenshot(page, "preferences-light-1280");
  await closeDialog(page);
  await page.evaluate(() => __inkstone.execute("export"));
  await page.locator('dialog select[name="format"]').selectOption("pdf");
  const exportControls = await page
    .locator("dialog input[name], dialog select[name], dialog textarea[name]")
    .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.name))].sort());
  const exportFormats = await page
    .locator('dialog select[name="format"] option')
    .evaluateAll((nodes) =>
      nodes.map((n) => ({ id: n.value, label: n.textContent })),
    );
  await screenshot(page, "export-light-1280");
  await closeDialog(page);
  await page.evaluate(() => __inkstone.execute("commands"));
  await screenshot(page, "commands-light-1280");
  const snippetCommands =
    baseline?.snippetCommands ||
    Object.keys(
      (await page.evaluate(() => __inkstone.invoke("bootstrap"))).settings
        .snippets || {},
    ).map((name) => ({
      id: "snippet:" + name,
      en: "Insert snippet: " + name,
      zh: "插入片段：" + name,
    }));
  const commandQueries = [];
  for (const item of [
    ...(baseline?.paletteCommands || paletteCommands),
    ...snippetCommands,
  ]) {
    await page.locator(".palette-input").fill(item.id);
    const labels = await page
      .locator(".palette-results button")
      .allTextContents();
    assert.ok(labels.length > 0, "Command inaccessible: " + item.id);
    commandQueries.push({ id: item.id, results: labels });
  }
  await closeDialog(page);
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.toString().indexOf("Good tools"),
    });
    e.view.dispatch({
      effects: e.view.constructor.scrollIntoView(0, { y: "start" }),
    });
    e.view.scrollDOM.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.locator(".cm-live-block .math-inline").first().click();
  await screenshot(page, "math-edit-light-1280");
  await page.keyboard.press("Control+Enter");
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({ anchor: 0, head: 10 });
  });
  const selectionBefore = await page.evaluate(() =>
    __inkstone.editor.getSelection(),
  );
  await page.evaluate(() => __inkstone.execute("source"));
  await screenshot(page, "source-light-1280");
  await page.evaluate(() => __inkstone.execute("source"));
  assert.deepEqual(
    await page.evaluate(() => __inkstone.editor.getSelection()),
    selectionBefore,
  );
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.toString().indexOf("## Thinking"),
    });
    e.view.dispatch({ scrollIntoView: true });
  });
  await page
    .locator(".diagram svg")
    .waitFor({ state: "attached", timeout: 30000 });
  await screenshot(page, "structures-light-1280");
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { theme: "dark" }),
  );
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.toString().indexOf("Good tools"),
    });
    e.view.dispatch({
      effects: e.view.constructor.scrollIntoView(0, { y: "start" }),
    });
    e.view.scrollDOM.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await screenshot(page, "writing-dark-1280");
  await page.evaluate(() => __inkstone.execute("settings"));
  await screenshot(page, "preferences-dark-1280");
  await closeDialog(page);
  await bw.evaluate((w) => w.setContentSize(800, 800));
  await screenshot(page, "writing-dark-800");
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { theme: "light" }),
  );
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await screenshot(page, "writing-light-800");
  await page.evaluate(() => __inkstone.execute("settings"));
  await screenshot(page, "preferences-light-800");
  await closeDialog(page);
  await bw.evaluate((w) => w.setContentSize(1280, 900));
  await page.evaluate(async () => {
    await __inkstone.execute("zoomReset");
    for (let i = 0; i < 5; i++) await __inkstone.execute("zoomIn");
  });
  await page.waitForFunction(
    () => innerWidth >= 852 && innerWidth <= 854 && devicePixelRatio >= 1.49,
  );
  // Layout may finish before the compositor has painted the new zoom scale.
  await page.evaluate(() => {
    document.querySelector(".cm-scroller").scrollTop = 0;
  });
  await bw.evaluate((w) => w.webContents.invalidate());
  await page.waitForTimeout(250);
  await screenshot(page, "writing-light-zoom150");
  await page.evaluate(() => __inkstone.execute("zoomReset"));
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { locale: "zh-CN" }),
  );
  await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
  await screenshot(page, "writing-zh-1280");
  const current = await page.evaluate(() => ({
    text: __inkstone.editor.getText(),
    dirty: __inkstone.getDocument().dirty,
  }));
  assert.equal(current.text, source);
  assert.equal(current.dirty, false);
  await page.evaluate(() => __inkstone.execute("save"));
  assert.equal(await fs.readFile(file, "utf8"), source);
  const inventory = {
    version: manifest.version,
    stage,
    generatedAt: new Date().toISOString(),
    host: process.platform,
    normalSandbox: !app.process().spawnargs.includes("--no-sandbox"),
    desktopIPC: "real Electron",
    display: env.DISPLAY,
    zoomScope:
      "150% Electron UI zoom; not physical Windows DPI or a Windows runtime test",
    sourceSHA256: digest(source),
    sourceBytes: Buffer.byteLength(source),
    sourcePreserved: true,
    modeSelectionPreserved: true,
    executeCommands,
    editorCommands,
    snippetCommands,
    nativeActionKeys: nativeKeys(nativeMenu),
    paletteCommands: baseline?.paletteCommands || paletteCommands,
    commandQueries,
    nativeMenu,
    toolbarCommands,
    preferences,
    exportControls,
    exportFormats,
    screenshots,
    screenshotGeometry,
    browserErrors: errors,
    sourceHashes: {},
  };
  for (const name of [
    "src/app.js",
    "src/styles.css",
    "src/editor.css",
    "src/editor.js",
    "src/preferences.js",
    "src/export.js",
    "src/ui.js",
    "electron/main.cjs",
    "dist/index.html",
  ])
    inventory.sourceHashes[name] = digest(
      await fs.readFile(
        name.startsWith("dist/") ? name : path.join(snapshotRoot, name),
      ),
    );
  if (baseline) {
    const missing = (a, b) => a.filter((v) => !b.includes(v));
    inventory.preservation = {
      missingExecuteCommands: missing(
        baseline.executeCommands,
        executeCommands,
      ),
      missingEditorCommands: missing(
        baseline.editorCommands || [],
        editorCommands,
      ),
      missingNativeActions: missing(
        baseline.nativeActionKeys || [],
        nativeKeys(nativeMenu),
      ),
      missingPreferences: missing(baseline.preferences, preferences),
      missingExportControls: missing(baseline.exportControls, exportControls),
      missingExportFormats: missing(
        baseline.exportFormats.map((x) => x.id),
        exportFormats.map((x) => x.id),
      ),
    };
    for (const [k, v] of Object.entries(inventory.preservation))
      assert.equal(v.length, 0, k + ": " + v.join(", "));
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, "inventory.json"),
    JSON.stringify(inventory, null, 2) + "\n",
  );
  await fs.writeFile(path.join(output, "fixture.md"), source);
  console.log(
    JSON.stringify(
      {
        stage,
        screenshots: screenshots.length,
        paletteCommands: inventory.paletteCommands.length,
        executeCommands: executeCommands.length,
        preferences: preferences.length,
        exportFormats: exportFormats.length,
        sourcePreserved: true,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
}
