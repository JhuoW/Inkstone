import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { renderMarkdown, getOutline, parseBlocks, resolveAsset } =
  await import("../src/markdown.js");
const { inlineMathRanges } = await import("../src/markdown.js");

test("formula source spans identify repeated formulas, headings and nested prose without matching code examples", () => {
  const source =
    "# Heading $x^2$\n\n`$x^2$` then $x^2$ and \\(\\frac{x}{y}\\).\n\n> quote $q^2$\n> next $z^2$\n\n- item $a^2$\n  - nested $b^2$";
  const ranges = parseBlocks(source).flatMap(inlineMathRanges);
  assert.deepEqual(
    ranges.map((range) => source.slice(range.from, range.to)),
    [
      "$x^2$",
      "$x^2$",
      "\\(\\frac{x}{y}\\)",
      "$q^2$",
      "$z^2$",
      "$a^2$",
      "$b^2$",
    ],
  );
  assert.deepEqual(
    ranges.map((range) => source.slice(range.contentFrom, range.contentTo)),
    ["x^2", "x^2", "\\frac{x}{y}", "q^2", "z^2", "a^2", "b^2"],
  );
  assert.equal(ranges[1].from, source.indexOf("then $x^2$") + 5);
});
const parse = (source) => {
  const div = document.createElement("div");
  div.innerHTML = renderMarkdown(source, { basePath: "/notes/book/doc.md" });
  return div;
};

test("GFM and extra inline syntax render together", () => {
  const element = parse(
    "# 中文标题\n\n**粗体** *斜体* ~~删除~~ ==高亮== H~2~O x^2^ :rocket:\n\n- [x] 完成\n\n| A | B |\n| --- | --- |\n| 一 | 二 |",
  );
  for (const tag of [
    "h1",
    "strong",
    "em",
    "s",
    "mark",
    "sub",
    "sup",
    "input",
    "table",
  ])
    assert.ok(element.querySelector(tag), tag);
  assert.ok(element.textContent.includes("🚀"));
});
test("TOC uses unique Chinese and duplicate heading anchors", () => {
  const text = "# 中文标题\n\n[TOC]\n\n## Same\n\n## Same";
  const outline = getOutline(text);
  assert.deepEqual(
    outline.map((item) => item.id),
    ["中文标题", "same", "same-1"],
  );
  assert.equal(parse(text).querySelectorAll(".table-of-contents a").length, 3);
});
test("YAML, reference links, HTML media, alerts and footnotes render", () => {
  const element = parse(
    '---\ntitle: 测试\n---\n\n[文档][ref]\n\n[ref]: https://example.com\n\n脚注[^a]\n\n[^a]: 内容\n\n> [!WARNING]\n> 小心\n\n<video controls src="./movie.mp4"></video>',
  );
  assert.ok(element.querySelector(".frontmatter"));
  assert.ok(element.querySelector(".footnotes"));
  assert.ok(element.querySelector(".markdown-alert-warning"));
  assert.equal(
    element.querySelector("a").getAttribute("href"),
    "https://example.com",
  );
  assert.match(
    element.querySelector("video").getAttribute("src"),
    /^inkstone-asset:/,
  );
});
test("math renders chemical equations, labels and equation references with error feedback", () => {
  const element = parse(
    "$$\n\\ce{2H2 + O2 -> 2H2O} \\label{water}\n$$\n\n$\\eqref{water}$\n\n$\\notARealCommand$",
  );
  assert.ok(element.querySelector("#equation-water .katex"));
  assert.ok(element.querySelector(".math-error"));
  assert.ok(element.textContent.includes("(1)"));
});
test("untrusted Markdown cannot install script handlers, embedded forms or javascript links", () => {
  const element = parse(
    '<script>alert(1)</script>\n<img src="x" onerror="alert(1)"><iframe srcdoc="<script>alert(1)</script>"></iframe><form><input></form>\n\n<a href="javascript:alert(1)">danger</a>',
  );
  assert.equal(element.querySelectorAll("script,form").length, 0);
  assert.equal(element.querySelectorAll("[onerror],[srcdoc]").length, 0);
  assert.equal(element.querySelector("a").hasAttribute("href"), false);
});
test("relative paths preserve Unicode and parent traversal for backend authorization", () => {
  assert.equal(
    resolveAsset("../图片/a b.png", "/home/user/notes/doc.md"),
    "inkstone-asset://local/?path=%2Fhome%2Fuser%2F%E5%9B%BE%E7%89%87%2Fa%20b.png",
  );
  assert.doesNotThrow(() => resolveAsset("100%.png", "/notes/doc.md"));
  assert.equal(resolveAsset("javascript:alert(1)", "/notes/doc.md"), "");
});

