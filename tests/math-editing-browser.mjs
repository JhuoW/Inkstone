/** Standalone browser interaction checks. Run: node tests/editor-browser.mjs */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "vite";
import { chromium } from "playwright";
const artifacts = path.resolve("artifacts/math-editing-validation");
await fs.mkdir(artifacts, { recursive: true });
let executablePath = process.env.INKSTONE_CHROMIUM;
if (!executablePath) {
  try {
    await fs.access(chromium.executablePath());
  } catch {
    const cache = path.join(os.homedir(), ".cache/ms-playwright");
    for (const directory of (await fs.readdir(cache))
      .filter((name) => /^chromium-/.test(name))
      .sort()
      .reverse()) {
      for (const binary of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const candidate = path.join(cache, directory, binary);
        try {
          await fs.access(candidate);
          executablePath = candidate;
          break;
        } catch {}
      }
      if (executablePath) break;
    }
  }
}
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/editor-harness", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="editor" style="height:850px"></div></body></html>',
  }),
);
await page.goto(url + "/editor-harness");
await page.evaluate(async () => {
  const module = await import("/src/editor.js");
  await import("/node_modules/katex/dist/katex.min.css");
  await import("/src/styles.css");
  window.newEditor = (text, settings = {}) => {
    window.editor?.destroy?.();
    window.editor = module.createEditor(document.querySelector("#editor"), {
      text,
      settings,
    });
    return window.editor;
  };
});
async function check(name, fn) {
  const start = performance.now();
  await fn();
  const result = {
    name,
    result: "passed",
    ms: Math.round(performance.now() - start),
  };
  results.push(result);
  console.log("PASS", name, result.ms + "ms");
}
async function open(text, settings = {}) {
  await page.evaluate(
    ({ text, settings }) => {
      newEditor(text, settings);
      editor.setSelection({ anchor: editor.view.state.doc.length });
      editor.focus();
    },
    { text, settings },
  );
}
async function text() {
  return page.evaluate(() => editor.getText());
}
async function selection() {
  return page.evaluate(() => editor.getSelection());
}
try {
  await check(
    "Clicking rendered inline fractions targets TeX source, preserves BOM/CRLF and undo",
    async () => {
      const raw = "\uFEFFStart\r\n\r\nBefore $\\frac{x}{y}$ after.\r\n\r\nEnd";
      await open(raw);
      await page.locator(".cm-live-block .math-inline").click();
      const normalized = raw.slice(1).replaceAll("\r\n", "\n");
      assert.equal((await selection()).head, normalized.indexOf("\\frac"));
      assert.equal(
        await page.locator(".cm-math-source").textContent(),
        "$\\frac{x}{y}$",
      );
      assert.equal(
        await page.locator(".cm-inline-math-preview .katex").count(),
        1,
      );
      await page.keyboard.type("Q");
      assert.equal(await text(), raw.replace("\\frac", "Q\\frac"));
      await page.keyboard.press("Control+z");
      assert.equal(await text(), raw);
      await page.keyboard.press("Control+Shift+z");
      assert.equal(await text(), raw.replace("\\frac", "Q\\frac"));
    },
  );
  await check(
    "Repeated formulas, backslash delimiters and active-paragraph widgets map independently",
    async () => {
      const raw =
        "Start\n\nfirst $x^2$ second $x^2$ and \\(\\frac{a}{b}\\).\n\nEnd";
      await open(raw);
      await page.locator(".cm-live-block .math-inline").nth(1).click();
      assert.equal(
        (await selection()).head,
        raw.indexOf("$x^2$", raw.indexOf("$x^2$") + 1) + 1,
      );
      assert.equal(await page.locator(".cm-inline-math").count(), 2);
      await page.locator(".cm-inline-math").last().click();
      assert.equal((await selection()).head, raw.indexOf("\\frac"));
      await page.keyboard.type("Q");
      assert.equal(await text(), raw.replace("\\frac", "Q\\frac"));
      await page.keyboard.press("Control+z");
      assert.equal(await text(), raw);
      // Move unrelated preceding source while reusing the later widget DOM.
      await page.evaluate(() => {
        editor.setSelection({ anchor: 0 });
        editor.insert("prefix ");
      });
      await page.locator(".cm-live-block .math-inline").nth(1).click();
      assert.equal(
        (await selection()).head,
        raw.indexOf("$x^2$", raw.indexOf("$x^2$") + 1) + 8,
      );
    },
  );
  await check(
    "Double-click selects only formula content in the same editor",
    async () => {
      for (const raw of [
        "Start\n\nBefore $\\frac{x}{y}$ after.\n\nEnd",
        "Start\n\n$$\n\\qty(\\frac{x}{y})\n$$\n\nEnd",
      ]) {
        await open(raw);
        await page.locator(".math-inline, .math-display").first().dblclick();
        const selected = await page.evaluate(() =>
          editor.view.state.sliceDoc(
            editor.view.state.selection.main.from,
            editor.view.state.selection.main.to,
          ),
        );
        assert.equal(
          selected,
          raw.includes("\\qty") ? "\\qty(\\frac{x}{y})" : "\\frac{x}{y}",
        );
        await page.keyboard.type("z^3");
        assert.equal(await text(), raw.replace(selected, "z^3"));
        await page.keyboard.press("Control+z");
        assert.equal(await text(), raw);
      }
    },
  );
  await check(
    "Block math and math fences reopen inside delimiters, update preview and recover errors",
    async () => {
      for (const fixture of [
        { body: "\\frac{x}{y}", open: "$$", close: "$$" },
        { body: "\\qty(\\frac{x}{y})", open: "$$", close: "$$" },
        { body: "\\dv{x}{t}", open: "\\[", close: "\\]" },
        { body: "x^2", open: "```math", close: "```" },
      ]) {
        const raw = `Start\n\n${fixture.open}\n${fixture.body}\n${fixture.close}\n\nEnd`;
        await open(raw);
        await page.locator(".math-inline, .math-display").first().click();
        const head = (await selection()).head,
          start = raw.indexOf(fixture.body),
          end = start + fixture.body.length;
        assert.ok(
          head >= start && head <= end,
          `${head} not in formula ${start}..${end}`,
        );
        assert.equal(await page.locator(".cm-live-preview").count(), 1);
        await page.evaluate(
          ({ start, end }) => editor.setSelection({ anchor: start, head: end }),
          { start, end },
        );
        await page.keyboard.type("\\notARealCommand");
        await page.locator(".cm-live-preview .math-error").waitFor();
        await page.keyboard.press("Control+z");
        assert.equal(await text(), raw);
        assert.equal(
          await page.locator(".cm-live-preview .math-error").count(),
          0,
        );
        await page.keyboard.press("Control+Enter");
        assert.equal(await page.locator(".cm-live-preview").count(), 0);
        assert.equal(await text(), raw);
      }
    },
  );
  await check(
    "Arrow navigation enters inline math source; repeated mode switches keep exact text and selection",
    async () => {
      const raw = "Start\n\ntext $x^2$ suffix.\n\n$$\ny=2\n$$\n\nEnd";
      await open(raw);
      await page.evaluate(
        (head) => {
          editor.setSelection({ anchor: head });
          editor.focus();
        },
        raw.indexOf("$x^2$") - 1,
      );
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.locator(".cm-math-source").count(), 1);
      await page.keyboard.press("ArrowRight");
      assert.equal((await selection()).head, raw.indexOf("x^2"));
      await page.keyboard.type("Q");
      const selected = await selection();
      await page.evaluate(() => {
        for (let i = 0; i < 20; i++) {
          editor.setMode("source");
          editor.setMode("live");
        }
      });
      assert.deepEqual(await selection(), selected);
      assert.equal(await text(), raw.replace("x^2", "Qx^2"));
      await page.keyboard.press("Control+z");
      assert.equal(await text(), raw);
      await page.evaluate(
        (head) => {
          editor.setSelection({ anchor: head });
          editor.focus();
        },
        raw.indexOf("$$") - 1,
      );
      for (let i = 0; i < 6; i++) {
        if (await page.locator(".cm-live-preview").count()) break;
        await page.keyboard.press("ArrowDown");
      }
      assert.equal(await page.locator(".cm-live-preview").count(), 1);
      assert.equal(await text(), raw);
    },
  );
  await check(
    "Mermaid and code blocks use body-safe click and double-click targets; diagram preview recovers",
    async () => {
      const code = "Start\n\n```javascript\nconst x = 1;\n```\n\nEnd";
      await open(code);
      await page.locator(".code-block").dblclick();
      assert.equal(
        await page.evaluate(() =>
          editor.view.state.sliceDoc(
            editor.view.state.selection.main.from,
            editor.view.state.selection.main.to,
          ),
        ),
        "const x = 1;",
      );
      await page.keyboard.type("const y = 2;");
      assert.equal(await text(), code.replace("const x = 1;", "const y = 2;"));
      await page.keyboard.press("Control+z");
      assert.equal(await text(), code);
      const raw =
        "Start\n\n```mermaid\ngraph LR\n A[中文] --> B[写作]\n```\n\nEnd";
      await open(raw);
      await page.locator(".diagram svg").waitFor();
      await page.locator(".diagram svg").click();
      assert.ok((await selection()).head >= raw.indexOf("graph LR"));
      await page.locator(".cm-live-preview .diagram svg").waitFor();
      assert.match(
        await page.locator(".cm-live-preview .diagram svg").textContent(),
        /中文/,
      );
      await page.evaluate(
        ({ from, to }) => editor.setSelection({ anchor: from, head: to }),
        {
          from: raw.indexOf("graph LR"),
          to: raw.indexOf("\n```", raw.indexOf("graph LR")),
        },
      );
      await page.keyboard.type("not a diagram");
      await page.locator(".cm-live-preview .diagram-error").waitFor();
      await page.keyboard.press("Control+z");
      assert.equal(await text(), raw);
      await page.locator(".cm-live-preview .diagram svg").waitFor();
    },
  );
  await check(
    "Composition near math survives preview updates and explicit finish without duplicate Chinese",
    async () => {
      const raw = "Start\n\nBefore $x^2$ after.\n\nEnd";
      await open(raw);
      await page.locator(".cm-live-block .math-inline").click();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.imeSetComposition", {
        text: "zhong",
        selectionStart: 5,
        selectionEnd: 5,
      });
      await page.evaluate(() => {
        editor.setMode("source");
        editor.setMode("live");
      });
      await cdp.send("Input.imeSetComposition", {
        text: "中文",
        selectionStart: 2,
        selectionEnd: 2,
      });
      await cdp.send("Input.insertText", { text: "中文" });
      await page.waitForTimeout(30);
      assert.equal(await text(), raw.replace("$x^2$", "$中文x^2$"));
      assert.equal(await page.evaluate(() => editor.finishComposition()), true);
      const selected = await selection();
      await page.evaluate(() => {
        editor.setSettings({ readOnly: true });
        editor.setSettings({ readOnly: false });
        editor.focus();
      });
      assert.deepEqual(await selection(), selected);
      assert.equal(await text(), raw.replace("$x^2$", "$中文x^2$"));
      await page.keyboard.press("Control+z");
      assert.equal(await text(), raw);
      await cdp.detach();
    },
  );
  await check(
    "Finishing an active IME composition commits prose and visual table cells before locking",
    async () => {
      const cdp = await context.newCDPSession(page);
      for (const table of [false, true]) {
        const raw = table
          ? "Start\n\n| A | B |\n| --- | --- |\n| alpha | beta |\n\nEnd"
          : "Start\n\nBefore $x^2$ after.\n\nEnd";
        await open(raw);
        if (table) {
          await page.locator(".cm-live-block td").first().click();
          await page.keyboard.press("End");
        } else await page.locator(".cm-live-block .math-inline").click();
        await cdp.send("Input.imeSetComposition", {
          text: "中文",
          selectionStart: 2,
          selectionEnd: 2,
        });
        const finished = await page.evaluate(() => editor.finishComposition());
        assert.equal(
          finished,
          true,
          table
            ? "table composition did not commit"
            : "prose composition did not commit",
        );
        assert.equal(
          await text(),
          table
            ? raw.replace("alpha", "alpha中文")
            : raw.replace("$x^2$", "$中文x^2$"),
        );
        await page.evaluate(() => {
          editor.setSettings({ readOnly: true });
          editor.setSettings({ readOnly: false });
          editor.focus();
        });
        assert.equal(
          await text(),
          table
            ? raw.replace("alpha", "alpha中文")
            : raw.replace("$x^2$", "$中文x^2$"),
        );
        if (!table) {
          // A canceled close/navigation is an editing boundary even when the
          // next keystroke arrives inside CodeMirror's 500ms typing window.
          const committed = raw.replace("$x^2$", "$中文x^2$");
          await page.keyboard.type("Q");
          const continued = committed.replace("中文", "中文Q");
          assert.equal(await text(), continued);
          await page.keyboard.press("Control+z");
          assert.equal(await text(), committed);
          // Uppercase Z matches the native shifted key event. Lowercase z
          // forces Playwright to emit an unshifted character with shiftKey.
          await page.keyboard.press("Control+Shift+Z");
          assert.equal(await text(), continued);
          await page.keyboard.press("Control+z");
          await page.keyboard.press("Control+z");
          assert.equal(await text(), raw);
        }
      }
      await cdp.detach();
    },
  );
  await check(
    "Dragging from inline math across blocks copies source once and paste/undo preserves it",
    async () => {
      const raw =
        "Start\n\nBefore $x^2$ after.\n\nMiddle paragraph\n\n$$\ny=2\n$$\n\nEnd";
      await open(raw);
      await page.evaluate(
        (head) => editor.setSelection({ anchor: head }),
        raw.indexOf("Before"),
      );
      const first = await page.locator(".cm-inline-math").boundingBox();
      await page.mouse.move(
        first.x + first.width / 2,
        first.y + first.height / 2,
      );
      await page.mouse.down();
      const last = await page
        .locator(".cm-live-block p")
        .filter({ hasText: "End" })
        .boundingBox();
      await page.mouse.move(last.x + last.width - 2, last.y + last.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
      const selected = await page.evaluate(() =>
        editor.view.state.sliceDoc(
          editor.view.state.selection.main.from,
          editor.view.state.selection.main.to,
        ),
      );
      assert.match(selected, /Middle paragraph/);
      assert.match(selected, /\$\$\ny=2\n\$\$/);
      await page.keyboard.press("Control+c");
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        selected,
      );
      await page.keyboard.press("Control+x");
      await page.keyboard.press("Control+v");
      assert.equal(await text(), raw);
      await page.keyboard.press("Control+z");
      await page.keyboard.press("Control+z");
      assert.equal(await text(), raw);
    },
  );
  await check(
    "Settings no-op preserves widgets, selection and history; read-only math stays non-editable",
    async () => {
      const raw = "Start\n\nBefore $x^2$ after.\n\nEnd";
      await open(raw, { locale: "en" });
      assert.deepEqual(
        await page.evaluate(() => {
          const widget = document.querySelector(".cm-live-block");
          const before = editor.getSelection();
          const same = editor.setSettings({
            locale: "en",
            recentFiles: ["x"],
            sidebarWidth: 300,
          });
          return {
            same,
            sameDOM: widget === document.querySelector(".cm-live-block"),
            sameSelection:
              JSON.stringify(before) === JSON.stringify(editor.getSelection()),
          };
        }),
        { same: false, sameDOM: true, sameSelection: true },
      );
      await page.evaluate(() => editor.setSettings({ readOnly: true }));
      await page.locator(".math-inline").click();
      await page.keyboard.type("BAD");
      assert.equal(await text(), raw);
      assert.equal(await page.locator(".cm-math-source").count(), 0);
      await page.evaluate(() => {
        editor.setSettings({ readOnly: false, locale: "zh-CN" });
        editor.command("find");
      });
      assert.match(await page.locator(".cm-search").textContent(), /下一个/);
      await page.keyboard.press("Escape");
      await page.locator(".math-inline").click();
      await page.screenshot({
        path: path.join(artifacts, "inline-edit.png"),
        fullPage: true,
      });
      await open("数学公式\n\n$$\n\\qty(\\frac{x}{y})\n$$\n\n末尾", {
        locale: "zh-CN",
      });
      await page.locator(".math-display").click();
      await page.screenshot({
        path: path.join(artifacts, "block-edit.png"),
        fullPage: true,
      });
    },
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(artifacts, "results.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        checks: results,
        browserErrors: errors,
        scope:
          "Actual Chromium mouse/keyboard and CDP composition. Native Windows OS IME remains platform validation.",
      },
      null,
      2,
    ),
  );
  await fs.rm(path.join(artifacts, "failure.json"), { force: true });
  await fs.rm(path.join(artifacts, "failure.png"), { force: true });
} catch (error) {
  await page.screenshot({
    path: path.join(artifacts, "failure.png"),
    fullPage: true,
  });
  await fs.writeFile(
    path.join(artifacts, "failure.json"),
    JSON.stringify(
      { error: error.stack, checks: results, browserErrors: errors },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
