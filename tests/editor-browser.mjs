/** Standalone browser interaction checks. Run: node tests/editor-browser.mjs */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "vite";
import { chromium } from "playwright";
const artifacts = path.resolve("artifacts/editor-validation");
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
  server: { host: "127.0.0.1", port: 0, watch: null },
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
try {
  await check(
    "Mode switches preserve original text, selection and undo history",
    async () => {
      const raw =
        "\uFEFF---\r\ntitle: 中文\r\n---\r\n\r\n# 标题\n\n段落 **文字**\r\n";
      assert.deepEqual(
        await page.evaluate((raw) => {
          newEditor(raw);
          editor.setSelection({ anchor: 9, head: 12 });
          const before = editor.getSelection();
          editor.setMode("source");
          editor.setMode("live");
          const stable =
            JSON.stringify(before) === JSON.stringify(editor.getSelection());
          const unchanged = editor.getText();
          editor.setSelection({ anchor: editor.view.state.doc.length });
          editor.insert("编辑");
          editor.setMode("source");
          editor.command("undo");
          const undone = editor.getText();
          editor.command("redo");
          return { stable, unchanged, undone, redone: editor.getText() };
        }, raw),
        { stable: true, unchanged: raw, undone: raw, redone: raw + "编辑" },
      );
    },
  );
  await check(
    "Continuous keyboard typing and nested-list Enter/Tab retain all text",
    async () => {
      await page.evaluate(() => {
        newEditor("- outer\n  - inner");
        editor.setSelection({ anchor: editor.view.state.doc.length });
        editor.focus();
      });
      await page.keyboard.press("Enter");
      await page.keyboard.type("next");
      await page.keyboard.press("Tab");
      const text = await page.evaluate(() => editor.getText());
      assert.match(text, /inner\n\s+- next/);
      assert.ok(text.includes("outer"));
    },
  );
  await check(
    "Chromium IME composition commits Chinese without dropped or duplicate text",
    async () => {
      await page.evaluate(() => {
        newEditor("开始\n\n");
        editor.setSelection({ anchor: 4 });
        editor.focus();
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.imeSetComposition", {
        text: "zhongwen",
        selectionStart: 8,
        selectionEnd: 8,
      });
      await cdp.send("Input.imeSetComposition", {
        text: "中文",
        selectionStart: 2,
        selectionEnd: 2,
      });
      await cdp.send("Input.insertText", { text: "中文" });
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => editor.getText()), "开始\n\n中文");
      await page.keyboard.type(" OK");
      assert.equal(
        await page.evaluate(() => editor.getText()),
        "开始\n\n中文 OK",
      );
      await cdp.detach();
    },
  );
  await check(
    "Cross-block selection, clipboard copy/paste and undo preserve Markdown",
    async () => {
      const original = "# Heading\n\nparagraph **bold**\n\n- one\n- two";
      await page.evaluate((text) => {
        newEditor(text);
        editor.setSelection({ anchor: 2, head: text.length - 3 });
        editor.focus();
      }, original);
      await page.keyboard.press("Control+c");
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(copied, original.slice(2, -3));
      await page.evaluate(() =>
        navigator.clipboard.writeText("中文 pasted\n\nsecond"),
      );
      await page.keyboard.press("Control+v");
      assert.equal(
        await page.evaluate(() => editor.getText()),
        original.slice(0, 2) + "中文 pasted\n\nsecond" + original.slice(-3),
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), original);
    },
  );
  await check(
    "Real mouse dragging from rendered blocks selects across paragraphs and copies complete Markdown",
    async () => {
      const original =
        "# Drag heading\n\nfirst **start** paragraph\n\nmiddle **complete** paragraph\n\nlast destination paragraph\n\n";
      await page.evaluate((text) => {
        newEditor(text);
        editor.setSelection({ anchor: editor.view.state.doc.length });
        editor.focus();
      }, original);
      const first = await page
        .locator(".cm-live-block")
        .filter({ hasText: "first start paragraph" })
        .boundingBox();
      await page.mouse.move(first.x + 20, first.y + first.height / 2);
      await page.mouse.down();
      const last = await page
        .locator(".cm-live-block")
        .filter({ hasText: "last destination paragraph" })
        .boundingBox();
      await page.mouse.move(last.x + 110, last.y + last.height / 2, {
        steps: 20,
      });
      await page.mouse.up();
      const selection = await page.evaluate(() => editor.getSelection());
      assert.ok(
        Math.min(selection.anchor, selection.head) <=
          original.indexOf("middle"),
        JSON.stringify(selection),
      );
      assert.ok(
        Math.max(selection.anchor, selection.head) >= original.indexOf("last"),
        JSON.stringify(selection),
      );
      await page.keyboard.press("Control+c");
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(copied.includes("middle **complete** paragraph"), copied);
      assert.equal(
        copied,
        original.slice(
          Math.min(selection.anchor, selection.head),
          Math.max(selection.anchor, selection.head),
        ),
      );
      assert.equal(await page.evaluate(() => editor.getText()), original);
      await page.screenshot({
        path: path.join(artifacts, "mouse-cross-block-selection.png"),
        fullPage: true,
      });
      // Reverse the same real gesture, then start a gesture inside already revealed source.
      for (const origin of ["reverse", "source"]) {
        await page.evaluate(
          ({ original, origin }) => {
            newEditor(original);
            editor.setSelection({
              anchor:
                origin === "source"
                  ? original.indexOf("first") + 5
                  : editor.view.state.doc.length,
            });
            editor.focus();
          },
          { original, origin },
        );
        const start = await (
          origin === "source"
            ? page
                .locator(".cm-line")
                .filter({ hasText: /first .*start.* paragraph/ })
            : page
                .locator(".cm-live-block")
                .filter({ hasText: "last destination paragraph" })
        ).boundingBox();
        await page.mouse.move(start.x + 30, start.y + start.height / 2);
        await page.mouse.down();
        const destination = await page
          .locator(".cm-live-block")
          .filter({
            hasText:
              origin === "source"
                ? "last destination paragraph"
                : "first start paragraph",
          })
          .boundingBox();
        await page.mouse.move(
          destination.x + 80,
          destination.y + destination.height / 2,
          { steps: 20 },
        );
        await page.mouse.up();
        await page.keyboard.press("Control+c");
        const selected = await page.evaluate(() =>
          navigator.clipboard.readText(),
        );
        assert.ok(
          selected.includes("middle **complete** paragraph"),
          origin + ": " + selected,
        );
        assert.equal(await page.evaluate(() => editor.getText()), original);
      }
    },
  );
  await check(
    "Table keyboard navigation, TSV paste, alignment and reordering change source",
    async () => {
      const original =
        "| A | B |\n| --- | --- |\n| one | two |\n| three | four |";
      await page.evaluate((text) => {
        newEditor(text);
        editor.setSelection({ anchor: text.indexOf("B") });
        editor.focus();
      }, original);
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          editor.view.state.doc.sliceString(
            editor.view.state.selection.main.head,
            editor.view.state.selection.main.head + 3,
          ),
        ),
        "one",
      );
      await page.evaluate(() =>
        navigator.clipboard.writeText("中文\tcell\nnext\tvalue"),
      );
      await page.keyboard.press("Control+v");
      let text = await page.evaluate(() => editor.getText());
      assert.match(text, /中文 \| cell/);
      assert.match(text, /next \| value/);
      await page.evaluate(() => {
        const pos = editor.getText().indexOf("cell");
        editor.setSelection({ anchor: pos });
        editor.command("tableAction", "alignCenter");
        editor.command("tableAction", "moveColumnLeft");
      });
      text = await page.evaluate(() => editor.getText());
      assert.match(text, /\| :---: \| --- \|/);
      assert.match(text, /cell \| 中文/);
    },
  );
  await check(
    "Active paragraphs and headings reveal only the selected inline syntax",
    async () => {
      const raw =
        "Plain **bold** and *italic* with [site](https://example.com) plus `code` and ~~gone~~ end";
      await page.evaluate((text) => {
        newEditor(text);
        editor.setSelection({ anchor: 2 });
        editor.focus();
      }, raw);
      assert.equal(
        await page.locator(".cm-line").first().textContent(),
        "Plain bold and italic with site plus code and gone end",
      );
      assert.equal(
        await page.locator(".cm-inline-strong").textContent(),
        "bold",
      );
      assert.equal(
        await page
          .locator(".cm-inline-strong")
          .evaluate((element) => getComputedStyle(element).fontWeight),
        "700",
      );
      await page.locator(".cm-inline-strong").click();
      assert.match(
        await page.locator(".cm-line").first().textContent(),
        /\*\*bold\*\*/,
      );
      assert.ok(
        !(await page.locator(".cm-line").first().textContent()).includes(
          "*italic*",
        ),
      );
      const position = await page.evaluate(() => editor.getSelection().head);
      await page.keyboard.type("X");
      assert.equal(
        await page.evaluate(() => editor.getText()),
        raw.slice(0, position) + "X" + raw.slice(position),
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      await page.evaluate(
        (text) => editor.setSelection({ anchor: text.indexOf("site") + 2 }),
        raw,
      );
      assert.ok(
        (await page.locator(".cm-line").first().textContent()).includes(
          "[site](https://example.com)",
        ),
      );
      assert.ok(
        !(await page.locator(".cm-line").first().textContent()).includes(
          "**bold**",
        ),
      );
      await page.evaluate(() => {
        editor.command("selectAll");
        editor.focus();
      });
      await page.keyboard.press("Control+c");
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        raw,
      );
      const heading = "# Heading **strong** and `code`";
      await page.evaluate((text) => {
        newEditor(text);
        editor.setSelection({ anchor: 5 });
      }, heading);
      assert.equal(
        await page.locator(".cm-inline-heading").textContent(),
        "Heading strong and code",
      );
      await page.evaluate(() => editor.setSelection({ anchor: 0 }));
      assert.ok(
        (await page.locator(".cm-inline-heading").textContent()).startsWith(
          "# ",
        ),
      );
      assert.equal(await page.evaluate(() => editor.getText()), heading);
      await page.evaluate(() => {
        editor.setSelection({ anchor: 5 });
        editor.setMode("source");
      });
      assert.equal(
        await page.locator(".cm-line").first().textContent(),
        heading,
      );
      await page.evaluate(() => editor.setMode("live"));
      await page.screenshot({
        path: path.join(artifacts, "inline-active-editing.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "Direct visual table cells edit exact source spans with IME, undo, Tab and row growth",
    async () => {
      const original =
        "\uFEFFBefore\r\n\r\n| A   | B |\r\n| :--- | ---: |\n| alpha  | beta |\r\n\r\nAfter <unknown>";
      await page.evaluate((text) => {
        newEditor(text);
        editor.setSelection({ anchor: editor.view.state.doc.length });
      }, original);
      await page
        .locator(".cm-live-block td")
        .filter({ hasText: "alpha" })
        .click();
      assert.equal(
        await page.locator(".inkstone-table-cell-editor").inputValue(),
        "alpha",
      );
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.imeSetComposition", {
        text: "zhongwen",
        selectionStart: 8,
        selectionEnd: 8,
      });
      await cdp.send("Input.imeSetComposition", {
        text: "中文",
        selectionStart: 2,
        selectionEnd: 2,
      });
      await cdp.send("Input.insertText", { text: "中文" });
      await cdp.detach();
      assert.equal(
        await page.evaluate(() => editor.getText()),
        original.replace("alpha", "中文"),
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), original);
      await page.keyboard.press("Control+Shift+z");
      assert.equal(
        await page.evaluate(() => editor.getText()),
        original.replace("alpha", "中文"),
      );
      await page.keyboard.press("Tab");
      assert.equal(
        await page.locator(".inkstone-table-cell-editor").inputValue(),
        "beta",
      );
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await page.locator(".inkstone-table-cell-editor").inputValue(),
        "中文",
      );
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      assert.equal(await page.locator(".cm-live-block tbody tr").count(), 2);
      await page.keyboard.type("new row");
      assert.match(
        await page.evaluate(() => editor.getText()),
        /\| new row \|  \|/,
      );
      assert.equal(
        await page.locator(".inkstone-table-cell-editor").inputValue(),
        "new row",
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".inkstone-table-cell-editor").count(),
        0,
      );
      assert.equal(
        await page
          .locator(".cm-live-block td")
          .filter({ hasText: "new row" })
          .count(),
        1,
      );
      const final = await page.evaluate(() => editor.getText());
      assert.ok(final.startsWith("\uFEFFBefore\r\n\r\n"));
      assert.ok(final.endsWith("\r\n\r\nAfter <unknown>"));
      await page.evaluate(() => {
        editor.setMode("source");
        editor.setMode("live");
      });
      assert.equal(await page.evaluate(() => editor.getText()), final);
      await page.screenshot({
        path: path.join(artifacts, "direct-table-editing.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "Live blocks preserve global links, footnotes, math labels and duplicate heading anchors",
    async () => {
      const raw =
        "# Same\n\n[external][ref] and note[^x]\n\n## Same\n\n$$a=1 \\label{one}$$\n\n$$b=2$$\n\n$\\eqref{one}$\n\n[ref]: https://example.com\n\n[^x]: 中文脚注\n\n";
      await page.evaluate((raw) => {
        newEditor(raw, { mathNumbering: true });
        editor.setSelection({ anchor: editor.view.state.doc.length });
      }, raw);
      assert.equal(
        await page
          .locator('.cm-live-block a[href="https://example.com"]')
          .count(),
        1,
      );
      assert.equal(await page.locator(".cm-live-block #same-1").count(), 1);
      assert.equal(await page.locator(".cm-live-block #fn1").count(), 1);
      assert.deepEqual(
        await page.locator(".equation-number").allTextContents(),
        ["(1)", "(2)"],
      );
      assert.equal(await page.locator(".math-error").count(), 0);
    },
  );
  await check(
    "Mermaid and legacy diagrams retain Chinese SVG labels, errors are visible",
    async () => {
      const text =
        "# 图表\n\n```mermaid\nflowchart LR\n A[中文] --> B[写作]\n```\n\n```sequence\nAlice->Bob: Hello\n```\n\n```flow\nst=>start: 开始\ne=>end: 结束\nst->e\n```\n\n```mermaid\nnot a diagram!\n```\n\n";
      await page.evaluate((text) => {
        newEditor(text);
        editor.setSelection({ anchor: editor.view.state.doc.length });
      }, text);
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.diagram[data-rendered="true"]').length ===
            3 &&
          document.querySelectorAll('.diagram[data-rendered="error"]')
            .length === 1,
        null,
        { timeout: 30000 },
      );
      const rendered = await page.locator(".diagram svg").allTextContents();
      assert.ok(
        rendered.some((text) => text.includes("中文") && text.includes("写作")),
      );
      assert.ok(rendered.some((text) => text.includes("Hello")));
      assert.ok(
        rendered.some((text) => text.includes("开始") && text.includes("结束")),
      );
      await page.setViewportSize({ width: 1200, height: 1500 });
      await page.evaluate(() => {
        document.querySelector("#editor").style.height = "1450px";
        editor.view.scrollDOM.scrollTop = 0;
      });
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(artifacts, "diagrams.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.evaluate(() => {
        document.querySelector("#editor").style.height = "850px";
      });
    },
  );
  await check(
    "Native legacy grammars render conditional flow styles, notes, aliases and all arrow types",
    async () => {
      const flow =
        'st=>start: 开始|past\ncond=>condition: 是否继续|current\nsub=>subroutine: 子过程|future\nio=>inputoutput: 输出|approved\ne=>end: 结束\nst->cond\ncond(yes,right)->sub->io->e\ncond(no,bottom)->e\nst@>cond({"stroke":"#c34b53","stroke-width":4})';
      const sequence =
        "Title: 交互流程\nparticipant 用户 as U\nparticipant 服务 as S\nNote left of U: 左侧说明\nNote over U,S: 共同说明\\n第二行\nU->S: 普通消息\nS-->U: 虚线回复\nU->>S: 开放箭头\nS-->>U: 虚线开放\nU->U: 自己处理";
      const rendered = await page.evaluate(
        async ({ flow, sequence }) => {
          const { renderMarkdown, hydrateDiagrams } =
            await import("/src/markdown.js");
          const host = document.createElement("div");
          document.body.append(host);
          host.innerHTML = renderMarkdown(
            "```flow\n" + flow + "\n```\n\n```sequence\n" + sequence + "\n```",
          );
          await hydrateDiagrams(host);
          const diagrams = [...host.querySelectorAll(".diagram")].map(
            (element) => ({
              engine: element.dataset.engine,
              state: element.dataset.rendered,
              text: element.querySelector("svg")?.textContent,
              svg: element.querySelector("svg")?.outerHTML,
              styled: Boolean(element.querySelector('path[stroke="#c34b53"]')),
              arrowheads: element.querySelectorAll("marker path").length,
              dashed: element.querySelectorAll("[stroke-dasharray]").length,
              error: element.querySelector("small")?.textContent,
            }),
          );
          host.remove();
          return diagrams;
        },
        { flow, sequence },
      );
      assert.deepEqual(
        rendered.map((item) => item.state),
        ["true", "true"],
        JSON.stringify(rendered),
      );
      assert.deepEqual(
        rendered.map((item) => item.engine),
        ["flowchart.js", "js-sequence-diagrams"],
      );
      for (const label of [
        "开始",
        "是否继续",
        "子过程",
        "输出",
        "结束",
        "yes",
        "no",
      ])
        assert.ok(rendered[0].text.includes(label), label);
      assert.ok(
        rendered[0].arrowheads >= 5,
        "flow arrowheads survive sanitization as self-contained paths",
      );
      assert.ok(
        rendered[1].arrowheads >= 4,
        "sequence arrowheads survive sanitization",
      );
      assert.ok(
        rendered[1].dashed >= 2,
        "sequence dashed arrow semantics retained",
      );
      assert.equal(
        rendered[0].styled,
        true,
        "flowchart source edge styling survives SVG sanitization",
      );
      for (const label of [
        "交互流程",
        "用户",
        "服务",
        "左侧说明",
        "共同说明",
        "第二行",
        "普通消息",
        "虚线回复",
        "开放箭头",
        "虚线开放",
        "自己处理",
      ])
        assert.ok(rendered[1].text.includes(label), label);
      await fs.writeFile(
        path.join(artifacts, "native-flow.svg"),
        rendered[0].svg,
      );
      await fs.writeFile(
        path.join(artifacts, "native-sequence.svg"),
        rendered[1].svg,
      );
      const html =
        '<!doctype html><meta charset="utf-8"><title>Native legacy diagrams export validation</title><style>body{font:16px sans-serif;padding:24px}svg{display:block;max-width:100%;height:auto}section{break-inside:avoid;margin-bottom:40px}</style>' +
        rendered
          .map(
            (item, index) =>
              "<section><h2>" +
              [
                "流程图 — 原生 flowchart.js",
                "时序图 — 原生 js-sequence-diagrams",
              ][index] +
              "</h2>" +
              item.svg +
              "</section>",
          )
          .join("");
      await fs.writeFile(path.join(artifacts, "native-legacy.html"), html);
      const exportPage = await context.newPage();
      await exportPage.setContent(html);
      await exportPage.evaluate(() => document.fonts.ready);
      await exportPage.pdf({
        path: path.join(artifacts, "native-legacy.pdf"),
        format: "A4",
        printBackground: true,
      });
      await exportPage.screenshot({
        path: path.join(artifacts, "native-legacy.png"),
        fullPage: true,
      });
      await exportPage.close();
    },
  );
  await check(
    "Offline sequence hand theme retains CJK labels and hand-drawn SVG geometry",
    async () => {
      await context.setOffline(true);
      const rendered = await page.evaluate(async () => {
        const { renderLegacyDiagram } = await import("/src/legacy-diagrams.js");
        const svg = await renderLegacyDiagram(
          "sequence",
          "Title: 手绘时序图\n用户->服务: 中文消息\nNote over 用户,服务: 不下载字体\n服务-->用户: 完成",
          { sequenceTheme: "hand" },
        );
        const host = document.createElement("div");
        host.innerHTML = svg;
        return {
          svg,
          text: host.textContent,
          paths: host.querySelectorAll("path").length,
          rectangles: host.querySelectorAll("rect").length,
          theme: host.querySelector("svg").dataset.sequenceTheme,
        };
      });
      await context.setOffline(false);
      for (const label of [
        "手绘时序图",
        "用户",
        "服务",
        "中文消息",
        "不下载字体",
        "完成",
      ])
        assert.ok(rendered.text.includes(label), label);
      assert.equal(rendered.theme, "hand");
      assert.equal(rendered.rectangles, 0);
      assert.ok(rendered.paths > 8);
      const html =
        '<!doctype html><meta charset="utf-8"><title>Offline hand sequence</title><style>body{padding:30px;font:18px sans-serif}svg{max-width:100%;height:auto}</style><h1>离线手绘时序图</h1>' +
        rendered.svg;
      await fs.writeFile(
        path.join(artifacts, "native-hand-sequence.svg"),
        rendered.svg,
      );
      const exportPage = await context.newPage();
      await exportPage.setContent(html);
      await exportPage.pdf({
        path: path.join(artifacts, "native-hand-sequence.pdf"),
        format: "A4",
        printBackground: true,
      });
      await exportPage.screenshot({
        path: path.join(artifacts, "native-hand-sequence.png"),
        fullPage: true,
      });
      await exportPage.close();
    },
  );
  await check(
    "Incremental paragraph edits keep following block clicks and references correct",
    async () => {
      await page.evaluate(() => {
        newEditor(
          "first paragraph\n\nsecond **bold** paragraph\n\n[ref][x]\n\n[x]: https://example.com\n",
        );
        editor.setSelection({ anchor: 6 });
        editor.insert("INSERT ");
      });
      const second = page
        .locator(".cm-live-block")
        .filter({ hasText: "second bold paragraph" });
      await second.click();
      const result = await page.evaluate(() => ({
        head: editor.getSelection().head,
        source: editor.getText(),
      }));
      assert.ok(
        result.head >= result.source.indexOf("second") &&
          result.head <= result.source.indexOf("[ref]"),
      );
      assert.equal(
        await page
          .locator('.cm-live-block a[href="https://example.com"]')
          .count(),
        1,
      );
    },
  );
  await check(
    "Optional Markdown pairing and input typography preserve source-mode text",
    async () => {
      await page.evaluate(() => {
        newEditor("", { autoPairMarkdown: true, smartPunctuationInput: true });
        editor.focus();
      });
      await page.keyboard.type("*");
      assert.equal(await page.evaluate(() => editor.getText()), "**");
      await page.keyboard.type("word");
      await page.keyboard.type("*");
      assert.equal(await page.evaluate(() => editor.getText()), "*word*");
      await page.keyboard.type(' \"quote\" --- ...');
      assert.equal(
        await page.evaluate(() => editor.getText()),
        "*word* “quote” — …",
      );
      await page.evaluate(() => {
        editor.setMode("source");
        editor.setSettings({ autoPair: false });
      });
      await page.keyboard.type(' \"raw\"');
      assert.ok(
        (await page.evaluate(() => editor.getText())).endsWith(' \"raw\"'),
      );
    },
  );
  await check(
    "Offline MathJax physics fallback and SVG glyphs survive browser rendering and export",
    async () => {
      const latex = [
        "\\qty(\\frac{x}{y})",
        "\\dv{x}{t}",
        "\\bbox[5px,border:2px solid red]{\\dv{x}{t}}",
        "\\begin{align}a&=b\\\\c&=d\\end{align}",
        "\\ce{SO4^2- + Ba^2+ -> BaSO4 v}",
      ];
      await context.setOffline(true);
      const result = await page.evaluate(async (latex) => {
        const { renderMarkdown } = await import("/src/markdown.js");
        const { renderMathJax } = await import("/src/mathjax.js");
        const host = document.createElement("div");
        host.innerHTML = renderMarkdown(
          latex
            .slice(0, 3)
            .map((code) => "$$" + code + "$$")
            .join("\n\n"),
        );
        document.body.append(host);
        const data = {
          errors: host.querySelectorAll(".math-error").length,
          fallback: host.querySelectorAll(".mathjax-fallback").length,
          paths: host.querySelectorAll(".mathjax-fallback path[d]").length,
          svg: latex.map((code) => renderMathJax(code, { displayMode: true })),
        };
        host.remove();
        return data;
      }, latex);
      await context.setOffline(false);
      assert.equal(result.errors, 0);
      assert.equal(result.fallback, 3);
      assert.ok(result.paths > 8);
      for (const svg of result.svg) {
        assert.match(svg, /<path[^>]+d="M/);
        assert.ok(!svg.includes("<use"));
      }
      const html =
        '<!doctype html><meta charset="utf-8"><title>Offline math compatibility</title><style>body{font:18px sans-serif;padding:30px}section{margin:30px 0;break-inside:avoid}svg{max-width:100%;height:auto}</style><h1>离线数学兼容验证</h1>' +
        result.svg
          .map(
            (svg, index) =>
              "<section><p>" +
              [
                "Physics quantity",
                "Physics derivative",
                "Bounding box",
                "AMS align",
                "Chemistry",
              ][index] +
              "</p>" +
              svg +
              "</section>",
          )
          .join("");
      await fs.writeFile(path.join(artifacts, "math-compatibility.html"), html);
      const exportPage = await context.newPage();
      await exportPage.setContent(html);
      await exportPage.evaluate(() => document.fonts.ready);
      await exportPage.pdf({
        path: path.join(artifacts, "math-compatibility.pdf"),
        format: "A4",
        printBackground: true,
      });
      await exportPage.screenshot({
        path: path.join(artifacts, "math-compatibility.png"),
        fullPage: true,
      });
      await exportPage.close();
      // Rendered blocks must not inherit CodeMirror's pre-wrap, which creates phantom vertical gaps.
      await page.evaluate(() => {
        newEditor("# Title\n\nA paragraph\n\n- one\n- two\n\n");
        editor.setSelection({ anchor: editor.view.state.doc.length });
      });
      assert.equal(
        await page
          .locator(".cm-live-block")
          .first()
          .evaluate((element) => getComputedStyle(element).whiteSpace),
        "normal",
      );
    },
  );
  await check(
    "Read-only mode blocks edits and retains copy, find, links, and explicit refresh",
    async () => {
      const raw = "# Read only\n\n- [ ] task\n\nA paragraph";
      await page.evaluate((raw) => {
        newEditor(raw, { readOnly: true });
        editor.focus();
      }, raw);
      assert.equal(
        await page.locator(".cm-content").getAttribute("contenteditable"),
        "false",
      );
      await page.keyboard.type("forbidden");
      assert.equal(await page.evaluate(() => editor.command("bold")), false);
      assert.equal(
        await page.evaluate(() => editor.insert("forbidden")),
        false,
      );
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      assert.equal(
        await page.locator("input.task-list-item-checkbox").isDisabled(),
        true,
      );
      await page.evaluate(() => {
        editor.command("selectAll");
        editor.focus();
      });
      await page.keyboard.press("Control+c");
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        raw,
      );
      await page.evaluate(() => editor.command("find"));
      assert.equal(await page.locator(".cm-search").count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate(() => {
          const before = document.querySelector(".cm-live-block");
          editor.command("refresh");
          return before !== document.querySelector(".cm-live-block");
        }),
        true,
      );
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      await page.evaluate(() => {
        editor.setSettings({ readOnly: false });
        editor.setSelection({ anchor: editor.view.state.doc.length });
        editor.insert(" allowed");
      });
      assert.equal(
        await page.evaluate(() => editor.getText()),
        raw + " allowed",
      );
    },
  );
  await check(
    "Grouped undo/redo restores every intermediate BOM and mixed LF/CRLF/CR layout",
    async () => {
      const result = await page.evaluate(() => {
        const original = "\uFEFFa\r\nb\nc\rd\r\n";
        newEditor(original);
        editor.view.dispatch({
          changes: { from: 1, to: 4, insert: "\nA\n" },
          userEvent: "input.type",
        });
        editor.view.dispatch({
          changes: { from: 4, insert: "b\n" },
          userEvent: "input.type.compose",
        });
        editor.view.dispatch({
          changes: { from: 5, to: 8, insert: "\nC\n" },
          userEvent: "input.type.compose",
        });
        const grouped = editor.getText();
        editor.view.dispatch({
          changes: { from: 0, to: 3, insert: "pasted\n\n" },
          userEvent: "input.paste",
        });
        const pasted = editor.getText();
        editor.setMode("source");
        editor.setMode("live");
        const undo = [];
        editor.command("undo");
        undo.push(editor.getText());
        editor.command("undo");
        undo.push(editor.getText());
        const redo = [];
        editor.command("redo");
        redo.push(editor.getText());
        editor.command("redo");
        redo.push(editor.getText());
        return { original, grouped, pasted, undo, redo };
      });
      assert.deepEqual(result.undo, [result.grouped, result.original]);
      assert.deepEqual(result.redo, [result.grouped, result.pasted]);
    },
  );
  await check(
    "Source structural commands preserve mixed EOL, nested blocks and one-step undo",
    async () => {
      const raw =
        "\uFEFFFirst 中文。\r\nFirst second.\n\n- one\r\n  - nested\n\nLast sentence。 Another.\r\n";
      const moved =
        "\uFEFF- one\r\n  - nested\n\nFirst 中文。\r\nFirst second.\n\nLast sentence。 Another.\r\n";
      await page.evaluate((raw) => {
        newEditor(raw);
        editor.setMode("source");
        editor.setSelection({
          anchor: editor.view.state.doc.toString().indexOf("nested") + 2,
        });
        editor.command("moveParagraphUp");
      }, raw);
      assert.equal(await page.evaluate(() => editor.getText()), moved);
      assert.equal(
        await page.evaluate(() =>
          editor.view.state.sliceDoc(
            editor.getSelection().head - 2,
            editor.getSelection().head + 4,
          ),
        ),
        "nested",
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      await page.keyboard.press("Control+Shift+z");
      assert.equal(await page.evaluate(() => editor.getText()), moved);
      await page.evaluate(() => editor.command("moveParagraphDown"));
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      await page.evaluate(() => editor.command("deleteBlock"));
      assert.equal(
        await page.evaluate(() => editor.getText()),
        raw.replace("- one\r\n  - nested\n\n", ""),
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      await page.evaluate(() => {
        editor.setSelection({
          anchor: editor.view.state.doc.toString().indexOf("Last") + 2,
        });
        editor.command("deleteSentence");
      });
      assert.equal(
        await page.evaluate(() => editor.getText()),
        raw.replace("Last sentence。 ", ""),
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      await page.evaluate(() => {
        editor.setSelection({
          anchor: editor.view.state.doc.toString().indexOf("中文"),
        });
        editor.command("deleteWord");
      });
      assert.equal(
        await page.evaluate(() => editor.getText()),
        raw.replace("中文", ""),
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      await page.evaluate(() => {
        newEditor("A **bold *nested*** text");
        editor.setMode("source");
        editor.setSelection({ anchor: 12 });
        editor.command("clearFormatting");
      });
      assert.equal(
        await page.evaluate(() => editor.getText()),
        "A **bold nested** text",
      );
      await page.keyboard.press("Control+z");
      assert.equal(
        await page.evaluate(() => editor.getText()),
        "A **bold *nested*** text",
      );
    },
  );
  await check(
    "Code wrapping preference changes layout without modifying code source",
    async () => {
      const text =
        '```javascript\nconst long = "' + "longword".repeat(50) + '";\n```\n\n';
      await page.evaluate((text) => {
        newEditor(text, { codeWrap: true });
        editor.setSelection({ anchor: editor.view.state.doc.length });
      }, text);
      assert.equal(
        await page
          .locator(".code-block pre")
          .evaluate((element) => getComputedStyle(element).whiteSpace),
        "pre-wrap",
      );
      await page.evaluate(() => editor.setSettings({ codeWrap: false }));
      assert.equal(
        await page
          .locator(".code-no-wrap pre")
          .evaluate((element) => getComputedStyle(element).whiteSpace),
        "pre",
      );
      assert.equal(await page.evaluate(() => editor.getText()), text);
    },
  );
  await check(
    "Strict heading and CJK punctuation settings agree between active and inactive rendering",
    async () => {
      const raw = "#中文标题\n\n开头 **文字。**后面 `**代码。**`\n\n";
      await page.evaluate((raw) => {
        newEditor(raw, { strictMarkdown: true, cjkEmphasis: false });
        editor.setSelection({ anchor: editor.view.state.doc.length });
      }, raw);
      assert.equal(await page.locator(".cm-live-block h1").count(), 0);
      await page.evaluate(() =>
        editor.setSettings({ strictMarkdown: false, cjkEmphasis: true }),
      );
      assert.equal(
        await page.locator(".cm-live-block h1").textContent(),
        "中文标题",
      );
      assert.equal(
        await page.locator(".cm-live-block strong").textContent(),
        "文字。",
      );
      await page.evaluate(() => editor.setSelection({ anchor: 3 }));
      assert.equal(
        await page.locator(".cm-inline-heading").textContent(),
        "中文标题",
      );
      await page.evaluate(() =>
        editor.setSelection({
          anchor: editor.view.state.doc.toString().indexOf("开头") + 1,
        }),
      );
      assert.equal(
        await page.locator(".cm-inline-strong").textContent(),
        "文字。",
      );
      assert.ok(
        !(
          await page
            .locator(".cm-line")
            .filter({ hasText: "开头" })
            .textContent()
        ).includes("**文字。**"),
      );
      assert.ok(
        (await page.locator(".cm-inline-code").textContent()).includes(
          "**代码。**",
        ),
      );
      await page.evaluate(() =>
        editor.setSettings({ cjkEmphasis: false, strictMarkdown: true }),
      );
      assert.ok(
        (
          await page
            .locator(".cm-line")
            .filter({ hasText: "开头" })
            .textContent()
        ).includes("**文字。**"),
      );
      assert.equal(await page.evaluate(() => editor.getText()), raw);
    },
  );
  await check(
    "Visual cells support formatting shortcuts and safe plain-text or TSV clipboard paste",
    async () => {
      const raw =
        "Before\n\n| A | B |\n| --- | --- |\n| alpha | beta |\n\nAfter";
      await page.evaluate((raw) => {
        newEditor(raw);
        editor.setSelection({ anchor: editor.view.state.doc.length });
      }, raw);
      await page
        .locator(".cm-live-block td")
        .filter({ hasText: "alpha" })
        .click();
      await page.keyboard.press("Control+b");
      assert.equal(
        await page.evaluate(() => editor.getText()),
        raw.replace("alpha", "**alpha**"),
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), raw);
      await page.keyboard.press("Control+a");
      await page.evaluate(() => navigator.clipboard.writeText("a|b\nsecond"));
      await page.keyboard.press("Control+v");
      assert.equal(
        await page.evaluate(() => editor.getText()),
        raw.replace("alpha", "a\\|b<br>second"),
      );
      assert.equal(await page.locator(".cm-live-block tbody td").count(), 2);
      await page.keyboard.press("Control+a");
      await page.evaluate(() =>
        navigator.clipboard.writeText("一\t二\n三\t四"),
      );
      await page.keyboard.press("Control+v");
      const result = await page.evaluate(() => editor.getText());
      assert.match(result, /\| 一 \| 二 \|\n\| 三 \| 四 \|/);
      assert.ok(result.startsWith("Before\n\n"));
      assert.ok(result.endsWith("\n\nAfter"));
    },
  );
  const performanceResult = await page.evaluate(() => {
    const line =
      "这是长文档性能验证 paragraph with **Markdown** and ordinary text. ".repeat(
        3,
      );
    const text = Array.from(
      { length: 5000 },
      (_, i) => `${i} ${line}\n\n`,
    ).join("");
    const begin = performance.now();
    newEditor(text);
    const opened = performance.now();
    editor.setSelection({ anchor: Math.floor(text.length / 2) });
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      editor.insert("字");
      samples.push(performance.now() - start);
    }
    const switchStart = performance.now();
    editor.setMode("source");
    editor.setMode("live");
    const switched = performance.now() - switchStart;
    const sourceStart = performance.now();
    editor.setMode("source");
    editor.insert("源");
    const sourceEdit = performance.now() - sourceStart;
    return {
      characters: text.length,
      bytes: new TextEncoder().encode(text).length,
      lines: text.split("\n").length,
      openMs: opened - begin,
      liveEditSamplesMs: samples,
      modeRoundTripMs: switched,
      sourceSwitchAndEditMs: sourceEdit,
    };
  });
  await fs.writeFile(
    path.join(artifacts, "performance.json"),
    JSON.stringify(performanceResult, null, 2),
  );
  console.log("PERFORMANCE", JSON.stringify(performanceResult));
  assert.equal(errors.length, 0, errors.join("\n"));
  await fs.rm(path.join(artifacts, "failure.json"), { force: true });
  await fs.rm(path.join(artifacts, "failure.png"), { force: true });
  await fs.writeFile(
    path.join(artifacts, "results.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        checks: results,
        performance: performanceResult,
        browserErrors: errors,
        imeScope:
          "Chromium CDP composition protocol; native OS IME candidates and language-switch integration remain manual validation.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: path.join(artifacts, "failure.png"),
    fullPage: true,
  });
  await fs.writeFile(
    path.join(artifacts, "failure.json"),
    JSON.stringify(
      { error: error.stack, results, browserErrors: errors },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