test("file URL assets retain Windows drives and UNC shares while excluding URL suffixes from the path", () => {
  for (const [source, expected] of [
    ["file:///C:/notes/a%20b.svg?cache=1#glyph", "C:/notes/a b.svg"],
    ["FILE:///C:/notes/a.png", "C:/notes/a.png"],
    ["file://server/share/a%20b.svg#glyph", "//server/share/a b.svg"],
    ["file://localhost/C:/notes/a.png", "C:/notes/a.png"],
    ["file:///notes/a%23b.png", "/notes/a#b.png"],
    ["C:\\notes\\a%20b.svg?cache=1#glyph", "C:/notes/a b.svg"],
  ]) {
    const asset = new URL(resolveAsset(source, "D:\\copies\\copy.md"));
    assert.equal(asset.protocol, "inkstone-asset:", source);
    assert.equal(asset.searchParams.get("path"), expected, source);
    assert.equal(asset.hash, source.includes("#glyph") ? "#glyph" : "", source);
    if (source.includes("cache=1"))
      assert.equal(asset.searchParams.get("cache"), "1");
  }
});

test("file URL image roots decode drive and UNC folders without rebasing absolute assets", () => {
  for (const [root, expected] of [
    ["file:///C:/shared%20assets/", "C:/shared assets/plot.png"],
    [
      "file://server/share/shared%20assets/",
      "//server/share/shared assets/plot.png",
    ],
  ]) {
    const asset = new URL(resolveAsset("/plot.png", "D:/notes/doc.md", root));
    assert.equal(asset.searchParams.get("path"), expected, root);
    assert.equal(
      new URL(
        resolveAsset("file:///E:/original.png", "D:/notes/doc.md", root),
      ).searchParams.get("path"),
      "E:/original.png",
    );
  }
});

