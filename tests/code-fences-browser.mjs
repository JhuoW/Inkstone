import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import { artifactPath } from "../scripts/artifact-path.mjs";

const output = artifactPath("code-fences");
await fs.mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.INKSTONE_CHROMIUM || undefined,
});
const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/code-harness", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><meta charset="utf-8"></head><body><button id="outside">Outside</button><div id="editor" style="height:800px"></div></body></html>',
  }),
);
await page.goto(
  `http://127.0.0.1:${server.httpServer.address().port}/code-harness`,
);
await page.evaluate(async () => {
  const { createEditor } = await import("/src/editor.js");
  const { installClipboard } = await import("/src/clipboard.js");
  await import("/src/styles.css");
  window.load = (text, settings = {}) => {
    window.editor?.destroy?.();
    const old = document.querySelector("#editor");
    const host = old.cloneNode(false);
    old.replaceWith(host);
    window.editor = createEditor(host, {
      text,
      settings: { autoPair: false, ...settings },
    });
    installClipboard(host, editor, () => ({ path: "test.md" }));
    return editor;
  };
});
const text = () => page.evaluate(() => editor.getText());
const load = (value, settings = {}) =>
  page.evaluate(
    ({ value, settings }) => {
      load(value, settings);
    },
    { value, settings },
  );
