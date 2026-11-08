import { StateField, StateEffect } from "@codemirror/state";
import { invertedEffects } from "@codemirror/commands";

/** Preserve newline spelling alongside CodeMirror's own text history, at one token per newline. */
export function createSourceHistory(initialLayout) {
  const restore = StateEffect.define();
  function update(layout, transaction) {
    let eols = layout.eols;
    if (transaction.docChanged) {
      const edits = [];
      transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
        const start = transaction.startState.doc.lineAt(from).number - 1;
        const end = transaction.startState.doc.lineAt(to).number - 1;
        if (start !== end || inserted.lines > 1)
          edits.push({ start, end, count: inserted.lines - 1 });
      });
      for (const edit of edits.reverse())
        eols =
          eols.slice(0, edit.start) +
          layout.defaultEol.repeat(edit.count) +
          eols.slice(edit.end);
    }
    let next =
      eols === layout.eols ? layout : Object.freeze({ ...layout, eols });
    // CM concatenates grouped inverse effects in newest-to-oldest order. The final effect
    // therefore describes the beginning of the undo group; redo stores the inverse again.
    for (const effect of transaction.effects)
      if (effect.is(restore)) next = effect.value;
    if (next.eols.length !== transaction.newDoc.lines - 1)
      throw new Error("Source history line-ending metadata is inconsistent.");
    return next;
  }
  const field = StateField.define({ create: () => initialLayout, update });
  const extension = [
    field,
    invertedEffects.of((transaction) => {
      if (!transaction.docChanged) return [];
      const before = transaction.startState.field(field);
      const after = update(before, transaction);
      let replacesNewlines = false;
      transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
        if (
          inserted.lines > 1 ||
          transaction.startState.doc.lineAt(from).number !==
            transaction.startState.doc.lineAt(to).number
        )
          replacesNewlines = true;
      });
      // Even an identical resulting map must be restored when undo reinserts lines;
      // rebuilding those lines with the default EOL would otherwise lose mixed endings.
      return !replacesNewlines &&
        before.eols === after.eols &&
        before.bom === after.bom
        ? []
        : [restore.of(before)];
    }),
  ];
  return { field, extension, restore };
}

/** Attach each inserted range's exact newline spelling using its position in the resulting doc. */
export function sourceChangesFromTransaction(transaction, field) {
  const layout = transaction.state.field(field);
  const changes = [];
  transaction.changes.iterChanges((from, to, fromB, _toB, inserted) => {
    const line = transaction.newDoc.lineAt(fromB).number - 1;
    changes.push({
      from,
      to,
      insert: inserted.toString(),
      eols: layout.eols.slice(line, line + inserted.lines - 1),
    });
  });
  return changes;
}
