import { artifactPath } from "../scripts/artifact-path.mjs";
/** Visual and interaction checks for document typography, using production CSS. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const artifacts = artifactPath("ui-redesign/editor");
await fs.mkdir(artifacts, { recursive: true });
const executablePath = process.env.INKSTONE_CHROMIUM || undefined;
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: "node_modules/.vite-editor-design",
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
  viewport: { width: 1100, height: 900 },
  deviceScaleFactor: 1.5,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/editor-design", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><head><meta charset="utf-8"><title>Inkstone editor design verification</title></head><body><div id="editor" style="height:100vh"></div></body></html>',
  }),
);
await page.goto(url + "/editor-design");
await page.evaluate(async () => {
  const module = await import("/src/editor.js");
  await import("/node_modules/katex/dist/katex.min.css");
  await import("/node_modules/highlight.js/styles/github.css");
  await import("/src/styles.css");
  window.newEditor = (text, settings = {}) => {
    window.editor?.destroy?.();
    window.editor = module.createEditor(document.querySelector("#editor"), {
      text,
      settings,
    });
    editor.setSelection({ anchor: editor.view.state.doc.length });
    return window.editor;
  };
});

async function check(name, fn) {
  const detail = await fn();
  results.push({ name, result: "passed", ...(detail ? { detail } : {}) });
  console.log("PASS", name);
}
async function open(text, theme = "light", settings = {}) {
  await page.evaluate(
    ({ text, theme, settings }) => {
      document.documentElement.dataset.theme = theme;
      newEditor(text, { ...settings, theme });
    },
    { text, theme, settings },
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
function contrast(a, b) {
  const luminance = (rgb) =>
    rgb
      .slice(0, 3)
      .map((value) => {
        value /= 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const fixture = [
  "# A place for careful writing",
  "Inkstone keeps the document at the centre. Write in **English and 中文** with clear hierarchy, measured spacing and familiar keyboard controls.",
  "## Notes worth keeping",
  "Local files remain yours. A formula such as $\\frac{x}{y}$ can be edited directly, and [references](https://example.com) remain easy to recognize.",
  "> A quiet interface should make the writing easier to see.",
  "- Start with a clear thought\n  - Keep the original Markdown intact\n- [x] Review the details",
  '```javascript\n// Keep source readable in both themes.\nconst title = "中文笔记";\nfunction save(document) { return document.length > 0; }\n```',
  "| Section | Status |\n| --- | --- |\n| Typography | Ready |\n| Mathematics | Editable |",
  "$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$",
  "End of the example.",
].join("\n\n");

try {
  await check(
    "Editing headings preserves their size and following-content position",
    async () => {
      const geometry = [];
      for (let level = 1; level <= 6; level++) {
        const text = `${"#".repeat(level)} Heading 标题\n\nFollowing paragraph\n\nEnd`;
        await open(text);
        const heading = page.locator(`.cm-live-block h${level}`);
        const before = await heading.evaluate((element) => ({
          font: getComputedStyle(element).fontSize,
          weight: getComputedStyle(element).fontWeight,
          height: element.closest(".cm-live-block").getBoundingClientRect()
            .height,
          followingTop: document
            .querySelector(".cm-live-block p")
            .getBoundingClientRect().top,
        }));
        await heading.click();
        const after = await page
          .locator(`.cm-inline-h${level}`)
          .evaluate((element) => ({
            font: getComputedStyle(element).fontSize,
            weight: getComputedStyle(element).fontWeight,
            height: element.getBoundingClientRect().height,
            followingTop: document
              .querySelector(".cm-live-block p")
              .getBoundingClientRect().top,
          }));
        assert.equal(after.font, before.font);
        assert.equal(after.weight, before.weight);
        assert.ok(
          Math.abs(before.followingTop - after.followingTop) < 2,
          `H${level}: ${JSON.stringify({ before, after })}`,
        );
        assert.equal(await page.evaluate(() => editor.getText()), text);
        geometry.push({ level, before, after });
      }
      return geometry;
    },
  );

  await check(
    "User writing and code fonts survive active and rendered states",
    async () => {
      await page.evaluate(() =>
        document.documentElement.style.setProperty(
          "--code-font",
          '"Liberation Mono", monospace',
        ),
      );
      await open(
        "# Custom size\n\nInline `code`\n\n```js\nconst value = 1;\n```\n\nEnd",
        "light",
        {
          fontSize: 20,
          fontFamily: '"Noto Sans", sans-serif',
          lineHeight: 1.8,
        },
      );
      assert.equal(
        await page
          .locator(".cm-editor")
          .evaluate((element) => getComputedStyle(element).fontSize),
        "20px",
      );
      for (const selector of [".cm-live-block p code", ".cm-code-line"]) {
        assert.match(
          await page
            .locator(selector)
            .evaluate((element) => getComputedStyle(element).fontFamily),
          /Liberation Mono/,
        );
      }
      await page
        .locator(".cm-live-block p")
        .filter({ hasText: "Inline" })
        .click();
      assert.match(
        await page
          .locator(".cm-inline-code")
          .evaluate((element) => getComputedStyle(element).fontFamily),
        /Liberation Mono/,
      );
      const before = await page.evaluate(() => editor.getText());
      await page.evaluate(() => editor.setMode("source"));
      assert.match(
        await page
          .locator(".cm-scroller")
          .evaluate((element) => getComputedStyle(element).fontFamily),
        /Liberation Mono/,
      );
      await page.evaluate(() => editor.setMode("live"));
      assert.equal(await page.evaluate(() => editor.getText()), before);
      await page.evaluate(() =>
        document.documentElement.style.removeProperty("--code-font"),
      );
    },
  );

  await check(
    "Rendered code and formula errors remain readable in light and dark themes",
    async () => {
      const ratios = [];
      for (const theme of ["light", "dark"]) {
        await open(fixture + "\n\n$$\\unknowncommand{bad}$$\n\nEnd", theme);
        for (const selector of [
          ".cm-code-line",
          '.cm-code-line span:text-is("// Keep source readable in both themes.")',
          '.cm-code-line span:text-is("const")',
          '.cm-code-line span:text-is("\\"中文笔记\\"")',
          '.cm-code-line span:text-is("save")',
          ".math-error",
        ]) {
          const colors = await page
            .locator(selector)
            .first()
            .evaluate((element) => {
              const rgb = (color) =>
                [...color.matchAll(/[\d.]+/g)].map((match) => Number(match[0]));
              let background = [255, 255, 255];
              const chain = [];
              for (let node = element; node; node = node.parentElement)
                chain.unshift(node);
              for (const node of chain) {
                const current = rgb(getComputedStyle(node).backgroundColor);
                // color-mix backgrounds are serialized as color(srgb ...).
                const value = getComputedStyle(node).backgroundColor;
                if (value.startsWith("color(srgb")) {
                  const channels = current
                    .slice(0, 3)
                    .map((channel) => channel * 255);
                  const alpha = current[3] ?? 1;
                  background = channels.map(
                    (channel, index) =>
                      channel * alpha + background[index] * (1 - alpha),
                  );
                } else if (current.length >= 3) {
                  const alpha = current[3] ?? 1;
                  background = current
                    .slice(0, 3)
                    .map(
                      (channel, index) =>
                        channel * alpha + background[index] * (1 - alpha),
                    );
                }
              }
              return {
                foreground: rgb(getComputedStyle(element).color),
                background,
              };
            });
          const ratio = contrast(colors.foreground, colors.background);
          assert.ok(
            ratio >= 4.5,
            `${theme} ${selector}: ${ratio.toFixed(2)}:1`,
          );
          ratios.push({ theme, selector, contrast: Number(ratio.toFixed(2)) });
        }
        await page.screenshot({
          path: path.join(artifacts, `structures-${theme}-150dpi.png`),
        });
        await page.evaluate(() => {
          editor.view.scrollDOM.scrollTop = 0;
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await page.screenshot({
          path: path.join(artifacts, `document-${theme}-150dpi.png`),
        });
      }
      return ratios;
    },
  );

  await check(
    "Source syntax stays readable while theme switches preserve selection and undo",
    async () => {
      const text =
        '# Source typography\n\n**English and 中文** with [links](https://example.com).\n\n```javascript\n// A source comment\nconst value = "中文笔记";\nfunction save(document) { return document.length > 0; }\n```\n\nEnd';
      await open(text);
      await page.evaluate(() => {
        editor.setMode("source");
        editor.insert(" edited");
        editor.view.scrollDOM.scrollTop = 0;
      });
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".cm-line span")].some(
          (span) => span.textContent === "const",
        ),
      );
      const originalSelection = await page.evaluate(() =>
        editor.getSelection(),
      );
      const ratios = [];
      for (const theme of ["light", "dark"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          editor.setSettings({ theme });
        }, theme);
        const colors = await page
          .locator(".cm-line span")
          .evaluateAll((elements) => {
            const rgb = (color) =>
              [...color.matchAll(/[\d.]+/g)].map((match) => Number(match[0]));
            const background = rgb(
              getComputedStyle(document.body).backgroundColor,
            );
            return elements
              .filter((element) => element.textContent.trim())
              .map((element) => ({
                text: element.textContent,
                foreground: rgb(getComputedStyle(element).color),
                background,
              }));
          });
        assert.ok(
          colors.length > 8,
          "Source code syntax must finish loading before checking its colors",
        );
        for (const token of colors) {
          const ratio = contrast(token.foreground, token.background);
          assert.ok(
            ratio >= 4.5,
            `${theme} ${token.text}: ${ratio.toFixed(2)}:1`,
          );
          ratios.push({
            theme,
            text: token.text,
            contrast: Number(ratio.toFixed(2)),
          });
        }
        assert.deepEqual(
          await page.evaluate(() => editor.getSelection()),
          originalSelection,
        );
        assert.equal(
          await page.evaluate(() => editor.getText()),
          text + " edited",
        );
        await page.screenshot({
          path: path.join(artifacts, `source-${theme}-150dpi.png`),
        });
      }
      await page.evaluate(() => editor.command("undo"));
      assert.equal(await page.evaluate(() => editor.getText()), text);
      await page.evaluate(() => editor.command("redo"));
      assert.equal(
        await page.evaluate(() => editor.getText()),
        text + " edited",
      );
      return ratios;
    },
  );

  await check(
    "Formula re-entry, source synchronization and undo work with themed typography",
    async () => {
      for (const theme of ["light", "dark"]) {
        const text =
          "Start\n\nBefore $\\frac{x}{y}$ after.\n\n$$\na^2+b^2=c^2\n$$\n\nEnd";
        await open(text, theme);
        const math = page.locator(".cm-live-block .math-inline");
        assert.equal(
          await math.evaluate((element) => getComputedStyle(element).display),
          "inline-block",
        );
        await math.dblclick();
        assert.equal(
          await page.locator(".cm-math-source").textContent(),
          "$\\frac{x}{y}$",
        );
        assert.equal(await page.locator(".cm-inline-math-preview").count(), 0);
        await page.keyboard.type("z^2");
        assert.equal(
          await page.evaluate(() => editor.getText()),
          text.replace("\\frac{x}{y}", "z^2"),
        );
        await page.keyboard.press("Control+Enter");
        assert.equal(
          await page
            .locator(".cm-math-source, .cm-inline-math-preview")
            .count(),
          0,
        );
        assert.equal(await page.locator(".cm-inline-math .katex").count(), 1);
        await page.keyboard.press("Control+z");
        assert.equal(await page.evaluate(() => editor.getText()), text);
        await page.evaluate(() =>
          editor.setSelection({ anchor: editor.view.state.doc.length }),
        );
        await page.locator(".cm-live-block .math-display").dblclick();
        await page.keyboard.type("E=mc^2");
        await page.keyboard.press("Control+Enter");
        const modified = text.replace("a^2+b^2=c^2", "E=mc^2");
        assert.equal(await page.evaluate(() => editor.getText()), modified);
        await page.evaluate(() => {
          editor.setMode("source");
          editor.setMode("live");
        });
        assert.equal(await page.evaluate(() => editor.getText()), modified);
      }
    },
  );

  await check(
    "Search keeps visible focus and wraps controls in a narrow editor",
    async () => {
      await page.setViewportSize({ width: 540, height: 700 });
      await open(fixture, "dark");
      await page.evaluate(() => editor.command("find"));
      const search = page.locator('.cm-search input[name="search"]');
      await search.fill("writing");
      assert.equal(
        await search.evaluate((element) => document.activeElement === element),
        true,
      );
      assert.equal(
        await search.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
        "solid",
      );
      const geometry = await page.locator(".cm-search").evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      assert.ok(
        geometry.scroll <= geometry.client + 1,
        JSON.stringify(geometry),
      );
      assert.equal(
        await page
          .locator(".cm-button")
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundImage),
        "none",
      );
      await page.screenshot({
        path: path.join(artifacts, "search-dark-narrow.png"),
      });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".cm-search").count(), 0);
      assert.equal(await page.evaluate(() => editor.getText()), fixture);
    },
  );

  await check(
    "Table cell focus remains visible and Tab plus undo preserve the Markdown",
    async () => {
      await page.setViewportSize({ width: 800, height: 800 });
      const text =
        "Before\n\n| Name | Status |\n| --- | --- |\n| alpha | beta |\n\nAfter";
      await open(text, "dark");
      await page
        .locator(".cm-live-block td")
        .filter({ hasText: "alpha" })
        .click();
      const cell = page.locator(".inkstone-active-cell");
      assert.equal(
        await cell.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
        "solid",
      );
      await page.keyboard.press("Control+a");
      await page.keyboard.type("changed");
      await page.keyboard.press("Tab");
      assert.equal(
        await page.locator(".inkstone-table-cell-editor").inputValue(),
        "beta",
      );
      assert.equal(
        await page.evaluate(() => editor.getText()),
        text.replace("alpha", "changed"),
      );
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => editor.getText()), text);
      await page.screenshot({
        path: path.join(artifacts, "table-dark-800.png"),
      });
    },
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  await fs.writeFile(
    path.join(artifacts, "results.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        checks: results,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  await fs.rm(path.join(artifacts, "failure.json"), { force: true });
  await fs.rm(path.join(artifacts, "failure.png"), { force: true });
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, "failure.png") });
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
