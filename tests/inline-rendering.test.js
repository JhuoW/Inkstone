import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection } from "@codemirror/state";
import { inlineRanges } from "../src/inline-rendering.js";

const text =
  "Plain **bold** and *italic* [site](https://example.com) `code` ~~gone~~";
const block = { from: 100, type: "paragraph_open", text };
function ranges(anchor, head = anchor) {
  return inlineRanges(
    block,
    EditorSelection.create([EditorSelection.range(100 + anchor, 100 + head)]),
  );
}
test("inactive inline syntax is hidden without changing source ranges", () => {
  const values = ranges(2);
  const hidden = values
    .filter((range) => range.kind === "hide")
    .map((range) => text.slice(range.from - 100, range.to - 100));
  assert.deepEqual(hidden, [
    "**",
    "**",
    "*",
    "*",
    "[",
    "](https://example.com)",
    "`",
    "`",
    "~~",
    "~~",
  ]);
  assert.equal(
    values.find((range) => range.className === "cm-inline-link").attributes[
      "data-inkstone-href"
    ],
    "https://example.com",
  );
});
test("cursor or non-empty selection reveals each intersecting inline token", () => {
  assert.equal(
    ranges(text.indexOf("bold") + 1).filter(
      (range) =>
        range.kind === "hide" &&
        text.slice(range.from - 100, range.to - 100) === "**",
    ).length,
    0,
  );
  assert.equal(
    ranges(0, text.length).filter((range) => range.kind === "hide").length,
    0,
  );
  assert.equal(
    ranges(text.indexOf("italic") + 2).filter(
      (range) =>
        range.kind === "hide" &&
        text.slice(range.from - 100, range.to - 100) === "**",
    ).length,
    2,
  );
});
test("heading marker remains available at its source location", () => {
  const heading = {
    from: 0,
    type: "heading_open",
    headingLevel: 2,
    text: "## Title **bold**",
  };
  assert.ok(
    inlineRanges(heading, EditorSelection.single(5)).some(
      (range) => range.kind === "hide" && range.from === 0 && range.to === 3,
    ),
  );
  assert.ok(
    !inlineRanges(heading, EditorSelection.single(0)).some(
      (range) => range.kind === "hide" && range.from === 0,
    ),
  );
});

test("TeX emphasis-like symbols are protected from prose inline decorations", () => {
  const source = "before $a * b * c$ **bold**";
  const formula = { from: 7, to: 18 };
  const ranges = inlineRanges(
    { from: 0, type: "paragraph_open", text: source },
    EditorSelection.single(0),
    [formula],
  );
  assert.equal(
    ranges.some((range) => range.from < formula.to && range.to > formula.from),
    false,
  );
  assert.ok(ranges.some((range) => range.className === "cm-inline-strong"));
});
