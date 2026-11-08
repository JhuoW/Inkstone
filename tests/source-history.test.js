import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import {
  history,
  isolateHistory,
  undo,
  redo,
  undoDepth,
} from "@codemirror/commands";
import { SourceDocument } from "../src/source.js";
import {
  createSourceHistory,
  sourceChangesFromTransaction,
} from "../src/source-history.js";

function harness(raw, config = {}) {
  const source = new SourceDocument(raw);
  const layout = createSourceHistory(source.getLayout());
  let state = EditorState.create({
    doc: source.normalized,
    extensions: [layout.extension, history({ minDepth: 600, ...config })],
  });
  const dispatch = (transaction) => {
    if (transaction.docChanged)
      source.apply(
        sourceChangesFromTransaction(transaction, layout.field),
        transaction.newDoc.toString(),
      );
    state = transaction.state;
    assert.equal(source.getLayout().eols, state.field(layout.field).eols);
  };
  return {
    source,
    layout,
    get state() {
      return state;
    },
    dispatch,
    edit: (spec) => dispatch(state.update(spec)),
    undo: () => undo({ state, dispatch }),
    redo: () => redo({ state, dispatch }),
  };
}
function rawOffset(raw, canonicalOffset) {
  let original = raw.charCodeAt(0) === 0xfeff ? 1 : 0,
    canonical = 0;
  while (canonical < canonicalOffset) {
    original += raw[original] === "\r" && raw[original + 1] === "\n" ? 2 : 1;
    canonical++;
  }
  return original;
}

test("every intermediate mixed-EOL state survives undo and redo beyond the former full-snapshot budget", () => {
  const raw =
    "\uFEFF" +
    Array.from(
      { length: 600 },
      (_, index) =>
        `${index} ${"source remains unchanged 中文 ".repeat(3)}${["\r\n", "\n", "\r"][index % 3]}`,
    ).join("");
  const h = harness(raw);
  const expected = [raw];
  let representedBytes = raw.length * 2;
  for (let index = 0; index < 400; index++) {
    const start = h.state.doc.line(5 + (index % 20)).from;
    const end = h.state.doc.line(6 + (index % 20)).from + 2;
    const insert = `edit ${index}\nreplacement\n`;
    const previous = expected[expected.length - 1];
    const next =
      previous.slice(0, rawOffset(previous, start)) +
      insert.replace(/\n/g, h.source.eol) +
      previous.slice(rawOffset(previous, end));
    h.edit({
      changes: { from: start, to: end, insert },
      annotations: isolateHistory.of("full"),
      userEvent: "input.type",
    });
    assert.equal(h.source.raw, next);
    expected.push(next);
    representedBytes += next.length * 2;
  }
  assert.ok(
    representedBytes > 32 * 1024 * 1024,
    "exercises the old 32 MiB cache eviction scenario",
  );
  assert.equal(
    h.source.snapshots,
    undefined,
    "the implementation stores no full-text history cache",
  );
  assert.equal(undoDepth(h.state), 400);
  for (let index = 399; index >= 0; index--) {
    assert.equal(h.undo(), true);
    assert.equal(h.source.raw, expected[index], `undo intermediate ${index}`);
  }
  for (let index = 1; index <= 400; index++) {
    assert.equal(h.redo(), true);
    assert.equal(h.source.raw, expected[index], `redo intermediate ${index}`);
  }
  assert.equal(
    h.state.field(h.layout.field).eols.length,
    h.state.doc.lines - 1,
  );
});

test("grouped history restores the final inverse EOL map and can redo the entire group", () => {
  const original = "\uFEFFa\r\nb\nc\rd\r\n";
  const h = harness(original, { joinToEvent: () => true });
  h.edit({
    changes: { from: 1, to: 4, insert: "\nA\n" },
    userEvent: "input.type",
    annotations: isolateHistory.of("before"),
  });
  h.edit({ changes: { from: 4, insert: "b\n" }, userEvent: "input.type" });
  h.edit({
    changes: { from: 5, to: 8, insert: "\nC\n" },
    userEvent: "input.type",
  });
  const grouped = h.source.raw;
  assert.equal(undoDepth(h.state), 1);
  assert.equal(h.undo(), true);
  assert.equal(h.source.raw, original);
  assert.equal(h.redo(), true);
  assert.equal(h.source.raw, grouped);
  h.edit({
    changes: [
      { from: 0, to: 2, insert: "first\n" },
      {
        from: h.state.doc.length - 2,
        to: h.state.doc.length,
        insert: "last\n\n",
      },
    ],
    annotations: isolateHistory.of("full"),
  });
  const multiple = h.source.raw;
  assert.equal(h.undo(), true);
  assert.equal(h.source.raw, grouped);
  assert.equal(h.undo(), true);
  assert.equal(h.source.raw, original);
  assert.equal(h.redo(), true);
  assert.equal(h.source.raw, grouped);
  assert.equal(h.redo(), true);
  assert.equal(h.source.raw, multiple);
});

test("character-only edits share a compact immutable EOL map", () => {
  const h = harness("a\r\nb\nc\r".repeat(4000));
  const initial = h.state.field(h.layout.field);
  for (let index = 0; index < 100; index++)
    h.edit({ changes: { from: 0, insert: "x" }, userEvent: "input.type" });
  assert.equal(h.state.field(h.layout.field), initial);
  assert.equal(initial.eols.length, 12000);
  assert.ok(Object.isFrozen(initial));
  assert.equal(h.undo(), true);
});

test("multiline reordering with an identical EOL map still records an inverse restore", () => {
  const original = "A\r\nAA\n\nB\r\nBB\n";
  const h = harness(original);
  const moved = "B\nBB\n\nA\nAA\n";
  h.edit({
    changes: { from: 0, to: h.state.doc.length, insert: moved },
    effects: h.layout.restore.of(h.state.field(h.layout.field)),
    annotations: isolateHistory.of("full"),
  });
  assert.equal(h.source.raw, "B\r\nBB\n\nA\r\nAA\n");
  assert.equal(h.undo(), true);
  assert.equal(h.source.raw, original);
  assert.equal(h.redo(), true);
  assert.equal(h.source.raw, "B\r\nBB\n\nA\r\nAA\n");
});
