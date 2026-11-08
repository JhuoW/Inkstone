import { icon } from "./ui.js";
import { locateTable } from "./tables.js";
import "./editor-context-menu.css";

const controllers = new WeakMap();
const drawing = (paths) =>
  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const artwork = {
  ...icon,
  cut: drawing(
    '<circle cx="5" cy="5" r="2.5"/><circle cx="5" cy="15" r="2.5"/><path d="m7 6 10 10M7 14 17 4"/>',
  ),
  copy: drawing(
    '<rect x="7" y="6" width="10" height="12" rx="1"/><path d="M13 6V2H3v12h4"/>',
  ),
  paste: drawing(
    '<path d="M6 4H3v14h14V4h-3"/><rect x="6" y="2" width="8" height="4" rx="1"/><path d="M6 10h8M6 14h6"/>',
  ),
  delete: drawing('<path d="M3 5h14M7 5V2h6v3M5 5l1 13h8l1-13M8 8v7m4-7v7"/>'),
  highlight: drawing('<path d="m5 13 6-10 5 3-6 10H5Zm0 0-2 4h5M12 5l3 2"/>'),
  sup: drawing('<path d="m3 8 7 9M3 17l7-9m3-4c0-3 5-3 5 0 0 2-5 4-5 6h5"/>'),
  sub: drawing('<path d="m3 3 7 9M3 12l7-9m3 10c0-3 5-3 5 0 0 2-5 3-5 5h5"/>'),
  math: drawing('<path d="M15 3H5l6 7-6 7h10"/>'),
  clear: drawing('<path d="m4 13 7-10 6 4-7 10H7Zm4 4h9M7 9l6 4"/>'),
  indent: drawing('<path d="M3 3h14M9 8h8M9 12h8M3 17h14m0-10 3 3-3 3"/>'),
  outdent: drawing('<path d="M3 3h14M9 8h8M9 12h8M3 17h14m3-10-3 3 3 3"/>'),
  ordered: drawing(
    '<path d="M8 5h9M8 10h9M8 15h9M2 3h1v4M2 7h3M2 11c0-2 3-2 3 0 0 1-3 2-3 4h3"/>',
  ),
};

