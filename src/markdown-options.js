/**
 * Per-parser Markdown policies. No source-string preprocessing is performed.
 * The list tokenization structure adapts markdown-it 15.0.3's MIT list rule:
 * Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin.
 * Its complete permission notice is retained in THIRD_PARTY_NOTICES.md.
 * https://github.com/markdown-it/markdown-it
 * Typora's documented differences: https://support.typora.io/Strict-Mode/
 */
const installed = new WeakMap();
const isSpace = (code) => code === 0x20 || code === 0x09;
const isCJK = (char) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u.test(
    char,
  );
const edgeBefore = (source, position) =>
  Array.from(source.slice(Math.max(0, position - 2), position)).at(-1) || "";
const edgeAfter = (source, position) =>
  String.fromCodePoint(source.codePointAt(position) || 0);

function looseHeading(state, startLine, _endLine, silent) {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const begin = state.bMarks[startLine] + state.tShift[startLine],
    end = state.eMarks[startLine];
  let cursor = begin;
  while (state.src.charCodeAt(cursor) === 35 && cursor < end) cursor++;
  const level = cursor - begin;
  // The built-in rule handles conventional headings and empty headings unchanged.
  if (
    level < 1 ||
    level > 6 ||
    cursor >= end ||
    isSpace(state.src.charCodeAt(cursor))
  )
    return false;
  if (silent) return true;
  const content = state.src
    .slice(cursor, end)
    .replace(/[ \t]+#+[ \t]*$/, "")
    .replace(/^[ \t]+|[ \t]+$/g, "");
  state.line = startLine + 1;
  const open = state.push("heading_open", `h${level}`, 1);
  open.markup = "#".repeat(level);
  open.map = [startLine, state.line];
  const inline = state.push("inline", "", 0);
  inline.content = content;
  inline.map = [startLine, state.line];
  inline.children = [];
  const close = state.push("heading_close", `h${level}`, -1);
  close.markup = open.markup;
  return true;
}

function listMarker(state, line, ordered) {
  const start = state.bMarks[line] + state.tShift[line],
    end = state.eMarks[line];
  let cursor = start;
  if (ordered) {
    while (
      cursor < end &&
      state.src.charCodeAt(cursor) >= 48 &&
      state.src.charCodeAt(cursor) <= 57
    )
      cursor++;
    if (
      cursor === start ||
      cursor - start > 9 ||
      ![41, 46].includes(state.src.charCodeAt(cursor))
    )
      return -1;
    cursor++;
  } else {
    if (![42, 43, 45].includes(state.src.charCodeAt(cursor))) return -1;
    cursor++;
  }
  return cursor < end && !isSpace(state.src.charCodeAt(cursor)) ? -1 : cursor;
}
function tightenParagraphs(state, start) {
  const level = state.level + 2;
  for (let index = start + 2; index < state.tokens.length - 2; index++) {
    if (
      state.tokens[index].level === level &&
      state.tokens[index].type === "paragraph_open"
    ) {
      state.tokens[index].hidden = true;
      state.tokens[index + 2].hidden = true;
      index += 2;
    }
  }
}
function looseList(state, startLine, endLine, silent) {
  let nextLine = startLine;
  if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
  if (
    state.listIndent >= 0 &&
    state.sCount[nextLine] - state.listIndent >= 4 &&
    state.sCount[nextLine] < state.blkIndent
  )
    return false;
  const interruptsParagraph =
    silent &&
    state.parentType === "paragraph" &&
    state.sCount[nextLine] >= state.blkIndent;
  let afterMarker = listMarker(state, nextLine, true),
    ordered = afterMarker >= 0;
  if (!ordered) afterMarker = listMarker(state, nextLine, false);
  if (afterMarker < 0) return false;
  let start = state.bMarks[nextLine] + state.tShift[nextLine];
  const markerValue = ordered
    ? Number(state.src.slice(start, afterMarker - 1))
    : 1;
  if (
    interruptsParagraph &&
    ((ordered && markerValue !== 1) ||
      state.skipSpaces(afterMarker) >= state.eMarks[nextLine])
  )
    return false;
  if (silent) return true;
  const marker = state.src.charCodeAt(afterMarker - 1),
    tokenStart = state.tokens.length;
  const open = state.push(
    ordered ? "ordered_list_open" : "bullet_list_open",
    ordered ? "ol" : "ul",
    1,
  );
  if (ordered && markerValue !== 1) open.attrs = [["start", markerValue]];
  const listLines = [nextLine, 0];
  open.map = listLines;
  open.markup = String.fromCharCode(marker);
  const terminators = state.md.block.ruler.getRules("list"),
    previousParent = state.parentType;
  state.parentType = "list";
  let tight = true,
    previousEmptyEnd = false;
  while (nextLine < endLine) {
    let cursor = afterMarker;
    const end = state.eMarks[nextLine];
    const initial =
      state.sCount[nextLine] +
      afterMarker -
      (state.bMarks[nextLine] + state.tShift[nextLine]);
    let offset = initial;
    while (cursor < end && isSpace(state.src.charCodeAt(cursor))) {
      offset +=
        state.src.charCodeAt(cursor) === 9
          ? 4 - ((offset + state.bsCount[nextLine]) % 4)
          : 1;
      cursor++;
    }
    const contentStart = cursor;
    let afterIndent = contentStart >= end ? 1 : offset - initial;
    if (afterIndent > 4) afterIndent = 1;
    const conventionalIndent = initial + afterIndent;
    // Typora's relaxed examples accept two spaces after any list marker width.
    const indent = Math.min(conventionalIndent, state.sCount[nextLine] + 2);
    const item = state.push("list_item_open", "li", 1);
    item.markup = String.fromCharCode(marker);
    const itemLines = [nextLine, 0];
    item.map = itemLines;
    if (ordered) item.info = state.src.slice(start, afterMarker - 1);
    const old = {
      tight: state.tight,
      tShift: state.tShift[nextLine],
      sCount: state.sCount[nextLine],
      getLines: state.getLines,
      listIndent: state.listIndent,
    };
    state.listIndent = state.blkIndent;
    state.blkIndent = indent;
    state.tight = true;
    // Only this marker line needs a wider prefix consumed than the following
    // relaxed continuation lines. Preserve actual coordinates (including tabs and
    // extra indentation for code) and translate the requested indent for this line.
    // No source characters or line maps change. Nested lists compose the adapters.
    const indentDifference = conventionalIndent - indent;
    const markerLine = nextLine;
    state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
    state.sCount[nextLine] = offset - indentDifference;
    state.getLines = function (begin, end, requestedIndent, keepLastLF) {
      if (begin !== markerLine || begin >= end)
        return old.getLines.call(this, begin, end, requestedIndent, keepLastLF);
      const first = old.getLines.call(
        this,
        begin,
        begin + 1,
        requestedIndent + indentDifference,
        begin + 1 < end || keepLastLF,
      );
      return (
        first +
        old.getLines.call(this, begin + 1, end, requestedIndent, keepLastLF)
      );
    };
    try {
      if (contentStart >= end && state.isEmpty(nextLine + 1))
        state.line = Math.min(state.line + 2, endLine);
      else state.md.block.tokenize(state, nextLine, endLine);
      if (!state.tight || previousEmptyEnd) tight = false;
      previousEmptyEnd =
        state.line - nextLine > 1 && state.isEmpty(state.line - 1);
    } finally {
      state.blkIndent = state.listIndent;
      state.listIndent = old.listIndent;
      state.tShift[nextLine] = old.tShift;
      state.sCount[nextLine] = old.sCount;
      state.getLines = old.getLines;
      state.tight = old.tight;
    }
    const closeItem = state.push("list_item_close", "li", -1);
    closeItem.markup = String.fromCharCode(marker);
    nextLine = state.line;
    itemLines[1] = nextLine;
    if (
      nextLine >= endLine ||
      state.sCount[nextLine] < state.blkIndent ||
      state.sCount[nextLine] - state.blkIndent >= 4
    )
      break;
    if (terminators.some((rule) => rule(state, nextLine, endLine, true))) break;
    afterMarker = listMarker(state, nextLine, ordered);
    if (afterMarker < 0 || marker !== state.src.charCodeAt(afterMarker - 1))
      break;
    if (ordered) start = state.bMarks[nextLine] + state.tShift[nextLine];
  }
  const close = state.push(
    ordered ? "ordered_list_close" : "bullet_list_close",
    ordered ? "ol" : "ul",
    -1,
  );
  close.markup = String.fromCharCode(marker);
  listLines[1] = nextLine;
  state.line = nextLine;
  state.parentType = previousParent;
  if (tight) tightenParagraphs(state, tokenStart);
  return true;
}

function cjkEmphasis(state, silent) {
  const marker = state.src.charCodeAt(state.pos);
  if (silent || (marker !== 42 && marker !== 95)) return false;
  const scanned = state.scanDelims(state.pos, marker === 42);
  const before = edgeBefore(state.src, state.pos),
    after = edgeAfter(state.src, state.pos + scanned.length);
  if (!isCJK(before) && !isCJK(after)) return false;
  const canOpen =
    scanned.can_open || Boolean(after && after !== "\0" && !/\s/u.test(after));
  const canClose = scanned.can_close || Boolean(before && !/\s/u.test(before));
  for (let index = 0; index < scanned.length; index++) {
    const token = state.push("text", "", 0);
    token.content = String.fromCharCode(marker);
    state.delimiters.push({
      marker,
      length: scanned.length,
      token: state.tokens.length - 1,
      end: -1,
      open: canOpen,
      close: canClose,
    });
  }
  state.pos += scanned.length;
  return true;
}

/**
 * Call immediately before parse/render on every path (including outline/live/export).
 * strictMarkdown defaults true (existing CommonMark behavior).
 * softBreaks and exportSoftBreaks default false, preserving the application defaults.
 * cjkEmphasis is an opt-in Inkstone enhancement, not a claim about undocumented Typora rules.
 */
export function configureMarkdownParser(
  md,
  settings = {},
  { target = "editor" } = {},
) {
  let policy = installed.get(md);
  if (!policy) {
    policy = {};
    installed.set(md, policy);
    md.block.ruler.before(
      "heading",
      "inkstone_relaxed_heading",
      (state, from, to, silent) =>
        !policy.strictMarkdown && looseHeading(state, from, to, silent),
      { alt: ["paragraph", "reference", "blockquote"] },
    );
    md.block.ruler.before(
      "list",
      "inkstone_relaxed_list",
      (state, from, to, silent) =>
        !policy.strictMarkdown && looseList(state, from, to, silent),
      { alt: ["paragraph", "reference", "blockquote"] },
    );
    md.inline.ruler.before(
      "emphasis",
      "inkstone_cjk_emphasis",
      (state, silent) => policy.cjkEmphasis && cjkEmphasis(state, silent),
    );
  }
  policy.strictMarkdown = settings.strictMarkdown !== false;
  policy.cjkEmphasis = settings.cjkEmphasis === true;
  const breaks =
    target === "export"
      ? settings.exportSoftBreaks === true
      : settings.softBreaks === true;
  md.set({ breaks });
  return md;
}
