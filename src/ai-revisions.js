import { ChangeSet } from "@codemirror/state";
import { t } from "./i18n.js";

/**
 * Follows every editor change after a point in time, so a range recorded then
 * can be located in the current document. If a change arrives that does not
 * fit the recorded length (the document was replaced), the tracker breaks and
 * every range it maps becomes unavailable.
 */
export function createChangeTracker(length) {
  let changes = ChangeSet.empty(length),
    broken = false;
  return {
    get length() {
      return changes.newLength;
    },
    get broken() {
      return broken;
    },
    add(set) {
      if (broken || !set) return;
      if (set.length !== changes.newLength) {
        broken = true;
        return;
      }
      changes = changes.compose(set);
    },
    // A passage: shrinks away from insertions at its edges, so text typed
    // directly before or after it does not count as an edit of the passage.
    map(from, to) {
      if (broken) return null;
      const start = changes.mapPos(from, 1),
        end = changes.mapPos(to, -1);
      return start <= end ? { from: start, to: end } : null;
    },
    // A region such as the analyzed scope: grows to include edge insertions.
    mapRegion(from, to) {
      if (broken) return null;
      return { from: changes.mapPos(from, -1), to: changes.mapPos(to, 1) };
    },
  };
}

/** The single occurrence of `needle` within [from, to), or null. */
export function uniqueOccurrence(text, needle, from = 0, to = text.length) {
  if (!needle) return null;
  const first = text.indexOf(needle, from);
  if (first < 0 || first + needle.length > to) return null;
  const second = text.indexOf(needle, first + 1);
  if (second >= 0 && second + needle.length <= to) return null;
  return { from: first, to: first + needle.length };
}

/**
 * Locate an anchored passage in the current text. The anchor records where
 * `expected` was when its tracker started. Returns null when the passage was
 * edited, removed or the document was replaced.
 */
export function locateAnchor(anchor, text) {
  if (!anchor || anchor.tracker.broken || anchor.tracker.length !== text.length)
    return null;
  const range = anchor.tracker.map(anchor.from, anchor.to);
  if (!range || text.slice(range.from, range.to) !== anchor.expected)
    return null;
  return range;
}

/** Combine revisions for one transaction; overlapping ones are refused. */
export function combineAIRevisions(context, revisions) {
  const changes = revisions
    .map((revision) => validateAIRevision(context, revision))
    .sort((a, b) => a.from - b.from);
  for (let index = 1; index < changes.length; index++)
    if (changes[index].from < changes[index - 1].to)
      throw new Error(
        t(
          "所选修改的范围相互重叠，请逐条应用。",
          "Selected revisions overlap. Apply them one at a time.",
        ),
      );
  return changes;
}

// Validate again at the editor transaction boundary, including locks and document changes.
export function validateAIRevision(context, revision) {
  if (
    context.readOnly ||
    context.identity !== revision.identity ||
    context.text !== revision.text
  )
    throw new Error(
      t(
        "文档已变化或处于锁定状态，无法应用此修改。",
        "The document changed or is locked. This revision cannot be applied.",
      ),
    );
  const { from, to, original, replacement } = revision;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    // An empty target is only valid for restoring a deleted passage.
    (to === from && original !== "") ||
    to > context.text.length ||
    typeof original !== "string" ||
    typeof replacement !== "string" ||
    replacement.length > 200000 ||
    context.text.slice(from, to) !== original
  )
    throw new Error(
      t(
        "建议对应的原文已变化，无法应用。",
        "The proposed revision does not match the original text.",
      ),
    );
  return { from, to, insert: replacement.replace(/\r\n|\r/g, "\n") };
}

// Resolve a quoted passage only when its location is unambiguous in the analyzed scope.
export function resolveAIRevision(snapshot, suggestion) {
  if (
    !suggestion ||
    typeof suggestion.original !== "string" ||
    !suggestion.original ||
    typeof suggestion.replacement !== "string"
  )
    return null;
  const first = snapshot.source.indexOf(suggestion.original);
  if (first < 0 || snapshot.source.indexOf(suggestion.original, first + 1) >= 0)
    return null;
  const from = snapshot.offset + first;
  return {
    identity: snapshot.identity,
    text: snapshot.text,
    from,
    to: from + suggestion.original.length,
    original: suggestion.original,
    replacement: suggestion.replacement,
  };
}

export function boundAIHistory(history) {
  // Four complete turns fit the provider's 100k history budget even at max length.
  return history.slice(-8).map(({ role, content }) => ({
    role,
    content: String(content).slice(0, role === "user" ? 8000 : 16000),
  }));
}
