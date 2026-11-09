import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, watch: null },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.route("**/stability-harness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><div id="editor" style="height:700px"></div></body></html>',
    }),
  );
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/stability-harness`,
  );
  await page.evaluate(async () => {
    const { createEditor } = await import("/src/editor.js");
    window.openEditor = (text) => {
      window.editor?.destroy?.();
      window.editor = createEditor(document.querySelector("#editor"), { text });
      editor.setMode("source");
    };
  });
  const original =
    '\uFEFFBefore\r\n\r\n  \r\n\r\n\r\n```python\r\nvalue = """\r\n   \r\n\r\n\r\n\r\nend\r\n"""\r\n```\r\n';
  await page.evaluate((text) => {
    openEditor(text);
    editor.command("format");
  }, original);
  assert.equal(
    await page.evaluate(() => editor.getText()),
    original.replace("Before\r\n\r\n  \r\n\r\n\r\n", "Before\r\n\r\n\r\n"),
  );
  await page.evaluate(() => editor.focus());
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(() => editor.getText()), original);
  console.log(
    "PASS source formatting preserves literal code, BOM/CRLF and exact undo",
  );

  const large = "x`".repeat(150000) + "\n`````\nend";
  await page.evaluate((text) => {
    openEditor(text);
    editor.setSelection({ anchor: 0, head: editor.view.state.doc.length });
    editor.command("codeBlock", "text");
  }, large);
  const wrapped = await page.evaluate(() => editor.getText());
  assert.equal(wrapped, "\n\n``````text\n" + large + "\n``````\n");
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(() => editor.getText()), large);
  console.log(
    "PASS large selection wraps without stack overflow and undoes exactly",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
