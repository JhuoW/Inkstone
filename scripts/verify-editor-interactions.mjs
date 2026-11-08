import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { artifactPath } from "./artifact-path.mjs";

const root = process.cwd();
const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "inkstone-interactive-中文-"),
);
const profile = path.join(temp, "profile");
await fs.mkdir(profile);
await fs.writeFile(
  path.join(profile, "settings.json"),
  JSON.stringify({
    locale: "en",
    firstRunComplete: true,
    defaultAppPrompted: true,
    autoSave: false,
    spellcheck: false,
  }),
);
const file = path.join(temp, "交互 文稿.md");
const original =
  "\uFEFF# Native 0.6 interaction\r\n\r\n| Left | Right |\r\n| --- | --- |\r\n| one | two |\r\n\r\nInline target: ";
await fs.writeFile(file, original);
const variant = process.env.INKSTONE_NATIVE_VARIANT || "development";
if (!/^[a-z0-9-]+$/i.test(variant))
  throw Error("Invalid native evidence variant.");
const output = artifactPath("interactive-native", variant);
await fs.mkdir(output, { recursive: true });
const env = { ...process.env, INKSTONE_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.INKSTONE_EXECUTABLE
  ? path.resolve(process.env.INKSTONE_EXECUTABLE)
  : undefined;
const errors = [];
let app,
  page,
  clipboardCaptured = false;
async function restoreClipboard() {
  if (!app || !clipboardCaptured) return;
  await page
    ?.evaluate(() => __inkstone.invoke("readClipboard"))
    .catch(() => {});
  await app.evaluate(async ({ clipboard }) => {
    await clipboard.write(global.__interactiveClipboardSnapshot);
    delete global.__interactiveClipboardSnapshot;
  });
  clipboardCaptured = false;
}
try {
  app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? [file] : [root, file],
    env,
    chromiumSandbox: true,
  });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(
    (file) =>
      window.__inkstone?.getDocument().path === file &&
      !__inkstone.editor.view.state.readOnly,
    file,
  );
  await page.evaluate(() => {
    const editor = __inkstone.editor;
    editor.setSelection({ anchor: editor.view.state.doc.length });
    editor.focus();
  });
  await page.keyboard.type("$a = b+c$");
  await page.waitForFunction(
    () => document.querySelectorAll(".cm-inline-math .katex").length === 1,
  );
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator(".cm-math-source").count(), 0);
  assert.equal(await page.locator(".cm-inline-math-preview").count(), 0);
  await page.screenshot({ path: path.join(output, "inline-closed.png") });
  const point = await page
    .locator(".cm-inline-math .katex-html")
    .evaluate((element) => {
      const symbol = [...element.querySelectorAll("span")].find(
        (node) => !node.children.length && node.textContent === "b",
      );
      if (!symbol) throw Error("Formula symbol was not rendered.");
      const box = symbol.getBoundingClientRect();
      return { x: box.left + box.width * 0.2, y: (box.top + box.bottom) / 2 };
    });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => !!document.querySelector(".cm-math-source"));
  const clicked = await page.evaluate(() => ({
    head: __inkstone.editor.view.state.selection.main.head,
    expected: __inkstone.editor.view.state.doc.toString().lastIndexOf("b+c"),
  }));
  assert.equal(clicked.head, clicked.expected);
  await page.keyboard.type("q");
  assert.ok(
    (await page.evaluate(() => __inkstone.editor.getText())).includes(
      "$a = qb+c$",
    ),
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    original.slice(1) + "$a = b+c$",
  );
  await page.keyboard.press("Control+Enter");
  assert.equal(await page.locator(".cm-math-source").count(), 0);
  await page.locator(".cm-live-block td").nth(1).click({ button: "right" });
  const rootMenu = page.locator('.editor-context-menu[data-context-depth="0"]');
  await rootMenu.waitFor({ state: "visible" });
  await rootMenu.locator('[data-context-submenu="table"]').hover();
  const submenu = page.locator('.editor-context-menu[data-context-depth="1"]');
  await submenu.waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(output, "table-context.png") });
  await submenu
    .locator('[data-context-action="contextTableColumnAfter"]')
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".cm-live-block th").length === 3,
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  await page.waitForFunction(
    () => document.querySelectorAll(".cm-live-block th").length === 2,
  );
  await page.evaluate(() => __inkstone.execute("save"));
  assert.equal(await fs.readFile(file, "utf8"), original + "$a = b+c$");
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    global.__interactiveClipboardSnapshot = await Promise.all(
      (await clipboard.read()).map(
        async (item) =>
          new ClipboardItem(
            Object.fromEntries(
              await Promise.all(
                item.types.map(async (type) => [
                  type,
                  await item.getType(type),
                ]),
              ),
            ),
          ),
      ),
    );
  });
  clipboardCaptured = true;
  const clipboardSource =
    "Text <!-- keep --> tail.\r\n\r\nReference [site][ref].\r\n\r\n[ref]: https://example.com\r\n\r\nFootnote[^n].\r\n\r\n[^n]: note\r\n\r\n| A | B |\r\n| --- | --- |\r\n| x\\|y | neighbor |";
  const clipboardTarget = "Before\r\n\r\nTARGET\r\n\r\nAfter";
  const expectedPaste = clipboardTarget.replace("TARGET", clipboardSource);
  const loadClipboardDocument = async (value, selectAll = false) =>
    page.evaluate(
      ({ value, selectAll }) => {
        __inkstone.loadDocument({ ...__inkstone.getDocument(), text: value });
        const editor = __inkstone.editor;
        editor.setMode("live");
        const start = selectAll
          ? 0
          : editor.view.state.doc.toString().indexOf("TARGET");
        editor.setSelection({
          anchor: start,
          head: selectAll ? editor.view.state.doc.length : start + 6,
        });
        editor.focus();
      },
      { value, selectAll },
    );
  const openClipboardMenu = async () => {
    const point = await page.evaluate(() => {
      const selection = __inkstone.editor.view.state.selection.main;
      const bounds = __inkstone.editor.view.coordsAtPos(selection.from + 2);
      return { x: bounds.left + 1, y: (bounds.top + bounds.bottom) / 2 };
    });
    await page.mouse.click(point.x, point.y, { button: "right" });
    await rootMenu.waitFor({ state: "visible" });
  };
  const waitForMarkdown = async () =>
    page.waitForFunction(
      async (expected) =>
        (await __inkstone.invoke("readClipboard")).markdown === expected,
      clipboardSource.replace(/\r\n/g, "\n"),
    );
  for (const action of ["Copy", "Cut"]) {
    await loadClipboardDocument(clipboardSource, true);
    await openClipboardMenu();
    await rootMenu.getByRole("menuitem", { name: action, exact: true }).click();
    await waitForMarkdown();
    if (action === "Cut")
      await page.waitForFunction(() => __inkstone.editor.getText() === "");
    await loadClipboardDocument(clipboardTarget);
    await openClipboardMenu();
    await rootMenu
      .getByRole("menuitem", { name: "Paste", exact: true })
      .click();
    await page.waitForFunction(
      (expected) => __inkstone.editor.getText() === expected,
      expectedPaste,
    );
    assert.equal(await page.locator(".cm-live-block th").count(), 2);
    assert.equal(
      await page.locator(".cm-live-block td").first().textContent(),
      "x|y",
    );
    await page.keyboard.press("Control+z");
    await page.waitForFunction(
      (expected) => __inkstone.editor.getText() === expected,
      clipboardTarget,
    );
    await loadClipboardDocument(clipboardTarget);
    await page.keyboard.press("Control+v");
    await page.waitForFunction(
      (expected) => __inkstone.editor.getText() === expected,
      expectedPaste,
    );
  }
  await loadClipboardDocument(clipboardSource, true);
  await page.keyboard.press("Control+c");
  await waitForMarkdown();
  await loadClipboardDocument(clipboardTarget);
  await openClipboardMenu();
  await rootMenu.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await page.waitForFunction(
    (expected) => __inkstone.editor.getText() === expected,
    expectedPaste,
  );
  assert.equal(await fs.readFile(file, "utf8"), original + "$a = b+c$");
  await restoreClipboard();
  assert.deepEqual(errors, []);
  const version = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  ).version;
  const result = {
    version,
    platform: process.platform,
    variant,
    executable: executablePath || "development Electron",
    passed: true,
    normalSandbox: !app.process().spawnargs.includes("--no-sandbox"),
    typedDollarFormulaRendersInPlace: true,
    noAdjacentPreview: true,
    glyphClickCaretAtB: true,
    editAndUndoPreserveBOMCRLF: true,
    tableContextColumnInsertAndUndo: true,
    actualFileSave: true,
    contextCopyCutMarkdownRoundTrip: true,
    keyboardContextClipboardInteroperability: true,
    escapedTableCommentsFootnotesReferencesPreserved: true,
    clipboardPasteSingleUndo: true,
    originalClipboardAllFormatsRestored: true,
    errors,
  };
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  try {
    await restoreClipboard();
  } finally {
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app?.close().catch(() => {});
    await fs.rm(temp, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200,
    });
  }
}
