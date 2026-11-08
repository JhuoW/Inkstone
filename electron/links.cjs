"use strict";
const path = require("node:path");

// Save As rewrites only parsed destination spans. Markdown itself is never serialized.
function rebaseLocalLinks(text, originalPath, targetPath) {
  if (!originalPath || path.dirname(originalPath) === path.dirname(targetPath))
    return { text, changed: 0, warnings: [] };
  const mask = new Uint8Array(text.length),
    changes = [];
  const frontMatter =
    /^(?:\ufeff)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(text);
  if (frontMatter) {
    mask.fill(1, 0, frontMatter[0].length);
    if (/^typora-root-url\s*:/m.test(frontMatter[0]))
      return {
        text,
        changed: 0,
        warnings: [
          "Relative links were preserved because YAML typora-root-url supplies a custom base. Review that base after Save As.",
        ],
      };
  }
  let fence = null;
  for (const line of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!line[0]) continue;
    const marker = /^(?: {0,3}>[ \t]?)*[ \t]*(`{3,}|~{3,})/.exec(line[0]);
    if (fence) {
      mask.fill(1, line.index, line.index + line[0].length);
      if (
        marker &&
        marker[1][0] === fence.char &&
        marker[1].length >= fence.length
      )
        fence = null;
    } else if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      mask.fill(1, line.index, line.index + line[0].length);
    } else if (/^(?:\t| {4})/.test(line[0]))
      mask.fill(1, line.index, line.index + line[0].length);
  }
  for (const match of text.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi))
    mask.fill(1, match.index, match.index + match[0].length);
  for (let i = 0; i < text.length; i++) {
    if (mask[i] || text[i] !== "`") continue;
    let length = 1;
    while (text[i + length] === "`") length++;
    let end = i + length;
    while ((end = text.indexOf("`".repeat(length), end)) !== -1) {
      if (text[end - 1] !== "`" && text[end + length] !== "`") break;
      end += length;
    }
    if (end !== -1) {
      mask.fill(1, i, end + length);
      i = end + length - 1;
    } else i += length - 1;
  }
  const rebase = (from, to) => {
    const original = text.slice(from, to);
    if (!original || /^(?:[a-z][a-z\d+.-]*:|[\/#?]|\\\\)/i.test(original))
      return;
    const split = original.search(/[?#]/);
    const destination = split < 0 ? original : original.slice(0, split),
      suffix = split < 0 ? "" : original.slice(split);
    let decoded;
    try {
      decoded = decodeURIComponent(destination.replace(/\\([ ()\\])/g, "$1"));
    } catch {
      return;
    }
    const absolute = path.resolve(path.dirname(originalPath), decoded);
    let relative = path
      .relative(path.dirname(targetPath), absolute)
      .split(path.sep)
      .join("/");
    if (!relative) relative = path.basename(absolute);
    const replacement =
      relative
        .replace(/%/g, "%25")
        .replace(/ /g, "%20")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/#/g, "%23")
        .replace(/\?/g, "%3F") + suffix;
    if (replacement !== original)
      changes.push({ from, to, insert: replacement });
  };
  // HTML media/link attributes are processed only outside code, then excluded from Markdown scanning.
  for (const tag of text.matchAll(/<(?:img|a|audio|video|source)\b[^>]*>/gi)) {
    if (mask[tag.index]) continue;
    for (const attribute of tag[0].matchAll(
      /\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi,
    )) {
      const offset = attribute[0].indexOf(attribute[1]) + 1;
      rebase(
        tag.index + attribute.index + offset,
        tag.index + attribute.index + offset + attribute[2].length,
      );
    }
    mask.fill(1, tag.index, tag.index + tag[0].length);
  }
  for (const definition of text.matchAll(
    /^ {0,3}\[[^\]\n]+\]:[ \t]*(?:<([^>\n]+)>|([^\s]+))/gm,
  )) {
    if (mask[definition.index]) continue;
    const destination = definition[1] ?? definition[2];
    const from = definition.index + definition[0].lastIndexOf(destination);
    rebase(from, from + destination.length);
    mask.fill(1, definition.index, definition.index + definition[0].length);
  }
  for (let i = 0; i < text.length; i++) {
    if (mask[i] || text[i] !== "[" || (i > 0 && text[i - 1] === "\\")) continue;
    let cursor = i + 1,
      depth = 1;
    for (; cursor < text.length && depth; cursor++) {
      if (text[cursor] === "\\") {
        cursor++;
        continue;
      }
      if (text[cursor] === "[") depth++;
      else if (text[cursor] === "]") depth--;
    }
    if (depth || text[cursor] !== "(") continue;
    cursor++;
    while (/[ \t\r\n]/.test(text[cursor] || "") && cursor < text.length)
      cursor++;
    let from = cursor,
      to = cursor;
    if (text[cursor] === "<") {
      from = ++cursor;
      while (
        cursor < text.length &&
        text[cursor] !== ">" &&
        text[cursor] !== "\n"
      )
        cursor++;
      if (text[cursor] !== ">") continue;
      to = cursor;
    } else {
      let nesting = 0;
      for (; cursor < text.length; cursor++) {
        const char = text[cursor];
        if (char === "\\") {
          cursor++;
          continue;
        }
        if (char === "(") nesting++;
        else if (char === ")") {
          if (!nesting) break;
          nesting--;
        } else if (/\s/.test(char) && !nesting) break;
      }
      to = cursor;
    }
    if (to > from) rebase(from, to);
    i = Math.max(i, cursor - 1);
  }
  changes.sort((a, b) => b.from - a.from);
  let output = text,
    last = text.length;
  for (const change of changes) {
    if (change.to > last) continue;
    output =
      output.slice(0, change.from) + change.insert + output.slice(change.to);
    last = change.from;
  }
  return { text: output, changed: changes.length, warnings: [] };
}
module.exports = { rebaseLocalLinks };
