import test from "node:test";
import assert from "node:assert/strict";
import { structuralEdit } from "../src/structure-commands.js";
const text =
  "First paragraph. Next sentence!\n\n- one\n  - nested\n\nLast paragraph.";
const blocks = [
  { from: 0, to: text.indexOf("\n\n"), type: "paragraph_open" },
  {
    from: text.indexOf("- one"),
    to: text.indexOf("\n\nLast"),
    type: "bullet_list_open",
  },
  { from: text.indexOf("Last"), to: text.length, type: "paragraph_open" },
];
const selection = (position) => ({
  from: position,
  to: position,
  head: position,
  anchor: position,
  empty: true,
});
const apply = (operation) => {
  let result = text;
  for (const change of [operation.changes]
    .flat()
    .sort((a, b) => b.from - a.from))
    result =
      result.slice(0, change.from) + change.insert + result.slice(change.to);
  return result;
};
test("moving a nested block retains its exact internal source and caret offset", () => {
  const cursor = selection(text.indexOf("nested") + 2);
  const operation = structuralEdit(text, cursor, blocks, "moveParagraphUp");
  assert.equal(
    apply(operation),
    "- one\n  - nested\n\nFirst paragraph. Next sentence!\n\nLast paragraph.",
  );
  assert.equal(operation.selection.head, "- one\n  - ne".length);
  assert.equal(
    structuralEdit(text, selection(0), blocks, "moveParagraphUp"),
    null,
  );
});
test("block deletion preserves neighboring blocks without joining their text", () => {
  assert.equal(
    apply(
      structuralEdit(
        text,
        selection(text.indexOf("nested")),
        blocks,
        "deleteBlock",
      ),
    ),
    "First paragraph. Next sentence!\n\nLast paragraph.",
  );
});
test("word and sentence deletion stay inside the current block", () => {
  assert.equal(
    apply(structuralEdit(text, selection(2), blocks, "deleteWord")),
    text.replace("First", ""),
  );
  assert.equal(
    apply(structuralEdit(text, selection(2), blocks, "deleteSentence")),
    text.replace("First paragraph. ", ""),
  );
});
test("clear formatting preserves nested text and URLs unless the link style is selected", () => {
  const raw = "**bold *nested*** [label](https://example.com)";
  const parent = [{ from: 0, to: raw.length, type: "paragraph_open" }];
  const italic = structuralEdit(
    raw,
    selection(raw.indexOf("nested") + 1),
    parent,
    "clearFormatting",
  );
  let edited = raw;
  for (const change of italic.changes.toReversed())
    edited = edited.slice(0, change.from) + edited.slice(change.to);
  assert.equal(edited, "**bold nested** [label](https://example.com)");
  const link = structuralEdit(
    raw,
    selection(raw.indexOf("label")),
    parent,
    "deleteStyle",
  );
  edited = raw;
  for (const change of link.changes.toReversed())
    edited = edited.slice(0, change.from) + edited.slice(change.to);
  assert.equal(edited, "**bold *nested*** label");
});
