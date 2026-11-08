import test from "node:test";
import assert from "node:assert/strict";
import {
  SourceDocument,
  normalizeSource,
  wordStatistics,
} from "../src/source.js";
import {
  splitTableRow,
  locateTable,
  modifyTable,
  nextTableCell,
  createTable,
  tableCellRanges,
} from "../src/tables.js";

test("unmodified source is identical including BOM, CRLF, YAML, unknown syntax and HTML", () => {
  const raw =
    '\uFEFF---\r\ntitle: 中文\r\n---\r\n\r\n<custom x="&">  未知</custom>\n\n![图](../资源/图.png)  \r\n';
  const source = new SourceDocument(raw);
  assert.equal(source.raw, raw);
  assert.equal(source.normalized, normalizeSource(raw));
});
test("local editing preserves all unaffected original bytes and mixed line endings", () => {
  const raw = "\uFEFF# 标题\r\n\r\n第一段\n第二段\r\n";
  const source = new SourceDocument(raw);
  const from = source.normalized.indexOf("第一段");
  source.apply([{ from, to: from + 3, insert: "修改后的段落" }]);
  assert.equal(source.raw, raw.replace("第一段", "修改后的段落"));
});
test("undo restores exact mixed-EOL source after multiline replacement", () => {
  const raw = "\uFEFFone\r\ntwo\nthree\r\n";
  const source = new SourceDocument(raw);
  const before = source.normalized;
  const layout = source.getLayout();
  source.apply([{ from: 0, to: before.length, insert: "new\ntext" }]);
  source.apply([
    {
      from: 0,
      to: source.normalized.length,
      insert: before,
      eols: layout.eols,
    },
  ]);
  assert.equal(source.raw, raw);
});
test("multiple simultaneous replacements use old source coordinates", () => {
  const source = new SourceDocument("a\r\nb\r\nc");
  source.apply([
    { from: 0, to: 1, insert: "AA" },
    { from: 4, to: 5, insert: "CC" },
  ]);
  assert.equal(source.raw, "AA\r\nb\r\nCC");
});
test("Chinese and English statistics handle characters without treating Chinese as one word", () => {
  const result = wordStatistics("你好 world today\n🙂");
  assert.equal(result.words, 4);
  assert.equal(result.cjk, 2);
  assert.equal(result.lines, 2);
  assert.equal(result.characters, 16);
});
test("table cells preserve escaped pipes and inline code pipes", () => {
  assert.deepEqual(splitTableRow("| a\\|b | `c|d` | ``x`|y`` |"), [
    "a\\|b",
    "`c|d`",
    "``x`|y``",
  ]);
});
test("table operation modifies only table source range", () => {
  const table = "| A | B |\n| --- | --- |\n| 一 | 二 |";
  const text = `before\n\n${table}\n\nafter`;
  const position = text.indexOf("一");
  const change = modifyTable(text, position, "addColumn");
  const next =
    text.slice(0, change.from) + change.insert + text.slice(change.to);
  assert.equal(change.from, 8);
  assert.ok(next.startsWith("before\n\n"));
  assert.ok(next.endsWith("\n\nafter"));
  assert.equal(locateTable(next, position).width, 3);
});
test("table alignment and row reordering are real source edits", () => {
  const text = "| A | B |\n| --- | --- |\n| one | two |\n| three | four |";
  const aligned = modifyTable(text, text.indexOf("two"), "align", "center");
  assert.match(aligned.insert, /\| --- \| :---: \|/);
  const reordered = modifyTable(text, text.indexOf("three"), "rowUp");
  assert.ok(
    reordered.insert.indexOf("three") < reordered.insert.indexOf("one"),
  );
});
test("TSV paste grows rows and columns and escapes raw pipes", () => {
  const text = "| A | B |\n| --- | --- |\n| x | y |";
  const changed = modifyTable(
    text,
    text.indexOf("x"),
    "paste",
    "one\ttwo\tthree\nfour\tfive\tsix|seven",
  );
  assert.match(changed.insert, /six\\\|seven/);
  assert.equal(locateTable(changed.insert, 0).width, 3);
});
test("Tab skips table delimiter and appends final row", () => {
  const text = "| A | B |\n| --- | --- |\n| x | y |";
  const first = nextTableCell(text, text.indexOf("B"));
  assert.equal(text[first.position], "x");
  const last = nextTableCell(text, text.indexOf("y"));
  assert.ok(last.change);
  assert.equal(last.change.insert.split("\n").length, 4);
});
test("table creation is bounded and valid", () => {
  assert.equal(createTable(2, 3).split("\n").length, 4);
  assert.equal(locateTable(createTable(2, 3), 0).width, 3);
});
test("mixed LF/CRLF/CR metadata restores arbitrary inserted ranges without full-text snapshots", () => {
  const raw = "\uFEFFone\r\ntwo\nthree\rfour\r\n";
  const source = new SourceDocument(raw);
  const layout = source.getLayout();
  assert.equal(layout.eols, "CLRC");
  source.apply([
    { from: 0, to: source.normalized.length, insert: "changed\ntext\n" },
  ]);
  source.apply([
    {
      from: 0,
      to: source.normalized.length,
      insert: "one\ntwo\nthree\nfour\n",
      eols: layout.eols,
    },
  ]);
  assert.equal(source.raw, raw);
  assert.equal(source.snapshots, undefined);
});

test("visual table source spans retain whitespace, escaped pipes and code spans", () => {
  const text = "| A   | B |\n| :--- | ---: |\n| alpha  | \\| \n|  | `x|y` |";
  const rows = tableCellRanges(text);
  assert.equal(text.slice(rows[2][0].from, rows[2][0].to), "alpha");
  assert.equal(text.slice(rows[2][1].from, rows[2][1].to), "\\|");
  assert.equal(rows[3][0].from, text.lastIndexOf("|  |") + 2);
  assert.equal(rows[3][1].text, "`x|y`");
  const edited =
    text.slice(0, rows[2][0].from) + "中文" + text.slice(rows[2][0].to);
  assert.equal(edited, text.replace("alpha", "中文"));
});
