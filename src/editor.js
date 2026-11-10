import {
  EditorState,
  EditorSelection,
  StateField,
  StateEffect,
  Compartment,
  Prec,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  Decoration,
  WidgetType,
  keymap,
  drawSelection,
  highlightActiveLine,
  lineNumbers,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  isolateHistory,
  historyKeymap,
  indentWithTab,
  indentMore,
  indentLess,
  undo,
  redo,
  selectAll,
  deleteLine,
} from "@codemirror/commands";
import {
  markdown,
  markdownLanguage,
  markdownKeymap,
} from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  HighlightStyle,
  indentUnit,
  bracketMatching,
  syntaxTree,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  search,
  searchKeymap,
  openSearchPanel,
  getSearchQuery,
  searchPanelOpen,
} from "@codemirror/search";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  acceptCompletion,
  completionStatus,
} from "@codemirror/autocomplete";
import {
  renderMarkdown,
  renderBlockMarkdown,
  reparseParagraph,
  hydrateDiagrams,
  parseBlocks,
  formatMarkdownSource,
  getOutline,
  inlineMathRanges,
  renderInlineMath,
} from "./markdown.js";
import { SourceDocument, captureSourceLayout } from "./source.js";
import { structuralEdit } from "./structure-commands.js";
import { normalizeShortcut } from "./shortcuts.js";
import {
  createSourceHistory,
  sourceChangesFromTransaction,
} from "./source-history.js";
import {
  modifyTable,
  createTable,
  nextTableCell,
  locateTable,
  tableCellRanges,
} from "./tables.js";
import {
  installTableEditor,
  updateTableEditor,
  destroyTableEditor,
  focusTableCell,
  bindTableCommands,
} from "./table-editor.js";
import { makeInlineDecorations } from "./inline-rendering.js";
import { inlineMathOffsetAtPoint } from "./inline-math-caret.js";
import {
  decorateCodeFence,
  isCodeFence,
  fenceRange,
  changeCodeLanguage,
  codeFenceEditing,
  resolveCodeLanguage,
} from "./code-fences.js";
import "./editor.css";

// The same CSS palette colors source and rendered code. Resolving theme tokens
// in CSS avoids recreating editor state when the application changes theme.
const inkstoneHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-comment)" },
  {
    tag: [tags.link, tags.url],
    color: "var(--ink-link)",
    textDecoration: "underline",
  },
  { tag: tags.heading, color: "var(--text)", fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  {
    tag: [
      tags.atom,
      tags.bool,
      tags.literal,
      tags.contentSeparator,
      tags.labelName,
    ],
    color: "var(--syntax-literal)",
  },
  { tag: [tags.string, tags.inserted], color: "var(--syntax-string)" },
  { tag: tags.deleted, color: "var(--syntax-keyword)" },
  {
    tag: [tags.regexp, tags.escape, tags.special(tags.string)],
    color: "var(--syntax-builtin)",
  },
  {
    tag: [
      tags.definition(tags.variableName),
      tags.function(tags.variableName),
      tags.className,
      tags.namespace,
    ],
    color: "var(--syntax-title)",
  },
  {
    tag: [tags.local(tags.variableName), tags.definition(tags.propertyName)],
    color: "var(--syntax-literal)",
  },
  {
    tag: [tags.typeName, tags.special(tags.variableName), tags.macroName],
    color: "var(--syntax-builtin)",
  },
  { tag: tags.comment, color: "var(--syntax-comment)" },
  {
    tag: tags.invalid,
    color: "var(--error)",
    textDecoration: "underline wavy",
  },
]);

const modeEffect = StateEffect.define();
const optionsEffect = StateEffect.define();
const compositionEffect = StateEffect.define();
const sourceUpdate = StateEffect.define();
const settingKeys = new Set([
  "mode",
  "autoPair",
  "autoPairMarkdown",
  "smartPunctuationInput",
  "smartPunctuation",
  "tabSize",
  "lineNumbers",
  "fontFamily",
  "fontSize",
  "lineHeight",
  "contentWidth",
  "theme",
  "locale",
  "readOnly",
  "spellcheck",
  "focusMode",
  "typewriterMode",
  "shortcuts",
  "snippets",
  "basePath",
  "imageRoot",
  "mathMacros",
  "mathNumbering",
  "sequenceTheme",
  "flowchartOptions",
  "codeWrap",
  "defaultCodeLanguage",
  "strictMarkdown",
  "cjkEmphasis",
  "softBreaks",
  "exportSoftBreaks",
  "renderTarget",
]);
const relevantSettings = (settings) =>
  Object.fromEntries(
    Object.entries(settings || {}).filter(([key]) => settingKeys.has(key)),
  );
const emojiChoices = {
  smile: "😄",
  heart: "❤️",
  thumbsup: "👍",
  sparkles: "✨",
  warning: "⚠️",
  check: "✅",
  rocket: "🚀",
  bulb: "💡",
  memo: "📝",
  tada: "🎉",
  eyes: "👀",
  fire: "🔥",
};

const widgetSources = new WeakMap();
const mouseSelections = new WeakMap();
const renderedEdits = new WeakMap();
function recordRenderedEdit(view, range, event) {
  renderedEdits.set(view, {
    ...range,
    x: event.clientX,
    y: event.clientY,
    time: event.timeStamp,
    source: view.state.sliceDoc(range.contentFrom, range.contentTo),
  });
}

