import test from "node:test";
import assert from "node:assert/strict";
import { ChangeSet } from "@codemirror/state";
import {
  resolveAIRevision,
  boundAIHistory,
  validateAIRevision,
  createChangeTracker,
  locateAnchor,
  combineAIRevisions,
  uniqueOccurrence,
} from "../src/ai-revisions.js";

const context = {
  identity: "1:a.md",
  text: "Before\nOriginal\nAfter",
  readOnly: false,
};
const proposal = {
  ...context,
  from: 7,
  to: 15,
  original: "Original",
  replacement: "New\r\ntext",
};
test("AI transaction preserves neighboring source and normalizes insertion EOLs", () => {
  const change = validateAIRevision(context, proposal);
  assert.equal(
    context.text.slice(0, change.from) +
      change.insert +
      context.text.slice(change.to),
    "Before\nNew\ntext\nAfter",
  );
});
test("AI transaction rejects stale, switched, locked and malformed targets", () => {
  for (const patch of [
    { identity: "2:a.md" },
    { text: "Changed" },
    { readOnly: true },
  ])
    assert.throws(() => validateAIRevision({ ...context, ...patch }, proposal));
  for (const patch of [
    { from: -1 },
    { from: 7.5 },
    { to: 99 },
    { original: "invented" },
    { replacement: null },
  ])
    assert.throws(() => validateAIRevision(context, { ...proposal, ...patch }));
});

test("AI revisions preserve UTF-16 offsets and literal Markdown within selection", () => {
  const text = "# 中文 🪨\n\nUse $a=b+c$ here.\n\nUse $a=b+c$ again.";
  const source = "Use $a=b+c$ again.";
  const offset = text.lastIndexOf(source);
  const suggestion = { original: "$a=b+c$", replacement: "$a=b+c+d$" };
  const revision = resolveAIRevision(
    { identity: "document-1", text, source, offset },
    suggestion,
  );
  assert.equal(revision.from, text.lastIndexOf(suggestion.original));
  assert.equal(text.slice(revision.from, revision.to), suggestion.original);
  assert.equal(revision.replacement, suggestion.replacement);
  assert.equal(revision.text, text);
  assert.equal(revision.identity, "document-1");
});

test("AI cannot silently apply invented, ambiguous or malformed passages", () => {
  const snapshot = { identity: "1", text: "aaaa", source: "aaaa", offset: 0 };
  for (const original of ["invented", "aa", "", null]) {
    assert.equal(
      resolveAIRevision(snapshot, { original, replacement: "changed" }),
      null,
    );
  }
  assert.equal(
    resolveAIRevision(snapshot, { original: "aaaa", replacement: null }),
    null,
  );
  assert.equal(
    resolveAIRevision(snapshot, { original: "aaaa", replacement: "" })
      .replacement,
    "",
  );
});

test("Long AI chats retain complete recent turns within request limits", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: String(i).padEnd(40000, "."),
  }));
  const bounded = boundAIHistory(history);
  assert.equal(bounded.length, 8);
  assert.equal(bounded[0].role, "user");
  assert.equal(bounded.at(-1).role, "assistant");
  assert.ok(bounded.every((m) => m.content.length <= 16000));
  assert.ok(bounded.reduce((sum, m) => sum + m.content.length, 0) <= 100000);
  assert.equal(history[0].content.length, 40000);
});

// Applies change specs (in original coordinates) to a string.
function applyString(text, spec) {
  const changes = [spec].flat().sort((a, b) => b.from - a.from);
  for (const { from, to = from, insert = "" } of changes)
    text = text.slice(0, from) + insert + text.slice(to);
  return text;
}