export function installEditorContextMenu({
  host,
  editor,
  getSettings,
  isLocked,
  getRevision,
  execute,
  onError,
}) {
  controllers.get(host)?.destroy();
  host.dataset.inkstoneContextMenu = "true";
  let panels = [],
    snapshot = null,
    opening = 0,
    previousSelection = null,
    lastNativeDetails = null,
    composing = false,
    keyboardNavigation = false,
    pointerPosition = null;
  const nativeContext =
    Boolean(window.inkstone) && /Electron\//.test(navigator.userAgent);
  const t = (zh, en) => (getSettings().locale === "en" ? en : zh);
  const validTarget = (target) => {
    if (
      !(target instanceof Element) ||
      !host.contains(target) ||
      !target.closest(".cm-editor")
    )
      return false;
    const field = target.closest("input,textarea,select");
    return !field || field.matches(".inkstone-table-cell-editor");
  };
  const restoreFocus = () => {
    if (!snapshot || !editor.view.dom.isConnected) return;
    if (editor.view.state.doc === snapshot.doc)
      editor.setSelection(snapshot.selection, { scrollIntoView: false });
    editor.focus();
  };
  function trim(depth) {
    for (const panel of panels.splice(depth)) {
      panel.parent?.setAttribute("aria-expanded", "false");
      panel.el.remove();
    }
  }
  function close(focus = false) {
    opening++;
    trim(0);
    if (focus) restoreFocus();
  }
  function choose(id, argument) {
    const context = snapshot;
    close(false);
    if (
      !context ||
      editor.view.state.doc !== context.doc ||
      JSON.stringify(getRevision()) !== context.revision
    ) {
      onError(
        new Error(
          t(
            "文档已变化，请重新打开菜单。",
            "The document changed. Open the menu again.",
          ),
        ),
      );
      return;
    }
    editor.setSelection(context.selection, { scrollIntoView: false });
    editor.focus();
    const settled = (ok) =>
      document.dispatchEvent(
        new CustomEvent("inkstone:context-action-complete", {
          detail: { id, ok },
        }),
      );
    Promise.resolve(execute(id, argument, context)).then(
      () => settled(true),
      (error) => {
        onError(error);
        settled(false);
      },
    );
  }
  function model(context) {
    const readOnly = isLocked() || editor.view.state.readOnly;
    const selected = context.selection.anchor !== context.selection.head;
    const item = (id, zh, en, options = {}) => ({
      id,
      label: t(zh, en),
      disabled: options.copy ? !selected : readOnly,
      ...options,
    });
    const separator = { separator: true };
    const paragraph = [
      item("paragraph", "正文", "Paragraph"),
      ...Array.from({ length: 6 }, (_, i) =>
        item(`heading${i + 1}`, `标题 ${i + 1}`, `Heading ${i + 1}`),
      ),
      separator,
      item("quote", "引用", "Block quote"),
      item("bullet", "无序列表", "Bullet list"),
      item("ordered", "有序列表", "Numbered list"),
      item("task", "任务列表", "Task list"),
      separator,
      item("strike", "删除线", "Strikethrough", { icon: "strike" }),
      item("highlight", "高亮", "Highlight", { icon: "highlight" }),
      item("sup", "上标", "Superscript", { icon: "sup" }),
      item("sub", "下标", "Subscript", { icon: "sub" }),
      item("clearFormatting", "清除格式", "Clear formatting", {
        icon: "clear",
      }),
      item("indent", "增加缩进", "Indent", { icon: "indent" }),
      item("outdent", "减少缩进", "Outdent", { icon: "outdent" }),
    ];
    const insertion = [
      item("insertImage", "图片…", "Image…", { icon: "image" }),
      ...(!context.table
        ? [
            item("footnote", "脚注…", "Footnote…"),
            item("contextLinkReference", "链接引用", "Link reference"),
            separator,
            item("hr", "水平分割线", "Horizontal line"),
            item("table", "表格…", "Table…", { icon: "table" }),
            item("codeFence", "代码块", "Code fences", { icon: "code" }),
            item("contextInlineMath", "行内公式", "Inline math", {
              icon: "math",
            }),
            item("math", "数学公式块", "Math block", { icon: "math" }),
            item("toc", "目录", "Table of contents"),
            item("contextYAML", "YAML 元数据", "YAML front matter"),
          ]
        : []),
      separator,
      item("contextParagraphBefore", "在前面插入段落", "Paragraph before"),
      item("contextParagraphAfter", "在后面插入段落", "Paragraph after"),
    ];
    const table = context.table;
    const tableItems = table
      ? [
          item("contextTableRowBefore", "在上方插入行", "Insert row above", {
            disabled: readOnly || table.row < 2,
          }),
          item("contextTableRowAfter", "在下方插入行", "Insert row below"),
          item(
            "contextTableColumnBefore",
            "在左侧插入列",
            "Insert column left",
          ),
          item(
            "contextTableColumnAfter",
            "在右侧插入列",
            "Insert column right",
          ),
          separator,
          item("tableAction", "上移行", "Move row up", {
            argument: "rowUp",
            disabled: readOnly || table.row <= 2,
          }),
          item("tableAction", "下移行", "Move row down", {
            argument: "rowDown",
            disabled:
              readOnly || table.row < 2 || table.row >= table.rows.length - 1,
          }),
          item("tableAction", "左移列", "Move column left", {
            argument: "columnLeft",
            disabled: readOnly || table.col === 0,
          }),
          item("tableAction", "右移列", "Move column right", {
            argument: "columnRight",
            disabled: readOnly || table.col >= table.width - 1,
          }),
          separator,
          item("tableAction", "删除行", "Delete row", {
            argument: "deleteRow",
            disabled: readOnly || table.row < 2,
          }),
          item("tableAction", "删除列", "Delete column", {
            argument: "deleteColumn",
            disabled: readOnly || table.width <= 1,
          }),
          item("contextCopyTable", "复制表格", "Copy table", {
            disabled: false,
          }),
          item("contextPrettyTable", "美化表格源码", "Prettify table"),
          separator,
          item("contextDeleteTable", "删除表格", "Delete table", {
            destructive: true,
          }),
        ]
      : [];
    const spelling =
      lastNativeDetails &&
      Date.now() - lastNativeDetails.time < 1500 &&
      Math.abs(lastNativeDetails.x - context.point.x) < 5 &&
      Math.abs(lastNativeDetails.y - context.point.y) < 5
        ? lastNativeDetails
        : null;
    return [
      ...(spelling?.misspelledWord
        ? [
            ...spelling.dictionarySuggestions.map((replacement) =>
              item("contextReplaceSpelling", replacement, replacement, {
                argument: { word: spelling.misspelledWord, replacement },
              }),
            ),
            item("contextAddDictionaryWord", "加入词典", "Add to dictionary", {
              argument: spelling.misspelledWord,
              disabled: false,
            }),
            separator,
          ]
        : []),
      {
        grid: [
          item("contextCut", "剪切", "Cut", {
            icon: "cut",
            disabled: readOnly || !selected,
          }),
          item("contextCopy", "复制", "Copy", { icon: "copy", copy: true }),
          item("contextPaste", "粘贴", "Paste", { icon: "paste" }),
          item("contextDelete", "删除", "Delete", {
            icon: "delete",
            disabled: readOnly || !selected,
          }),
        ],
        label: t("编辑", "Edit"),
        columns: 4,
      },
      {
        id: "copy-paste",
        label: t("复制 / 粘贴为", "Copy / Paste as"),
        children: [
          item("contextCopyMarkdown", "复制为 Markdown", "Copy as Markdown", {
            copy: true,
          }),
          item("copyPlain", "复制为纯文本", "Copy as plain text", {
            copy: true,
          }),
          item("copyHTML", "复制 HTML 源码", "Copy HTML code", { copy: true }),
          item("copyRich", "复制为富文本", "Copy as rich text", { copy: true }),
          separator,
          item("contextPastePlain", "粘贴为纯文本", "Paste as plain text"),
          item("contextPasteMarkdown", "粘贴为 Markdown", "Paste as Markdown"),
          item(
            "contextPasteHTML",
            "将 HTML 粘贴为 Markdown",
            "Paste HTML as Markdown",
          ),
        ],
      },
      separator,
      {
        grid: [
          item("bold", "粗体", "Bold", { icon: "bold" }),
          item("italic", "斜体", "Italic", { icon: "italic" }),
          item("code", "行内代码", "Inline code", { icon: "code" }),
          item("link", "链接", "Link", { icon: "link" }),
          item("quote", "引用", "Block quote", {
            icon: "quote",
            disabled: readOnly || Boolean(context.table),
          }),
          item("bullet", "无序列表", "Bullet list", {
            icon: "bullet",
            disabled: readOnly || Boolean(context.table),
          }),
          item("ordered", "有序列表", "Numbered list", {
            icon: "ordered",
            disabled: readOnly || Boolean(context.table),
          }),
          item("task", "任务列表", "Task list", {
            icon: "task",
            disabled: readOnly || Boolean(context.table),
          }),
        ],
        label: t("格式", "Formatting"),
        columns: 4,
      },
      separator,
      context.table
        ? {
            id: "table",
            label: t("表格", "Table"),
            icon: "table",
            children: tableItems,
          }
        : {
            id: "paragraph",
            label: t("段落", "Paragraph"),
            children: paragraph,
          },
      { id: "insert", label: t("插入", "Insert"), children: insertion },
    ];
  }
  function createPanel(items, depth, parent, point) {
    trim(depth);
    parent?.setAttribute("aria-expanded", "true");
    const el = document.createElement("div");
    el.className = "editor-context-menu";
    el.dataset.inkstoneContextMenu = "true";
    el.dataset.contextDepth = depth;
    el.setAttribute("role", "menu");
    el.setAttribute(
      "aria-label",
      parent?.getAttribute("aria-label") ||
        t("编辑器右键菜单", "Editor context menu"),
    );
    el.setAttribute("popover", "manual");
    const append = (entry, container = el) => {
      if (entry.separator) {
        const separator = document.createElement("div");
        separator.className = "editor-context-separator";
        separator.setAttribute("role", "separator");
        container.append(separator);
        return;
      }
      if (entry.grid) {
        const grid = document.createElement("div");
        grid.className = "editor-context-grid";
        grid.style.setProperty("--context-columns", entry.columns);
        grid.setAttribute("role", "group");
        grid.setAttribute("aria-label", entry.label);
        entry.grid.forEach((child) =>
          append({ ...child, compact: true }, grid),
        );
        container.append(grid);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-label", entry.label);
      button.dataset.contextEntry = "true";
      button.disabled = Boolean(entry.disabled);
      if (entry.compact) {
        button.className = "editor-context-icon";
        button.title = entry.label;
      }
      if (entry.destructive) button.classList.add("is-destructive");
      if (entry.icon) {
        const visual = document.createElement("span");
        visual.className = "editor-context-symbol";
        visual.innerHTML = artwork[entry.icon] || "";
        button.append(visual);
      }
      if (!entry.compact) {
        const label = document.createElement("span");
        label.className = "editor-context-label";
        label.textContent = entry.label;
        button.append(label);
      }
      if (entry.children) {
        button.dataset.contextSubmenu = entry.id;
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        const arrow = document.createElement("span");
        arrow.className = "editor-context-chevron";
        arrow.innerHTML = artwork.chevronRight;
        button.append(arrow);
        const expand = (focus = false) => {
          if (button.disabled) return;
          const replacingFocus = panels
            .slice(depth + 1)
            .some((panel) => panel.el.contains(document.activeElement));
          button.setAttribute("aria-expanded", "true");
          const child = createPanel(entry.children, depth + 1, button);
          if (focus || replacingFocus)
            enabled(child)[0]?.focus({ preventScroll: true });
        };
        button.onclick = () => expand(true);
        button.contextHover = () => {
          if (!keyboardNavigation) expand();
        };
        button.addEventListener("pointerenter", button.contextHover);
        button.contextExpand = expand;
      } else {
        button.dataset.contextAction = entry.id;
        if (entry.argument) button.dataset.contextArgument = entry.argument;
        button.onclick = () => {
          if (!button.disabled) choose(entry.id, entry.argument);
        };
        button.contextHover = () => {
          if (keyboardNavigation) return;
          const replacingFocus = panels
            .slice(depth + 1)
            .some((panel) => panel.el.contains(document.activeElement));
          trim(depth + 1);
          if (replacingFocus) button.focus({ preventScroll: true });
        };
        button.addEventListener("pointerenter", button.contextHover);
      }
      container.append(button);
    };
    items.forEach((entry) => append(entry));
    document.body.append(el);
    el.showPopover?.();
    const panel = { el, parent, depth };
    panels.push(panel);
    const margin = 8,
      width = el.offsetWidth,
      height = el.offsetHeight;
    let left = point?.x ?? parent.getBoundingClientRect().right + 4;
    let top = point?.y ?? parent.getBoundingClientRect().top - 5;
    if (parent && left + width > innerWidth - margin)
      left = parent.getBoundingClientRect().left - width - 4;
    el.style.left =
      Math.max(margin, Math.min(left, innerWidth - width - margin)) + "px";
    el.style.top =
      Math.max(margin, Math.min(top, innerHeight - height - margin)) + "px";
    let prefix = "",
      prefixTimer;
    el.onkeydown = (event) => {
      if (event.isComposing) return;
      keyboardNavigation = true;
      const buttons = enabled(panel),
        at = buttons.indexOf(document.activeElement),
        current = buttons[at];
      let next;
      if (event.key === "ArrowDown") next = (at + 1) % buttons.length;
      if (event.key === "ArrowUp")
        next = (at - 1 + buttons.length) % buttons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        trim(depth + 1);
        buttons[next]?.focus();
        return;
      }
      if (event.key === "ArrowRight" && current?.contextExpand) {
        event.preventDefault();
        current.contextExpand(true);
        return;
      }
      if (event.key === "ArrowLeft" && depth) {
        event.preventDefault();
        trim(depth);
        parent.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (depth) {
          trim(depth);
          parent.focus();
        } else close(true);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        close(true);
        return;
      }
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        current?.click();
        return;
      }
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        prefix += event.key.toLocaleLowerCase();
        clearTimeout(prefixTimer);
        prefixTimer = setTimeout(() => {
          prefix = "";
        }, 600);
        buttons
          .find((button) =>
            button
              .getAttribute("aria-label")
              .toLocaleLowerCase()
              .startsWith(prefix),
          )
          ?.focus();
      }
    };
    el.oncontextmenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    return panel;
  }
  const enabled = (panel) => [
    ...panel.el.querySelectorAll("button[data-context-entry]:not(:disabled)"),
  ];
  async function open(point, target) {
    close(false);
    const request = ++opening;
    if (isLocked() && !editor.view.state.readOnly) return;
    const originalDoc = editor.view.state.doc,
      originalRevision = JSON.stringify(getRevision()),
      wasComposing = composing || editor.view.composing;
    const contextBeforeBlur = editor.prepareContextMenu?.({
      x: point.x,
      y: point.y,
      target,
      preserveSelection: true,
      previousSelection:
        previousSelection?.doc === originalDoc
          ? previousSelection.selection
          : undefined,
    });
    if (editor.finishComposition && !(await editor.finishComposition())) return;
    if (request !== opening || !host.isConnected) return;
    if (
      JSON.stringify(getRevision()) !== originalRevision ||
      (originalDoc !== editor.view.state.doc && !wasComposing)
    )
      return;
    const context =
      originalDoc === editor.view.state.doc ? contextBeforeBlur : null;
    if (context)
      editor.setSelection(context.selection, { scrollIntoView: false });
    if (!context) {
      const position =
        editor.view.posAtCoords(point, false) ??
        editor.view.state.selection.main.head;
      const selected = editor.view.state.selection.main;
      if (selected.empty || position < selected.from || position > selected.to)
        editor.setSelection({ anchor: position }, { scrollIntoView: false });
    }
    const selection = editor.getSelection(),
      position = context?.position ?? selection.head;
    snapshot = {
      ...context,
      position,
      selection,
      point,
      table: context
        ? context.table
        : locateTable(editor.view.state.doc.toString(), position),
      doc: editor.view.state.doc,
      revision: JSON.stringify(getRevision()),
    };
    const panel = createPanel(model(snapshot), 0, null, point);
    enabled(panel)[0]?.focus({ preventScroll: true });
  }
  const contextmenu = (event) => {
    if (!validTarget(event.target)) return;
    if (!nativeContext) event.preventDefault();
    event.stopPropagation();
    open({ x: event.clientX, y: event.clientY }, event.target).catch(onError);
  };
  const pointerdown = (event) => {
    keyboardNavigation = false;
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (event.button === 2 && validTarget(event.target))
      previousSelection = {
        selection: editor.getSelection(),
        doc: editor.view.state.doc,
      };
    if (!event.target.closest?.(".editor-context-menu")) close(false);
  };
  const pointermove = (event) => {
    const wasKeyboard = keyboardNavigation;
    // Popover painting can emit pointerenter under a stationary cursor. Only
    // actual motion should hand a keyboard-opened menu back to hover control.
    if (
      event.movementX ||
      event.movementY ||
      (pointerPosition &&
        (event.clientX !== pointerPosition.x ||
          event.clientY !== pointerPosition.y))
    )
      keyboardNavigation = false;
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (wasKeyboard && !keyboardNavigation)
      event.target.closest?.("[data-context-entry]")?.contextHover?.();
  };
  const keydown = (event) => {
    if (
      !validTarget(event.target) ||
      event.isComposing ||
      !(event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    keyboardNavigation = true;
    previousSelection = {
      selection: editor.getSelection(),
      doc: editor.view.state.doc,
    };
    const rectangle = editor.view.coordsAtPos(
      editor.view.state.selection.main.head,
    );
    open(
      {
        x: rectangle?.left ?? host.getBoundingClientRect().left + 20,
        y: rectangle?.bottom ?? host.getBoundingClientRect().top + 20,
      },
      event.target,
    ).catch(onError);
  };
  const compositionStart = () => {
    composing = true;
  };
  const compositionEnd = () => {
    composing = false;
  };
  const unsubscribeDetails = window.inkstone?.on?.(
    "context-menu-details",
    (details) => {
      lastNativeDetails = {
        ...details,
        dictionarySuggestions: (details.dictionarySuggestions || []).slice(
          0,
          5,
        ),
        time: Date.now(),
      };
      if (
        !snapshot ||
        !panels.length ||
        Math.abs(details.x - snapshot.point.x) >= 5 ||
        Math.abs(details.y - snapshot.point.y) >= 5
      )
        return;
      const panel = createPanel(model(snapshot), 0, null, snapshot.point);
      enabled(panel)[0]?.focus({ preventScroll: true });
    },
  );
  const dismiss = () => close(false);
  host.addEventListener("contextmenu", contextmenu, true);
  host.addEventListener("keydown", keydown, true);
  host.addEventListener("compositionstart", compositionStart, true);
  host.addEventListener("compositionend", compositionEnd, true);
  document.addEventListener("pointerdown", pointerdown, true);
  document.addEventListener("pointermove", pointermove, true);
  window.addEventListener("resize", dismiss);
  window.addEventListener("blur", dismiss);
  host.addEventListener("scroll", dismiss, true);
  const controller = {
    close,
    destroy() {
      close(false);
      unsubscribeDetails?.();
      host.removeEventListener("contextmenu", contextmenu, true);
      host.removeEventListener("keydown", keydown, true);
      host.removeEventListener("compositionstart", compositionStart, true);
      host.removeEventListener("compositionend", compositionEnd, true);
      document.removeEventListener("pointerdown", pointerdown, true);
      document.removeEventListener("pointermove", pointermove, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
      host.removeEventListener("scroll", dismiss, true);
      delete host.dataset.inkstoneContextMenu;
      controllers.delete(host);
    },
  };
  controllers.set(host, controller);
  return controller;
}