function blockContentRange(block) {
  if (block.type === "fence") {
    const first = block.text.indexOf("\n");
    const closing = /\n[ \t]*(?:`{3,}|~{3,})[ \t]*$/.exec(block.text);
    return {
      from: first < 0 ? block.text.length : first + 1,
      to: closing?.index ?? block.text.length,
    };
  }
  if (block.type === "math_block") {
    const opening = /^(?: {0,3})(?:\$\$|\\\[)[ \t]*(?:\n)?/.exec(block.text);
    const closing = /(?:\n)?[ \t]*(?:\$\$|\\\])[ \t]*$/.exec(block.text);
    const from = opening?.[0].length || 0;
    return { from, to: Math.max(from, closing?.index ?? block.text.length) };
  }
  return { from: 0, to: block.text.length };
}

function isPreviewBlock(block) {
  return (
    block.type === "math_block" ||
    (block.type === "fence" &&
      /^(?:math|mermaid|flow|flowchart|sequence)$/.test(
        block.tokens[0]?.info?.trim() || "",
      ))
  );
}

function widgetPositionAtPoint(view, element, x, y, target) {
  const block = widgetSources.get(element);
  if (!block) return view.posAtDOM(element);
  const document = element.ownerDocument;
  const currentFrom = view.posAtDOM(element);
  const math = (target || document.elementFromPoint(x, y))?.closest(
    "[data-math-index]",
  );
  if (math && element.contains(math)) {
    const range = inlineMathRanges(block)[Number(math.dataset.mathIndex)];
    if (range)
      return (
        currentFrom +
        range.contentFrom -
        block.from +
        inlineMathOffsetAtPoint(
          math,
          block.text.slice(
            range.contentFrom - block.from,
            range.contentTo - block.from,
          ),
          x,
          y,
        )
      );
  }
  const content = blockContentRange(block);
  const caret = document.caretPositionFromPoint?.(x, y);
  const range = !caret && document.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode || range?.startContainer;
  const offset = caret?.offset ?? range?.startOffset ?? 0;
  let relative = content.from;
  if (node?.nodeType === 3 && element.contains(node)) {
    const text = node.textContent;
    const found = block.text.indexOf(text);
    if (found >= content.from && found <= content.to) relative = found + offset;
    else {
      const trimmed = text.trim();
      const at = trimmed && block.text.indexOf(trimmed);
      if (at >= content.from && at <= content.to)
        relative = at + Math.min(offset, trimmed.length);
    }
  } else if (y >= element.getBoundingClientRect().bottom)
    relative = block.text.length;
  return Math.min(
    view.state.doc.length,
    currentFrom + Math.max(content.from, Math.min(content.to, relative)),
  );
}

// A replaced block is not native editable DOM. Keep the initiating pointer gesture
// alive while selection reveals source and replaces the rendered block under it.
function beginWidgetSelection(view, anchor, event) {
  mouseSelections.get(view)?.();
  const document = view.dom.ownerDocument;
  const window = document.defaultView;
  let x = event.clientX,
    y = event.clientY,
    frame = 0,
    moving = false;
  function update() {
    if (!view.dom.isConnected) {
      stop();
      return;
    }
    const bounds = view.scrollDOM.getBoundingClientRect();
    const edge =
      y < bounds.top
        ? y - bounds.top
        : y > bounds.bottom
          ? y - bounds.bottom
          : 0;
    if (edge)
      view.scrollDOM.scrollTop +=
        Math.sign(edge) * Math.min(40, Math.max(8, Math.abs(edge) / 3));
    const target = document.elementFromPoint(
      x,
      Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, y)),
    );
    const widget = target?.closest(".cm-live-block");
    let head =
      widget && view.dom.contains(widget)
        ? widgetPositionAtPoint(view, widget, x, y)
        : view.posAtCoords({ x, y }, false);
    if (head == null) head = y < bounds.top ? 0 : view.state.doc.length;
    if (
      view.state.selection.main.anchor !== anchor ||
      view.state.selection.main.head !== head
    ) {
      view.dispatch({
        selection: { anchor, head },
        userEvent: "select.pointer",
        scrollIntoView: false,
      });
    }
    if (edge && moving)
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
  }
  function move(next) {
    if (!(next.buttons & 1)) {
      stop();
      return;
    }
    if (
      !moving &&
      Math.abs(next.clientX - event.clientX) +
        Math.abs(next.clientY - event.clientY) <
        3
    )
      return;
    moving = true;
    x = next.clientX;
    y = next.clientY;
    next.preventDefault();
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    update();
  }
  function stop() {
    moving = false;
    if (frame) window.cancelAnimationFrame(frame);
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("mouseup", stop, true);
    window.removeEventListener("blur", stop);
    mouseSelections.delete(view);
  }
  document.addEventListener("mousemove", move, true);
  document.addEventListener("mouseup", stop, true);
  window.addEventListener("blur", stop);
  mouseSelections.set(view, stop);
}

class MarkdownWidget extends WidgetType {
  constructor(block, options, onLink) {
    super();
    this.block = block;
    this.options = options;
    this.onLink = onLink;
  }
  eq(other) {
    return (
      this.block.text === other.block.text &&
      this.block.headingId === other.block.headingId &&
      this.options.renderKey === other.options.renderKey
    );
  }
  toDOM(view) {
    const element = document.createElement("div");
    element.className = "cm-live-block markdown-body";
    element.dataset.sourceFrom = String(this.block.from);
    element.dataset.blockType = this.block.type;
    widgetSources.set(element, this.block);
    element.innerHTML = renderBlockMarkdown(this.block, this.options);
    element.querySelectorAll(".math-inline").forEach((math, index) => {
      math.dataset.mathIndex = String(index);
      math.title =
        this.options.locale === "zh-CN"
          ? "点击编辑公式"
          : "Click to edit formula";
    });
    if (this.block.headingId)
      element
        .querySelector("h1,h2,h3,h4,h5,h6")
        ?.setAttribute("id", this.block.headingId);
    if (this.block.type === "table_open")
      installTableEditor(
        element,
        view,
        this.block,
        this.options,
        renderBlockMarkdown,
      );
    element.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const link = event.target.closest("a");
      if (link && (this.options.readOnly || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.onLink?.(link.getAttribute("href"));
        return;
      }
      if (this.options.readOnly || event.target.matches("input[type=checkbox]"))
        return;
      if (event.target.closest("video,audio,summary")) return;
      event.preventDefault();
      const head = widgetPositionAtPoint(
        view,
        element,
        event.clientX,
        event.clientY,
        event.target,
      );
      const anchor = event.shiftKey ? view.state.selection.main.anchor : head;
      const mathIndex =
        event.target.closest("[data-math-index]")?.dataset.mathIndex;
      const mathRange =
        mathIndex == null
          ? null
          : inlineMathRanges(this.block)[Number(mathIndex)];
      if (mathRange) {
        const delta = view.posAtDOM(element) - this.block.from;
        recordRenderedEdit(
          view,
          {
            contentFrom: mathRange.contentFrom + delta,
            contentTo: mathRange.contentTo + delta,
          },
          event,
        );
      } else if (
        this.block.type === "math_block" ||
        this.block.type === "fence"
      ) {
        const from = view.posAtDOM(element),
          content = blockContentRange(this.block);
        recordRenderedEdit(
          view,
          { contentFrom: from + content.from, contentTo: from + content.to },
          event,
        );
      }
      view.dispatch({
        selection: { anchor, head },
        userEvent: "select.pointer",
        scrollIntoView: false,
      });
      view.focus();
      beginWidgetSelection(view, anchor, event);
    });
    element
      .querySelectorAll("input[type=checkbox]")
      .forEach((checkbox, index) => {
        checkbox.disabled = Boolean(this.options.readOnly);
        checkbox.addEventListener("click", (event) => {
          if (view.state.readOnly) {
            event.preventDefault();
            return;
          }
          event.stopPropagation();
          const matches = [
            ...this.block.text.matchAll(/^\s*[-+*]\s+\[([ xX])\]/gm),
          ];
          const match = matches[index];
          if (!match) return;
          const position =
            view.posAtDOM(element) + match.index + match[0].indexOf("[") + 1;
          view.dispatch({
            changes: {
              from: position,
              to: position + 1,
              insert: checkbox.checked ? "x" : " ",
            },
            annotations: [],
          });
        });
      });
    queueMicrotask(() =>
      hydrateDiagrams(element, this.options).catch((error) => {
        element.dataset.renderError = error.message;
      }),
    );
    return element;
  }
  updateDOM(element, view) {
    if (
      this.block.type !== "table_open" ||
      element.dataset.blockType !== "table_open"
    )
      return false;
    widgetSources.set(element, this.block);
    element.dataset.sourceFrom = String(this.block.from);
    return updateTableEditor(element, this.block, this.options);
  }
  destroy(element) {
    destroyTableEditor(element);
  }
  ignoreEvent() {
    return true;
  }
}

class BlockPreviewWidget extends WidgetType {
  constructor(block, options) {
    super();
    this.block = block;
    this.options = options;
  }
  eq(other) {
    return (
      this.block.text === other.block.text &&
      this.options.renderKey === other.options.renderKey
    );
  }
  toDOM(view) {
    const element = document.createElement("div");
    element.className = "cm-live-block cm-live-preview markdown-body";
    element.dataset.blockType = this.block.type;
    element.dataset.preview = "true";
    const label = document.createElement("div");
    label.className = "cm-live-preview-label";
    label.textContent =
      this.options.locale === "zh-CN"
        ? "实时预览 · Ctrl+Enter 完成编辑"
        : "Live preview · Ctrl+Enter to finish editing";
    element.append(label);
    const body = document.createElement("div");
    body.innerHTML = renderBlockMarkdown(this.block, this.options);
    element.append(body);
    element.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      // Preview is a zero-width widget at block.to, not the block replacement.
      const from = view.posAtDOM(element) - this.block.text.length;
      const head = from + blockContentRange(this.block).from;
      recordRenderedEdit(
        view,
        {
          contentFrom: head,
          contentTo: from + blockContentRange(this.block).to,
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
    queueMicrotask(() => hydrateDiagrams(body, this.options).catch(() => {}));
    return element;
  }
  ignoreEvent() {
    return true;
  }
}

function activeBlockIds(blocks, selection) {
  return blocks
    .filter((block) =>
      selection.ranges.some(
        (range) => range.from <= block.to && range.to >= block.from,
      ),
    )
    .map((block) => block.from)
    .join(",");
}
function makeDecorations(blocks, state, options, onLink) {
  const ranges = [];
  for (const block of blocks) {
    if (isCodeFence(block)) {
      const code = decorateCodeFence(block, state, options);
      if (code) {
        ranges.push(...code);
        continue;
      }
    }
    const active =
      !options.readOnly &&
      state.selection.ranges.some(
        (range) => range.from <= block.to && range.to >= block.from,
      );
    if (!active || block.type === "table_open")
      ranges.push(
        Decoration.replace({
          widget: new MarkdownWidget(block, options, onLink),
          block: true,
        }).range(block.from, block.to),
      );
    else if (block.type === "math_block" || block.type === "fence") {
      ranges.push(
        Decoration.mark({ class: "cm-rendered-source" }).range(
          block.from,
          block.to,
        ),
      );
      if (isPreviewBlock(block))
        ranges.push(
          Decoration.widget({
            widget: new BlockPreviewWidget(block, options),
            block: true,
            side: 1,
          }).range(block.to),
        );
    }
  }
  return Decoration.set(ranges, true);
}

export function createEditor(
  parent,
  {
    text = "",
    onChange = () => {},
    onSelection = () => {},
    onLink = () => {},
    // Runs an application command chosen from the "/" insert menu.
    onSlashCommand = null,
    settings: initialSettings = {},
  } = {},
) {
  let settings = {
    autoPair: true,
    tabSize: 2,
    locale: "en",
    ...relevantSettings(initialSettings),
  };
  let mode = settings.mode || "live";
  let source = new SourceDocument(text);
  let api;
  let view;
  let dispatching = false;
  let renderRevision = 0;
  let documentEpoch = 0;
  let sourceHistory;
  const composingInputs = new Set();
  const behavior = new Compartment();
  const look = new Compartment();
  const customKeys = new Compartment();
  const sourceLanguage = new Compartment();
  const buildBlocks = (doc) => {
    const content = doc.toString();
    const blocks = parseBlocks(content, settings);
    const outline = blocks
      .filter((block) => block.headingId)
      .map((block) => ({
        id: block.headingId,
        text: block.headingText,
        level: block.headingLevel,
        from: block.from,
        line: block.line,
      }));
    return { blocks, outline };
  };
  function renderingOptions(blocks, outline, currentSettings = settings) {
    const environment = blocks[0]?.environment || {};
    return {
      ...currentSettings,
      outline,
      renderKey: JSON.stringify([
        renderRevision,
        currentSettings,
        outline.map((item) => [item.id, item.text, item.level]),
        environment.references,
        environment.equationLabels,
        environment.footnoteDefinitions,
        environment.options?.imageRoot,
      ]),
    };
  }
  const liveField = StateField.define({
    create(state) {
      const { blocks, outline } = buildBlocks(state.doc);
      const options = renderingOptions(blocks, outline);
      return {
        blocks,
        options,
        mode,
        composing: false,
        active: activeBlockIds(blocks, state.selection),
        decorations:
          mode === "source"
            ? Decoration.none
            : makeDecorations(blocks, state, options, followLink),
      };
    },
    update(value, transaction) {
      let nextMode = value.mode,
        composing = value.composing,
        options = value.options;
      let forced = false;
      for (const effect of transaction.effects) {
        if (effect.is(modeEffect)) {
          nextMode = effect.value;
          forced = true;
        }
        if (effect.is(optionsEffect)) {
          options = { ...effect.value, outline: value.options.outline };
          forced = true;
        }
        if (effect.is(compositionEffect)) {
          composing = effect.value;
          forced = !composing;
        }
      }
      if (composing)
        return {
          ...value,
          mode: nextMode,
          composing,
          options,
          decorations: transaction.docChanged
            ? value.decorations.map(transaction.changes)
            : value.decorations,
        };
      if (nextMode === "source")
        return {
          ...value,
          mode: nextMode,
          composing,
          options,
          stale:
            value.stale ||
            transaction.docChanged ||
            transaction.effects.some((effect) => effect.is(optionsEffect)),
          decorations: Decoration.none,
        };
      let blocks = value.blocks;
      if (
        transaction.docChanged &&
        !forced &&
        !value.composing &&
        !value.stale &&
        nextMode === "live"
      ) {
        const edits = [];
        transaction.changes.iterChanges((from, to, _a, _b, inserted) =>
          edits.push({ from, to, insert: inserted.toString() }),
        );
        const edited = blocks.find(
          (block) =>
            block.type === "paragraph_open" &&
            edits.every(
              (edit) =>
                edit.from >= block.from &&
                edit.to <= block.to &&
                !edit.insert.includes("\n") &&
                !transaction.startState
                  .sliceDoc(edit.from, edit.to)
                  .includes("\n"),
            ),
        );
        if (edited) {
          const start = transaction.changes.mapPos(edited.from, -1),
            end = transaction.changes.mapPos(edited.to, 1);
          const parsed = reparseParagraph(
            edited,
            transaction.state.sliceDoc(start, end),
            settings,
          );
          if (parsed) {
            blocks = blocks.map((block) =>
              block === edited
                ? { ...parsed, from: start, to: end }
                : {
                    ...block,
                    from: transaction.changes.mapPos(block.from, 1),
                    to: transaction.changes.mapPos(block.to, -1),
                  },
            );
            const oldActive = value.blocks
              .filter((block) =>
                transaction.startState.selection.ranges.some(
                  (range) => range.from <= block.to && range.to >= block.from,
                ),
              )
              .map((block) => transaction.changes.mapPos(block.from, -1))
              .join(",");
            const active = activeBlockIds(blocks, transaction.state.selection);
            const outline = value.options.outline.map((item) => ({
              ...item,
              from: transaction.changes.mapPos(item.from, 1),
            }));
            options = { ...value.options, outline };
            return {
              ...value,
              blocks,
              options,
              active,
              decorations:
                active === oldActive
                  ? value.decorations.map(transaction.changes)
                  : makeDecorations(
                      blocks,
                      transaction.state,
                      options,
                      followLink,
                    ),
            };
          }
        }
      }
      if (
        transaction.docChanged ||
        value.composing ||
        value.stale ||
        transaction.effects.some((effect) => effect.is(optionsEffect))
      ) {
        const parsed = buildBlocks(transaction.state.doc);
        blocks = parsed.blocks;
        options = renderingOptions(blocks, parsed.outline, settings);
        forced = true;
      }
      const active = activeBlockIds(blocks, transaction.state.selection);
      if (!forced && active === value.active) return value;
      return {
        blocks,
        options,
        mode: nextMode,
        composing,
        active,
        decorations:
          nextMode === "source"
            ? Decoration.none
            : makeDecorations(blocks, transaction.state, options, followLink),
      };
    },
    provide: (field) =>
      EditorView.decorations.from(field, (value) => value.decorations),
  });

  const inlineField = StateField.define({
    create(state) {
      const live = state.field(liveField);
      return live.mode === "live" && !settings.readOnly
        ? makeInlineDecorations(live.blocks, state, inlineMathOptions(live))
        : Decoration.none;
    },
    update(value, transaction) {
      const live = transaction.state.field(liveField);
      if (live.mode !== "live" || settings.readOnly) return Decoration.none;
      if (live.composing)
        return transaction.docChanged ? value.map(transaction.changes) : value;
      if (
        !transaction.docChanged &&
        !transaction.selection &&
        !transaction.effects.length
      )
        return value;
      return makeInlineDecorations(
        live.blocks,
        transaction.state,
        inlineMathOptions(live),
      );
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  function inlineMathOptions(live) {
    return {
      ranges: inlineMathRanges,
      render: (token, block) => renderInlineMath(token, block, live.options),
      onActivate: (view, range, event) => {
        recordRenderedEdit(view, range, event);
        beginWidgetSelection(
          view,
          event.shiftKey ? view.state.selection.main.anchor : range.head,
          event,
        );
      },
      locale: settings.locale,
    };
  }

  function finishRenderedEditing() {
    if (mode !== "live" || view.composing || view.state.readOnly) return false;
    const head = view.state.selection.main.head;
    const block = view.state
      .field(liveField)
      .blocks.find((block) => head >= block.from && head <= block.to);
    if (!block) return false;
    const inline = inlineMathRanges(block).find(
      (range) => head >= range.from && head <= range.to,
    );
    if (!inline && !isPreviewBlock(block) && !isCodeFence(block)) return false;
    if (inline) {
      view.dispatch({ selection: { anchor: inline.to }, scrollIntoView: true });
      return true;
    }
    const fence = fenceRange(block);
    if (fence && fence.closingFrom == null) {
      const indentation = block.text.match(/^ */)[0];
      const insert = `\n${indentation}${fence.delimiter}\n\n`;
      view.dispatch({
        changes: { from: block.to, insert },
        selection: { anchor: block.to + insert.length },
        annotations: isolateHistory.of("full"),
        userEvent: "input",
        scrollIntoView: true,
      });
      return true;
    }
    const end = inline?.to ?? block.to;
    if (end < view.state.doc.length) {
      view.dispatch({ selection: { anchor: end + 1 }, scrollIntoView: true });
    } else {
      view.dispatch({
        changes: { from: end, insert: "\n\n" },
        selection: { anchor: end + 2 },
        userEvent: "input",
      });
    }
    return true;
  }

  function enterRenderedBlock(direction) {
    if (
      mode !== "live" ||
      view.composing ||
      view.state.readOnly ||
      !view.state.selection.main.empty
    )
      return false;
    const head = view.state.selection.main.head;
    const blocks = view.state.field(liveField).blocks;
    const block =
      direction > 0
        ? blocks.find((item) => item.from > head)
        : blocks.findLast((item) => item.to < head);
    if (!block || (block.type !== "math_block" && block.type !== "fence"))
      return false;
    const boundary = direction > 0 ? block.from : block.to;
    if (
      Math.abs(
        view.state.doc.lineAt(boundary).number -
          view.state.doc.lineAt(head).number,
      ) > 1 ||
      /\S/.test(
        view.state.sliceDoc(Math.min(head, boundary), Math.max(head, boundary)),
      )
    )
      return false;
    const body = blockContentRange(block);
    view.dispatch({
      selection: { anchor: block.from + (direction > 0 ? body.from : body.to) },
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  }

  function protectCodeBoundary(backward) {
    if (mode !== "live" || view.composing || view.state.readOnly) return false;
    const selection = view.state.selection.main;
    if (!selection.empty) return false;
    const range = view.state
      .field(liveField)
      .blocks.filter(isCodeFence)
      .map(fenceRange)
      .find((range) =>
        backward
          ? selection.head === range.bodyFrom
          : selection.head === range.bodyTo,
      );
    if (!range || range.empty) return false;
    // Do not join the body to a hidden fence. Delete an empty block as one undoable edit.
    if (range.bodyFrom === range.bodyTo) {
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: "" },
        selection: { anchor: range.from },
        annotations: isolateHistory.of("full"),
        userEvent: "delete",
      });
    }
    return true;
  }

  function followLink(href) {
    if (href?.startsWith("#") && view) {
      let target;
      try {
        target = decodeURIComponent(href.slice(1));
      } catch {
        target = href.slice(1);
      }
      const data = view.state.field(liveField);
      let position = data.options.outline?.find(
        (item) => item.id === target,
      )?.from;
      const note = target.match(/^fn(ref)?(\d+)/);
      if (note) {
        const label =
          data.blocks[0]?.environment?.footnotes?.list?.[Number(note[2]) - 1]
            ?.label;
        if (label) {
          const source = view.state.doc.toString();
          position = note[1]
            ? source.indexOf(`[^${label}]`)
            : source.indexOf(`[^${label}]:`);
        }
      }
      if (target.startsWith("equation-")) {
        const block = data.blocks.find(
          (item) =>
            item.type === "math_block" &&
            item.text.includes("\\label{") &&
            target ===
              "equation-" +
                item.text
                  .match(/\\label\{([^}]+)\}/)?.[1]
                  ?.toLowerCase()
                  .replace(/[^\p{L}\p{N}\s_-]/gu, "")
                  .trim()
                  .replace(/\s+/g, "-"),
        );
        if (block) position = block.from;
      }
      if (position != null && position >= 0) {
        view.dispatch({
          selection: { anchor: position },
          scrollIntoView: true,
        });
        view.focus();
        return;
      }
    }
    onLink(href);
  }
  function snippets() {
    return Array.isArray(settings.snippets)
      ? settings.snippets
      : Object.entries(settings.snippets || {}).map(([name, content]) => ({
          name,
          trigger: ";" + name,
          content,
        }));
  }
  function tab(backward = false) {
    if (view.state.readOnly) return false;
    if (
      !backward &&
      completionStatus(view.state) === "active" &&
      acceptCompletion(view)
    )
      return true;
    const next = nextTableCell(
      view.state.doc.toString(),
      view.state.selection.main.head,
      backward,
    );
    if (next) {
      view.dispatch({
        changes: next.change || undefined,
        selection: { anchor: next.position },
        scrollIntoView: true,
      });
      if (mode === "live") focusTableCell(view, next.position);
      return true;
    }
    if (!backward) {
      const cursor = view.state.selection.main;
      const line = view.state.doc.lineAt(cursor.head);
      const before = line.text.slice(0, cursor.head - line.from);
      for (const snippet of snippets()) {
        if (snippet.trigger && before.endsWith(snippet.trigger)) {
          const insert = String(snippet.content || "")
            .replace(
              /\$\{date\}|\{\{date\}\}/g,
              new Date().toLocaleDateString("sv"),
            )
            .replace(
              /\$\{time\}|\{\{time\}\}/g,
              new Date().toLocaleTimeString(),
            );
          view.dispatch({
            changes: {
              from: cursor.head - snippet.trigger.length,
              to: cursor.head,
              insert,
            },
            selection: {
              anchor: cursor.head - snippet.trigger.length + insert.length,
            },
          });
          return true;
        }
      }
    }
    return backward ? indentLess(view) : indentMore(view);
  }
  function completion(context) {
    const match = context.matchBefore(/:[a-z_]*|;[\w-]*/);
    if (!match) return null;
    const options = match.text.startsWith(":")
      ? Object.entries(emojiChoices).map(([label, apply]) => ({
          label: `:${label}:`,
          displayLabel: `${apply}  :${label}:`,
          apply,
          type: "text",
        }))
      : snippets().map((item) => ({
          label: item.trigger,
          detail: item.name || "snippet",
          apply: item.content,
          type: "text",
        }));
    return { from: match.from, options, validFor: /^[:;\w-]*$/ };
  }
  // "/" at the start of a line opens a searchable insert menu. Typing after the
  // slash filters by English or Chinese names; choosing an item removes the
  // typed "/query" and runs the command.
  const slashItems = [
    ["heading1", "Heading 1", "一级标题", "h1 title"],
    ["heading2", "Heading 2", "二级标题", "h2 subtitle"],
    ["heading3", "Heading 3", "三级标题", "h3"],
    ["bullet", "Bullet list", "无序列表", "ul list"],
    ["ordered", "Numbered list", "有序列表", "ol list number"],
    ["task", "Task list", "任务列表", "todo checkbox"],
    ["quote", "Quote", "引用", "blockquote"],
    ["table", "Table", "表格", "grid"],
    ["codeFence", "Code block", "代码块", "code fence"],
    ["math", "Math block", "公式", "latex equation formula"],
    ["insertImage", "Image", "图片", "picture photo"],
    ["insertImageURL", "Image from URL", "网络图片", "picture url"],
    ["link", "Link", "链接", "url"],
    ["footnote", "Footnote", "脚注", "note"],
    ["toc", "Table of contents", "目录", "toc outline"],
    ["hr", "Horizontal rule", "分隔线", "divider line"],
    ["pageBreak", "Page break", "分页符", "page"],
  ];
  function slashCompletion(context) {
    if (!onSlashCommand || settings.readOnly) return null;
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const match = /^(\s*)\/([^\s/]*)$/u.exec(before);
    if (!match) return null;
    // Not inside fenced or indented code, where "/" is ordinary text.
    for (
      let node = syntaxTree(context.state).resolveInner(context.pos, -1);
      node;
      node = node.parent
    )
      if (["FencedCode", "CodeBlock", "CodeText"].includes(node.name))
        return null;
    const query = match[2].toLowerCase();
    const zh = settings.locale === "zh-CN";
    const options = slashItems
      .filter(
        ([id, en, zhLabel, terms]) =>
          !query ||
          [id, en, zhLabel, terms].some((term) =>
            term.toLowerCase().includes(query),
          ),
      )
      .map(([id, en, zhLabel], index) => ({
        label: "/" + (zh ? zhLabel : en),
        detail: zh ? en : zhLabel,
        type: "keyword",
        boost: -index,
        apply: (view, _completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: "" },
            selection: { anchor: from },
            userEvent: "input.complete",
          });
          onSlashCommand(id);
        },
      }));
    if (!options.length) return null;
    return {
      from: line.from + match[1].length,
      to: context.pos,
      options,
      filter: false,
    };
  }
  function smartInput(editor, from, to, inserted) {
    if (
      (!settings.autoPairMarkdown && !settings.smartPunctuationInput) ||
      editor.composing ||
      inserted.length !== 1
    )
      return false;
    const line = editor.state.doc.lineAt(from);
    const prefix = line.text.slice(0, from - line.from);
    if ((prefix.match(/(?<!\\)`/g) || []).length % 2) return false;
    const before = editor.state.sliceDoc(Math.max(line.from, from - 3), from);
    const after = editor.state.sliceDoc(
      to,
      Math.min(editor.state.doc.length, to + 1),
    );
    const block = editor.state
      .field(liveField)
      .blocks.find((block) => from >= block.from && from <= block.to);
    if (
      settings.autoPairMarkdown &&
      inserted === "$" &&
      from === to &&
      before.endsWith("$") &&
      after === "$" &&
      line.text.trim() === "$$" &&
      (!block || block.type === "math_block")
    ) {
      editor.dispatch({ selection: { anchor: to + 1 } });
      return true;
    }
    if (
      block &&
      [
        "fence",
        "code_block",
        "math_block",
        "html_block",
        "frontmatter",
      ].includes(block.type)
    )
      return false;
    if (
      settings.autoPairMarkdown &&
      ["*", "_", "~", "`", "$"].includes(inserted) &&
      !before.endsWith("\\")
    ) {
      if (
        from === to &&
        after === inserted &&
        before.endsWith(inserted) &&
        ["*", "_", "~"].includes(inserted)
      ) {
        editor.dispatch({
          changes: { from, insert: inserted + inserted },
          selection: { anchor: from + 1 },
          userEvent: "input.type",
        });
        return true;
      }
      if (from === to && after === inserted) {
        editor.dispatch({ selection: { anchor: to + 1 } });
        return true;
      }
      if (from !== to || !after || /\s|[.,!?;:)}\]]/.test(after)) {
        const text = editor.state.sliceDoc(from, to);
        editor.dispatch({
          changes: { from, to, insert: inserted + text + inserted },
          selection: { anchor: from + 1, head: from + 1 + text.length },
          userEvent: "input.type",
        });
        return true;
      }
    }
    if (!settings.smartPunctuationInput || mode === "source") return false;
    // Typographic substitutions affect newly typed prose only; IME and code are untouched.
    let replaceFrom = from,
      replacement = null;
    if (inserted === '"' || inserted === "'") {
      const opening = !before || /[\s([{—–]/.test(before.slice(-1));
      replacement =
        inserted === '"' ? (opening ? "“" : "”") : opening ? "‘" : "’";
    } else if (inserted === "-" && before.endsWith("--")) {
      replaceFrom -= 2;
      replacement = "—";
    } else if (inserted === "." && before.endsWith("..")) {
      replaceFrom -= 2;
      replacement = "…";
    }
    if (!replacement) return false;
    editor.dispatch({
      changes: { from: replaceFrom, to, insert: replacement },
      selection: { anchor: replaceFrom + replacement.length },
      userEvent: "input.type",
    });
    return true;
  }
  function behaviorExtensions() {
    return [
      EditorState.readOnly.of(Boolean(settings.readOnly)),
      EditorView.editable.of(!settings.readOnly),
      EditorState.phrases.of(
        settings.locale === "zh-CN"
          ? {
              Find: "查找",
              Replace: "替换",
              next: "下一个",
              previous: "上一个",
              all: "全部",
              "match case": "区分大小写",
              regexp: "正则表达式",
              "by word": "全词匹配",
              replace: "替换",
              "replace all": "全部替换",
              close: "关闭",
              "Go to line": "跳转到行",
              go: "跳转",
              "current match": "当前匹配",
              "replaced $ matches": "已替换 $ 处匹配",
              "replaced match on line $": "已替换第 $ 行匹配",
            }
          : {
              next: "Next",
              previous: "Previous",
              all: "Select all",
              "match case": "Match case",
              regexp: "Regex",
              "by word": "Whole word",
              replace: "Replace",
              "replace all": "Replace all",
              close: "Close",
              "Go to line": "Go to line",
              go: "Go",
            },
      ),
      EditorState.tabSize.of(Number(settings.tabSize) || 2),
      indentUnit.of(" ".repeat(Number(settings.tabSize) || 2)),
      settings.autoPair ? closeBrackets() : [],
      EditorView.contentAttributes.of({
        spellcheck: settings.spellcheck ? "true" : "false",
        tabindex: "0",
        "aria-label":
          settings.locale === "en" ? "Markdown editor" : "Markdown 编辑器",
        autocapitalize: "off",
      }),
    ];
  }
  function appearanceExtensions() {
    return [
      settings.lineNumbers ? lineNumbers() : [],
      EditorView.theme(
        {
          "&": {
            fontSize: `${Number(settings.fontSize) || 17}px`,
            height: "100%",
          },
          ".cm-scroller": {
            fontFamily: settings.fontFamily || "var(--font-editor)",
            lineHeight: String(Number(settings.lineHeight) || 1.75),
            overflow: "auto",
          },
          ".cm-content": {
            maxWidth: `${Number(settings.contentWidth) || 780}px`,
            margin: "0 auto",
            padding: "45px 40px 45vh",
            minHeight: "100%",
          },
          ".cm-line": { padding: "0", overflowWrap: "anywhere" },
          ".cm-gutters": { background: "transparent", border: "none" },
        },
        { dark: settings.theme === "dark" },
      ),
    ];
  }
  // Shows "current / total" next to the find field while the panel is open.
  function searchMatchCounter() {
    let frame = 0;
    const render = (view) => {
      frame = 0;
      const panel = view.dom.querySelector(".cm-search");
      if (!panel) return;
      let counter = panel.querySelector(".inkstone-search-count");
      if (!counter) {
        counter = document.createElement("span");
        counter.className = "inkstone-search-count";
        counter.setAttribute("role", "status");
        counter.setAttribute("aria-live", "polite");
        panel.querySelector('input[name="search"]')?.after(counter);
      }
      // Keep the replace field and its buttons together so they wrap as one
      // row. Moving the nodes keeps CodeMirror's listeners and tab order.
      const replace = panel.querySelector('input[name="replace"]');
      if (
        replace &&
        !replace.parentElement.classList.contains("inkstone-replace-row")
      ) {
        const row = document.createElement("div");
        row.className = "inkstone-replace-row";
        replace.before(row);
        row.append(
          replace,
          ...panel.querySelectorAll(
            'button[name="replace"], button[name="replaceAll"]',
          ),
        );
      }
      const zh = settings.locale === "zh-CN";
      const query = getSearchQuery(view.state);
      if (!query.search) {
        counter.textContent = "";
        return;
      }
      if (!query.valid) {
        counter.textContent = zh ? "表达式无效" : "Invalid pattern";
        return;
      }
      const { from, to } = view.state.selection.main;
      const limit = 9999;
      let total = 0,
        current = 0;
      const cursor = query.getCursor(view.state);
      for (let next = cursor.next(); !next.done; next = cursor.next()) {
        total++;
        if (next.value.from === from && next.value.to === to) current = total;
        if (total > limit) break;
      }
      counter.textContent = !total
        ? zh
          ? "无结果"
          : "No results"
        : `${current || "–"} / ${total > limit ? limit + "+" : total}`;
    };
    return EditorView.updateListener.of((update) => {
      if (!searchPanelOpen(update.state)) return;
      if (
        frame ||
        !(
          update.docChanged ||
          update.selectionSet ||
          update.transactions.some((tr) => tr.effects.length) ||
          !update.view.dom.querySelector(".inkstone-search-count")
        )
      )
        return;
      frame = requestAnimationFrame(() => render(update.view));
    });
  }
  function customKeyExtensions() {
    return Prec.highest(
      keymap.of(
        Object.entries(settings.shortcuts || {})
          .map(([name, binding]) => ({
            key: normalizeShortcut(binding),
            run: () => api.command(name),
          }))
          .filter(({ key }) => key),
      ),
    );
  }
  const baseKeys = [
    { key: "Backspace", run: () => protectCodeBoundary(true) },
    { key: "Delete", run: () => protectCodeBoundary(false) },
    { key: "ArrowDown", run: () => enterRenderedBlock(1) },
    { key: "ArrowUp", run: () => enterRenderedBlock(-1) },
    { key: "Mod-Enter", run: finishRenderedEditing },
    { key: "Mod-b", run: () => api.command("bold") },
    { key: "Mod-i", run: () => api.command("italic") },
    { key: "Mod-Shift-x", run: () => api.command("strike") },
    { key: "Mod-k", run: () => api.command("link") },
    { key: "Mod-Shift-c", run: () => api.command("code") },
    { key: "Mod-Alt-t", run: () => api.command("table") },
    { key: "Mod-Shift-z", run: redo, preventDefault: true },
    { key: "Tab", run: () => tab(), shift: () => tab(true) },
    ...[1, 2, 3, 4, 5, 6].map((level) => ({
      key: `Mod-${level}`,
      run: () => api.command("heading", level),
    })),
    ...markdownKeymap,
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...completionKeymap,
  ];
  function createState(content, selection) {
    sourceHistory = createSourceHistory(source.getLayout());
    return EditorState.create({
      doc: content,
      selection,
      extensions: [
        sourceHistory.extension,
        EditorState.allowMultipleSelections.of(true),
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSpecialChars(),
        highlightActiveLine(),
        bracketMatching(),
        // YAML front matter is highlighted as YAML instead of being read as a
        // Markdown setext heading with links.
        sourceLanguage.of(
          yamlFrontmatter({
            content: markdown({
              base: markdownLanguage,
              codeLanguages: resolveCodeLanguage,
              addKeymap: false,
            }),
          }),
        ),
        syntaxHighlighting(inkstoneHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        search({ top: true }),
        searchMatchCounter(),
        customKeys.of(customKeyExtensions()),
        autocompletion({ override: [completion, slashCompletion] }),
        Prec.highest(EditorView.inputHandler.of(smartInput)),
        keymap.of(baseKeys),
        behavior.of(behaviorExtensions()),
        look.of(appearanceExtensions()),
        liveField,
        codeFenceEditing(liveField),
        EditorView.atomicRanges.of((view) =>
          view.state.field(liveField).decorations.update({
            filter: (_from, _to, value) => Boolean(value.spec.codeFenceMarker),
          }),
        ),
        inlineField,
        EditorView.domEventHandlers({
          mousedown(event) {
            const link = event.target.closest?.("[data-inkstone-href]");
            if (link && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              followLink(link.dataset.inkstoneHref);
              return true;
            }
            return false;
          },
          compositionstart(_event, editor) {
            editor.dispatch({ effects: compositionEffect.of(true) });
            return false;
          },
          compositionend(_event, editor) {
            setTimeout(() => {
              if (editor.dom.isConnected)
                editor.dispatch({ effects: compositionEffect.of(false) });
            }, 0);
            return false;
          },
          paste(event, editor) {
            if (editor.state.readOnly) return false;
            const data = event.clipboardData?.getData("text/plain");
            if (
              data?.includes("\t") &&
              locateTable(
                editor.state.doc.toString(),
                editor.state.selection.main.head,
              )
            ) {
              const change = modifyTable(
                editor.state.doc.toString(),
                editor.state.selection.main.head,
                "paste",
                data,
              );
              if (change) {
                event.preventDefault();
                editor.dispatch({
                  changes: change,
                  selection: { anchor: change.anchor },
                });
                return true;
              }
            }
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            for (const transaction of update.transactions)
              if (transaction.docChanged) {
                source.apply(
                  sourceChangesFromTransaction(
                    transaction,
                    sourceHistory.field,
                  ),
                  transaction.newDoc.toString(),
                );
              }
            onChange(source.raw, {
              selection: api?.getSelection(),
              composing: update.view.composing,
              // Lets consumers map recorded positions through this edit.
              changes: update.changes,
            });
          }
          if (update.selectionSet || update.docChanged) {
            onSelection(api?.getSelection());
            if (
              settings.typewriterMode &&
              !update.view.composing &&
              !dispatching
            ) {
              dispatching = true;
              requestAnimationFrame(() => {
                if (view.dom.isConnected)
                  view.dispatch({
                    effects: EditorView.scrollIntoView(
                      view.state.selection.main.head,
                      { y: "center" },
                    ),
                  });
                dispatching = false;
              });
            }
          }
        }),
      ],
    });
  }
  view = new EditorView({ parent, state: createState(source.normalized) });
  const fontSet = view.dom.ownerDocument.fonts;
  const measureLoadedFonts = () => {
    if (!view.dom.isConnected) return;
    view.requestMeasure();
    // A math font can widen a widget without changing the source line height.
    // Reselect without a history event so the drawn caret follows the new edge.
    if (!view.composing && !composingInputs.size)
      view.dispatch({
        selection: view.state.selection,
        annotations: Transaction.addToHistory.of(false),
      });
  };
  fontSet?.addEventListener("loadingdone", measureLoadedFonts);
  view.dom.addEventListener(
    "mousedown",
    (event) => {
      const previous = renderedEdits.get(view);
      if (
        event.button !== 0 ||
        event.detail !== 2 ||
        !previous ||
        view.state.readOnly ||
        event.timeStamp - previous.time > 600 ||
        Math.abs(event.clientX - previous.x) +
          Math.abs(event.clientY - previous.y) >
          8 ||
        previous.contentTo > view.state.doc.length ||
        view.state.sliceDoc(previous.contentFrom, previous.contentTo) !==
          previous.source
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      view.dispatch({
        selection: { anchor: previous.contentFrom, head: previous.contentTo },
        userEvent: "select.pointer",
      });
      view.focus();
    },
    true,
  );
  view.dom.addEventListener(
    "compositionstart",
    (event) => composingInputs.add(event.target),
    true,
  );
  view.dom.addEventListener(
    "compositionend",
    (event) => composingInputs.delete(event.target),
    true,
  );
  function updateClasses() {
    view.dom.classList.toggle("inkstone-source", mode === "source");
    view.dom.classList.toggle("inkstone-focus", Boolean(settings.focusMode));
    view.dom.classList.toggle(
      "inkstone-typewriter",
      Boolean(settings.typewriterMode),
    );
  }
  updateClasses();

  function wrap(before, after = before, placeholder = "") {
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    if (
      selected.startsWith(before) &&
      selected.endsWith(after) &&
      selected.length >= before.length + after.length
    ) {
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: selected.slice(before.length, -after.length),
        },
        selection: {
          anchor: selection.from,
          head: selection.to - before.length - after.length,
        },
      });
    } else if (
      view.state.sliceDoc(
        Math.max(0, selection.from - before.length),
        selection.from,
      ) === before &&
      view.state.sliceDoc(selection.to, selection.to + after.length) === after
    ) {
      view.dispatch({
        changes: [
          {
            from: selection.from - before.length,
            to: selection.from,
            insert: "",
          },
          { from: selection.to, to: selection.to + after.length, insert: "" },
        ],
        selection: {
          anchor: selection.from - before.length,
          head: selection.to - before.length,
        },
      });
    } else {
      const content = selected || placeholder;
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: before + content + after,
        },
        selection: {
          anchor: selection.from + before.length,
          head: selection.from + before.length + content.length,
        },
      });
    }
    view.focus();
    return true;
  }
  function prefixLines(
    prefix,
    strip = /^\s{0,3}(?:#{1,6}\s+|>\s+|[-+*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/,
  ) {
    const selection = view.state.selection.main;
    const first = view.state.doc.lineAt(selection.from);
    const last = view.state.doc.lineAt(
      selection.to > selection.from ? selection.to - 1 : selection.to,
    );
    const changes = [];
    for (let number = first.number; number <= last.number; number++) {
      const line = view.state.doc.line(number);
      const cleaned = line.text.replace(strip, "");
      const marker =
        typeof prefix === "function" ? prefix(number - first.number) : prefix;
      changes.push({ from: line.from, to: line.to, insert: marker + cleaned });
    }
    view.dispatch({ changes });
    view.focus();
    return true;
  }
  function blockInsert(content) {
    const { from, to } = view.state.selection.main;
    const before =
      from && view.state.sliceDoc(Math.max(0, from - 2), from) !== "\n\n"
        ? "\n\n"
        : "";
    const after =
      to < view.state.doc.length && view.state.sliceDoc(to, to + 2) !== "\n\n"
        ? "\n\n"
        : "\n";
    view.dispatch({
      changes: { from, to, insert: before + content + after },
      selection: { anchor: from + before.length },
    });
    view.focus();
    return true;
  }
  api = {
    view,
    isInCodeBlock() {
      const selection = view.state.selection.main;
      return parseBlocks(view.state.doc.toString()).some((block) => {
        if (block.type === "code_block")
          return selection.from >= block.from && selection.to <= block.to;
        const range = fenceRange(block);
        return (
          range &&
          selection.from >= range.bodyFrom &&
          selection.to <= range.bodyTo
        );
      });
    },
    getText: () => source.raw,
    getSelection: () => ({
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head,
      ranges: view.state.selection.ranges.map((range) => ({
        anchor: range.anchor,
        head: range.head,
      })),
      mainIndex: view.state.selection.mainIndex,
    }),
    prepareContextMenu({
      x,
      y,
      target,
      preserveSelection = true,
      previousSelection,
    } = {}) {
      const document = view.dom.ownerDocument;
      const hit = target?.isConnected
        ? target
        : document.elementFromPoint(x, y);
      if (!hit || (!view.dom.contains(hit) && hit !== view.dom.parentElement))
        return null;
      if (
        hit.closest("input,select,textarea") &&
        !hit.closest(".inkstone-table-cell-editor")
      )
        return null;
      const element = hit.closest(".cm-live-block");
      const renderedBlock = element && widgetSources.get(element);
      let position;
      if (renderedBlock?.type === "table_open") {
        const cellElement = hit.closest("td,th");
        if (cellElement) {
          const rowElement = cellElement.parentElement;
          const displayedRow = [...element.querySelectorAll("tr")].indexOf(
            rowElement,
          );
          const row = displayedRow === 0 ? 0 : displayedRow + 1;
          const column = [...rowElement.children].indexOf(cellElement);
          const cell = tableCellRanges(renderedBlock.text)[row]?.[column];
          if (cell) {
            const input = hit.closest(".inkstone-table-cell-editor");
            position =
              view.posAtDOM(element) +
              cell.from +
              Math.min(cell.text.length, input?.selectionStart || 0);
          }
        }
      }
      if (position == null && element && renderedBlock)
        position = widgetPositionAtPoint(view, element, x, y, hit);
      if (position == null) position = view.posAtCoords({ x, y }, false);
      if (position == null) {
        const content = view.contentDOM.getBoundingClientRect();
        position = y >= content.bottom ? view.state.doc.length : 0;
      }
      position = Math.max(0, Math.min(view.state.doc.length, position));
      const saved = previousSelection || api.getSelection();
      const ranges = saved.ranges || [saved];
      const selected = ranges.some(({ anchor, head = anchor }) => {
        const from = Math.min(anchor, head),
          to = Math.max(anchor, head);
        return from < to && position >= from && position <= to;
      });
      if (preserveSelection && selected)
        api.setSelection(saved, { scrollIntoView: false });
      else
        view.dispatch({
          selection: { anchor: position },
          userEvent: "select.pointer",
        });
      const live = view.state.field(liveField);
      const parsed = live.stale
        ? parseBlocks(view.state.doc.toString(), settings)
        : live.blocks;
      const block = parsed.find(
        (block) => position >= block.from && position <= block.to,
      );
      const table =
        block?.type === "table_open"
          ? locateTable(view.state.doc.toString(), position)
          : null;
      return {
        position,
        block: block
          ? { from: block.from, to: block.to, type: block.type }
          : null,
        table,
        selection: api.getSelection(),
      };
    },
    setSelection(selection, { scrollIntoView = true } = {}) {
      const max = view.state.doc.length;
      const ranges = (selection.ranges || [selection]).map((range) =>
        EditorSelection.range(
          Math.max(0, Math.min(max, range.anchor || 0)),
          Math.max(0, Math.min(max, range.head ?? range.anchor ?? 0)),
        ),
      );
      view.dispatch({
        selection: EditorSelection.create(
          ranges,
          Math.min(selection.mainIndex || 0, ranges.length - 1),
        ),
        scrollIntoView,
      });
    },
    // Increments whenever the whole document is replaced without edit history.
    getDocumentEpoch: () => documentEpoch,
    setDocument(nextText, selection) {
      documentEpoch++;
      source = new SourceDocument(nextText);
      const safe = selection
        ? {
            anchor: Math.min(selection.anchor || 0, source.normalized.length),
            head: Math.min(
              selection.head ?? selection.anchor ?? 0,
              source.normalized.length,
            ),
          }
        : undefined;
      view.setState(createState(source.normalized, safe));
      updateClasses();
    },
    setMode(nextMode) {
      mode = nextMode === "source" ? "source" : "live";
      view.dispatch({ effects: modeEffect.of(mode) });
      updateClasses();
    },
    getMode: () => mode,
    setSettings(next) {
      const relevant = relevantSettings(next);
      if (
        !Object.entries(relevant).some(
          ([key, value]) =>
            JSON.stringify(settings[key]) !== JSON.stringify(value),
        )
      )
        return false;
      settings = { ...settings, ...relevant };
      view.dispatch({
        effects: [
          optionsEffect.of(settings),
          behavior.reconfigure(behaviorExtensions()),
          look.reconfigure(appearanceExtensions()),
          customKeys.reconfigure(customKeyExtensions()),
        ],
      });
      updateClasses();
      return true;
    },
    async finishComposition() {
      // Blurring the actual native editing element asks Chromium/Windows IME to
      // commit its composition. Never replace the state or make it read-only
      // until compositionend and the browser's final input have been delivered.
      const active = view.dom.ownerDocument.activeElement;
      if (active && view.dom.contains(active)) active.blur();
      const started = performance.now();
      while (
        view.dom.isConnected &&
        (composingInputs.size ||
          view.composing ||
          view.state.field(liveField).composing)
      ) {
        if (performance.now() - started > 1000) return false;
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      await new Promise((resolve) => {
        // A window hidden in the tray draws no frames, and has no IME
        // composition to settle; never wait for frames that will not come.
        if (view.dom.ownerDocument.visibilityState === "hidden")
          return resolve();
        requestAnimationFrame(() => requestAnimationFrame(resolve));
        setTimeout(resolve, 250);
      });
      const finished =
        !composingInputs.size &&
        !view.composing &&
        !view.state.field(liveField).composing;
      if (finished && view.dom.isConnected) {
        // Closing/navigation ends the current editing gesture. If the user
        // cancels and types again immediately, that input must not merge into
        // the composition just committed above. An empty history boundary
        // preserves every existing undo event and the source/EOL metadata.
        view.dispatch({ annotations: isolateHistory.of("full") });
      }
      return finished;
    },
    insert(value) {
      if (settings.readOnly) return false;
      const selection = view.state.selection.main;
      const normalized = String(value).replace(/\r\n|\r/g, "\n");
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: normalized },
        selection: { anchor: selection.from + normalized.length },
        scrollIntoView: true,
      });
      view.focus();
    },
    command(name, argument) {
      if (
        settings.readOnly &&
        !["find", "replace", "selectAll", "refresh"].includes(name)
      )
        return false;
      const selection = view.state.selection.main;
      switch (name) {
        case "deleteBlock":
        case "deleteSentence":
        case "deleteWord":
        case "clearFormatting":
        case "deleteStyle":
        case "moveParagraphUp":
        case "moveParagraphDown": {
          const operation = structuralEdit(
            view.state.doc.toString(),
            selection,
            parseBlocks(view.state.doc.toString(), settings),
            name,
            settings.locale || "zh-CN",
          );
          if (!operation) return false;
          let effects;
          if (operation.rawParts) {
            const insertedRaw = operation.rawParts
              .map(([from, to]) =>
                source.raw.slice(source.rawOffset(from), source.rawOffset(to)),
              )
              .join("");
            const layout = view.state.field(sourceHistory.field);
            const fromLine =
                view.state.doc.lineAt(operation.changes.from).number - 1,
              toLine = view.state.doc.lineAt(operation.changes.to).number - 1;
            effects = sourceHistory.restore.of(
              Object.freeze({
                ...layout,
                eols:
                  layout.eols.slice(0, fromLine) +
                  captureSourceLayout(insertedRaw).eols +
                  layout.eols.slice(toLine),
              }),
            );
          }
          view.dispatch({
            changes: operation.changes,
            selection: operation.selection,
            effects,
            annotations: isolateHistory.of("full"),
            userEvent: name.startsWith("delete") ? "delete" : "input",
          });
          if (operation.selection)
            view.dispatch({
              selection: view.state.selection,
              userEvent: "select.structure",
            });
          view.focus();
          return true;
        }
        case "editTableCell":
          return focusTableCell(view, selection.head);
        case "refresh":
          renderRevision++;
          view.dispatch({ effects: optionsEffect.of(settings) });
          return true;
        case "bold":
          return wrap("**");
        case "italic":
          return wrap("*");
        case "strike":
          return wrap("~~");
        case "highlight":
          return wrap("==");
        case "subscript":
          return wrap("~");
        case "superscript":
          return wrap("^");
        case "code":
          return selection.from !== selection.to &&
            view.state.sliceDoc(selection.from, selection.to).includes("\n")
            ? wrap("```\n", "\n```")
            : wrap("`");
        case "codeBlock": {
          const selected = view.state.sliceDoc(selection.from, selection.to);
          let fenceLength = 3;
          for (const match of selected.matchAll(/`+/g))
            fenceLength = Math.max(fenceLength, match[0].length + 1);
          const delimiter = "`".repeat(fenceLength);
          return wrap(
            `\n\n${delimiter}${argument ?? settings.defaultCodeLanguage ?? ""}\n`,
            `\n${delimiter}\n`,
          );
        }
        case "math":
          return wrap("$");
        case "mathBlock":
          return wrap("\n\n$$\n", "\n$$\n");
        case "heading":
          return prefixLines(
            "#".repeat(Math.max(1, Math.min(6, Number(argument) || 1))) + " ",
          );
        case "paragraph":
          return prefixLines("");
        case "quote":
          return prefixLines("> ");
        case "bullet":
          return prefixLines("- ");
        case "ordered":
          return prefixLines((index) => `${index + 1}. `);
        case "task":
          return prefixLines("- [ ] ");
        case "hr":
          return blockInsert("---");
        case "toc":
          return blockInsert("[TOC]");
        case "table":
          return blockInsert(
            createTable(
              argument?.rows == null ? 2 : Math.max(1, argument.rows - 1),
              argument?.columns,
            ),
          );
        case "link": {
          const label =
            view.state.sliceDoc(selection.from, selection.to) ||
            argument?.text ||
            "link";
          const url =
            typeof argument === "string"
              ? argument
              : argument?.url || "https://";
          const insert = `[${label}](${url})`;
          view.dispatch({
            changes: { from: selection.from, to: selection.to, insert },
            selection: {
              anchor: selection.from + label.length + 3,
              head: selection.from + label.length + 3 + url.length,
            },
          });
          view.focus();
          return true;
        }
        case "image": {
          const url =
            typeof argument === "string"
              ? argument
              : argument?.url || "image.png";
          const alt = argument?.alt || "";
          api.insert(
            argument?.width
              ? `<img src="${url.replace(/"/g, "&quot;")}" alt="${alt.replace(/"/g, "&quot;")}" width="${Number(argument.width) || 400}">`
              : `![${alt}](${url.replace(/ /g, "%20")})`,
          );
          return true;
        }
        case "footnote": {
          const id = argument || "note";
          api.insert(`[^${id}]`);
          view.dispatch({
            changes: { from: view.state.doc.length, insert: `\n\n[^${id}]: ` },
          });
          return true;
        }
        case "codeLanguage":
        case "language": {
          const block = parseBlocks(view.state.doc.toString()).find(
            (item) =>
              item.type === "fence" &&
              selection.head >= item.from &&
              selection.head <= item.to,
          );
          if (!block) return false;
          return changeCodeLanguage(
            view,
            fenceRange(block),
            String(argument || ""),
          );
        }
        case "tableAction": {
          const value =
            typeof argument === "string" ? argument : argument?.action;
          const aliases = {
            moveRowUp: "rowUp",
            moveRowDown: "rowDown",
            moveColumnLeft: "columnLeft",
            moveColumnRight: "columnRight",
          };
          const operation = /^align/.test(value)
            ? "align"
            : aliases[value] || value;
          const align = /^align/.test(value)
            ? value.slice(5).toLowerCase()
            : argument?.value;
          const change = modifyTable(
            view.state.doc.toString(),
            selection.head,
            operation,
            align,
          );
          if (!change) return false;
          view.dispatch({
            changes: change,
            selection: {
              anchor:
                change.anchor ??
                Math.min(selection.head, change.from + change.insert.length),
            },
          });
          view.focus();
          return true;
        }
        case "tableAddRow":
        case "tableDeleteRow":
        case "tableAddColumn":
        case "tableDeleteColumn":
        case "tableRowUp":
        case "tableRowDown":
        case "tableColumnLeft":
        case "tableColumnRight":
        case "tableAlign": {
          const op = name.slice(5);
          const operation = op[0].toLowerCase() + op.slice(1);
          const change = modifyTable(
            view.state.doc.toString(),
            selection.head,
            operation,
            argument,
          );
          if (!change) return false;
          view.dispatch({
            changes: change,
            selection: {
              anchor:
                change.anchor ??
                Math.min(selection.head, change.from + change.insert.length),
            },
          });
          view.focus();
          return true;
        }
        case "undo":
          return undo(view);
        case "redo":
          return redo(view);
        case "indent":
          return indentMore(view);
        case "outdent":
          return indentLess(view);
        case "find":
        case "replace":
          return openSearchPanel(view);
        case "selectAll":
          return selectAll(view);
        case "deleteLine":
          return deleteLine(view);
        case "format": {
          const text = view.state.doc.toString();
          const formatted = formatMarkdownSource(text, settings);
          if (text !== formatted)
            view.dispatch({
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: formatted,
              },
            });
          return true;
        }
        default:
          return false;
      }
    },
    focus: () => view.focus(),
    destroy: () => {
      fontSet?.removeEventListener("loadingdone", measureLoadedFonts);
      mouseSelections.get(view)?.();
      bindTableCommands(view, null);
      view.destroy();
    },
  };
  bindTableCommands(view, (name, argument) => api.command(name, argument));
  return api;
}