test("Accepting one suggestion keeps the remaining suggestions applicable", () => {
  let text = "First sentence is weak. Second sentence is vague. Third one.";
  const tracker = createChangeTracker(text.length);
  const anchors = ["First sentence is weak.", "Second sentence is vague."].map(
    (expected) => ({
      tracker,
      from: text.indexOf(expected),
      to: text.indexOf(expected) + expected.length,
      expected,
    }),
  );
  // Accept the first suggestion with a longer replacement.
  const first = locateAnchor(anchors[0], text);
  const spec = {
    from: first.from,
    to: first.to,
    insert: "The opening sentence now states its point.",
  };
  tracker.add(ChangeSet.of(spec, text.length));
  text = applyString(text, spec);
  assert.equal(locateAnchor(anchors[0], text), null);
  const second = locateAnchor(anchors[1], text);
  assert.ok(second);
  assert.equal(text.slice(second.from, second.to), "Second sentence is vague.");
  const revision = {
    identity: "doc",
    text,
    from: second.from,
    to: second.to,
    original: "Second sentence is vague.",
    replacement: "Second sentence names the method.",
  };
  const change = validateAIRevision(
    { identity: "doc", text, readOnly: false },
    revision,
  );
  assert.equal(
    applyString(text, change),
    "The opening sentence now states its point. Second sentence names the method. Third one.",
  );
});

test("Manual edits elsewhere keep suggestions; edits inside a passage mark it outdated", () => {
  let text = "Alpha paragraph.\n\nBeta paragraph.";
  const tracker = createChangeTracker(text.length);
  const anchor = (expected) => ({
    tracker,
    from: text.indexOf(expected),
    to: text.indexOf(expected) + expected.length,
    expected,
  });
  const alpha = anchor("Alpha paragraph."),
    beta = anchor("Beta paragraph.");
  // Typing directly before and after a passage does not touch it.
  for (const spec of [
    { from: 0, insert: "# Title\n\n" },
    { from: "# Title\n\nAlpha paragraph.".length, insert: " Extra." },
  ]) {
    tracker.add(ChangeSet.of(spec, text.length));
    text = applyString(text, spec);
  }
  assert.equal(
    text.slice(locateAnchor(alpha, text).from, locateAnchor(alpha, text).to),
    "Alpha paragraph.",
  );
  // Editing inside Beta invalidates only Beta.
  const inside = { from: text.indexOf("Beta") + 4, insert: "!" };
  tracker.add(ChangeSet.of(inside, text.length));
  text = applyString(text, inside);
  assert.ok(locateAnchor(alpha, text));
  assert.equal(locateAnchor(beta, text), null);
});

test("A replaced document breaks trackers instead of mapping to wrong text", () => {
  const tracker = createChangeTracker(10);
  tracker.add(ChangeSet.of({ from: 0, insert: "x" }, 25));
  assert.equal(tracker.broken, true);
  assert.equal(
    locateAnchor({ tracker, from: 0, to: 1, expected: "a" }, "a".repeat(11)),
    null,
  );
});

test("Batch revisions are combined in order and overlapping ones are refused", () => {
  const text = "one two three";
  const context = { identity: "d", text, readOnly: false };
  const revision = (original, replacement) => ({
    identity: "d",
    text,
    from: text.indexOf(original),
    to: text.indexOf(original) + original.length,
    original,
    replacement,
  });
  const changes = combineAIRevisions(context, [
    revision("three", "3"),
    revision("one", "1"),
  ]);
  assert.deepEqual(
    changes.map((c) => c.from),
    [0, 8],
  );
  assert.equal(applyString(text, changes), "1 two 3");
  assert.throws(() =>
    combineAIRevisions(context, [
      revision("one two", "x"),
      revision("two", "y"),
    ]),
  );
});

test("Reverting a deletion may restore text at an empty range only", () => {
  const text = "Keep  this.";
  const context = { identity: "d", text, readOnly: false };
  const restore = {
    identity: "d",
    text,
    from: 5,
    to: 5,
    original: "",
    replacement: "all",
  };
  assert.equal(
    applyString(text, validateAIRevision(context, restore)),
    "Keep all this.",
  );
  assert.throws(() =>
    validateAIRevision(context, { ...restore, original: "x" }),
  );
});

test("Unique occurrence respects the analyzed region", () => {
  const text = "same text | same text";
  assert.equal(uniqueOccurrence(text, "same text"), null);
  assert.deepEqual(uniqueOccurrence(text, "same text", 10), {
    from: 12,
    to: 21,
  });
  assert.deepEqual(uniqueOccurrence(text, "same text", 0, 10), {
    from: 0,
    to: 9,
  });
  assert.equal(uniqueOccurrence(text, ""), null);
});
