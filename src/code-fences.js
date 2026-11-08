import { Decoration, WidgetType } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";

const previewLanguages = new Set([
  "math",
  "mermaid",
  "flow",
  "flowchart",
  "sequence",
]);
const preferredNames = {
  "C++": "cpp",
  "C#": "csharp",
  Shell: "shell",
  "Objective-C": "objective-c",
};
export const codeLanguages = languages
  .map((language) => ({
    name: language.name,
    value:
      preferredNames[language.name] ||
      (/^[\w+#.-]+$/.test(language.name)
        ? language.name.toLowerCase()
        : language.alias.find((alias) => /^[\w+#.-]+$/.test(alias))) ||
      language.extensions[0],
    aliases: language.alias,
  }))
  .filter((language) => language.value)
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

// Some descriptors only declare a spaced/display name (e.g. Web IDL), while
// Markdown fences require a single token. Resolve every picker value explicitly.
const languageByValue = new Map(
  codeLanguages.map((choice) => [
    choice.value,
    languages.find((language) => language.name === choice.name),
  ]),
);
export function resolveCodeLanguage(info) {
  const token = info.trim().split(/\s+/)[0].toLowerCase();
  return (
    languageByValue.get(token) ||
    LanguageDescription.matchLanguageName(languages, token, true)
  );
}

/** Source spans are derived from the actual opening delimiter, including tilde/long fences. */
export function fenceRange(block) {
  if (block?.type !== "fence") return null;
  const opening = /^( {0,3})(`{3,}|~{3,})([^\n]*)/.exec(block.text);
  if (!opening) return null;
  const headerTo = block.from + opening[0].length;
  const bodyFrom = Math.min(headerTo + 1, block.to);
  const lastBreak = block.text.lastIndexOf("\n");
  const lastLine = block.text.slice(lastBreak + 1);
  const closing = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(lastLine);
  const closed =
    lastBreak >= 0 &&
    closing &&
    closing[2][0] === opening[2][0] &&
    closing[2].length >= opening[2].length;
  const closingFrom = closed ? block.from + lastBreak + 1 : null;
  const info = opening[3];
  const language = info.trim().split(/\s+/)[0] || "";
  return {
    from: block.from,
    to: block.to,
    headerTo,
    bodyFrom,
    bodyTo: closed ? Math.max(bodyFrom, closingFrom - 1) : block.to,
    closingFrom,
    language,
    delimiter: opening[2],
    languageFrom:
      block.from +
      opening[1].length +
      opening[2].length +
      (info.match(/^[ \t]*/)?.[0].length || 0),
    languageTo:
      block.from +
      opening[1].length +
      opening[2].length +
      (info.match(/^[ \t]*\S*/)?.[0].length || 0),
    empty: closed && closingFrom === bodyFrom,
  };
}

export function isCodeFence(block) {
  const range = fenceRange(block);
  return range && !previewLanguages.has(range.language.toLowerCase());
}

export function changeCodeLanguage(view, range, language) {
  if (view.state.readOnly || !/^[\w+#.-]{0,80}$/.test(language)) return false;
  if (!language && view.state.sliceDoc(range.languageTo, range.headerTo).trim())
    language = "text";
  view.dispatch({
    changes: [
      { from: range.languageFrom, to: range.languageTo, insert: language },
      ...(range.empty ? [{ from: range.bodyFrom, insert: "\n" }] : []),
    ],
    annotations: isolateHistory.of("full"),
    userEvent: "input.code-language",
  });
  return true;
}

export function codeFenceEditing(field) {
  return EditorState.transactionFilter.of((transaction) => {
    const live = transaction.startState.field(field, false);
    if (
      live?.mode !== "live" ||
      live.composing ||
      transaction.startState.readOnly ||
      transaction.isUserEvent("undo") ||
      transaction.isUserEvent("redo")
    )
      return transaction;
    const ranges = live.blocks.filter(isCodeFence).map(fenceRange);
    if (!transaction.docChanged && transaction.selection?.main.empty) {
      const head = transaction.selection.main.head;
      const previous = transaction.startState.selection.main.head;
      for (const range of ranges) {
        let anchor;
        if (
          head >= range.from &&
          head <= range.headerTo &&
          range.headerTo < range.to
        )
          anchor =
            head < previous && range.from > 0 ? range.from - 1 : range.bodyFrom;
        else if (
          range.closingFrom != null &&
          head >= range.closingFrom &&
          head <= range.to
        )
          anchor =
            head > previous && range.to < transaction.newDoc.length
              ? range.to + 1
              : range.bodyTo;
        if (anchor != null && anchor !== head)
          return [transaction, { selection: { anchor }, sequential: true }];
      }
      return transaction;
    }
    if (!transaction.docChanged) return transaction;
    const changes = [];
    transaction.changes.iterChangedRanges((from, to) =>
      changes.push({ from, to }),
    );
    const range = ranges.find(
      (range) =>
        range.closingFrom != null &&
        changes.every(
          (change) =>
            change.from >= range.bodyFrom && change.to <= range.bodyTo,
        ),
    );
    if (!range) return transaction;
    if (range.empty) {
      const end = transaction.changes.mapPos(range.bodyFrom, 1);
      if (transaction.newDoc.sliceString(range.bodyFrom, end).endsWith("\n"))
        return transaction;
      return [
        transaction,
        { changes: { from: end, insert: "\n" }, sequential: true },
      ];
    }
    const body = transaction.newDoc.sliceString(
      transaction.changes.mapPos(range.bodyFrom, -1),
      transaction.changes.mapPos(range.bodyTo, 1),
    );
    const pattern =
      range.delimiter[0] === "`"
        ? /^ {0,3}(`+)[ \t]*$/gm
        : /^ {0,3}(~+)[ \t]*$/gm;
    const longest = Math.max(
      0,
      ...[...body.matchAll(pattern)].map((match) => match[1].length),
    );
    if (longest < range.delimiter.length) return transaction;
    const opening = transaction.startState.doc.lineAt(range.from).text;
    const closing = transaction.startState.doc.lineAt(range.closingFrom).text;
    const from = range.from + opening.search(/[`~]/);
    const close = range.closingFrom + closing.search(/[`~]/);
    const delimiter = range.delimiter[0].repeat(longest + 1);
    return [
      transaction,
      {
        changes: [
          {
            from: transaction.changes.mapPos(from),
            to: transaction.changes.mapPos(from + range.delimiter.length),
            insert: delimiter,
          },
          {
            from: transaction.changes.mapPos(close, 1),
            to: transaction.changes.mapPos(close + closing.trim().length, 1),
            insert: delimiter,
          },
        ],
        sequential: true,
      },
    ];
  });
}

class CodeHeader extends WidgetType {
  constructor(range, options) {
    super();
    this.range = range;
    this.options = options;
  }
  eq(other) {
    return (
      this.range.language === other.range.language &&
      this.range.empty === other.range.empty &&
      this.range.bodyFrom - this.range.from ===
        other.range.bodyFrom - other.range.from &&
      this.range.languageFrom - this.range.from ===
        other.range.languageFrom - other.range.from &&
      this.options.locale === other.options.locale &&
      this.options.readOnly === other.options.readOnly
    );
  }
  toDOM(view) {
    const element = document.createElement("span");
    element.className = "cm-code-header";
    const label = document.createElement("span");
    const chinese = this.options.locale === "zh-CN";
    label.textContent = chinese ? "代码" : "Code";
    label.className = "cm-code-label";
    const select = document.createElement("select");
    select.className = "cm-code-language";
    select.setAttribute("aria-label", chinese ? "代码语言" : "Code language");
    select.title = select.getAttribute("aria-label");
    select.disabled = Boolean(this.options.readOnly);
    select.add(new Option(chinese ? "纯文本" : "Plain text", ""));
    for (const language of codeLanguages)
      select.add(new Option(language.name, language.value));
    const current = /^(?:text|plaintext|txt)$/i.test(this.range.language)
      ? ""
      : this.range.language;
    if (
      current &&
      ![...select.options].some((option) => option.value === current)
    ) {
      const language = codeLanguages.find((entry) =>
        entry.aliases.includes(current.toLowerCase()),
      );
      select.add(
        new Option(
          language ? `${language.name} (${current})` : current,
          current,
        ),
      );
    }
    select.value = current;
    // Resolve the source position from the current DOM, never a captured offset.
    // Earlier paragraphs can change while this widget is retained by CodeMirror.
    const currentRange = () => {
      const from = view.state.doc.lineAt(view.posAtDOM(element)).from;
      const header = view.state.doc.lineAt(from);
      const closing = new RegExp(
        `^ {0,3}${this.range.delimiter[0]}{${this.range.delimiter.length},}[ \\t]*$`,
      );
      let to = view.state.doc.length;
      for (
        let number = header.number + 1;
        number <= view.state.doc.lines;
        number++
      ) {
        const line = view.state.doc.line(number);
        if (closing.test(line.text)) {
          to = line.to;
          break;
        }
      }
      return fenceRange({
        type: "fence",
        from,
        to,
        text: view.state.sliceDoc(from, to),
      });
    };
    select.addEventListener("change", () => {
      const range = currentRange();
      const value = select.value;
      const selection = view.state.selection.main;
      const editingBody =
        selection.from >= range.bodyFrom && selection.to <= range.bodyTo;
      if (!changeCodeLanguage(view, range, value)) return;
      if (!editingBody)
        view.dispatch({
          selection: { anchor: view.state.doc.lineAt(range.from).to + 1 },
          scrollIntoView: true,
        });
      view.focus();
    });
    select.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        view.focus();
      }
    });
    element.addEventListener("mousedown", (event) => {
      if (event.target === select || event.button !== 0) return;
      event.preventDefault();
      const range = currentRange();
      if (range.empty && !view.state.readOnly) {
        view.dispatch({
          changes: { from: range.bodyFrom, insert: "\n" },
          selection: { anchor: range.bodyFrom },
          userEvent: "input",
        });
      } else view.dispatch({ selection: { anchor: range.bodyFrom } });
      view.focus();
    });
    element.append(label, select);
    return element;
  }
  ignoreEvent() {
    return true;
  }
}

class CodeFooter extends WidgetType {
  constructor(empty) {
    super();
    this.empty = empty;
  }
  eq(other) {
    return this.empty === other.empty;
  }
  toDOM(view) {
    const element = document.createElement("span");
    element.className = `cm-code-footer${this.empty ? " cm-code-empty" : ""}`;
    element.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const from = view.state.doc.lineAt(view.posAtDOM(element)).from;
      if (this.empty && !view.state.readOnly)
        view.dispatch({
          changes: { from, insert: "\n" },
          selection: { anchor: from },
          userEvent: "input",
        });
      else view.dispatch({ selection: { anchor: Math.max(0, from - 1) } });
      view.focus();
    });
    return element;
  }
  ignoreEvent() {
    return true;
  }
}

/** Keep code as native editable document lines: one selection, clipboard and undo history. */
export function decorateCodeFence(block, state, options) {
  const range = fenceRange(block);
  // A just-typed opening fence still needs Enter before its code area exists.
  if (!range || range.headerTo === block.to) return null;
  const result = [
    Decoration.line({ class: "cm-code-heading" }).range(block.from),
    Decoration.replace({
      widget: new CodeHeader(range, options),
      codeFenceMarker: true,
    }).range(block.from, range.headerTo),
  ];
  const first = state.doc.lineAt(range.bodyFrom).number;
  const last = state.doc.lineAt(range.bodyTo).number;
  if (!range.empty)
    for (let number = first; number <= last; number++) {
      const line = state.doc.line(number);
      result.push(
        Decoration.line({
          class: `cm-code-line${options.codeWrap === false ? " cm-code-nowrap" : ""}${range.closingFrom == null && number === last ? " cm-code-last" : ""}`,
          attributes: {
            "data-code-line": String(number - first + 1),
            ...(options.lineNumbers
              ? { "data-code-number": String(number - first + 1) }
              : {}),
          },
        }).range(line.from),
      );
    }
  if (range.closingFrom != null)
    result.push(
      Decoration.line({ class: "cm-code-ending" }).range(range.closingFrom),
      Decoration.replace({
        widget: new CodeFooter(range.empty),
        codeFenceMarker: true,
      }).range(range.closingFrom, block.to),
    );
  return result;
}
