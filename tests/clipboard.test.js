import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { htmlToMarkdown } = await import("../src/clipboard.js");
const { renderMarkdown } = await import("../src/markdown.js");
test.after(() => dom.window.close());

const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const tableHTML = (headers, rows) =>
  `<table><thead><tr>${headers.map((value) => `<th>${value}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
function roundtrip(html) {
  const markdown = htmlToMarkdown(html);
  const element = document.createElement("div");
  element.innerHTML = renderMarkdown(markdown);
  assert.equal(
    element.querySelectorAll("table").length,
    1,
    "HTML table must remain a table after Markdown conversion and rendering",
  );
  return { markdown, element, table: element.querySelector("table") };
}
const cellText = (table) =>
  [...table.rows].map((row) => [...row.cells].map((cell) => cell.textContent));

test("large copied code with many backtick runs does not overflow the call stack", () => {
  const code = "x`".repeat(150000) + "\n`````\nend";
  const markdown = htmlToMarkdown(`<pre><code>${escape(code)}</code></pre>`);
  assert.equal(markdown, "``````\n" + code + "\n``````");
});

test("external HTML table preserves literal heading and cell pipes without inventing columns", () => {
  const { table } = roundtrip(
    tableHTML(
      ["A|B", "中文列"],
      [
        ["left|right", "unchanged"],
        ["||", "最后"],
      ],
    ),
  );
  assert.deepEqual(cellText(table), [
    ["A|B", "中文列"],
    ["left|right", "unchanged"],
    ["||", "最后"],
  ]);
});

test("table text retains every backslash immediately before a literal pipe", () => {
  for (let count = 0; count <= 4; count++) {
    const value = "before" + "\\".repeat(count) + "|after";
    const { table } = roundtrip(
      tableHTML(["Value", "Neighbor"], [[escape(value), "keep-me"]]),
    );
    assert.deepEqual(
      cellText(table),
      [
        ["Value", "Neighbor"],
        [value, "keep-me"],
      ],
      `${count} literal backslashes`,
    );
  }
});

test("inline code table cells retain pipe characters, backslashes and backtick delimiters", () => {
  const values = [
    "left|right",
    "left\\|right",
    "left\\\\|right",
    "`tick`|value",
    "``tick`|\\value``",
  ];
  for (const value of values) {
    const { table } = roundtrip(
      tableHTML(
        ["Code", "Neighbor"],
        [[`<code>${escape(value)}</code>`, "untouched"]],
      ),
    );
    assert.deepEqual(
      cellText(table),
      [
        ["Code", "Neighbor"],
        [value, "untouched"],
      ],
      value,
    );
    assert.equal(
      table.querySelector("td code")?.textContent,
      value,
      "cell remains inline code",
    );
  }
});

test("table pipe preservation composes with strong, emphasis and link formatting", () => {
  const target = "https://example.com/path|part?first=one|two";
  const { table } = roundtrip(
    tableHTML(
      ["Strong", "Emphasis", "Link"],
      [
        [
          "<strong>A|B</strong>",
          "<em>C\\|D</em>",
          `<a href="${target}">site|label</a>`,
        ],
      ],
    ),
  );
  assert.deepEqual(cellText(table), [
    ["Strong", "Emphasis", "Link"],
    ["A|B", "C\\|D", "site|label"],
  ]);
  assert.equal(table.querySelector("strong")?.textContent, "A|B");
  assert.equal(table.querySelector("em")?.textContent, "C\\|D");
  assert.equal(
    decodeURI(table.querySelector("a")?.getAttribute("href")),
    target,
  );
});

test("pipes around nested inline spans stay in the original table cell", () => {
  const { table } = roundtrip(
    tableHTML(
      ["Content", "Neighbor"],
      [["<span>left|<strong>bold\\|middle</strong>|right</span>", "stable"]],
    ),
  );
  assert.deepEqual(cellText(table), [
    ["Content", "Neighbor"],
    ["left|bold\\|middle|right", "stable"],
  ]);
  assert.equal(table.querySelector("strong")?.textContent, "bold\\|middle");
});

test("escaping table pipes never rewrites literal pipes or backslashes in code outside the table", () => {
  const code = "outside | \\| `quoted`\nnext";
  const html =
    `<p>Outside | literal \\| text</p><pre><code>${escape(code)}</code></pre>` +
    tableHTML(["Cell", "Neighbor"], [["table|value", "safe"]]);
  const { table, element } = roundtrip(html);
  assert.deepEqual(cellText(table), [
    ["Cell", "Neighbor"],
    ["table|value", "safe"],
  ]);
  assert.equal(
    element.querySelector("p")?.textContent,
    "Outside | literal \\| text",
  );
  // The renderer displays its final empty code line with a placeholder space.
  // Compare with the exact literal code rendered directly, preserving every
  // source pipe and backslash without trimming meaningful code whitespace.
  const reference = document.createElement("div");
  reference.innerHTML = renderMarkdown("```\n" + code + "\n```");
  assert.equal(
    element.querySelector("pre code")?.textContent,
    reference.querySelector("pre code")?.textContent,
  );
});
