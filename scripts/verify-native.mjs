// Runs on the actual supported host. Linux execution does not validate Windows.
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
if (!["win32", "linux"].includes(process.platform))
  throw new Error("Windows or Linux is required.");
const root = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone native 中文 "));
const output = path.join(
  root,
  "artifacts",
  "native-validation",
  process.platform,
);
await fs.mkdir(output, { recursive: true });
const file = path.join(temp, "本地 文稿.md");
const original =
  "\uFEFF# 本地写作\r\n\r\n第一段 **强调**。\r\n\r\n$$\r\nE=mc^2\r\n$$\r\n\r\n```mermaid\r\nflowchart LR\r\nA[中文] --> B[保存]\r\n```\r\n\r\n末段\r\n";
await fs.writeFile(file, original);
const environment = {
  ...process.env,
  INKSTONE_USER_DATA: path.join(temp, "profile"),
};
delete environment.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.INKSTONE_EXECUTABLE
  ? path.resolve(process.env.INKSTONE_EXECUTABLE)
  : undefined;
const args = executablePath ? [file] : [root, file];
let app;
const pageErrors = [];
try {
  app = await electron.launch({
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
    ...(executablePath ? { executablePath } : {}),
    args,
    env: environment,
    timeout: 30000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.waitForFunction(() =>
    window.__inkstone?.getDocument().path?.endsWith("本地 文稿.md"),
  );
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  await page.waitForFunction(
    async () => (await window.inkstone.invoke("spellcheckStatus")).available,
  );
  const spellcheck = await page.evaluate(() =>
    window.inkstone.invoke("spellcheckStatus"),
  );
  assert.equal(spellcheck.dictionaryURL, "inkstone-dictionary://local/");
  assert.equal(spellcheck.externalDownloads, false);
  assert.ok(spellcheck.languages.includes("en-US"));
  assert.ok(spellcheck.bundledLanguages.includes("en-US"));
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { autoSave: false }),
  );
  const before = await fs.readFile(file),
    stat = await fs.stat(file);
  await page.evaluate(() => __inkstone.execute("save"));
  assert.deepEqual(await fs.readFile(file), before);
  assert.equal((await fs.stat(file)).mtimeMs, stat.mtimeMs);
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
    e.focus();
  });
  await page.locator(".katex").first().waitFor({ state: "attached" });
  await page
    .locator(".diagram svg")
    .first()
    .waitFor({ state: "attached", timeout: 30000 });
  await page.keyboard.insertText("本机编辑");
  await page.evaluate(() => __inkstone.execute("save"));
  assert.equal(await fs.readFile(file, "utf8"), original + "本机编辑");
  await page.evaluate(() => __inkstone.editor.command("undo"));
  await page.evaluate(() => __inkstone.execute("save"));
  assert.deepEqual(await fs.readFile(file), before);
  await page.evaluate(() =>
    __inkstone.editor.setSelection({ anchor: 4, head: 12 }),
  );
  const selection = await page.evaluate(() => __inkstone.editor.getSelection());
  await page.evaluate(() => __inkstone.editor.setMode("source"));
  await page.evaluate(() => __inkstone.editor.setMode("live"));
  assert.deepEqual(
    await page.evaluate(() => __inkstone.editor.getSelection()),
    selection,
  );
  const exports = [];
  for (const format of ["html", "pdf"]) {
    const destination = path.join(temp, `本机导出.${format}`);
    await page.evaluate(
      ({ format, destination, file }) =>
        __inkstone.invoke("exportFile", {
          format,
          path: destination,
          documentPath: file,
          title: "本机验证",
          html: "<h1>中文本机导出</h1><p>Windows/Linux本地文件验证。</p>",
          css: "body{font-family: sans-serif}",
          pageSize: "A4",
        }),
      { format, destination, file },
    );
    const bytes = await fs.readFile(destination);
    assert.ok(bytes.length > 100);
    if (format === "pdf")
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    await fs.copyFile(destination, path.join(output, `native.${format}`));
    exports.push(format);
  }
  const reopened = await app.evaluate(
    async ({ BrowserWindow }, filename) => {
      const window = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      try {
        await window.loadFile(filename);
        return await window.webContents.executeJavaScript(
          "document.body.innerText",
        );
      } finally {
        window.destroy();
      }
    },
    path.join(temp, "本机导出.html"),
  );
  assert.ok(reopened.includes("中文本机导出"));
  assert.deepEqual(pageErrors, []);
  await page.screenshot({ path: path.join(output, "native-window.png") });
  const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        version,
        platform: process.platform,
        architecture: process.arch,
        executable: executablePath || "development Electron",
        passed: true,
        normalSandbox: !app.process().spawnargs.includes("--no-sandbox"),
        nodeIsolation: true,
        spellcheck,
        noEditByteAndMtime: true,
        normalSandbox: !app.process().spawnargs.includes("--no-sandbox"),
        chinesePath: true,
        localEditAndUndo: true,
        selectionAcrossModes: true,
        mathAndDiagram: true,
        exports,
        htmlReopened: true,
        pageErrors,
        limitations: [
          "This is not installer/association/uninstall verification.",
          "insertText does not validate native OS IME.",
          "PDF signature checked; typography needs visual inspection.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(`Native ${process.platform} smoke passed (${version}).`);
} finally {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
  await fs.rm(temp, { recursive: true, force: true });
}
