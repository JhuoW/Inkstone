import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAIRevision,
  boundAIHistory,
  validateAIRevision,
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
