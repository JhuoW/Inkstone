// Validate again at the editor transaction boundary, including locks and document changes.
export function validateAIRevision(context, revision) {
  if (
    context.readOnly ||
    context.identity !== revision.identity ||
    context.text !== revision.text
  )
    throw new Error(
      "The document changed or is locked. Analyze it again before applying a revision.",
    );
  const { from, to, original, replacement } = revision;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to <= from ||
    to > context.text.length ||
    typeof original !== "string" ||
    typeof replacement !== "string" ||
    replacement.length > 200000 ||
    context.text.slice(from, to) !== original
  )
    throw new Error("The proposed revision does not match the original text.");
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