async function select(value, offset = 0) {
  await page.evaluate(
    ({ value, offset }) => {
      editor.setSelection({
        anchor: editor.view.state.doc.toString().indexOf(value) + offset,
      });
      editor.focus();
    },
    { value, offset },
  );
}
async function check(name, run) {
  await run();
  checks.push({ name, result: "passed" });
  console.log("PASS", name);
}
try {
  await check(
    "Insert focuses a persistent, editable blank code area",
    async () => {
      await load("Start");
      await select("Start", 5);
      await page.evaluate(() => editor.command("codeBlock", "javascript"));
      assert.equal(await page.locator(".cm-code-line").count(), 1);
      await page.keyboard.type("const answer = 42;");
      assert.match(await text(), /```javascript\nconst answer = 42;\n```/);
      await page.locator("#outside").click();
      assert.equal(
        await page.locator(".cm-code-line").innerText(),
        "const answer = 42;",
      );
      assert.equal(await page.locator(".cm-code-header").count(), 1);
      await page.locator(".cm-code-line").click();
      assert.equal(await page.locator(".cm-code-header").count(), 1);
      await page.waitForFunction(() =>
        document.querySelector(".cm-code-line span"),
      );
      assert.ok((await page.locator(".cm-code-line span").count()) > 0);
    },
  );
  await check(
    "Language dropdown supports Python, JavaScript, C++, Java, SQL and plain text",
    async () => {
      const raw =
        "\uFEFFBefore\r\n\r\n```javascript\r\nconst answer = 42;\r\n```\r\n\r\nTail";
      await load(raw);
      const options = await page
        .locator(".cm-code-language option")
        .evaluateAll((options) => options.map((option) => option.value));
      for (const value of [
        "",
        "javascript",
        "python",
        "cpp",
        "java",
        "sql",
        "html",
        "css",
        "json",
        "rust",
      ])
        assert.ok(options.includes(value), value);
      for (const language of ["python", "cpp", "java", "sql", ""]) {
        await page.locator(".cm-code-language").selectOption(language);
        assert.equal(
          await text(),
          raw.replace("```javascript", "```" + language),
        );
        await page.keyboard.press("Control+z");
        assert.equal(await text(), raw);
      }
      await page.locator(".cm-code-language").selectOption("python");
      await page.evaluate(() => {
        const start = editor.view.state.doc.toString().indexOf("const");
        editor.setSelection({
          anchor: start,
          head: start + "const answer = 42;".length,
        });
      });
      await page.keyboard.insertText(
        'def greet(name):\n    return "Hello " + name',
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".cm-code-line span")].some(
          (span) => span.textContent === "def",
        ),
      );
      const colors = await page
        .locator(".cm-code-line span")
        .evaluateAll((spans) => [
          ...new Set(spans.map((span) => getComputedStyle(span).color)),
        ]);
      assert.ok(colors.length >= 2, JSON.stringify(colors));
    },
  );
  await check(
    "Plain paste keeps code indentation and ignores rich HTML wrappers",
    async () => {
      await load("```python\n\n```\n\nTail");
      await select("```python", 10);
      const value = 'if ready:\n\tprint("**literal** <tag>")\n';
      await page.evaluate((value) => {
        const data = new DataTransfer();
        data.setData("text/plain", value);
        data.setData(
          "text/html",
          '<pre><code class="language-python">WRONG FORMATTED VALUE</code></pre>',
        );
        editor.view.contentDOM.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      }, value);
      assert.equal(await text(), "```python\n" + value + "\n```\n\nTail");
      await page.keyboard.press("Control+z");
      assert.equal(await text(), "```python\n\n```\n\nTail");
    },
  );
  await check(
    "Long tilde fences, unknown labels and metadata are preserved",
    async () => {
      const raw =
        "Before\n\n~~~~customlang linenos=1\na < b && x\n~~~\n~~~~\n\nTail";
      await load(raw);
      assert.equal(
        await page.locator(".cm-code-language").inputValue(),
        "customlang",
      );
      assert.equal(await page.locator(".cm-code-line").count(), 2);
      await page.locator(".cm-code-language").selectOption("python");
      assert.equal(await text(), raw.replace("customlang", "python"));
      await page.keyboard.press("Control+z");
      assert.equal(await text(), raw);
    },
  );
  await check(
    "Language controls follow their block after edits before it",
    async () => {
      const raw =
        "Before\n\n```js\nfirst\n```\n\n```python\nsecond\n```\n\nTail";
      await load(raw);
      await select("Before", 2);
      await page.keyboard.type("INSERTED");
      await page.locator(".cm-code-language").nth(1).selectOption("java");
      assert.equal(
        await text(),
        raw.replace("Before", "BeINSERTEDfore").replace("```python", "```java"),
      );
    },
  );
  await check(
    "Empty imported fences stay visible and become editable on click",
    async () => {
      await load("```\n```\n\nTail");
      assert.ok(
        (await page.locator(".cm-code-empty").boundingBox()).height >= 30,
      );
      await page.locator(".cm-code-empty").click();
      await page.keyboard.type("hello");
      assert.equal(await text(), "```\nhello\n```\n\nTail");
    },
  );
  await check(
    "Boundary editing protects fences, Ctrl+Enter exits, and undo restores an empty block",
    async () => {
      await load("```js\nvalue\n```\n\nTail");
      await select("value");
      await page.keyboard.press("Backspace");
      assert.equal(await text(), "```js\nvalue\n```\n\nTail");
      await select("value", 5);
      await page.keyboard.press("Delete");
      assert.equal(await text(), "```js\nvalue\n```\n\nTail");
      await page.keyboard.press("Control+Enter");
      await page.keyboard.type("Outside");
      assert.match(await text(), /```\nOutside\nTail$/);
      await load("```\n\n```");
      await select("```", 4);
      await page.keyboard.press("Backspace");
      assert.equal(await text(), "");
      await page.keyboard.press("Control+z");
      assert.equal(await text(), "```\n\n```");
    },
  );
  await check("Source and read-only modes preserve exact content", async () => {
    const raw = "```python\nx = 1\n```\n\nTail";
    await load(raw, { readOnly: true });
    assert.equal(await page.locator(".cm-code-language").isDisabled(), true);
    await page.locator(".cm-code-line").click();
    await page.keyboard.type("BAD");
    assert.equal(await text(), raw);
    await page.evaluate(() => editor.setMode("source"));
    assert.equal(await page.locator(".cm-code-language").count(), 0);
    assert.match(await page.locator(".cm-content").innerText(), /```python/);
    await page.evaluate(() => editor.setMode("live"));
    assert.equal(await text(), raw);
  });
  await check(
    "Pasted literal closing fences stay inside code and undo restores original delimiters",
    async () => {
      for (const delimiter of ["```", "~~~~"]) {
        const raw =
          "\uFEFF" + delimiter + "text\r\n\r\n" + delimiter + "\r\n\r\nTail";
        await load(raw);
        await select(delimiter + "text", delimiter.length + 5);
        const code = "before\n" + delimiter + "\nafter";
        await page.keyboard.insertText(code);
        assert.equal(
          await text(),
          "\uFEFF" +
            delimiter +
            delimiter[0] +
            "text\r\n" +
            code.replaceAll("\n", "\r\n") +
            "\r\n" +
            delimiter +
            delimiter[0] +
            "\r\n\r\nTail",
        );
        assert.equal(await page.locator(".cm-code-language").count(), 1);
        assert.equal(await page.locator(".cm-code-line").count(), 3);
        await page.keyboard.press("Control+z");
        assert.equal(await text(), raw);
        await page.keyboard.press("Control+Shift+z");
        assert.match(await text(), /before/);
      }
    },
  );
  await check(
    "Keyboard navigation avoids invisible fences and preserves neighboring prose",
    async () => {
      const raw = "Before\n\n```js\nvalue\n```\n\nAfter";
      await load(raw);
      await select("value");
      await page.keyboard.press("ArrowUp");
      let head = await page.evaluate(() => editor.getSelection().head);
      assert.ok(head < raw.indexOf("```js") || head >= raw.indexOf("value"));
      await select("value", 5);
      await page.keyboard.press("ArrowDown");
      head = await page.evaluate(() => editor.getSelection().head);
      assert.ok(
        head <= raw.indexOf("value") + 5 || head > raw.lastIndexOf("```") + 2,
      );
      await load("```python\nx = 1\n```");
      await select("x = 1", 3);
      await page.keyboard.press("Control+Home");
      assert.equal(await page.evaluate(() => editor.getSelection().head), 10);
      await page.keyboard.type("# ");
      assert.equal(await text(), "```python\n# x = 1\n```");
    },
  );
  await check(
    "Unclosed fences remain editable and diagram previews keep their behavior",
    async () => {
      await load("```python\nx = 1");
      await select("x = 1", 5);
      await page.keyboard.press("Enter");
      await page.keyboard.type("y = 2");
      assert.equal(await text(), "```python\nx = 1\ny = 2");
      assert.equal(await page.locator(".cm-code-line").count(), 2);
      await load("```math\nx^2\n```\n\nTail");
      await select("Tail");
      assert.equal(await page.locator(".cm-code-language").count(), 0);
      assert.ok((await page.locator(".math-display").count()) > 0);
    },
  );
  await check(
    "Code remains readable in both themes with line numbers and a narrow viewport",
    async () => {
      for (const theme of ["light", "dark"]) {
        await load(
          '```javascript\n// A thought, written down\nconst message = "Hello, Inkstone";\nconsole.log(message);\n```\n\nContinue writing here.',
          { theme, locale: "zh-CN", lineNumbers: true },
        );
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        );
        await page.waitForFunction(
          () => document.querySelectorAll(".cm-code-line span").length >= 4,
        );
        assert.equal(
          await page.locator(".cm-code-line[data-code-number]").count(),
          3,
        );
        await page.screenshot({ path: path.join(output, `code-${theme}.png`) });
      }
      await page.setViewportSize({ width: 450, height: 750 });
      const bounds = await page.locator(".cm-code-language").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 450);
      assert.equal(errors.length, 0, errors.join("\n"));
    },
  );
  await page.setViewportSize({ width: 1100, height: 850 });
  await check(
    "Plain-text selection preserves fence metadata and the editing position",
    async () => {
      const raw = "```javascript linenos=1\nconst value = 42;\n```\n\nTail";
      await load(raw);
      await select("value", 3);
      await page.locator(".cm-code-language").selectOption("");
      assert.equal(await text(), raw.replace("javascript", "text"));
      assert.equal(await page.locator(".cm-code-language").inputValue(), "");
      await page.keyboard.type("X");
      assert.match(await text(), /valXue/);
      await page.keyboard.press("Control+z");
      await page.keyboard.press("Control+z");
      assert.equal(await text(), raw);
    },
  );
  await check(
    "Ctrl+Enter closes an unfinished code fence and resumes prose",
    async () => {
      for (const delimiter of ["```", "~~~~"]) {
        const raw = delimiter + "python\nx = 1";
        await load(raw);
        await select("x = 1", 5);
        await page.keyboard.press("Control+Enter");
        await page.keyboard.type("Outside");
        assert.equal(await text(), raw + "\n" + delimiter + "\n\nOutside");
        assert.equal(await page.locator(".cm-code-line").count(), 1);
      }
    },
  );
} finally {
  await page
    .screenshot({ path: path.join(output, "last-state.png") })
    .catch(() => {});
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  await browser.close();
  await server.close();
}
