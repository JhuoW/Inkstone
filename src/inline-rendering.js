import { markdownLanguage } from "@codemirror/lang-markdown";
import { Decoration, WidgetType } from "@codemirror/view";
import { inlineMathOffsetAtPoint } from "./inline-math-caret.js";

const styled = {
  StrongEmphasis: "cm-inline-strong",
  Emphasis: "cm-inline-emphasis",
  InlineCode: "cm-inline-code",
  Strikethrough: "cm-inline-strike",
};
function touches(selection, from, to) {
  return selection.ranges.some((range) =>
    range.empty
      ? range.head >= from && range.head <= to
      : range.from < to && range.to > from,
  );
}

/** Decorations never rewrite source. Cursor/selection intersection reveals the containing syntax. */
export function inlineRanges(block, selection, math = []) {
  if (!["paragraph_open", "heading_open"].includes(block.type)) return [];
  const ranges = [],
    base = block.from,
    parsedStyles = [],
    protectedRanges = math.map((range) => ({
      from: range.from - block.from,
      to: range.to - block.from,
    }));
  let sawHeaderMark = false;
  const tree = markdownLanguage.parser.parse(block.text);
  const hide = (from, to) => {
    if (to > from)
      ranges.push({ kind: "hide", from: base + from, to: base + to });
  };
  const mark = (from, to, className, attributes) => {
    if (to > from)
      ranges.push({
        kind: "mark",
        from: base + from,
        to: base + to,
        className,
        attributes,
      });
  };
  tree.iterate({
    enter(node) {
      const { name, from, to } = node;
      if (
        (styled[name] || name === "Link") &&
        math.some((range) => base + from < range.to && base + to > range.from)
      )
        return false;
      const exposed = touches(selection, base + from, base + to);
      if (["InlineCode", "HTMLTag", "Image", "URL"].includes(name))
        protectedRanges.push({ from, to });
      if (styled[name]) {
        parsedStyles.push({ from, to });
        const children = [];
        for (let child = node.node.firstChild; child; child = child.nextSibling)
          children.push(child);
        const first = children[0],
          last = children[children.length - 1];
        if (!first || !last) return;
        mark(first.to, last.from, styled[name]);
        if (!exposed) {
          hide(first.from, first.to);
          hide(last.from, last.to);
        }
      } else if (name === "Link") {
        const children = [];
        for (let child = node.node.firstChild; child; child = child.nextSibling)
          children.push(child);
        const close = children.find(
          (child) =>
            child.name === "LinkMark" &&
            block.text.slice(child.from, child.to) === "]",
        );
        const url = children.find((child) => child.name === "URL");
        if (close && url) {
          mark(from + 1, close.from, "cm-inline-link", {
            "data-inkstone-href": block.text.slice(url.from, url.to),
            role: "link",
          });
          if (!exposed) {
            hide(from, from + 1);
            hide(close.from, to);
          }
        }
      } else if (name === "HeaderMark") {
        sawHeaderMark = true;
        let end = to;
        while (block.text[end] === " " || block.text[end] === "\t") end++;
        if (!touches(selection, base + from, base + end)) hide(from, end);
      }
    },
  });
  if (block.environment?.options?.cjkEmphasis) {
    // Supplement only spans the document's configured parser actually rendered.
    // This covers CJK punctuation rules without interpreting code/HTML as emphasis.
    const tokens =
        block.tokens?.find((token) => token.type === "inline")?.children || [],
      stack = [],
      allowed = [];
    for (const token of tokens) {
      if (token.type === "strong_open" || token.type === "em_open")
        stack.push({ type: token.type, markup: token.markup, text: "" });
      else if (token.type === "strong_close" || token.type === "em_close") {
        const span = stack.pop();
        if (span) allowed.push(span);
      } else if (token.type === "text" || token.type === "code_inline")
        for (const span of stack) span.text += token.content;
    }
    for (const match of block.text.matchAll(
      /(\*\*|__|\*|_)(?=\S)([^\n]*?\S)\1/g,
    )) {
      const from = match.index,
        to = from + match[0].length;
      const span = allowed.find(
        (item) => item.markup === match[1] && item.text === match[2],
      );
      if (
        !span ||
        parsedStyles.some((range) => range.from === from && range.to === to) ||
        protectedRanges.some((range) => from < range.to && to > range.from)
      )
        continue;
      mark(
        from + match[1].length,
        to - match[1].length,
        span.type === "strong_open" ? "cm-inline-strong" : "cm-inline-emphasis",
      );
      if (!touches(selection, base + from, base + to)) {
        hide(from, from + match[1].length);
        hide(to - match[1].length, to);
      }
    }
  }
  if (block.type === "heading_open") {
    const relaxed = !sawHeaderMark && block.text.match(/^ {0,3}#{1,6}[ \t]*/);
    if (relaxed && !touches(selection, base, base + relaxed[0].length))
      hide(0, relaxed[0].length);
    ranges.push({
      kind: "line",
      from: base,
      to: base,
      className: `cm-inline-heading cm-inline-h${block.headingLevel || 1}`,
    });
  }
  return ranges;
}

class InlineMathWidget extends WidgetType {
  constructor(html, range, locale, onActivate) {
    super();
    this.html = html;
    this.range = range;
    this.locale = locale;
    this.onActivate = onActivate;
  }
  eq(other) {
    return (
      this.html === other.html &&
      this.locale === other.locale &&
      this.range.to - this.range.from === other.range.to - other.range.from
    );
  }
  toDOM(view) {
    const element = document.createElement("span");
    element.className = "cm-inline-math";
    element.innerHTML = this.html;
    element.title =
      this.locale === "zh-CN"
        ? "点击编辑公式 · Ctrl+Enter 完成"
        : "Click to edit formula · Ctrl+Enter to finish";
    element.setAttribute("aria-label", element.title);
    element.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || view.state.readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      const from = view.posAtDOM(element);
      const contentFrom = from + this.range.contentFrom - this.range.from;
      const contentTo = from + this.range.contentTo - this.range.from;
      const head =
        contentFrom +
        inlineMathOffsetAtPoint(
          element,
          view.state.sliceDoc(contentFrom, contentTo),
          event.clientX,
          event.clientY,
        );
      this.onActivate?.(
        view,
        {
          contentFrom,
          contentTo,
          head,
        },
        event,
      );
      view.dispatch({
        selection: {
          anchor: event.shiftKey ? view.state.selection.main.anchor : head,
          head,
        },
        userEvent: "select.pointer",
      });
      view.focus();
    });
    return element;
  }
  ignoreEvent() {
    return true;
  }
}