test("file URL Markdown images use authorized assets and only anchor hrefs retain file URLs", () => {
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown(
    "![plot](file:///C:/notes/a%20b.svg?cache=1#glyph)\n\n" +
      "[document](file:///C:/notes/percent%25name.md)\n\n" +
      '<a href="file://server/share/note.md">UNC</a>' +
      '<iframe src="file:///C:/secret.html"></iframe>',
    { basePath: "D:/copies/copy.md" },
  );
  const image = new URL(host.querySelector("img").getAttribute("src"));
  assert.equal(image.protocol, "inkstone-asset:");
  assert.equal(image.searchParams.get("path"), "C:/notes/a b.svg");
  assert.equal(image.hash, "#glyph");
  assert.equal(
    host.querySelector("a").getAttribute("href"),
    "file:///C:/notes/percent%25name.md",
  );
  assert.equal(
    host.querySelectorAll("a")[1].getAttribute("href"),
    "file://server/share/note.md",
  );
  assert.equal(host.querySelector("iframe").hasAttribute("src"), false);
  assert.equal(parse("[bad](javascript:alert(1))").querySelector("a"), null);
});
test("block ranges preserve nested lists as a single editing region and retain raw source", () => {
  const text =
    "# Title\n\n- first\n  - nested\n\n<div>raw</div>\n\n```unknown\n<raw>\n```";
  const blocks = parseBlocks(text);
  assert.equal(
    blocks.find((block) => block.type === "bullet_list_open").text.trim(),
    "- first\n  - nested",
  );
  for (const block of blocks)
    assert.equal(text.slice(block.from, block.to), block.text);
  assert.equal(blocks[0].headingId, "title");
});
test("live block rendering shares reference links, footnotes, equation numbering and heading IDs", async () => {
  const { renderBlockMarkdown } = await import("../src/markdown.js");
  const text =
    "# Same\n\n[ref][link] and note[^n]\n\n## Same\n\n$$a=1 \\label{first}$$\n\n$$b=2$$\n\n$\\eqref{first}$\n\n[link]: https://example.com\n\n[^n]: Footnote body";
  const blocks = parseBlocks(text, { mathNumbering: true });
  const host = document.createElement("div");
  host.innerHTML = blocks
    .map((block) => renderBlockMarkdown(block, { mathNumbering: true }))
    .join("");
  assert.equal(
    host.querySelector('a[href="https://example.com"]').textContent,
    "ref",
  );
  assert.ok(host.querySelector(".footnote-ref"));
  assert.equal(
    host.querySelector("#fn1").textContent.trim().startsWith("Footnote body"),
    true,
  );
  assert.ok(host.querySelector("#same-1"));
  assert.deepEqual(
    [...host.querySelectorAll(".equation-number")].map((el) => el.textContent),
    ["(1)", "(2)"],
  );
  assert.equal(host.querySelectorAll(".math-error").length, 0);
  assert.match(host.textContent, /\(1\)/);
});
test("math fences and backslash delimiters share display numbering and labels", () => {
  const text =
    "\\(x^2\\)\n\n\\[\na=1 \\label{a}\n\\]\n\n```math\nb=2 \\label{b}\n```\n\n$\\eqref{a}$ and $\\eqref{b}$";
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown(text, { mathNumbering: true });
  assert.equal(host.querySelectorAll(".katex").length, 5);
  assert.equal(host.querySelectorAll(".math-error").length, 0);
  assert.deepEqual(
    [...host.querySelectorAll(".equation-number")].map(
      (element) => element.textContent,
    ),
    ["(1)", "(2)"],
  );
  assert.ok(host.querySelector("#equation-a"));
  assert.ok(host.querySelector("#equation-b"));
});
test("embedded frames always receive a restrictive sandbox after HTML parsing", () => {
  const host = parse(
    '<iframe src="https://example.com" sandbox="allow-scripts allow-same-origin allow-top-navigation" allowfullscreen></iframe>',
  );
  assert.equal(
    host.querySelector("iframe").getAttribute("sandbox"),
    "allow-scripts allow-presentation",
  );
  assert.equal(host.querySelector("iframe").getAttribute("loading"), "lazy");
});
test("offline MathJax fallback renders physics, bbox, AMS and chemistry with real glyph paths", () => {
  const source =
    "$$\\qty(\\frac{x}{y})$$\n\n$$\\dv{x}{t}$$\n\n$$\\bbox[5px,border:2px solid red]{\\dv{x}{t}}$$\n\n$$\\begin{align}a&=b\\\\c&=d\\end{align}$$\n\n$$\\ce{SO4^2- + Ba^2+ -> BaSO4 v}$$";
  const element = parse(source);
  assert.equal(element.querySelectorAll(".math-error").length, 0);
  assert.equal(element.querySelectorAll(".mathjax-fallback").length, 3);
  assert.ok(element.querySelectorAll(".mathjax-fallback path[d]").length > 8);
  assert.equal(
    element.querySelectorAll(".mathjax-fallback use").length,
    0,
    "SVG glyphs are self-contained",
  );
  assert.equal(element.querySelectorAll(".katex").length, 2);
});
test("unknown TeX and runtime extension loading still report explicit errors", () => {
  for (const source of [
    "$\\notARealCommand$",
    "$\\require{https://untrusted.invalid/script}$",
  ])
    assert.ok(parse(source).querySelector(".math-error"));
});
test("Azure TOC alias and relative video subtitle tracks render", () => {
  const element = parse(
    '# Heading\n\n[[_TOC_]]\n\n<video controls><source src="movie.mp4"><track kind="subtitles" src="zh.vtt" srclang="zh" label="中文"></video>',
  );
  assert.equal(element.querySelectorAll(".table-of-contents a").length, 1);
  assert.match(
    element.querySelector("track").getAttribute("src"),
    /^inkstone-asset:/,
  );
  assert.equal(element.querySelector("track").getAttribute("srclang"), "zh");
});
test("YAML image roots resolve per document in full and live block rendering", async () => {
  const { renderBlockMarkdown } = await import("../src/markdown.js");
  const source =
    "---\ntypora-root-url: ../site\ntypora-copy-images-to: ./assets\n---\n\n![图](/images/a.png)";
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown(source, { basePath: "/notes/posts/post.md" });
  const expected =
    "inkstone-asset://local/?path=%2Fnotes%2Fsite%2Fimages%2Fa.png";
  assert.equal(host.querySelector("img").getAttribute("src"), expected);
  const blocks = parseBlocks(source, { basePath: "/notes/posts/post.md" });
  host.innerHTML = blocks
    .map((block) =>
      renderBlockMarkdown(block, { basePath: "/notes/posts/post.md" }),
    )
    .join("");
  assert.equal(host.querySelector("img").getAttribute("src"), expected);
  assert.equal(
    resolveAsset("/img.png", "/notes/post.md", "https://example.com/blog/"),
    "https://example.com/blog/img.png",
  );
  assert.equal(
    resolveAsset("/img.png", "/notes/post.md", "javascript:alert(1)"),
    "",
  );
  assert.equal(
    resolveAsset("file:///original/a.png", "/notes/post.md", "../site"),
    "inkstone-asset://local/?path=%2Foriginal%2Fa.png",
  );
});
test("explicit equation tags render once while labels retain the explicit reference number", () => {
  const host = document.createElement("div");
  host.innerHTML = renderMarkdown(
    "$$a=1 \\tag{42} \\label{answer}$$\n\n$\\eqref{answer}$",
    { mathNumbering: true },
  );
  assert.equal(host.querySelectorAll(".math-display .katex-tag").length, 1);
  assert.equal(
    host.querySelectorAll(".math-display .equation-number").length,
    0,
  );
  assert.equal(host.querySelectorAll(".math-error").length, 0);
  assert.ok(host.querySelector("p").textContent.includes("(42)"));
});
test("HTML media resolves single, double, unquoted and poster resource attributes after HTML parsing", () => {
  const source = `<img src='assets/a.svg'><img src=assets/b.svg><audio src="media/a.mp3"></audio><video src='media/a.webm' poster=assets/poster.png><source src='media/b.webm'><track src=subtitles/zh.vtt></video>`;
  const host = parse(source);
  for (const element of host.querySelectorAll(
    "img, audio, video, source, track",
  ))
    assert.match(
      element.getAttribute("src"),
      /^inkstone-asset:\/\/local\/\?path=%2Fnotes%2Fbook%2F/,
    );
  assert.equal(
    host.querySelector("video").getAttribute("poster"),
    "inkstone-asset://local/?path=%2Fnotes%2Fbook%2Fassets%2Fposter.png",
  );
  const file = parse(
    `<img src='file:///notes/absolute.svg'><img src='javascript:alert(1)'>`,
  );
  assert.equal(
    file.querySelector("img").getAttribute("src"),
    "inkstone-asset://local/?path=%2Fnotes%2Fabsolute.svg",
  );
  assert.ok(!file.querySelectorAll("img")[1].getAttribute("src"));
});
