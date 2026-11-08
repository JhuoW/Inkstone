/** Markdown remains source text. Only changed ranges are patched in the original byte-level layout. */
export function normalizeSource(raw) {
  return raw.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n");
}
export const LINE_ENDINGS = Object.freeze({ L: "\n", C: "\r\n", R: "\r" });
export function captureSourceLayout(raw, defaultEol) {
  const endings = [...String(raw).matchAll(/\r\n|\r|\n/g)]
    .map((match) => (match[0] === "\r\n" ? "C" : match[0] === "\r" ? "R" : "L"))
    .join("");
  if (!defaultEol) {
    const counts = { L: 0, C: 0, R: 0 };
    for (const token of endings) counts[token]++;
    defaultEol =
      counts.C > counts.L && counts.C >= counts.R
        ? "C"
        : counts.R > counts.L
          ? "R"
          : "L";
  }
  return Object.freeze({
    bom: raw.charCodeAt(0) === 0xfeff,
    eols: endings,
    defaultEol,
  });
}
export class SourceDocument {
  constructor(raw = "") {
    this.reset(raw);
  }
  reset(raw) {
    this.raw = String(raw);
    this.normalized = normalizeSource(this.raw);
    this.defaultEol = captureSourceLayout(this.raw).defaultEol;
    this.eol = LINE_ENDINGS[this.defaultEol];
    this.indexLineEndings();
  }
  getLayout() {
    return captureSourceLayout(this.raw, this.defaultEol);
  }
  indexLineEndings() {
    const bom = this.raw.charCodeAt(0) === 0xfeff ? 1 : 0;
    this.bom = bom;
    let count = 0;
    this.crlfPositions = [...this.raw.matchAll(/\r\n/g)].map(
      (match) => match.index - bom - count++,
    );
  }
  rawOffset(position) {
    let low = 0,
      high = this.crlfPositions.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.crlfPositions[mid] < position) low = mid + 1;
      else high = mid;
    }
    return position + this.bom + low;
  }
  apply(changes, nextText) {
    // The caller may supply precise per-insertion EOL tokens from CodeMirror's history.
    // Ordinary callers get the document's default EOL. No complete-document snapshots exist.
    const ordered = [...changes]
      .sort((a, b) => a.from - b.from)
      .map((change) => {
        const insert = String(change.insert).replace(/\r\n|\r/g, "\n");
        const count = (insert.match(/\n/g) || []).length;
        const eols = change.eols ?? this.defaultEol.repeat(count);
        if (eols.length !== count || /[^LCR]/.test(eols))
          throw new Error("Invalid source line-ending metadata.");
        let index = 0;
        return {
          ...change,
          insert,
          eols,
          rawInsert: insert.replace(/\n/g, () => LINE_ENDINGS[eols[index++]]),
        };
      });
    let result = this.raw;
    for (const change of [...ordered].reverse())
      result =
        result.slice(0, this.rawOffset(change.from)) +
        change.rawInsert +
        result.slice(this.rawOffset(change.to));
    const nextPositions = [];
    let index = 0,
      delta = 0;
    for (const change of ordered) {
      while (
        index < this.crlfPositions.length &&
        this.crlfPositions[index] < change.from
      )
        nextPositions.push(this.crlfPositions[index++] + delta);
      while (
        index < this.crlfPositions.length &&
        this.crlfPositions[index] < change.to
      )
        index++;
      let ending = 0;
      for (const match of change.insert.matchAll(/\n/g))
        if (change.eols[ending++] === "C")
          nextPositions.push(change.from + delta + match.index);
      delta += change.insert.length - (change.to - change.from);
    }
    while (index < this.crlfPositions.length)
      nextPositions.push(this.crlfPositions[index++] + delta);
    this.crlfPositions = nextPositions;
    this.normalized = nextText ?? normalizeSource(result);
    this.raw = result;
    return this.raw;
  }
}
export function wordStatistics(text) {
  const content = normalizeSource(text);
  const cjk = (
    content.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
    ) || []
  ).length;
  const words =
    (
      content
        .replace(
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
          " ",
        )
        .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []
    ).length + cjk;
  return {
    words,
    characters: [...content].length,
    charactersWithoutSpaces: [...content.replace(/\s/g, "")].length,
    lines: content.split("\n").length,
    cjk,
    readingMinutes: Math.max(1, Math.ceil(words / 250)),
  };
}