export function makeInlineDecorations(blocks, state, mathOptions = {}) {
  const ranges = [];
  for (const block of blocks) {
    if (
      !state.selection.ranges.some(
        (range) => range.from <= block.to && range.to >= block.from,
      )
    )
      continue;
    const math = ["paragraph_open", "heading_open"].includes(block.type)
      ? mathOptions.ranges?.(block) || []
      : [];
    for (const range of inlineRanges(block, state.selection, math)) {
      if (range.kind === "line")
        ranges.push(
          Decoration.line({ class: range.className }).range(range.from),
        );
      else if (range.kind === "hide")
        ranges.push(Decoration.replace({}).range(range.from, range.to));
      else
        ranges.push(
          Decoration.mark({
            class: range.className,
            attributes: range.attributes,
          }).range(range.from, range.to),
        );
    }
    for (const range of math) {
      const active = state.selection.ranges.some((selection) =>
        selection.empty
          ? selection.head >= range.from && selection.head < range.to
          : selection.from < range.to && selection.to > range.from,
      );
      if (active) {
        ranges.push(
          Decoration.mark({ class: "cm-math-source" }).range(
            range.from,
            range.to,
          ),
        );
      } else {
        const widget = new InlineMathWidget(
          mathOptions.render(range.token, block),
          range,
          mathOptions.locale,
          mathOptions.onActivate,
        );
        ranges.push(Decoration.replace({ widget }).range(range.from, range.to));
      }
    }
  }
  return Decoration.set(ranges, true);
}
