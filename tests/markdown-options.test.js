import test from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";
import { configureMarkdownParser } from "../src/markdown-options.js";
const parser = (settings = {}, context) =>
  configureMarkdownParser(new MarkdownIt({ html: true }), settings, context);

test("strict and relaxed headings follow official examples without altering source or token lines", () => {
  const source = "###Header\n\n### Header\n\n#######too many\n";
  const md = parser({ strictMarkdown: true });
  const strict = md.render(source);
  assert.match(strict, /<p>###Header<\/p>/);
  configureMarkdownParser(md, { strictMarkdown: false });
  assert.match(md.render(source), /<h3>Header<\/h3>/);
  assert.match(md.render(source), /<p>#######too many<\/p>/);
  const headings = md
    .parse(source, {})
    .filter((token) => token.type === "heading_open");
  assert.deepEqual(
    headings.map((t) => t.map),
    [
      [0, 1],
      [2, 3],
    ],
  );
  assert.equal(source, "###Header\n\n### Header\n\n#######too many\n");
  configureMarkdownParser(md, { strictMarkdown: true });
  assert.equal(md.render(source), strict);
});

test("loose list accepts two-space second paragraphs while strict requires marker alignment", () => {
  const source = "1. aaa\n\n  bbb\n\nend";
  assert.match(
    parser({ strictMarkdown: true }).render(source),
    /<\/ol>\n<p>bbb<\/p>/,
  );
  const loose = parser({ strictMarkdown: false }).render(source);
  assert.match(loose, /<li>\n<p>aaa<\/p>\n<p>bbb<\/p>\n<\/li>/);
  assert.match(loose, /<\/ol>\n<p>end<\/p>/);
  const tokens = parser({ strictMarkdown: false }).parse(source, {});
  assert.deepEqual(
    tokens.find((t) => t.type === "ordered_list_open").map,
    [0, 4],
  );
  assert.deepEqual(
    tokens.filter((t) => t.type === "inline").map((t) => t.map),
    [
      [0, 1],
      [2, 3],
      [4, 5],
    ],
  );
});

test("loose long ordered marker nests two-space lists and keeps every source character", () => {
  const source = "10. aaa\n  1. ccc\n    - 中文\n  2. ddd\n11. eee\n\nTAIL";
  const loose = parser({ strictMarkdown: false }).render(source);
  assert.match(loose, /<ol start="10">/);
  assert.match(loose, /<li>aaa\n<ol>/);
  assert.match(loose, /<li>ccc\n<ul>\n<li>中文<\/li>/);
  assert.match(loose, /<li>ddd<\/li>/);
  assert.match(loose, /<li>eee<\/li>/);
  assert.match(loose, /<p>TAIL<\/p>/);
  const strict = parser({ strictMarkdown: true }).render(source);
  assert.notEqual(loose, strict);
  assert.ok(!loose.includes(". aaa"));
});

test("relaxed parsing leaves fenced and indented code, quotes, references and tasks intact", () => {
  const source =
    "```md\n###literal\n10. literal\n  1. literal\n```\n\n    ###code\n\n> 10. 引用\n>\n>   续段 [链接][ref]\n\n[ref]: https://example.org\n\n- [ ] task\n  - child\n";
  const md = parser({ strictMarkdown: false });
  const output = md.render(source);
  assert.match(
    output,
    /<code class="language-md">###literal\n10\. literal\n  1\. literal/,
  );
  assert.match(output, /<pre><code>###code/);
  assert.match(output, /<blockquote>/);
  assert.match(output, /<a href="https:\/\/example.org">链接<\/a>/);
  assert.match(output, /<li>\[ \] task\n<ul>/);
  assert.deepEqual(
    md
      .parse(source, {})
      .filter((t) => t.type === "fence")
      .map((t) => t.map),
    [[0, 5]],
  );
});

test("independent editor/export soft-break policies preserve hard breaks and code", () => {
  const source = "甲\n乙\n\n丙  \n丁\n\n`code`\n";
  const md = parser({ softBreaks: true });
  assert.match(md.render(source), /甲<br>\n乙/);
  configureMarkdownParser(md, {}, { target: "export" });
  assert.match(md.render(source), /甲\n乙/);
  assert.match(md.render(source), /丙<br>\n丁/);
  configureMarkdownParser(
    md,
    { softBreaks: false, exportSoftBreaks: true },
    { target: "export" },
  );
  assert.match(md.render(source), /甲<br>\n乙/);
  configureMarkdownParser(md, { softBreaks: false, exportSoftBreaks: true });
  assert.match(md.render(source), /甲\n乙/);
});

test("opt-in CJK emphasis handles adjacent punctuation without changing English identifiers or code", () => {
  const source =
    "中文**强调。**中文\n\n中文_重点_中文\n\nwow_great_stuff\n\n`中文**原样。**中文`\n";
  const strict = parser({ cjkEmphasis: false }).render(source);
  assert.match(strict, /中文\*\*强调。\*\*中文/);
  const md = parser({ cjkEmphasis: true });
  const output = md.render(source);
  assert.match(output, /中文<strong>强调。<\/strong>中文/);
  assert.match(output, /中文<em>重点<\/em>中文/);
  assert.match(output, /wow_great_stuff/);
  assert.match(output, /<code>中文\*\*原样。\*\*中文<\/code>/);
  configureMarkdownParser(md, { cjkEmphasis: false });
  assert.equal(md.render(source), strict);
});

test("policies are isolated per parser and repeated configuration does not install duplicate rules", () => {
  const relaxed = parser({ strictMarkdown: false }),
    strict = parser({ strictMarkdown: true });
  for (let i = 0; i < 20; i++)
    configureMarkdownParser(relaxed, { strictMarkdown: false });
  assert.equal((relaxed.render("###标题").match(/<h3>/g) || []).length, 1);
  assert.match(strict.render("###标题"), /<p>/);
  assert.deepEqual(
    relaxed
      .parse("###标题\n\n1. 一\n\n  二", {})
      .filter((t) => t.type === "inline")
      .map((t) => t.map),
    [
      [0, 1],
      [2, 3],
      [4, 5],
    ],
  );
});

test("relaxed marker indentation retains tabs, empty items, and indented code content", () => {
  const md = parser({ strictMarkdown: false });
  for (const source of [
    "-     code\n",
    "10.     code\n",
    "-\tcode\n",
    "10.\tcode\n",
    "-\n- item\n",
    "- item\n\n      code\n",
  ]) {
    const expected = new MarkdownIt().render(source);
    assert.equal(md.render(source), expected, JSON.stringify(source));
  }
  const nested = "10. - nested\n    continuation\n";
  assert.match(md.render(nested), /<ol start="10">\n<li>\n<ul>/);
  assert.match(md.render(nested), /nested\ncontinuation/);
});
