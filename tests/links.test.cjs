const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { rebaseLocalLinks } = require("../electron/links.cjs");

const originalPath = path.resolve("notes", "original.md");
const targetPath = path.resolve("notes", "sub", "copy.md");

test("Save As preserves both destinations of an image inside a link", () => {
  const source =
    '[![图](assets/image.png "Image title")](target.md#heading "Link title")';
  const result = rebaseLocalLinks(source, originalPath, targetPath);
  assert.equal(
    result.text,
    '[![图](../assets/image.png "Image title")](../target.md#heading "Link title")',
  );
  assert.equal(result.changed, 2);
});

test("Save As leaves HTML comments and unrelated HTML attributes exact", () => {
  const source =
    '<!-- [example](guide.md) <img src="example.png"> -->\r\n' +
    '<img data-src="keep.png" src="image.png" data-poster="keep.jpg">\r\n' +
    '<a data-href="keep.md" href="guide.md">Guide</a>\r\n';
  const result = rebaseLocalLinks(source, originalPath, targetPath);
  assert.equal(
    result.text,
    '<!-- [example](guide.md) <img src="example.png"> -->\r\n' +
      '<img data-src="keep.png" src="../image.png" data-poster="keep.jpg">\r\n' +
      '<a data-href="keep.md" href="../guide.md">Guide</a>\r\n',
  );
  assert.equal(result.changed, 2);
});

test("Save As finds media attributes after quoted greater-than characters", () => {
  const source =
    '<img title="a > b" src="image.png"><video poster=cover.png></video>';
  const result = rebaseLocalLinks(source, originalPath, targetPath);
  assert.equal(
    result.text,
    '<img title="a > b" src="../image.png"><video poster=../cover.png></video>',
  );
  assert.equal(result.changed, 2);
});

test("Save As does not rewrite incomplete Markdown links", () => {
  const source =
    '[plain](keep.png\n\n[unfinished](keep.png "unterminated)\n\n' +
    '[complete](guide.md "Title")\n';
  const result = rebaseLocalLinks(source, originalPath, targetPath);
  assert.equal(
    result.text,
    '[plain](keep.png\n\n[unfinished](keep.png "unterminated)\n\n' +
      '[complete](../guide.md "Title")\n',
  );
  assert.equal(result.changed, 1);
});

test("Save As keeps encoded punctuation safe in Markdown and single-quoted HTML", () => {
  const result = rebaseLocalLinks(
    "![photo](assets/a%26copy;.png)\n<img src='assets/author%27s.png'>",
    originalPath,
    targetPath,
  );
  assert.equal(
    result.text,
    "![photo](../assets/a%26copy;.png)\n<img src='../assets/author%27s.png'>",
  );
});

test("Save As decodes destination entities before encoding paths and preserves HTML query escaping", () => {
  const result = rebaseLocalLinks(
    "![photo](assets/a&amp;b.png)\n" +
      "[document](assets/a&#38;b.md)\n" +
      '<img src="assets/a&amp;b.png">\n' +
      '<img src="assets/a&copy.png?label=&quot;quoted&quot;&amp;id=2">',
    originalPath,
    targetPath,
  );
  assert.equal(
    result.text,
    "![photo](../assets/a%26b.png)\n" +
      "[document](../assets/a%26b.md)\n" +
      '<img src="../assets/a%26b.png">\n' +
      '<img src="../assets/a©.png?label=&quot;quoted&quot;&amp;id=2">',
  );
  assert.equal(result.changed, 4);
});

test(
  "Save As uses file URLs for resources on another Windows drive",
  { skip: process.platform !== "win32" },
  () => {
    const result = rebaseLocalLinks(
      "![photo](assets/a%20b%28.png?size=2#preview)",
      "C:\\notes\\original.md",
      "D:\\copies\\copy.md",
    );
    assert.equal(
      result.text,
      `![photo](${pathToFileURL("C:\\notes\\assets\\a b(.png").href.replace(/\(/g, "%28")}?size=2#preview)`,
    );
    assert.equal(result.changed, 1);
  },
);
