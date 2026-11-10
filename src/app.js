import { createEditor } from "./editor.js";
import { brandIdentity } from "./branding.js";
import { showAbout } from "./about-dialog.js";
import { offerDefaultApp } from "./default-app-dialog.js";
import {
  renderMarkdown,
  hydrateDiagrams,
  getOutline,
  countWords,
  parseBlocks,
} from "./markdown.js";
import {
  $,
  $$,
  esc,
  toast,
  modal,
  ask,
  promptText,
  icon,
  commandMenu,
} from "./ui.js";
import { defaults, showPreferences } from "./preferences.js";
import welcome, { getWelcome } from "./welcome.js";
import "./styles.css";
import "./dialog-design.css";
import "./editor.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";
import { showExport, repeatExport } from "./export.js";
import { editTable } from "./table-dialog.js";
import {
  locateTable,
  serializeTable,
  tableCellRanges,
  modifyTable,
  escapeTableCell,
} from "./tables.js";
import {
  installClipboard,
  writeRichClipboard,
  htmlToMarkdown,
} from "./clipboard.js";
import { installEditorContextMenu } from "./editor-context-menu.js";
import { isolateHistory } from "@codemirror/commands";
import { readDocumentConfig } from "./document-config.js";
import { normalizeSource } from "./source.js";
import { manageResources } from "./resource-manager.js";
import { installFileTreeKeyboard } from "./file-tree-keyboard.js";
import { shortcutMatches } from "./shortcuts.js";
import { createAIAssistant } from "./ai-assistant.js";
import { showAIModelSettings } from "./ai-model-settings.js";
import { combineAIRevisions } from "./ai-revisions.js";
import { localizedError, rawErrorMessage } from "./errors.js";
import { createUpdateNotice } from "./update-notice.js";
import {
  builtInShortcuts,
  defaultShortcuts,
  commandList as commandCatalog,
} from "./commands.js";
import "./ai-assistant.css";

const native = window.inkstone;
// Desktop errors arrive in English with an IPC wrapper. Show them in the UI
// language; `error.raw` and `error.code` keep the original for branching.
const invoke = async (method, payload = {}) => {
  if (!native)
    throw new Error(
      t(
        "请通过桌面应用打开 Inkstone。",
        "Open Inkstone as a desktop application.",
      ),
    );
  try {
    return await native.invoke(method, payload);
  } catch (error) {
    throw localizedError(error, settings.locale === "zh-CN" ? "zh-CN" : "en");
  }
};
const failedWith = (error, code) =>
  rawErrorMessage(error).includes(code + ":") || error?.code === code;
let settings = { ...defaults },
  current = { path: null, text: welcome, revision: null },
  savedText = welcome;
let folder = null,
  files = [],
  selectedPath = null,
  mode = "live",
  sidebarTab = "files",
  fileView = "tree";
const collapsedFolders = new Set(),
  collapsedHeadings = new Set(),
  fileUndoStack = [],
  closedDocuments = [];
let editor,
  aiAssistant,
  saveTimer,
  recoveryTimer,
  outlineTimer,
  statisticsTimer,
  statisticsText = "",
  statisticsCache,
  busySave = null,
  conflict = false,
  resourceCommitting = false,
  compositionActive = false;
let needsLanguageChoice = false,
  closeRequest = null,
  closeDisposition = null,
  closeApprovedSnapshot = null,
  leavePending = null,
  lifecycleLocked = false,
  lastNativeDirty = null,
  deferredExternalChange = null,
  filterTimer = null,
  navigationPending = null,
  navigationLocked = false,
  bootstrapLoading = false,
  startupRecoveryCount = 0,
  updateNotice = null,
  outlineButtons = [],
  activeOutlineButton = null;
const pendingRecoveries = new Set();
let recoveryId = crypto.randomUUID(),
  generation = 0,
  bootstrapData,
  recentFiles = [];
const t = (zh, en) => (settings.locale === "en" ? en : zh);
const basename = (path) => (path || "").split(/[\\/]/).pop();
const imageReference = (file) =>
  "![" +
  basename(file.path).replace(/[\\[\]]/g, "\\$&") +
  "](" +
  (file.markdownPath ||
    file.relativePath.split("/").map(encodeURIComponent).join("/")) +
  ")";
const dirname = (path) => path?.replace(/[\\/][^\\/]+$/, "") || null;
const affectsPath = (path, candidate) =>
  !!candidate &&
  (candidate === path ||
    candidate.startsWith(path + "/") ||
    candidate.startsWith(path + "\\"));
const dirty = () => (editor ? editor.getText() !== savedText : false);
const mutationBlocked = () =>
  bootstrapLoading ||
  lifecycleLocked ||
  navigationLocked ||
  closeRequest ||
  resourceCommitting ||
  settings.readOnly;
const mutationSnapshot = () => ({
  generation,
  path: current.path,
  doc: editor.view.state.doc,
});
function assertAsyncMutation(snapshot) {
  if (
    mutationBlocked() ||
    (snapshot &&
      (snapshot.generation !== generation ||
        snapshot.path !== current.path ||
        (snapshot.doc && snapshot.doc !== editor.view.state.doc)))
  )
    throw Error(
      t(
        "文档已变化、正在切换或关闭，未应用异步编辑。请重试。",
        "The document changed, is switching, or is closing. The pending edit was not applied; try again.",
      ),
    );
}
function approvedCloseUnchanged() {
  return (
    closeApprovedSnapshot &&
    closeApprovedSnapshot.generation === generation &&
    closeApprovedSnapshot.path === current.path &&
    closeApprovedSnapshot.text === editor.getText() &&
    closeApprovedSnapshot.revision === current.revision
  );
}
const guarded =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      toast(e.message, true);
      console.error(e);
    }
  };
const preferenceOptions = () => ({
  commands: () => commandList(),
  shortcutDefaults: { ...builtInShortcuts, ...defaultShortcuts },
  checkUpdates: () => run("checkUpdates"),
});
function commandShortcut(id) {
  const key = { ...defaultShortcuts, ...settings.shortcuts }[id];
  return key
    ? key
        .split("-")
        .map((part) =>
          part.toLowerCase() === "mod"
            ? "Ctrl"
            : part.length === 1
              ? part.toUpperCase()
              : part,
        )
        .join("+")
    : "";
}
const run = (name, arg) => guarded(execute)(name, arg);

let toolbarObserver = null,
  toolbarFrame = 0;
// Hide trailing formatting buttons until the toolbar fits; show "⋯" for them.
function fitToolbar() {
  const tools = $(".format-tools"),
    more = $("#toolbar-more");
  if (!tools || !more) return;
  const items = [...tools.children];
  items.forEach((item) => (item.hidden = false));
  more.hidden = true;
  if (tools.scrollWidth <= tools.clientWidth + 1) return;
  more.hidden = false;
  for (
    let index = items.length - 1;
    index >= 0 && tools.scrollWidth > tools.clientWidth + 1;
    index--
  )
    items[index].hidden = true;
  // Do not leave a separator at the visible end.
  const visible = items.filter((item) => !item.hidden);
  if (visible.at(-1)?.classList.contains("separator"))
    visible.at(-1).hidden = true;
}

// Below this width the sidebar starts hidden; the sidebar button then shows
// it over the editor instead of squeezing the document.
const NARROW_WINDOW = 960;
let sidebarAutoHidden = false;
const narrowWindow = () => window.innerWidth < NARROW_WINDOW;
function fitSidebarToWindow() {
  const body = document.body;
  if (narrowWindow()) {
    if (
      !body.classList.contains("sidebar-hidden") &&
      !body.classList.contains("sidebar-overlay")
    ) {
      body.classList.add("sidebar-hidden");
      sidebarAutoHidden = true;
    }
  } else {
    body.classList.remove("sidebar-overlay");
    if (sidebarAutoHidden) body.classList.remove("sidebar-hidden");
    sidebarAutoHidden = false;
  }
}
function closeSidebarOverlay() {
  if (!document.body.classList.contains("sidebar-overlay")) return;
  document.body.classList.remove("sidebar-overlay");
  document.body.classList.add("sidebar-hidden");
}
function toggleSidebar() {
  const body = document.body;
  if (narrowWindow()) {
    if (body.classList.contains("sidebar-overlay")) closeSidebarOverlay();
    else {
      body.classList.remove("sidebar-hidden");
      body.classList.add("sidebar-overlay");
      sidebarAutoHidden = true;
    }
    return;
  }
  sidebarAutoHidden = false;
  body.classList.toggle("sidebar-hidden");
}
window.addEventListener("resize", fitSidebarToWindow);
// Choosing something outside the overlay, or Esc, closes it.
document.addEventListener(
  "pointerdown",
  (event) => {
    if (
      document.body.classList.contains("sidebar-overlay") &&
      !event.target.closest?.("#sidebar, [data-command=sidebar]")
    )
      closeSidebarOverlay();
  },
  true,
);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    document.body.classList.contains("sidebar-overlay") &&
    !document.querySelector("dialog[open]")
  )
    closeSidebarOverlay();
});

// Immersive mode hides every surface except the document and AI panel. It is
// not saved: each window starts with the full interface.
function toggleZen(force) {
  const on = force ?? !document.body.classList.contains("zen-mode");
  document.body.classList.toggle("zen-mode", on);
  if (on) closeSidebarOverlay();
  const exit = $("#zen-exit");
  if (exit) exit.hidden = !on;
  if (on)
    toast(
      t(
        `已进入沉浸模式，按 Esc 或 ${commandShortcut("zen") || "Ctrl+Shift+Enter"} 退出`,
        `Immersive mode. Press Esc or ${commandShortcut("zen") || "Ctrl+Shift+Enter"} to exit`,
      ),
    );
  editor?.focus();
}
// Esc leaves immersive mode only when nothing else (search, completion, a
// menu or dialog) used the key first.
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !event.defaultPrevented &&
    document.body.classList.contains("zen-mode") &&
    !document.querySelector("dialog[open], .command-menu:popover-open")
  )
    toggleZen(false);
});

function shell() {
  aiAssistant?.destroy();
  aiAssistant = null;
  $("#app").innerHTML =
    '<aside id="sidebar"><div id="sidebar-resize" role="separator" aria-orientation="vertical" aria-label="Sidebar width" tabindex="0"></div><div class="brand">' +
    brandIdentity(
      t("让想法落在纸上", "A place for your thoughts"),
      settings.locale,
    ) +
    '<button data-command="openFolder" class="icon-button" title="' +
    t("打开文件夹", "Open folder") +
    '">' +
    icon.folder +
    "</button></div>" +
    '<div class="workspace-label"><span id="folder-name">' +
    t("写作空间", "Workspace") +
    '</span><button data-command="pinFolder" class="icon-button" title="' +
    t("固定文件夹", "Pin folder") +
    '">' +
    icon.pin +
    '</button><button data-command="newFile" class="icon-button" title="' +
    t("新建文件", "New file") +
    '">' +
    icon.plus +
    "</button></div>" +
    '<nav class="sidebar-tabs" role="tablist" aria-label="' +
    t("侧边栏视图", "Sidebar views") +
    '"><button data-tab="files" class="active">' +
    icon.folder +
    t("文件", "Files") +
    '</button><button data-tab="outline">' +
    icon.outline +
    t("大纲", "Outline") +
    '</button><button data-tab="search">' +
    icon.search +
    t("搜索", "Search") +
    "</button></nav>" +
    '<div class="sidebar-filter"><input id="file-filter" placeholder="' +
    t("筛选文件…", "Filter files…") +
    '" aria-label="Filter files"><button id="toggle-file-view" class="icon-button" title="' +
    t("切换树/列表", "Toggle tree/list") +
    '">' +
    icon.bullet +
    '</button></div><div id="sidebar-content"></div>' +
    '<div class="sidebar-bottom"><button data-command="quickOpen">' +
    icon.search +
    "<span>" +
    t("快速打开", "Quick open") +
    '</span><kbd>Ctrl+P</kbd></button><button data-command="settings">' +
    icon.settings +
    "<span>" +
    t("偏好设置", "Preferences") +
    "</span><kbd>Ctrl+,</kbd></button></div></aside>" +
    '<main id="main"><header class="titlebar"><button class="icon-button" data-command="sidebar" title="' +
    t("侧边栏", "Sidebar") +
    '">' +
    icon.sidebar +
    '</button><div class="breadcrumb"><span id="breadcrumb-folder">' +
    t("本地文档", "Local document") +
    '</span><span>/</span><strong id="document-title">' +
    t("欢迎使用墨石", "Welcome to Inkstone") +
    '</strong><span id="dirty-dot"></span></div><div class="ai-entry-slot"><button class="ai-launcher" data-command="aiAssistant" aria-controls="ai-assistant-host" aria-expanded="false" title="' +
    esc(
      t("AI写作助手", "AI Writing Assistant") +
        (commandShortcut("aiAssistant")
          ? ` (${commandShortcut("aiAssistant")})`
          : ""),
    ) +
    '">' +
    icon.writingAssistant +
    "<span>" +
    t("AI写作助手", "AI Writing Assistant") +
    '</span></button></div><div id="save-state" role="status" aria-live="polite"></div><div class="titlebar-actions"><button class="command-launcher" data-command="commands" title="' +
    t("全部命令", "All commands") +
    '">' +
    icon.command +
    "<span>" +
    t("命令", "Commands") +
    "</span></button></div></header>" +
    '<div class="toolbar"><div class="format-tools">' +
    [
      ["heading", "heading"],
      ["bold", "bold"],
      ["italic", "italic"],
      ["strike", "strike"],
      ["quote", "quote"],
      ["bullet", "bullet"],
      ["task", "task"],
      ["link", "link"],
      ["insertImage", "image"],
      ["table", "table"],
      ["code", "code"],
    ]
      .map(
        ([command, glyph], index) =>
          (index === 4
            ? '<span class="separator" aria-hidden="true"></span>'
            : "") +
          '<button data-command="' +
          command +
          '"' +
          (command === "heading" ? ' data-arg="1"' : "") +
          ">" +
          icon[glyph] +
          "</button>",
      )
      .join("") +
    '</div><button id="toolbar-more" class="icon-button" aria-haspopup="menu" hidden title="' +
    t("更多格式", "More formatting") +
    '" aria-label="' +
    t("更多格式", "More formatting") +
    '">⋯</button><button id="insert-menu-button" aria-haspopup="menu" aria-expanded="false"><span>' +
    t("插入", "Insert") +
    "</span>" +
    icon.chevronDown +
    '</button><div class="view-tools"><button id="mode-button" data-command="source">' +
    icon.code +
    "<span>" +
    t("源码", "Source") +
    '</span></button><button data-command="export">' +
    icon.export +
    "<span>" +
    t("导出", "Export") +
    "</span></button></div></div>" +
    '<button id="zen-exit" data-command="zen" hidden>' +
    t("退出沉浸模式", "Exit immersive mode") +
    "</button>" +
    '<div id="language-onboarding" hidden></div><div id="recovery-notice" class="recovery-notice" hidden></div><div id="update-notice" class="recovery-notice update-notice" role="status" aria-live="polite" hidden></div><div id="conflict-banner" hidden role="alert"></div><div id="editor-area"><div id="editor-host"></div><div id="ai-assistant-host" hidden></div></div><div id="floating-toolbar" hidden>' +
    [
      ["bold", "bold"],
      ["italic", "italic"],
      ["link", "link"],
      ["copyHTML", "code"],
    ]
      .map(
        ([command, glyph]) =>
          '<button data-command="' + command + '">' + icon[glyph] + "</button>",
      )
      .join("") +
    "</div>" +
    '<footer class="statusbar"><button id="statistics" data-command="statistics"></button><div><span id="cursor-status"></span><span id="encoding-status">UTF-8</span><button data-command="focus" id="focus-button">' +
    t("专注", "Focus") +
    '</button><button data-command="typewriter" id="typewriter-button">' +
    t("打字机", "Typewriter") +
    '</button><button id="zoom-button" data-command="zoomReset">100%</button></div></footer></main>';
  $("#app").onclick = (e) => {
    const b = e.target.closest("[data-command]");
    if (b) run(b.dataset.command, b.dataset.arg);
  };
  const tabs = $$("[data-tab]");
  tabs.forEach((button, index) => {
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "sidebar-content");
    button.onclick = () => {
      sidebarTab = button.dataset.tab;
      renderSidebar();
    };
    button.onkeydown = (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft")
        next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        tabs[next].click();
        tabs[next].focus();
      }
    };
  });
  $("#insert-menu-button").onclick = (event) => {
    const commands = new Map(
      commandList().map((command) => [command.id, command]),
    );
    const items = [
      { group: t("内容", "Content") },
      ...[
        "table",
        "tableEdit",
        "codeFence",
        "codeLanguage",
        "math",
        "toc",
        "footnote",
        "hr",
        "pageBreak",
      ],
      { group: t("图片与链接", "Images and links") },
      ...[
        "link",
        "insertImage",
        "insertImageURL",
        "resizeImage",
        "manageImages",
        "downloadImage",
      ],
      { group: t("更多格式", "More formatting") },
      ...["highlight", "sup", "sub", "ordered"],
    ]
      .map((item) => (typeof item === "string" ? commands.get(item) : item))
      .filter(Boolean);
    commandMenu(event.currentTarget, items, (id) => run(id));
  };
  // Formatting buttons that do not fit move into the "⋯" menu instead of
  // making the toolbar scroll.
  const toolbarLabels = {
    heading: [t("标题 1", "Heading 1"), "heading1"],
    bold: [t("加粗", "Bold")],
    italic: [t("斜体", "Italic")],
    strike: [t("删除线", "Strikethrough")],
    quote: [t("引用", "Quote")],
    bullet: [t("无序列表", "Bullet list")],
    task: [t("任务列表", "Task list")],
    link: [t("插入链接", "Insert link")],
    insertImage: [t("插入本地图片", "Insert local image")],
    table: [t("创建表格", "Create table")],
    code: [t("行内代码", "Inline code")],
  };
  for (const button of $$(".format-tools [data-command]")) {
    const [label] = toolbarLabels[button.dataset.command] || [];
    if (label && !button.getAttribute("aria-label")) {
      button.setAttribute("aria-label", label);
      button.title = label;
    }
  }
  $("#toolbar-more").onclick = (event) => {
    const items = $$(".format-tools [data-command]")
      .filter((button) => button.hidden)
      .map((button) => {
        const [label, id] = toolbarLabels[button.dataset.command] || [
          button.dataset.command,
        ];
        return { id: id || button.dataset.command, label };
      });
    commandMenu(event.currentTarget, items, (id) => run(id));
  };
  toolbarObserver?.disconnect();
  toolbarObserver = new ResizeObserver(() => {
    cancelAnimationFrame(toolbarFrame);
    toolbarFrame = requestAnimationFrame(fitToolbar);
  });
  toolbarObserver.observe($(".toolbar"));
  fitSidebarToWindow();
  $("#file-filter").oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(renderSidebar, 80);
  };
  $("#file-filter").onkeydown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      renderSidebar();
      $(
        "#sidebar-content [role=treeitem]:not([hidden]), #sidebar-content .outline-item",
      )?.focus();
    }
  };
  $("#toggle-file-view").onclick = () => {
    fileView = fileView === "tree" ? "list" : "tree";
    renderSidebar();
  };
  const resize = $("#sidebar-resize");
  resize.onpointerdown = (e) => {
    e.preventDefault();
    resize.setPointerCapture(e.pointerId);
    const move = (event) => {
      const width = Math.max(
        180,
        Math.min(
          500,
          event.clientX - $("#sidebar").getBoundingClientRect().left,
        ),
      );
      document.documentElement.style.setProperty(
        "--sidebar-width",
        width + "px",
      );
      resize.setAttribute("aria-valuenow", width);
    };
    const finish = (event) => {
      resize.removeEventListener("pointermove", move);
      resize.removeEventListener("pointerup", finish);
      resize.releasePointerCapture(event.pointerId);
      guarded(updateSettings)({
        sidebarWidth: Math.round($("#sidebar").getBoundingClientRect().width),
      });
    };
    resize.addEventListener("pointermove", move);
    resize.addEventListener("pointerup", finish);
  };
  resize.onkeydown = (e) => {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      guarded(updateSettings)({
        sidebarWidth: Math.max(
          180,
          Math.min(
            500,
            (settings.sidebarWidth || 256) + (e.key === "ArrowLeft" ? -10 : 10),
          ),
        ),
      });
    }
  };
  const labels = {
    heading: t("一级标题", "Heading 1"),
    bold: t("粗体", "Bold"),
    italic: t("斜体", "Italic"),
    strike: t("删除线", "Strikethrough"),
    quote: t("引用", "Block quote"),
    bullet: t("无序列表", "Bulleted list"),
    task: t("任务列表", "Task list"),
    link: t("链接", "Link"),
    insertImage: t("插入本地图片", "Insert local image"),
    table: t("表格", "Table"),
    code: t("行内代码", "Inline code"),
    copyHTML: t("复制 HTML", "Copy HTML"),
  };
  $$(".toolbar [data-command], #floating-toolbar [data-command]").forEach(
    (button) => {
      const label = labels[button.dataset.command] || button.textContent.trim();
      button.title = label;
      button.setAttribute("aria-label", label);
    },
  );
  $$("button[title]").forEach((button) =>
    button.setAttribute("aria-label", button.title),
  );
  $("#file-filter").setAttribute("aria-label", t("筛选文件", "Filter files"));
  resize.setAttribute("aria-label", t("侧边栏宽度", "Sidebar width"));
  resize.setAttribute("aria-valuemin", "180");
  resize.setAttribute("aria-valuemax", "500");
  resize.setAttribute("aria-valuenow", settings.sidebarWidth || 256);
  renderLanguageChoice();
  renderRecoveryNotice();
  updateNotice?.refresh();
}

function renderLanguageChoice() {
  const host = $("#language-onboarding");
  if (!host) return;
  host.hidden = !needsLanguageChoice || settings.firstRunComplete;
  if (host.hidden) return;
  host.innerHTML =
    '<div class="onboarding-copy"><strong>' +
    t("欢迎使用 Inkstone", "Welcome to Inkstone") +
    "</strong><span>" +
    t(
      "选择界面语言。你可以随时在偏好设置中更改。",
      "Choose your language. You can change it anytime in Preferences.",
    ) +
    '</span></div><label class="onboarding-language"><span class="sr-only">' +
    t("语言", "Language") +
    '</span><select id="welcome-language"><option value="en">English</option><option value="zh-CN">简体中文</option></select></label><button id="welcome-continue" class="primary">' +
    t("开始写作", "Get started") +
    "</button>";
  $("#welcome-language").value = settings.locale;
  $("#welcome-continue").onclick = guarded(async () => {
    await updateSettings({
      locale: $("#welcome-language").value,
      firstRunComplete: true,
    });
    needsLanguageChoice = false;
    renderLanguageChoice();
    editor.focus();
    await offerDefaultApp(invoke, settings.locale);
  });
}

function renderRecoveryNotice() {
  const host = $("#recovery-notice");
  if (!host) return;
  host.hidden = !startupRecoveryCount;
  if (host.hidden) return;
  host.innerHTML =
    "<span>" +
    t("有可恢复的本机草稿。", "Local recovery drafts are available.") +
    '</span><button id="recovery-review">' +
    t("查看草稿", "Review drafts") +
    '</button><button id="recovery-dismiss" class="icon-button" aria-label="' +
    t("稍后查看", "Dismiss for now") +
    '">' +
    icon.close +
    "</button>";
  $("#recovery-review").onclick = guarded(() =>
    recoveryDialog({ startup: true }),
  );
  $("#recovery-dismiss").onclick = () => {
    startupRecoveryCount = 0;
    renderRecoveryNotice();
  };
}

function applyAppearance() {
  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.lang = settings.locale;
  document.documentElement.style.setProperty(
    "--sidebar-width",
    (settings.sidebarWidth || 256) + "px",
  );
  document.documentElement.style.setProperty(
    "--writing-width",
    settings.contentWidth + "px",
  );
  document.documentElement.style.setProperty(
    "--writing-font",
    settings.fontFamily,
  );
  document.documentElement.style.setProperty(
    "--writing-size",
    settings.fontSize + "px",
  );
  document.documentElement.style.setProperty(
    "--writing-leading",
    settings.lineHeight,
  );
  let style = $("#custom-css");
  if (!style) {
    style = document.createElement("style");
    style.id = "custom-css";
    document.head.append(style);
  }
  style.textContent = settings.customCSS;
  $("#focus-button")?.classList.toggle("active", settings.focusMode);
  $("#typewriter-button")?.classList.toggle("active", settings.typewriterMode);
  $("#focus-button")?.setAttribute("aria-pressed", String(settings.focusMode));
  $("#typewriter-button")?.setAttribute(
    "aria-pressed",
    String(settings.typewriterMode),
  );
  document.body.classList.toggle("focus-mode", settings.focusMode);
  document.body.classList.toggle("typewriter-mode", settings.typewriterMode);
  editor?.setSettings({
    ...settings,
    basePath: current.path,
    readOnly:
      bootstrapLoading ||
      lifecycleLocked ||
      navigationLocked ||
      resourceCommitting ||
      settings.readOnly,
  });
}
async function updateSettings(patch) {
  await invoke("updateSettings", patch);
  acceptSettings(patch);
  if (
    [
      "showHidden",
      "showAllFiles",
      "fileSort",
      "sortDescending",
      "foldersFirst",
      "includeGlobs",
      "excludeGlobs",
    ].some((k) => k in patch)
  )
    await refreshFiles();
}
function acceptSettings(patch) {
  const languageChanged = patch.locale && patch.locale !== settings.locale;
  settings = { ...settings, ...patch };
  if (patch.recentFiles) recentFiles = patch.recentFiles;
  if (languageChanged && editor) {
    const host = $("#editor-host"),
      oldHost = host.cloneNode(false);
    host.replaceWith(oldHost);
    const mount = host;
    shell();
    $("#editor-host").replaceWith(mount);
    makeAIAssistant();
    applyAppearance();
    updateStatus();
    renderSidebar();
  }
  applyAppearance();
  renderLanguageChoice();
  renderRecoveryNotice();
  updateNotice?.refresh();
  if (languageChanged) {
    updateStatus();
    document.dispatchEvent(
      new CustomEvent("inkstone:locale-change", { detail: settings }),
    );
  }
  if ("outlineNumbering" in patch && sidebarTab === "outline") renderSidebar();
}
function makeEditor(text) {
  editor = createEditor($("#editor-host"), {
    text,
    settings: {
      ...settings,
      basePath: current.path,
      readOnly: bootstrapLoading || settings.readOnly,
    },
    onChange: changed,
    onSelection: updateStatus,
    onLink: (href) => run("followLink", href),
    onSlashCommand: (id) => run(id),
  });
  $("#editor-host").addEventListener(
    "compositionstart",
    () => {
      compositionActive = true;
      clearTimeout(saveTimer);
      clearTimeout(recoveryTimer);
    },
    true,
  );
  $("#editor-host").addEventListener(
    "compositionend",
    () => {
      compositionActive = false;
      setTimeout(changed, 30);
    },
    true,
  );
  $("#editor-host").addEventListener(
    "paste",
    (e) => {
      const images = [...(e.clipboardData?.items || [])].filter((i) =>
        i.type.startsWith("image/"),
      );
      if (images.length) {
        e.preventDefault();
        e.stopPropagation();
        guarded(insertImageFiles)(images.map((i) => i.getAsFile()));
      }
    },
    true,
  );
  installClipboard(
    $("#editor-host"),
    editor,
    () => current,
    (error) => {
      toast(error.message, true);
      console.error(error);
    },
  );
  installEditorContextMenu({
    host: $("#editor-host"),
    editor,
    getSettings: () => settings,
    isLocked: mutationBlocked,
    getRevision: () => ({ generation, path: current.path }),
    execute: executeContextAction,
    onError: (error) => {
      toast(error.message, true);
      console.error(error);
    },
  });
  $("#editor-host").addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  });
  $("#editor-host").addEventListener(
    "drop",
    (e) => {
      const imgs = [...e.dataTransfer.files].filter((f) =>
        f.type.startsWith("image/"),
      );
      if (imgs.length) {
        e.preventDefault();
        e.stopPropagation();
        guarded(insertImageFiles)(imgs);
      }
    },
    true,
  );
}
function getAIContext() {
  const selection = editor.view.state.selection.main;
  const doc = editor.view.state.doc;
  let text;
  return {
    // Changes when another document loads or the text is replaced wholesale.
    // Saving under a new path (Save As, first save) keeps the same document.
    identity: `${generation}:${editor.getDocumentEpoch?.() ?? 0}`,
    // Built on demand: most callers only need the identity or lock state.
    get text() {
      return (text ??= doc.toString());
    },
    selection: { from: selection.from, to: selection.to },
    readOnly: !!(
      mutationBlocked() ||
      compositionActive ||
      editor.view.composing
    ),
  };
}
function makeAIAssistant() {
  aiAssistant?.destroy();
  aiAssistant = createAIAssistant({
    host: $("#ai-assistant-host"),
    invoke,
    on: (event, callback) => native?.on(event, callback) || (() => {}),
    getContext: getAIContext,
    t,
    initialLayout: {
      open: !!settings.aiPanelOpen,
      height: settings.aiPanelHeight || 260,
    },
    saveLayout: async (patch) => {
      $("[data-command=aiAssistant]")?.setAttribute(
        "aria-expanded",
        String(patch.aiPanelOpen ?? settings.aiPanelOpen),
      );
      await updateSettings(patch);
    },
    onConfigure: (options) => showAIModelSettings({ invoke, t, ...options }),
    locate: ({ from, to }) => {
      editor.setSelection({ anchor: from, head: to });
      editor.focus();
    },
    copyText: (text) => invoke("writeClipboard", { text }),
    // Inserts an AI reply at the cursor as its own undo step.
    insertText: (text) => {
      if (getAIContext().readOnly)
        throw Error(t("文档为只读", "Document is read-only"));
      const { from, to } = editor.view.state.selection.main;
      const insert = String(text).replace(/\r\n|\r/g, "\n");
      editor.view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        annotations: isolateHistory.of("full"),
        userEvent: "input.ai",
        scrollIntoView: true,
      });
      editor.focus();
    },
    // Accepts one revision or several; several become one undo step.
    applyRevision: (input) => {
      const revisions = Array.isArray(input) ? input : [input];
      const changes = combineAIRevisions(getAIContext(), revisions);
      if (!changes.length) return;
      const last = changes.at(-1);
      editor.view.dispatch({
        changes,
        selection: {
          anchor: editor.view.state.changes(changes).mapPos(last.to, 1),
        },
        annotations: isolateHistory.of("full"),
        userEvent: "input.ai",
        scrollIntoView: true,
      });
      editor.focus();
    },
  });
  $("[data-command=aiAssistant]")?.setAttribute(
    "aria-expanded",
    String(!!settings.aiPanelOpen),
  );
}
function changed(_text, metadata = {}) {
  if (metadata.changes) aiAssistant?.trackChanges(metadata.changes);
  updateStatus();
  syncNativeDirty();
  clearTimeout(recoveryTimer);
  clearTimeout(saveTimer);
  if (
    compositionActive ||
    metadata.composing ||
    bootstrapLoading ||
    lifecycleLocked ||
    navigationLocked
  )
    return;
  const expectedGeneration = generation;
  recoveryTimer = setTimeout(
    guarded(async () => {
      if (expectedGeneration === generation && dirty())
        await writeRecovery({
          id: recoveryId,
          path: current.path,
          text: editor.getText(),
          revision: current.revision,
          selection: editor.getSelection(),
        });
    }),
    500,
  );
  clearTimeout(saveTimer);
  if (settings.autoSave && current.path && !conflict && !resourceCommitting)
    saveTimer = setTimeout(
      () => run("autoSave"),
      Math.max(500, settings.autoSaveDelay),
    );
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => {
    if (sidebarTab === "outline") renderSidebar();
  }, 200);
}

function syncNativeDirty(force = false) {
  const value = dirty();
  if (!force && lastNativeDirty === value) return Promise.resolve();
  lastNativeDirty = value;
  return invoke("setDirty", { dirty: value }).catch((error) => {
    lastNativeDirty = null;
    console.error(error);
  });
}
function writeRecovery(payload) {
  const write = invoke("saveRecovery", payload);
  pendingRecoveries.add(write);
  write.then(
    () => pendingRecoveries.delete(write),
    () => pendingRecoveries.delete(write),
  );
  return write;
}
function pausePersistence() {
  clearTimeout(saveTimer);
  clearTimeout(recoveryTimer);
}
async function discardCurrentDraft() {
  pausePersistence();
  await Promise.allSettled([...pendingRecoveries]);
  await invoke("discardRecovery", { id: recoveryId, path: current.path });
  recoveryId = crypto.randomUUID();
}
async function lockForClose() {
  pausePersistence();
  if (navigationPending) await navigationPending.catch(() => {});
  if (editor.finishComposition && !(await editor.finishComposition()))
    throw Error(
      t(
        "请先完成当前输入，再关闭窗口。",
        "Finish the current text composition before closing.",
      ),
    );
  lifecycleLocked = true;
  pausePersistence();
  editor.setSettings({ readOnly: true });
  updateStatus();
  if (busySave) await busySave;
  await Promise.allSettled([...pendingRecoveries]);
}
function resumeEditing() {
  lifecycleLocked = false;
  closeRequest = null;
  closeDisposition = null;
  closeApprovedSnapshot = null;
  recoveryId = crypto.randomUUID();
  editor.setSettings({
    readOnly:
      lifecycleLocked ||
      navigationLocked ||
      resourceCommitting ||
      !!settings.readOnly,
  });
  if (dirty()) changed();
  editor.focus();
  updateStatus();
  flushExternalChange();
}
function flushExternalChange() {
  if (lifecycleLocked || navigationLocked || resourceCommitting) return;
  if (deferredExternalChange) {
    const event = deferredExternalChange;
    deferredExternalChange = null;
    guarded(handleExternalChange)(event);
  }
}
function updateStatus() {
  if (!editor) return;
  aiAssistant?.updateContext();
  const text = editor.getText(),
    sel = editor.view.state.selection.main;
  if (text !== statisticsText) {
    if (text.length < 100000 || !statisticsCache) {
      statisticsCache = countWords(text);
      statisticsText = text;
    } else {
      clearTimeout(statisticsTimer);
      statisticsTimer = setTimeout(() => {
        statisticsCache = countWords(editor.getText());
        statisticsText = editor.getText();
        updateStatus();
      }, 250);
    }
  }
  const stats = statisticsCache;
  const count = stats.words.toLocaleString(settings.locale);
  $("#statistics").textContent = t(
    `字数 ${count} · 约 ${stats.readingMinutes} 分钟`,
    `${count} ${stats.words === 1 ? "word" : "words"} · ${stats.readingMinutes} min`,
  );
  // Chinese characters and other words are counted separately; show both.
  $("#statistics").title = t(
    `中日韩字符 ${stats.cjk} · 其他词 ${stats.words - stats.cjk} · 字符 ${stats.characters}（点击查看统计）`,
    `CJK characters ${stats.cjk} · other words ${stats.words - stats.cjk} · characters ${stats.characters} (click for statistics)`,
  );
  const line = editor.view.state.doc.lineAt(sel.head);
  $("#cursor-status").textContent =
    t("行 ", "Ln ") +
    line.number +
    ", " +
    t("列 ", "Col ") +
    (sel.head - line.from + 1) +
    (sel.empty
      ? ""
      : " · " + (sel.to - sel.from) + " " + t("已选", "selected"));
  $("#document-title").textContent =
    basename(current.path) || t("未命名", "Untitled");
  $("#breadcrumb-folder").textContent =
    basename(dirname(current.path)) || t("本地文档", "Local document");
  $("#dirty-dot").textContent = dirty() ? "●" : "";
  $("#save-state").textContent = busySave
    ? t("正在保存…", "Saving…")
    : bootstrapLoading || navigationLocked
      ? t("正在打开…", "Opening…")
      : lifecycleLocked
        ? t("正在关闭…", "Closing…")
        : settings.readOnly
          ? t("只读", "Read-only")
          : conflict
            ? t("外部修改冲突", "External conflict")
            : dirty()
              ? t("未保存", "Unsaved")
              : current.path
                ? t("已保存", "Saved")
                : t("本地草稿", "Local draft");
  $("#encoding-status").textContent =
    (current.encoding || "UTF-8").toUpperCase() +
    (current.bom ? " BOM" : "") +
    " · " +
    (["\r\n", "CRLF"].includes(current.lineEnding) ? "CRLF" : "LF");
  const modeButton = $("#mode-button");
  if (modeButton.dataset.mode !== mode) {
    const label =
      mode === "source" ? t("即时渲染", "Live preview") : t("源码", "Source");
    modeButton.innerHTML =
      (mode === "source" ? icon.preview : icon.code) +
      "<span>" +
      label +
      "</span>";
    modeButton.title = label;
    modeButton.setAttribute("aria-label", label);
    modeButton.setAttribute("aria-pressed", String(mode === "source"));
    modeButton.classList.toggle("active", mode === "source");
    modeButton.dataset.mode = mode;
  }
  $("#document-title").title = current.path || t("未命名", "Untitled");
  $("#breadcrumb-folder").title =
    dirname(current.path) || t("本地文档", "Local document");
  let left = 0,
    right = outlineButtons.length - 1,
    active = null;
  while (left <= right) {
    const mid = (left + right) >> 1;
    const item = outlineButtons[mid];
    if (Number(item.dataset.from) <= sel.head) {
      active = item;
      left = mid + 1;
    } else right = mid - 1;
  }
  if (active && sel.head >= Number(active.dataset.to)) active = null;
  if (active !== activeOutlineButton) {
    activeOutlineButton?.classList.remove("current");
    active?.classList.add("current");
    activeOutlineButton = active;
  }
  $("#floating-toolbar").hidden =
    sel.empty || !!document.querySelector("dialog[open]");
  document.title =
    (dirty() ? "● " : "") +
    (basename(current.path) || t("未命名", "Untitled")) +
    " — Inkstone";
}
// Asks before the document is closed or replaced. `batch` is a choice already
// made for several documents at once when exiting ("save" or "discard").
async function mayLeave({ deferDiscard = false, batch = null } = {}) {
  if (leavePending) return leavePending;
  pausePersistence();
  let allowed = false;
  leavePending = (async () => {
    if (resourceCommitting) {
      toast(
        t("资源正在保存，请稍候", "Resources are being saved; please wait"),
      );
      return false;
    }
    if (busySave) await busySave;
    if (!dirty()) return true;
    // With auto save on, a named document is saved now, as it would have
    // been a moment later. Only a failed save asks.
    if (!batch && settings.autoSave && current.path && !conflict) {
      const saved = await saveDocument(false, current.encoding, {
        quiet: true,
      });
      if (saved && !dirty()) {
        if (deferDiscard) closeDisposition = "save";
        return true;
      }
    }
    if (!batch) await revealWindow();
    const result =
      batch ||
      (await ask(
        t("保存当前文档？", "Save this document?"),
        current.path
          ? t(
              "文档有未保存的修改。关闭前是否保存？",
              "This document has unsaved changes. Would you like to save them?",
            )
          : t(
              "这份新文档尚未保存到本机。",
              "This new document has not been saved to a file yet.",
            ),
        [
          { label: t("保存", "Save"), value: "save" },
          { label: t("不保存", "Don't Save"), value: "discard" },
          { label: t("取消", "Cancel"), value: "cancel" },
        ],
      ));
    if (result === "save") {
      const saved = !!(await saveDocument()) && !dirty();
      if (saved && deferDiscard) closeDisposition = "save";
      return saved;
    }
    if (result === "discard") {
      if (deferDiscard) closeDisposition = "discard";
      else await discardCurrentDraft();
      return true;
    }
    return false;
  })();
  try {
    allowed = await leavePending;
    return allowed;
  } finally {
    leavePending = null;
    if (!allowed && !lifecycleLocked && dirty()) changed();
  }
}

async function handleExternalChange(event) {
  if (event.path !== current.path || event.revision === current.revision)
    return;
  if (lifecycleLocked || navigationLocked || resourceCommitting) {
    deferredExternalChange = event;
    return;
  }
  if (dirty() || event.deleted) {
    showConflict(event.deleted ? "missing" : "changed");
    return;
  }
  const snapshot = {
    generation,
    revision: current.revision,
    text: editor.getText(),
    selection: editor.getSelection(),
  };
  const disk = await invoke("openFile", {
    path: current.path,
    encoding: current.encoding,
  });
  if (
    generation !== snapshot.generation ||
    current.revision !== snapshot.revision
  )
    return;
  // Reading the disk is asynchronous: never replace a keystroke made meanwhile.
  if (
    lifecycleLocked ||
    navigationLocked ||
    editor.getText() !== snapshot.text ||
    dirty()
  ) {
    deferredExternalChange = event;
    if (!lifecycleLocked) showConflict();
    return;
  }
  await loadDocument(disk, snapshot.selection);
  toast(t("已载入外部修改", "External changes loaded"));
}

async function prepareClose(request) {
  if (closeRequest) return;
  closeRequest = request;
  closeDisposition = null;
  closeApprovedSnapshot = null;
  try {
    await lockForClose();
    const allow = await mayLeave({ deferDiscard: true, batch: request.batch });
    if (allow)
      closeApprovedSnapshot = {
        generation,
        path: current.path,
        text: editor.getText(),
        revision: current.revision,
      };
    await invoke("windowAction", {
      action: "closeResponse",
      requestId: request.requestId,
      allow,
    });
  } catch (error) {
    toast(error.message, true);
    await invoke("windowAction", {
      action: "closeResponse",
      requestId: request.requestId,
      allow: false,
      error: error.message,
    });
  }
}
async function commitClose(request) {
  if (closeRequest?.requestId !== request.requestId) return;
  try {
    if (!approvedCloseUnchanged())
      throw Error(
        t(
          "确认关闭后文档又有变化，已取消关闭以保留新内容。",
          "The document changed after close approval. Closing was canceled to preserve the new content.",
        ),
      );
    pausePersistence();
    await Promise.allSettled([...pendingRecoveries]);
    if (closeDisposition === "discard") await discardCurrentDraft();
    else if (!dirty()) await invoke("deleteRecovery", { id: recoveryId });
    await persistSession();
    if (!approvedCloseUnchanged())
      throw Error(
        t(
          "确认关闭后文档又有变化，已取消关闭以保留新内容。",
          "The document changed after close approval. Closing was canceled to preserve the new content.",
        ),
      );
    await invoke("windowAction", {
      action: "closeCommit",
      requestId: request.requestId,
      allow: true,
    });
  } catch (error) {
    toast(error.message, true);
    await invoke("windowAction", {
      action: "closeCommit",
      requestId: request.requestId,
      allow: false,
      error: error.message,
    });
  }
}
// A newly opened document starts below its YAML front matter, so the metadata
// stays collapsed instead of being shown as raw source at the cursor.
function initialSelection(text) {
  const source = normalizeSource(String(text || ""));
  const match = /^---[ \t]*\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(
    source,
  );
  if (!match) return undefined;
  let position = match[0].length;
  while (source[position] === "\n") position++;
  // A title heading right after the metadata would show its "#" at the
  // cursor; start on the following text instead.
  const line = source.slice(position, source.indexOf("\n", position) >>> 0);
  if (/^#{1,6}\s/.test(line)) {
    const next = source.slice(position + line.length).search(/\n\s*\n\S/);
    if (next >= 0) {
      position += line.length + next;
      while (/\s/.test(source[position] || "")) position++;
    }
  }
  return { anchor: position, head: position };
}
async function loadDocument(doc, selection) {
  clearTimeout(saveTimer);
  clearTimeout(recoveryTimer);
  generation++;
  deferredExternalChange = null;
  compositionActive = false;
  conflict = false;
  $("#conflict-banner").hidden = true;
  if (current.path && current.path !== doc.path)
    closedDocuments.push(current.path);
  current = doc;
  savedText = doc.text;
  recoveryId = crypto.randomUUID();
  closeSidebarOverlay();
  editor.setDocument(doc.text, selection ?? initialSelection(doc.text));
  editor.setSettings({
    ...settings,
    basePath: doc.path,
    readOnly:
      bootstrapLoading ||
      lifecycleLocked ||
      navigationLocked ||
      resourceCommitting ||
      settings.readOnly,
  });
  editor.setMode(mode);
  if (doc.path && settings.recordRecent !== false) {
    recentFiles = [
      doc.path,
      ...recentFiles.filter((p) => p !== doc.path),
    ].slice(0, 30);
    await invoke("updateSettings", { recentFiles });
  }
  // Opening preferences can finish after the first keystroke. Reflect the
  // current document so a late initialization step cannot clear close protection.
  await syncNativeDirty(true);
  updateStatus();
  renderSidebar();
  await persistSession();
  editor.focus();
}
async function documentTransition(work) {
  if (navigationPending || closeRequest) return;
  navigationPending = (async () => {
    if (editor.finishComposition && !(await editor.finishComposition()))
      throw Error(
        t("请先完成当前输入。", "Finish the current text composition first."),
      );
    navigationLocked = true;
    pausePersistence();
    editor.setSettings({ readOnly: true });
    updateStatus();
    try {
      if (busySave) await busySave;
      return await work();
    } finally {
      navigationLocked = false;
      editor.setSettings({
        readOnly:
          bootstrapLoading ||
          lifecycleLocked ||
          resourceCommitting ||
          !!settings.readOnly,
      });
      if (!closeRequest && dirty()) changed();
      updateStatus();
      flushExternalChange();
    }
  })();
  try {
    return await navigationPending;
  } finally {
    navigationPending = null;
  }
}

async function openDocument(path) {
  if (closeRequest) return;
  if (
    path &&
    /\.(png|jpe?g|gif|webp|svg|avif|bmp|mp4|webm|mp3|wav|ogg)$/i.test(path)
  ) {
    const data = await invoke("readAsset", { path });
    const video = /\.(mp4|webm)$/i.test(path),
      audio = /\.(mp3|wav|ogg)$/i.test(path);
    modal(
      basename(path),
      video
        ? '<video controls style="width:100%" src="' + esc(data) + '"></video>'
        : audio
          ? '<audio controls style="width:100%" src="' +
            esc(data) +
            '"></audio>'
          : '<img style="max-width:100%;max-height:65vh;display:block;margin:auto" src="' +
            esc(data) +
            '" alt="' +
            esc(basename(path)) +
            '">',
      { wide: !audio },
    );
    return;
  }
  if (path && /\.(pdf|docx|odt|epub|pptx)$/i.test(path))
    return invoke("openExport", { path });
  if (!path) {
    path = await invoke("pickPath", {
      title: t("打开文档", "Open document"),
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown", "mdown", "mkd", "txt"],
        },
        { name: t("所有文件", "All files"), extensions: ["*"] },
      ],
    });
    if (!path) return;
  }
  return documentTransition(async () => {
    if (!(await mayLeave())) return;
    let doc;
    try {
      doc = await invoke("openFile", { path });
    } catch (error) {
      if (!failedWith(error, "ENCODING")) throw error;
      const encoding = await chooseEncoding();
      if (!encoding) return;
      doc = await invoke("openFile", { path, encoding });
    }
    if (doc) await loadDocument(doc);
  });
}
async function chooseEncoding(conversion = false) {
  return new Promise((resolve) => {
    const d = modal(
      t("选择文件编码", "Choose text encoding"),
      '<p class="muted">' +
        (conversion
          ? t(
              "转换后将按所选编码保存。无法表示的字符会阻止保存，原文件保持不变。",
              "Save using the selected encoding. Unrepresentable characters prevent saving and leave the file unchanged.",
            )
          : t(
              "文件不是有效 UTF-8。请明确选择原文件编码；无法表示的字符将拒绝保存。",
              "This file is not valid UTF-8. Select its original encoding. Unrepresentable characters will prevent saving.",
            )) +
        '</p><select id="file-encoding">' +
        [
          ...(conversion ? [["utf8", "UTF-8"]] : []),
          ["gb18030", t("GB18030 / GBK（中文）", "GB18030 / GBK (Chinese)")],
          ["utf16le", "UTF-16 LE"],
          ["utf16be", "UTF-16 BE"],
          ["shiftjis", t("Shift JIS（日语）", "Shift JIS (Japanese)")],
          ["windows1252", "Windows-1252"],
        ]
          .map(([v, l]) => '<option value="' + v + '">' + l + "</option>")
          .join("") +
        '</select><footer><button class="primary" id="encoding-open">' +
        (conversion
          ? t("按此编码保存", "Save with this encoding")
          : t("按此编码打开", "Open with this encoding")) +
        "</button></footer>",
    );
    let resolved = false;
    d.el.addEventListener("close", () => {
      if (!resolved) resolve(null);
    });
    $("#encoding-open", d.el).onclick = () => {
      resolved = true;
      resolve($("#file-encoding", d.el).value);
      d.close();
    };
  });
}
// Save failures the user can do something about: the file was moved or
// deleted, is read-only, is in use, or the disk is full.
const recoverableSaveErrors = [
  "MISSING",
  "READONLY",
  "PERMISSION",
  "BUSY",
  "DISK_FULL",
];
let saveFailure = null;
const revealWindow = () =>
  invoke("windowAction", { action: "reveal" }).catch(() => {});
/**
 * Saves, and when that fails in a way the user can resolve, explains why and
 * offers to save at the original location, retry, or Save As. The document
 * stays open and dirty whenever nothing was written. With `quiet` (timed auto
 * save, or closing with auto save on) failures only show the banner.
 */
async function saveDocument(
  saveAs = false,
  encoding = current.encoding,
  { quiet = false, recreate = false } = {},
) {
  for (;;) {
    const saved = await writeDocument(saveAs, encoding, { recreate });
    const failure = saveFailure;
    saveFailure = null;
    if (saved || quiet || !failure) return saved;
    await revealWindow();
    const missing = failure.code === "MISSING";
    const choice = await ask(
      missing
        ? t("文件已被移动或删除", "The file was moved or deleted")
        : t("无法保存此文件", "Couldn't save this file"),
      failure.message,
      [
        ...(missing
          ? [
              {
                label: t("保存到原位置", "Save to Original Location"),
                value: "recreate",
              },
              { label: t("另存为…", "Save As…"), value: "saveAs" },
            ]
          : [
              { label: t("另存为…", "Save As…"), value: "saveAs" },
              { label: t("重试", "Try Again"), value: "retry" },
            ]),
        { label: t("取消", "Cancel"), value: null },
      ],
    );
    if (!choice) return false;
    saveAs = choice === "saveAs";
    recreate = choice === "recreate";
  }
}
// One write. Recoverable failures are left in saveFailure.
async function writeDocument(
  saveAs = false,
  encoding = current.encoding,
  { recreate = false } = {},
) {
  if (resourceCommitting) return false;
  clearTimeout(saveTimer);
  if (busySave) return busySave;
  saveFailure = null;
  const text = editor.getText(),
    expectedGeneration = generation,
    oldRecovery = recoveryId;
  busySave = (async () => {
    try {
      const doc = await invoke("saveFile", {
        path: current.path,
        text,
        // No revision: create the file again where it was.
        revision: recreate ? null : current.revision,
        saveAs,
        preserveLinks: true,
        encoding,
      });
      if (!doc) return false;
      if (expectedGeneration !== generation) return true;
      if (doc.text !== text && editor.getText() !== text) {
        toast(
          t(
            "副本已保存。保存期间又有编辑，当前文档和未保存内容保持原位置，请再次保存。",
            "Copy saved. You edited during saving; your current document remains at its original path. Save again.",
          ),
          true,
        );
        return true;
      }
      if (doc.text !== text) {
        const before = editor.view.state.doc.toString(),
          after = doc.text.replace(/\r\n|\r/g, "\n");
        let start = 0,
          end = 0;
        while (
          start < before.length &&
          start < after.length &&
          before[start] === after[start]
        )
          start++;
        while (
          end < before.length - start &&
          end < after.length - start &&
          before[before.length - 1 - end] === after[after.length - 1 - end]
        )
          end++;
        editor.view.dispatch({
          changes: {
            from: start,
            to: before.length - end,
            insert: after.slice(start, after.length - end),
          },
        });
      }
      current = { ...current, ...doc };
      savedText = doc.text;
      conflict = false;
      $("#conflict-banner").hidden = true;
      if (doc.warnings?.length) toast(doc.warnings.join("\n"), true);
      editor.setSettings({
        ...settings,
        basePath: current.path,
        readOnly:
          lifecycleLocked ||
          navigationLocked ||
          resourceCommitting ||
          settings.readOnly,
      });
      await syncNativeDirty(true);
      await invoke("deleteRecovery", { id: oldRecovery });
      updateStatus();
      await persistSession();
      await refreshFiles();
      if (dirty()) changed();
      return true;
    } catch (e) {
      const code = recoverableSaveErrors.find((name) => failedWith(e, name));
      if (failedWith(e, "CONFLICT")) showConflict();
      else if (code) {
        saveFailure = {
          code,
          message: e.message.replace(/^[A-Z][A-Z_]+:\s+/, ""),
        };
        showConflict(code === "MISSING" ? "missing" : "unwritable");
      } else toast(e.message, true);
      return false;
    } finally {
      busySave = null;
      updateStatus();
    }
  })();
  updateStatus();
  return busySave;
}
async function persistSession() {
  await invoke("saveSession", {
    path: current.path,
    folder,
    selection: editor.getSelection(),
    mode,
    encoding: current.encoding,
  });
}
// Pauses auto save and explains why: "changed" on disk, "missing" (moved or
// deleted) or "unwritable" (read-only, in use, no permission or disk full).
function showConflict(kind = "changed") {
  conflict = true;
  clearTimeout(saveTimer);
  const b = $("#conflict-banner");
  b.hidden = false;
  if (kind !== "changed") {
    const missing = kind === "missing";
    b.innerHTML =
      "<span>" +
      (missing
        ? t(
            "文件已被移动或删除。你的内容仍保留，自动保存已暂停。",
            "The file was moved or deleted. Your text is preserved; auto save is paused.",
          )
        : t(
            "无法写入此文件。你的内容仍保留，自动保存已暂停。",
            "This file can't be written. Your text is preserved; auto save is paused.",
          )) +
      '</span><button data-conflict="' +
      (missing ? "recreate" : "retry") +
      '">' +
      (missing
        ? t("保存到原位置", "Save to original location")
        : t("重试", "Try again")) +
      '</button><button data-conflict="saveAs">' +
      t("另存为…", "Save As…") +
      "</button>";
    b.querySelectorAll("button").forEach(
      (btn) =>
        (btn.onclick = guarded(() =>
          btn.dataset.conflict === "saveAs"
            ? saveDocument(true)
            : saveDocument(false, current.encoding, {
                recreate: btn.dataset.conflict === "recreate",
              }),
        )),
    );
    return;
  }
  b.innerHTML =
    "<span>" +
    t(
      "文件已在外部修改。你的内容仍保留，自动保存已暂停。",
      "The file changed on disk. Your text is preserved; auto save is paused.",
    ) +
    '</span><button data-conflict="compare">' +
    t("查看差异", "Compare") +
    '</button><button data-conflict="reload">' +
    t("载入磁盘版本", "Load disk version") +
    '</button><button data-conflict="copy">' +
    t("另存副本", "Save a copy") +
    "</button>";
  b.querySelectorAll("button").forEach(
    (btn) =>
      (btn.onclick = guarded(async () => {
        if (btn.dataset.conflict === "copy") return saveDocument(true);
        const showDisk = async () => {
          const disk = await invoke("openFile", {
            path: current.path,
            encoding: current.encoding,
          });
          if (btn.dataset.conflict === "compare")
            return modal(
              t("外部修改比较", "Compare external changes"),
              '<div class="diff"><section><h3>' +
                t("编辑器内容", "Editor") +
                "</h3><pre>" +
                esc(editor.getText()) +
                "</pre></section><section><h3>" +
                t("磁盘内容", "Disk") +
                "</h3><pre>" +
                esc(disk.text) +
                "</pre></section></div>",
              { wide: true },
            );
          await writeRecovery({
            id: recoveryId,
            path: current.path,
            text: editor.getText(),
            revision: current.revision,
          });
          await loadDocument(disk);
          toast(
            t(
              "原编辑内容已保留为恢复草稿",
              "Your previous text is kept as a recovery draft",
            ),
          );
        };
        return btn.dataset.conflict === "reload"
          ? documentTransition(showDisk)
          : showDisk();
      })),
  );
  updateStatus();
}
async function refreshFiles() {
  if (folder)
    files = await invoke("listFiles", {
      path: folder,
      recursive: true,
      showHidden: settings.showHidden,
      showAllFiles: settings.showAllFiles,
      sort: settings.fileSort,
      descending: settings.sortDescending,
      foldersFirst: settings.foldersFirst,
      includeGlobs: settings.includeGlobs,
      excludeGlobs: settings.excludeGlobs,
    });
  renderSidebar();
}
let collator, collatorLocale;
function compareNames(a, b) {
  if (!collator || collatorLocale !== settings.locale) {
    collatorLocale = settings.locale;
    collator = new Intl.Collator(collatorLocale, { numeric: true });
  }
  return collator.compare(a, b);
}
function renderSidebar() {
  clearTimeout(filterTimer);
  outlineButtons = [];
  activeOutlineButton = null;
  if (!$("#sidebar-content")) return;
  $$("[data-tab]").forEach((b) => {
    const selected = b.dataset.tab === sidebarTab;
    b.classList.toggle("active", selected);
    b.setAttribute("aria-selected", String(selected));
    b.tabIndex = selected ? 0 : -1;
  });
  $("#toggle-file-view").setAttribute(
    "aria-pressed",
    String(fileView === "list"),
  );
  $(".sidebar-filter").hidden = sidebarTab === "search";
  $("#toggle-file-view").hidden = sidebarTab !== "files";
  $("#file-filter").placeholder =
    sidebarTab === "outline"
      ? t("筛选标题…", "Filter headings…")
      : t("筛选文件…", "Filter files…");
  $("#folder-name").textContent =
    basename(folder) || t("写作空间", "Workspace");
  const container = $("#sidebar-content");
  const focusPath = container.contains(document.activeElement)
    ? document.activeElement.dataset.path
    : null;
  container.onkeydown = null;
  container.onfocusin = null;
  container.removeAttribute("role");
  container.replaceChildren();
  if (sidebarTab === "outline") {
    const outline = getOutline(editor.getText(), settings),
      query = $("#file-filter").value.toLowerCase();
    let hiddenLevel = 7;
    if (!outline.length)
      container.innerHTML =
        '<p class="sidebar-empty">' +
        t("添加标题，让思路清晰可见。", "Add headings to see your outline.") +
        "</p>";
    const counters = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < outline.length; i++) {
      const h = outline[i];
      counters[h.level - 1]++;
      counters.fill(0, h.level);
      const numbering =
        counters.slice(0, h.level).filter(Boolean).join(".") + " ";
      if (h.level <= hiddenLevel) hiddenLevel = 7;
      if (!query && h.level > hiddenLevel) continue;
      if (query && !h.text.toLowerCase().includes(query)) continue;
      const row = document.createElement("div");
      row.className = "outline-row";
      row.style.paddingLeft = 8 + (h.level - 1) * 10 + "px";
      const fold = document.createElement("button");
      fold.className = "outline-fold";
      fold.innerHTML = collapsedHeadings.has(h.id)
        ? icon.chevronRight
        : icon.chevronDown;
      if (outline[i + 1]?.level > h.level)
        fold.setAttribute(
          "aria-expanded",
          String(!collapsedHeadings.has(h.id)),
        );
      fold.onclick = () => {
        collapsedHeadings.has(h.id)
          ? collapsedHeadings.delete(h.id)
          : collapsedHeadings.add(h.id);
        renderSidebar();
      };
      const b = document.createElement("button");
      b.className = "outline-item";
      b.dataset.from = h.from;
      b.dataset.to = outline[i + 1]?.from ?? editor.view.state.doc.length;
      b.textContent = (settings.outlineNumbering ? numbering : "") + h.text;
      const head = editor.view.state.selection.main.head;
      b.classList.toggle(
        "current",
        head >= h.from && head < (outline[i + 1]?.from ?? Infinity),
      );
      b.onclick = () => {
        editor.setSelection({ anchor: h.from, head: h.from });
        editor.view.dispatch({ scrollIntoView: true });
        editor.focus();
      };
      outlineButtons.push(b);
      if (b.classList.contains("current")) activeOutlineButton = b;
      fold.setAttribute(
        "aria-label",
        collapsedHeadings.has(h.id)
          ? t("展开标题", "Expand heading")
          : t("折叠标题", "Collapse heading"),
      );
      fold.disabled = !(outline[i + 1]?.level > h.level);
      row.append(fold, b);
      container.append(row);
      if (collapsedHeadings.has(h.id)) hiddenLevel = h.level;
    }
    return;
  }
  if (sidebarTab === "search") {
    container.innerHTML =
      '<form id="global-search"><input name="query" placeholder="' +
      t("在文件夹内搜索…", "Search folder…") +
      '" aria-label="' +
      t("搜索文件夹", "Search folder") +
      '" autocomplete="off" required><label class="inline" title="' +
      t("正则表达式", "Regular expression") +
      '"><input type="checkbox" name="regex">' +
      t("正则", "Regex") +
      '</label><label class="inline" title="' +
      t("区分大小写", "Match case") +
      '"><input type="checkbox" name="case">' +
      t("区分大小写", "Match case") +
      '</label><label class="inline"><input type="checkbox" name="wholeWord">' +
      t("整词", "Whole word") +
      '</label><button class="primary">' +
      t("搜索", "Search") +
      '</button><button type="button" id="cancel-search" hidden>' +
      t("取消", "Cancel") +
      '</button></form><p class="muted search-limit">' +
      t(
        "最多搜索 5,000 个文件，显示 1,000 个结果。",
        "Searches up to 5,000 files; shows up to 1,000 matches.",
      ) +
      '</p><div id="search-results"></div>';
    let searchGeneration = 0,
      searchId = null,
      typingTimer = 0;
    // Search while typing: after a short pause, once two characters are in.
    const searchSoon = () => {
      clearTimeout(typingTimer);
      const form = $("#global-search");
      if (!folder || form.query.value.trim().length < 2) return;
      typingTimer = setTimeout(() => {
        if (form.isConnected) form.requestSubmit();
      }, 450);
    };
    $("#global-search").addEventListener("input", searchSoon);
    $("#cancel-search").onclick = () => {
      searchGeneration++;
      if (searchId) invoke("cancelSearch", { id: searchId }).catch(() => {});
      $("#cancel-search").hidden = true;
      $("#search-results").textContent = t("已取消搜索", "Search cancelled");
    };
    $("#global-search").onsubmit = guarded(async (e) => {
      e.preventDefault();
      if (!folder) throw Error(t("请先打开文件夹", "Open a folder first"));
      const form = e.target;
      const searchRun = ++searchGeneration;
      if (searchId) invoke("cancelSearch", { id: searchId }).catch(() => {});
      searchId = crypto.randomUUID();
      $("#cancel-search").hidden = false;
      $("#search-results").textContent = t("正在搜索…", "Searching…");
      let results;
      try {
        results = await invoke("searchFiles", {
          id: searchId,
          wholeWord: form.wholeWord.checked,
          path: folder,
          query: form.query.value,
          regex: form.regex.checked,
          caseSensitive: form.case.checked,
          includeGlobs: settings.includeGlobs,
          excludeGlobs: settings.excludeGlobs,
        });
      } catch (error) {
        if (searchRun !== searchGeneration || !form.isConnected) return;
        $("#cancel-search").hidden = true;
        throw error;
      }
      if (searchRun !== searchGeneration || !form.isConnected) return;
      $("#cancel-search").hidden = true;
      const resultEl = $("#search-results");
      resultEl.replaceChildren();
      if (!results.length)
        resultEl.textContent = t("没有匹配结果", "No matches");
      results.forEach((r) => {
        const b = document.createElement("button");
        b.className = "search-result";
        b.innerHTML =
          "<strong>" +
          esc(basename(r.path)) +
          ":" +
          r.line +
          "</strong><span>" +
          esc(r.text) +
          "</span>";
        b.onclick = guarded(async () => {
          await openDocument(r.path);
          if (current.path === r.path) {
            const pos = editor.view.state.doc.line(
              Math.min(r.line, editor.view.state.doc.lines),
            ).from;
            editor.setSelection({ anchor: pos, head: pos });
            editor.view.dispatch({ scrollIntoView: true });
          }
        });
        resultEl.append(b);
      });
    });
    return;
  }
  const query = $("#file-filter").value.toLowerCase();
  if (folder) {
    const list = files
      .filter(
        (f) =>
          (settings.showHidden || !f.name.startsWith(".")) &&
          (f.isDirectory ||
            settings.showAllFiles ||
            /\.(md|markdown|mdown|mkd|txt)$/i.test(f.name)),
      )
      .filter((f) => f.path.toLowerCase().includes(query))
      .filter((f) => fileView === "tree" || !f.isDirectory);
    if (fileView === "tree") {
      const byPath = new Map(files.map((f) => [f.path.replace(/\\/g, "/"), f]));
      const parts = new Map(
        list.map((item) => [
          item.path,
          item.path.replace(/\\/g, "/").split("/"),
        ]),
      );
      list.sort((a, b) => {
        const aa = parts.get(a.path),
          bb = parts.get(b.path);
        for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
          if (aa[i] === bb[i]) continue;
          const ai = byPath.get(aa.slice(0, i + 1).join("/")),
            bi = byPath.get(bb.slice(0, i + 1).join("/"));
          const folders =
            settings.foldersFirst !== false
              ? Number(!!bi?.isDirectory) - Number(!!ai?.isDirectory)
              : 0;
          const key = settings.fileSort;
          const compared =
            key === "name" || !ai || !bi
              ? compareNames(aa[i], bb[i])
              : Number(
                  ai[
                    key === "created"
                      ? "birthtime"
                      : key === "modified"
                        ? "mtime"
                        : "size"
                  ] || 0,
                ) -
                Number(
                  bi[
                    key === "created"
                      ? "birthtime"
                      : key === "modified"
                        ? "mtime"
                        : "size"
                  ] || 0,
                );
          return (
            folders ||
            (settings.sortDescending ? -compared : compared) ||
            compareNames(aa[i], bb[i])
          );
        }
        return aa.length - bb.length;
      });
    }
    for (const f of list) {
      const b = document.createElement("button");
      b.className =
        "file-item" +
        (f.path === current.path ? " current" : "") +
        (f.path === selectedPath ? " selected" : "");
      b.title = f.path;
      b.dataset.treeItem = "";
      b.dataset.directory = String(f.isDirectory);
      b.setAttribute("role", "treeitem");
      b.setAttribute("aria-selected", String(f.path === current.path));
      const relative = f.path.slice(folder.length + 1),
        depth = fileView === "tree" ? relative.split(/[\\/]/).length - 1 : 0;
      b.style.paddingLeft = 14 + depth * 14 + "px";
      b.setAttribute("aria-level", depth + 1);
      if (f.isDirectory)
        b.setAttribute("aria-expanded", String(!collapsedFolders.has(f.path)));
      b.innerHTML =
        '<span class="tree-chevron" aria-hidden="true">' +
        (f.isDirectory ? icon.chevronRight : "") +
        "</span>" +
        (f.isDirectory ? icon.folder : icon.file) +
        "<span>" +
        esc(f.name) +
        "</span>";
      b.hidden =
        !query &&
        fileView === "tree" &&
        [...collapsedFolders].some(
          (path) =>
            f.path.startsWith(path + "/") || f.path.startsWith(path + "\\"),
        );
      b.classList.toggle("collapsed", collapsedFolders.has(f.path));
      b.onclick = guarded(async () => {
        selectedPath = f.path;
        if (!f.isDirectory) await openDocument(f.path);
        else {
          collapsedFolders.has(f.path)
            ? collapsedFolders.delete(f.path)
            : collapsedFolders.add(f.path);
          renderSidebar();
        }
      });
      b.dataset.path = f.path;
      b.oncontextmenu = (e) => {
        e.preventDefault();
        selectedPath = f.path;
        showFileActions(f);
      };
      container.append(b);
    }
    if (!list.length)
      container.innerHTML =
        '<p class="sidebar-empty">' +
        t("此文件夹还没有 Markdown 文档。", "No Markdown documents here yet.") +
        "</p>";
  } else {
    container.innerHTML =
      '<div class="workspace-empty"><div class="empty-glyph">' +
      icon.folder +
      "</div><h3>" +
      t("你的文档", "Your documents") +
      "</h3><p>" +
      t(
        "打开一个本地文件夹，\n开始整理你的文字。",
        "Open a local folder\nto organize your writing.",
      ) +
      '</p><button class="primary" id="open-workspace">' +
      t("打开文件夹", "Open folder") +
      '</button><button id="open-document">' +
      t("或打开一个文档", "Or open a document") +
      "</button></div>";
    $("#open-workspace").onclick = () => run("openFolder");
    $("#open-document").onclick = () => run("open");
  }
  if (folder) {
    container.setAttribute("role", "tree");
    container.setAttribute("aria-label", t("文件树", "File tree"));
    const toggle = (path, collapsed) => {
      selectedPath = path;
      collapsed ? collapsedFolders.add(path) : collapsedFolders.delete(path);
      renderSidebar();
    };
    installFileTreeKeyboard(container, {
      collapse: (path) => toggle(path, true),
      expand: (path) => toggle(path, false),
      rename: (path, isDirectory) =>
        run("fileOperation", { operation: "rename", path, isDirectory }),
      trash: (path, isDirectory) =>
        run("fileOperation", { operation: "trash", path, isDirectory }),
    });
    if (focusPath)
      [...container.querySelectorAll("[data-tree-item]")]
        .find((el) => el.dataset.path === focusPath && !el.hidden)
        ?.focus();
  }

  const sections = [
    [t("固定文件夹", "Pinned folders"), settings.pins || [], true],
    [
      t("最近文档", "Recent"),
      recentFiles.filter((p) => p !== current.path).slice(0, 8),
      false,
    ],
  ];
  for (const [label, paths, isFolder] of sections) {
    if (!paths.length) continue;
    const h = document.createElement("h4");
    h.textContent = label;
    container.append(h);
    for (const path of paths) {
      const b = document.createElement("button");
      b.className = "file-item";
      b.innerHTML =
        (isFolder ? icon.folder : icon.file) +
        "<span>" +
        esc(basename(path)) +
        "</span>";
      b.title = path;
      b.onclick = guarded(async () => {
        if (isFolder) {
          folder = path;
          await refreshFiles();
          await persistSession();
        } else await openDocument(path);
      });
      container.append(b);
    }
  }
}
function showFileActions(file) {
  const d = modal(
    file.name,
    ["rename", "move", "copy", "trash"]
      .map(
        (cmd, i) =>
          '<button class="menu-action" data-op="' +
          cmd +
          '">' +
          [
            t("重命名", "Rename"),
            t("移动到…", "Move to…"),
            t("创建副本", "Duplicate"),
            t("移到回收站", "Move to trash"),
          ][i] +
          "</button>",
      )
      .join(""),
  );
  $$("[data-op]", d.el).forEach(
    (b) =>
      (b.onclick = () => {
        d.close();
        run("fileOperation", {
          operation: b.dataset.op,
          path: file.path,
          isDirectory: file.isDirectory,
        });
      }),
  );
}
async function fileOperation(arg) {
  return documentTransition(() => performFileOperation(arg));
}
async function performFileOperation(arg) {
  let target;
  const activeAffected = affectsPath(arg.path, current.path);
  if (activeAffected && !(await mayLeave())) return;
  if (arg.operation === "rename") {
    const name = await promptText(
      t("重命名", "Rename"),
      t("新名称", "New name"),
      basename(arg.path),
    );
    if (!name) return;
    target = dirname(arg.path) + "/" + name;
  }
  if (arg.operation === "copy") {
    const name = await promptText(
      t("创建副本", "Duplicate"),
      t("新名称", "New name"),
      basename(arg.path).replace(/(\.[^.]+)?$/, " copy$1"),
    );
    if (!name) return;
    target = dirname(arg.path) + "/" + name;
  }
  if (arg.operation === "move") {
    const dest = await invoke("chooseFolder");
    if (!dest) return;
    target = dest + "/" + basename(arg.path);
  }
  if (
    arg.operation === "trash" &&
    (await ask(t("移到回收站", "Move to trash"), arg.path, [
      { label: t("移到回收站", "Move to trash"), value: true },
      { label: t("取消", "Cancel"), value: false },
    ])) !== true
  )
    return;
  const operationResult = await invoke("fileOperation", {
    operation: arg.operation,
    path: arg.path,
    target,
  });
  if (operationResult.warnings?.length)
    toast(operationResult.warnings.join("\n"), true);
  if (["rename", "move"].includes(arg.operation))
    fileUndoStack.push({ path: arg.path, target: operationResult.path });
  if (activeAffected && ["rename", "move"].includes(arg.operation)) {
    const path = operationResult.path + current.path.slice(arg.path.length);
    await loadDocument(
      await invoke("openFile", { path, encoding: current.encoding }),
    );
  }
  if (activeAffected && arg.operation === "trash")
    await loadDocument({ path: null, text: editor.getText(), revision: null });
  await refreshFiles();
}
async function insertImageFiles(imageFiles) {
  if (mutationBlocked()) {
    toast(
      t("只读模式不能插入图片", "Cannot insert images in read-only mode"),
      true,
    );
    return;
  }
  if (!current.path && !(await saveDocument())) return;
  if (mutationBlocked()) return;
  const insertion = {
    generation,
    path: current.path,
    imageFolder: readDocumentConfig(editor.getText()).imageFolder,
    imageRoot: readDocumentConfig(editor.getText()).imageRoot,
    doc: editor.view.state.doc,
    selection: editor.view.state.selection.main,
  };
  const images = await Promise.all(
    imageFiles.map(
      (file) =>
        new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () =>
            resolve({ name: file.name || "clipboard.png", dataUrl: r.result });
          r.onerror = reject;
          r.readAsDataURL(file);
        }),
    ),
  );
  const inserted = await invoke("insertImages", {
    imageFolder: insertion.imageFolder,
    imageRoot: insertion.imageRoot,
    documentPath: insertion.path,
    images,
  });
  const markdown = inserted.map(imageReference).join("\n");
  if (mutationBlocked()) return;
  if (
    insertion.generation !== generation ||
    insertion.doc !== editor.view.state.doc
  ) {
    const d = modal(
      t("图片已保存", "Images saved"),
      '<p class="muted">' +
        t(
          "读取图片期间文档发生变化，未替换任何新内容。可复制以下引用后手动粘贴。",
          "The document changed while images loaded. Copy these references and paste them where needed.",
        ) +
        '</p><textarea rows="5" readonly style="width:100%">' +
        esc(markdown) +
        "</textarea>",
    );
    $("textarea", d.el).select();
    return;
  }
  editor.view.dispatch({
    changes: {
      from: insertion.selection.from,
      to: insertion.selection.to,
      insert: markdown,
    },
    selection: { anchor: insertion.selection.from + markdown.length },
  });
  editor.focus();
}
function fuzzyScore(text, query) {
  text = text.toLowerCase();
  query = query.toLowerCase();
  if (!query) return 1;
  if (text.includes(query)) return 1000 - query.length - text.indexOf(query);
  let at = 0,
    score = 0;
  for (const character of query) {
    const found = text.indexOf(character, at);
    if (found < 0) return -Infinity;
    score += found === at ? 5 : 1;
    at = found + 1;
  }
  return score;
}
function fuzzyMatch(text, query) {
  return fuzzyScore(text, query) > -Infinity;
}
async function quickOpen(commands = false) {
  const d = modal(
    commands ? t("命令面板", "Command palette") : t("快速打开", "Quick open"),
    '<input class="palette-input" autocomplete="off" spellcheck="false" placeholder="' +
      t("输入以搜索…", "Type to search…") +
      '"><div class="palette-results"></div><div class="palette-hint"><span><kbd>↑ ↓</kbd> ' +
      t("选择", "Navigate") +
      "</span><span><kbd>Enter</kbd> " +
      t("打开", "Open") +
      "</span><span><kbd>Esc</kbd> " +
      t("关闭", "Close") +
      "</span></div>",
  );
  d.el.classList.add("palette-dialog");
  const input = $("input", d.el),
    results = $(".palette-results", d.el);
  results.id = "palette-results";
  results.setAttribute("role", "listbox");
  results.setAttribute(
    "aria-label",
    commands ? t("命令", "Commands") : t("文档", "Documents"),
  );
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", results.id);
  input.setAttribute(
    "aria-label",
    commands ? t("搜索命令", "Search commands") : t("搜索文件", "Search files"),
  );
  let active = 0,
    items = [];
  const update = () => {
    const q = input.value.toLowerCase();
    items = commands
      ? commandList().filter((c) =>
          (c.label + " " + c.id).toLowerCase().includes(q),
        )
      : [
          ...new Set([
            ...files.filter((f) => !f.isDirectory).map((f) => f.path),
            ...recentFiles,
          ]),
        ]
          .filter((p) => fuzzyMatch(p, q))
          .sort((a, b) => fuzzyScore(b, q) - fuzzyScore(a, q))
          .map((path) => ({ label: basename(path), detail: path, id: path }));
    active = Math.min(active, Math.max(0, items.length - 1));
    results.innerHTML = items
      .slice(0, 80)
      .map(
        (item, i) =>
          '<button data-index="' +
          i +
          '" id="palette-option-' +
          i +
          '" role="option" tabindex="-1" aria-selected="' +
          (i === active) +
          '" class="' +
          (i === active ? "active" : "") +
          '"><span>' +
          esc(item.label) +
          "</span><small>" +
          esc(commands ? commandShortcut(item.id) : item.detail || "") +
          "</small></button>",
      )
      .join("");
    if (items.length)
      input.setAttribute("aria-activedescendant", "palette-option-" + active);
    else input.removeAttribute("aria-activedescendant");
    if (!items.length)
      results.innerHTML =
        '<p class="palette-empty">' +
        t("没有匹配的结果", "No matching results") +
        "</p>";
    $$("[data-index]", d.el).forEach(
      (b) => (b.onclick = () => choose(+b.dataset.index)),
    );
  };
  const choose = (i) => {
    const item = items[i];
    if (!item) return;
    d.close();
    commands ? run(item.id) : guarded(openDocument)(item.id);
  };
  input.oninput = () => {
    active = 0;
    update();
  };
  input.onkeydown = (e) => {
    if (e.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(
        0,
        Math.min(
          Math.min(80, items.length) - 1,
          active + (e.key === "ArrowDown" ? 1 : -1),
        ),
      );
      update();
      $("button.active", results)?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    }
  };
  update();
  input.focus();
}
function commandList() {
  return commandCatalog(settings.snippets, t);
}
async function historyDialog() {
  if (settings.readOnly) {
    toast(
      t(
        "请先关闭只读模式再恢复历史",
        "Turn off read-only mode before restoring history",
      ),
      true,
    );
    return;
  }
  if (!current.path) throw Error(t("请先保存文档", "Save this document first"));
  const historySnapshot = { generation, path: current.path };
  const history = await invoke("listHistory", { path: current.path });
  assertAsyncMutation(historySnapshot);
  const d = modal(
    t("版本历史", "Version history"),
    history.length
      ? history
          .map(
            (h, i) =>
              '<button class="menu-action" data-history="' +
              i +
              '">' +
              esc(new Date(h.time).toLocaleString(settings.locale)) +
              " · " +
              h.size +
              " " +
              t("字节", "bytes") +
              "</button>",
          )
          .join("")
      : "<p>" +
          t(
            "首次保存修改后将在这里保留历史。",
            "History appears here after saving changes.",
          ) +
          "</p>",
  );
  $$("[data-history]", d.el).forEach(
    (b) =>
      (b.onclick = guarded(async () => {
        assertAsyncMutation(historySnapshot);
        const old = await invoke("restoreHistory", {
          path: historySnapshot.path,
          id: history[+b.dataset.history].id,
        });
        assertAsyncMutation(historySnapshot);
        d.close();
        const choice = await ask(
          t("恢复这个版本？", "Restore this version?"),
          t(
            "当前内容会先保留为恢复草稿。恢复后需手动保存。",
            "Current text is kept as a recovery draft. Save manually after restoring.",
          ),
          [
            { label: t("恢复到编辑器", "Restore in editor"), value: true },
            { label: t("取消", "Cancel"), value: false },
          ],
        );
        if (choice) {
          assertAsyncMutation(historySnapshot);
          await documentTransition(async () => {
            await writeRecovery({
              id: recoveryId,
              path: current.path,
              text: editor.getText(),
              revision: current.revision,
            });
            editor.setDocument(old.text);
            recoveryId = crypto.randomUUID();
            changed();
          });
        }
      })),
  );
}
async function recoveryDialog({ startup = false } = {}) {
  const data = await invoke("bootstrap");
  const recovery = startup ? data.recoverableAtStartup || [] : data.recovery;
  const records = Array.isArray(recovery)
    ? recovery
    : Object.values(recovery || {});
  const d = modal(
    t("恢复草稿", "Recovery drafts"),
    records.length
      ? records
          .map(
            (r, i) =>
              '<div class="recovery-row"><button data-recovery="' +
              i +
              '"><strong>' +
              esc(basename(r.path) || t("未命名", "Untitled")) +
              "</strong><small>" +
              esc(
                new Date(r.time || r.updatedAt || Date.now()).toLocaleString(
                  settings.locale,
                ),
              ) +
              '</small></button><button data-delete="' +
              i +
              '">' +
              t("删除草稿", "Delete draft") +
              "</button></div>",
          )
          .join("")
      : "<p>" + t("暂无待恢复的草稿。", "No recovery drafts.") + "</p>",
  );
  $$("[data-recovery]", d.el).forEach(
    (b) =>
      (b.onclick = guarded(async () => {
        const r = records[+b.dataset.recovery];
        d.close();
        return documentTransition(async () => {
          if (!(await mayLeave())) return;
          let disk = null;
          if (r.path)
            try {
              disk = await invoke("openFile", {
                path: r.path,
                encoding: r.encoding,
              });
            } catch {}
          await loadDocument(
            disk || {
              path: r.path || null,
              text: "",
              revision: null,
              encoding: r.encoding,
            },
          );
          editor.setDocument(r.text);
          editor.setSelection(r.selection || { anchor: 0, head: 0 });
          recoveryId = r.id;
          startupRecoveryCount = Math.max(0, startupRecoveryCount - 1);
          renderRecoveryNotice();
          changed();
          if (disk && r.revision !== disk.revision) showConflict();
        });
      })),
  );
  $$("[data-delete]", d.el).forEach(
    (b) =>
      (b.onclick = guarded(async () => {
        const r = records[+b.dataset.delete];
        if (
          await ask(
            t("删除恢复草稿？", "Delete recovery draft?"),
            t(
              "这只删除本机草稿，不修改源文件。",
              "This removes only the local draft, not the source file.",
            ),
            [
              { label: t("删除", "Delete"), value: true },
              { label: t("取消", "Cancel"), value: false },
            ],
          )
        ) {
          await invoke("deleteRecovery", { id: r.id });
          b.parentElement.remove();
          startupRecoveryCount = Math.max(0, startupRecoveryCount - 1);
          renderRecoveryNotice();
        }
      })),
  );
}
async function executeContextAction(name, argument, context) {
  const copyOnly = [
    "contextCopy",
    "contextCopyMarkdown",
    "copyPlain",
    "copyHTML",
    "copyRich",
    "contextCopyTable",
    "contextAddDictionaryWord",
  ].includes(name);
  if (!copyOnly) assertAsyncMutation();
  const pending = mutationSnapshot();
  const selection = editor.view.state.selection.main;
  const text = editor.view.state.doc.toString();
  const commit = (changes, nextSelection) => {
    assertAsyncMutation(pending);
    editor.view.dispatch({
      changes,
      selection: nextSelection,
      annotations: isolateHistory.of("full"),
      userEvent: "input.context",
    });
    editor.focus();
  };
  const table =
    editor.getMode() === "live" &&
    context.table &&
    locateTable(text, context.position);
  const cell =
    table &&
    tableCellRanges(text.slice(table.from, table.to))[table.row]?.[table.col];
  const cellFrom = cell && table.from + cell.from,
    cellTo = cell && table.from + cell.to;
  const insideCell =
    cell && selection.from >= cellFrom && selection.to <= cellTo;
  const commitSelection = (insert) => {
    insert = insert.replace(/\r\n|\r/g, "\n");
    if (insideCell) {
      const prefix = text.slice(cellFrom, selection.from);
      return commit(
        {
          from: cellFrom,
          to: cellTo,
          insert: escapeTableCell(
            prefix + insert + text.slice(selection.to, cellTo),
          ),
        },
        { anchor: cellFrom + escapeTableCell(prefix + insert).length },
      );
    }
    return commit(
      { from: selection.from, to: selection.to, insert },
      { anchor: selection.from + insert.length },
    );
  };
  if (name === "contextAddDictionaryWord")
    return invoke("addDictionaryWord", { word: argument });
  if (name === "contextReplaceSpelling") {
    const word = argument?.word,
      replacement = argument?.replacement;
    if (!word || typeof replacement !== "string") return;
    const at = context.position;
    const from = text.lastIndexOf(word, at);
    if (
      from < 0 ||
      at > from + word.length ||
      text.slice(from, from + word.length) !== word
    )
      throw Error(
        t(
          "单词已变化，请重新打开菜单。",
          "The word changed. Open the menu again.",
        ),
      );
    return commit(
      { from, to: from + word.length, insert: replacement },
      { anchor: from + replacement.length },
    );
  }
  if (
    [
      "contextCopy",
      "contextCopyMarkdown",
      "contextCut",
      "contextCopyTable",
    ].includes(name)
  ) {
    const table =
      name === "contextCopyTable" && locateTable(text, context.position);
    const copied = table
      ? text.slice(table.from, table.to)
      : text.slice(selection.from, selection.to);
    if (!copied) return;
    await invoke("writeClipboard", {
      text: copied,
      markdown: copied,
      ...(name !== "contextCopyMarkdown"
        ? { html: renderMarkdown(copied, { basePath: current.path }) }
        : {}),
    });
    if (name === "contextCut") commitSelection("");
    return;
  }
  if (name.startsWith("contextPaste")) {
    let clipboard;
    if (native) clipboard = await invoke("readClipboard");
    else {
      clipboard = { text: "", html: "" };
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes("text/plain"))
          clipboard.text = await (await item.getType("text/plain")).text();
        if (item.types.includes("text/html"))
          clipboard.html = await (await item.getType("text/html")).text();
      }
    }
    assertAsyncMutation(pending);
    const tableTSV =
      insideCell &&
      ["contextPaste", "contextPastePlain"].includes(name) &&
      clipboard.text.includes("\t");
    let insertion = clipboard.text || "";
    if (name === "contextPaste" && typeof clipboard.markdown === "string")
      insertion = clipboard.markdown;
    if (
      (name === "contextPasteHTML" ||
        (name === "contextPaste" &&
          editor.getMode() !== "source" &&
          !editor.isInCodeBlock() &&
          typeof clipboard.markdown !== "string")) &&
      clipboard.html &&
      !tableTSV
    )
      insertion = htmlToMarkdown(clipboard.html);
    if (insertion) {
      insertion = insertion.replace(/\r\n|\r/g, "\n");
      if (insideCell) {
        if (insertion.includes("\t")) {
          const change = modifyTable(
            text,
            context.position,
            "paste",
            insertion,
          );
          return commit(change, { anchor: change.anchor });
        }
      }
      return commitSelection(insertion);
    } else if (native && name === "contextPaste" && clipboard.hasImage) {
      if (!current.path && !(await saveDocument())) return;
      const imageSnapshot = mutationSnapshot();
      const images = await invoke("clipboardImage", {
        documentPath: current.path,
        imageFolder: readDocumentConfig(editor.getText()).imageFolder,
        imageRoot: readDocumentConfig(editor.getText()).imageRoot,
      });
      assertAsyncMutation(imageSnapshot);
      if (images.length) editor.insert(images.map(imageReference).join("\n"));
    }
    return;
  }
  if (name === "contextDelete") {
    if (!selection.empty) commitSelection("");
    return;
  }
  if (name === "contextInlineMath") {
    editor.view.dispatch({ annotations: isolateHistory.of("full") });
    editor.command("math");
    editor.view.dispatch({ annotations: isolateHistory.of("full") });
    return;
  }
  if (name === "footnote") {
    let suggested = "note",
      suffix = 1;
    while (new RegExp(`^ {0,3}\\[\\^${suggested}\\]:`, "mi").test(text))
      suggested = `note-${++suffix}`;
    const id = await promptText(
      t("脚注", "Footnote"),
      t("脚注标识", "Footnote identifier"),
      suggested,
    );
    if (!id) return;
    if (!/^[\p{L}\p{N}_-]+$/u.test(id))
      throw Error(
        t(
          "脚注标识只能包含文字、数字、下划线和连字符。",
          "Use letters, numbers, underscores or hyphens for the footnote identifier.",
        ),
      );
    assertAsyncMutation(pending);
    const reference = `[^${id}]`;
    const exists = new RegExp(`^ {0,3}\\[\\^${id}\\]:`, "mi").test(text);
    const separator = text.endsWith("\n\n")
      ? ""
      : text.endsWith("\n")
        ? "\n"
        : "\n\n";
    const definition = exists ? "" : `${separator}[^${id}]: `;
    return commit(
      [
        { from: selection.to, insert: reference },
        ...(definition ? [{ from: text.length, insert: definition }] : []),
      ],
      {
        anchor: definition
          ? text.length + reference.length + definition.length
          : selection.to + reference.length,
      },
    );
  }
  if (name === "contextYAML") {
    const existing = parseBlocks(text, settings).find(
      (block) => block.from === 0 && block.type === "frontmatter",
    );
    if (existing) {
      editor.setSelection({ anchor: 4, head: Math.max(4, existing.to - 4) });
      editor.focus();
      return;
    }
    return commit({ from: 0, insert: "---\ntitle: \n---\n\n" }, { anchor: 11 });
  }
  if (name === "contextLinkReference") {
    let id = "ref",
      index = 1;
    while (new RegExp(`^ {0,3}\\[${id}\\]:`, "mi").test(text))
      id = `ref-${++index}`;
    const label =
      text.slice(selection.from, selection.to) || t("链接文字", "link text");
    const reference = `[${label}][${id}]`;
    const separator = text.endsWith("\n\n")
      ? ""
      : text.endsWith("\n")
        ? "\n"
        : "\n\n";
    const definition = `${separator}[${id}]: https://`;
    const url =
      text.length +
      reference.length -
      (selection.to - selection.from) +
      separator.length +
      id.length +
      4;
    return commit(
      [
        { from: selection.from, to: selection.to, insert: reference },
        { from: text.length, insert: definition },
      ],
      { anchor: url, head: url + 8 },
    );
  }
  if (name === "contextParagraphBefore" || name === "contextParagraphAfter") {
    const block =
      context.table ||
      context.block ||
      parseBlocks(text, settings).find(
        (block) =>
          context.position >= block.from && context.position <= block.to,
      );
    const at = block
      ? name === "contextParagraphBefore"
        ? block.from
        : block.to
      : context.position;
    return commit(
      { from: at, insert: "\n\n" },
      { anchor: at + (name === "contextParagraphAfter" ? 2 : 0) },
    );
  }
  if (
    [
      "contextTableRowBefore",
      "contextTableRowAfter",
      "contextTableColumnBefore",
      "contextTableColumnAfter",
      "contextPrettyTable",
      "contextDeleteTable",
    ].includes(name)
  ) {
    const table = locateTable(text, context.position);
    if (!table) return;
    if (name === "contextDeleteTable")
      return commit(
        { from: table.from, to: table.to, insert: "" },
        { anchor: table.from },
      );
    const rows = table.rows.map((row) => [...row]);
    let row = table.row,
      column = table.col;
    if (name.startsWith("contextTableRow")) {
      if (name === "contextTableRowBefore" && row < 2) return;
      row = row < 2 ? 2 : row + (name === "contextTableRowAfter" ? 1 : 0);
      rows.splice(row, 0, Array(table.width).fill(""));
    }
    if (name.startsWith("contextTableColumn")) {
      column += name === "contextTableColumnAfter" ? 1 : 0;
      rows.forEach((cells, index) =>
        cells.splice(column, 0, index === 1 ? "---" : ""),
      );
    }
    let insertion = serializeTable(rows);
    if (name === "contextPrettyTable") {
      const widths = rows[0].map((_, col) =>
        Math.max(
          3,
          ...rows
            .filter((_, index) => index !== 1)
            .map((cells) => cells[col].trim().length),
        ),
      );
      insertion = rows
        .map(
          (cells, index) =>
            "| " +
            cells
              .map((cell, col) => {
                if (index !== 1) return cell.trim().padEnd(widths[col]);
                const left = cell.startsWith(":"),
                  right = cell.endsWith(":");
                return (
                  (left ? ":" : "") +
                  "-".repeat(
                    Math.max(3, widths[col] - Number(left) - Number(right)),
                  ) +
                  (right ? ":" : "")
                );
              })
              .join(" | ") +
            " |",
        )
        .join("\n");
    }
    const ranges = tableCellRanges(insertion);
    const cell =
      ranges[Math.min(row, ranges.length - 1)]?.[
        Math.min(column, rows[0].length - 1)
      ];
    return commit(
      { from: table.from, to: table.to, insert: insertion },
      { anchor: table.from + (cell?.from ?? 0) },
    );
  }
  if (name === "tableAction") editor.setSelection({ anchor: context.position });
  if (!copyOnly)
    editor.view.dispatch({ annotations: isolateHistory.of("full") });
  await execute(name, argument);
  if (!copyOnly && editor.view.dom.isConnected)
    editor.view.dispatch({ annotations: isolateHistory.of("full") });
}

async function execute(name, arg) {
  if (bootstrapLoading || lifecycleLocked || navigationLocked || closeRequest)
    return;
  if (resourceCommitting)
    throw Error(
      t("资源正在保存，请稍候", "Resources are being saved; please wait"),
    );
  if (
    settings.readOnly &&
    (name.startsWith("heading") ||
      name.startsWith("snippet:") ||
      [
        "undo",
        "redo",
        "deleteBlock",
        "deleteSentence",
        "deleteWord",
        "clearFormatting",
        "moveParagraphUp",
        "moveParagraphDown",
        "bold",
        "italic",
        "strike",
        "highlight",
        "sub",
        "sup",
        "quote",
        "bullet",
        "ordered",
        "task",
        "link",
        "insertImage",
        "insertImageURL",
        "resizeImage",
        "downloadImage",
        "collectImages",
        "manageImages",
        "table",
        "tableEdit",
        "tableAction",
        "code",
        "codeFence",
        "codeLanguage",
        "math",
        "toc",
        "footnote",
        "hr",
        "pageBreak",
        "format",
        "indent",
        "outdent",
      ].includes(name))
  ) {
    toast(
      t(
        "文档处于只读模式，请先关闭只读再编辑。",
        "This document is read-only. Turn off read-only mode to edit.",
      ),
      true,
    );
    return;
  }
  if (name.startsWith("heading") && name !== "heading")
    return editor.command("heading", Number(name.slice(7)));
  if (name.startsWith("snippet:"))
    return editor.insert(
      settings.snippets[name.slice(8)]
        .replaceAll("{{date}}", new Date().toLocaleDateString("sv-SE"))
        .replaceAll("{{time}}", new Date().toLocaleTimeString()),
    );
  switch (name) {
    case "quit":
      return invoke("windowAction", { action: "quit" });
    case "close":
      return invoke("windowAction", { action: "requestClose" });
    case "new":
      return documentTransition(async () => {
        if (await mayLeave())
          await loadDocument({ path: null, text: "", revision: null });
      });
    case "open":
      return openDocument();
    case "openFolder": {
      const path = await invoke("chooseFolder");
      if (path) {
        folder = path;
        await refreshFiles();
        await persistSession();
      }
      return;
    }
    case "pinFolder":
      if (folder)
        await updateSettings({
          pins: (settings.pins || []).includes(folder)
            ? settings.pins.filter((p) => p !== folder)
            : [folder, ...(settings.pins || [])],
        });
      renderSidebar();
      return;
    case "newFile":
    case "newFolder": {
      if (!folder) {
        await execute("openFolder");
        if (!folder) return;
      }
      const n = await promptText(
        name === "newFile"
          ? t("新建文件", "New file")
          : t("新建文件夹", "New folder"),
        t("名称", "Name"),
        name === "newFile" ? "Untitled.md" : "",
      );
      if (!n) return;
      const path = folder + "/" + n;
      await invoke("fileOperation", {
        operation: name === "newFile" ? "createFile" : "createFolder",
        path,
        text: "",
      });
      await refreshFiles();
      if (name === "newFile") await openDocument(path);
      return;
    }
    case "fileOperation":
      return fileOperation(arg);
    case "save":
      return saveDocument();
    // Timed auto save: failures show the banner instead of a dialog.
    case "autoSave":
      return saveDocument(false, current.encoding, { quiet: true });
    case "saveAs":
      return saveDocument(true);
    case "convertEncoding": {
      if (settings.readOnly)
        throw Error(t("请先关闭只读模式", "Turn off read-only mode first"));
      const encoding = await chooseEncoding(true);
      if (encoding) await saveDocument(false, encoding);
      return;
    }
    case "source":
      mode = mode === "live" ? "source" : "live";
      editor.setMode(mode);
      updateStatus();
      await persistSession();
      return;
    case "settings":
      return showPreferences(settings, updateSettings, invoke, {
        ...preferenceOptions(),
      });
    case "aiAssistant":
      return aiAssistant?.toggle();
    case "aiModels":
      return showAIModelSettings({ invoke, t });
    case "defaultApps":
      return showPreferences(settings, updateSettings, invoke, {
        ...preferenceOptions(),
        section: "files",
      });
    case "about":
      return showAbout(await invoke("getAboutInfo"), invoke, {
        locale: settings.locale,
        checkUpdates: () => run("checkUpdates"),
      });
    case "checkUpdates":
      if (!updateNotice) throw Error(t("编辑器仍在启动", "Still starting"));
      return updateNotice.check();
    case "copyDiagnostics":
      await invoke("writeClipboard", { text: await invoke("getDiagnostics") });
      return toast(
        t(
          "诊断信息已复制，可粘贴到 GitHub Issue 中。其中不含文档内容、文件路径和 API Key。",
          "Diagnostic information copied. Paste it into a GitHub issue; it contains no document text, file paths or API keys.",
        ),
      );
    case "reopenClosed": {
      const path = closedDocuments.pop();
      if (path) await openDocument(path);
      else toast(t("没有可重新打开的文档", "No previous document"));
      return;
    }
    case "undoFileOperation":
      return documentTransition(async () => {
        const op = fileUndoStack[fileUndoStack.length - 1];
        if (!op) {
          toast(t("没有可撤销的文件移动", "No file move to undo"));
          return;
        }
        if (affectsPath(op.target, current.path) && !(await mayLeave())) return;
        const restored = await invoke("fileOperation", {
          operation: "move",
          path: op.target,
          target: op.path,
        });
        fileUndoStack.pop();
        if (affectsPath(op.target, current.path))
          await loadDocument(
            await invoke("openFile", {
              path: restored.path + current.path.slice(op.target.length),
              encoding: current.encoding,
            }),
          );
        await refreshFiles();
      });
    case "quickOpen":
      return quickOpen(false);
    case "outline":
    case "globalSearch":
      sidebarTab = name === "outline" ? "outline" : "search";
      document.body.classList.remove("sidebar-hidden");
      renderSidebar();
      $("#global-search input")?.focus();
      return;
    case "commands":
      return quickOpen(true);
    case "readOnly":
      settings.readOnly = !settings.readOnly;
      editor.setSettings({ readOnly: settings.readOnly });
      updateStatus();
      toast(
        settings.readOnly
          ? t("只读模式：文字已锁定", "Read-only: text is locked")
          : t("已恢复编辑", "Editing enabled"),
      );
      return;
    case "refresh":
      editor.command("refresh");
      toast(t("排版已刷新", "Rendering refreshed"));
      return;
    case "copyMathML": {
      const s = editor.view.state.selection.main;
      const text = s.empty
        ? editor.view.state.doc.lineAt(s.head).text
        : editor.view.state.sliceDoc(s.from, s.to);
      const el = document.createElement("div");
      el.innerHTML = renderMarkdown(text);
      const math = el.querySelector("math");
      if (!math)
        throw Error(
          t(
            "请选择完整公式源码（含 $ 定界符）",
            "Select a complete formula including $ delimiters",
          ),
        );
      await invoke("writeClipboard", {
        text: math.outerHTML,
        html: math.outerHTML,
      });
      toast(t("MathML 已复制", "MathML copied"));
      return;
    }
    case "focus":
      return updateSettings({ focusMode: !settings.focusMode });
    case "typewriter":
      return updateSettings({ typewriterMode: !settings.typewriterMode });
    case "sidebar":
      toggleSidebar();
      return;
    case "zen":
      return toggleZen();
    case "fullscreen":
      return invoke("windowAction", { action: "fullscreen" });
    case "zoomIn":
    case "zoomOut":
    case "zoomReset": {
      const factor = await invoke("windowAction", { action: name });
      if (typeof factor === "number")
        $("#zoom-button").textContent = Math.round(factor * 100) + "%";
      return;
    }
    case "newWindow":
      return invoke("newWindow");
    case "repeatExport":
      return repeatExport({
        editor,
        current,
        settings,
        invoke,
        updateSettings,
      });
    case "export":
      return showExport({ editor, current, settings, invoke, updateSettings });
    case "print":
      return showExport({
        editor,
        current,
        settings,
        invoke,
        updateSettings,
        print: true,
      });
    case "import": {
      const result = await invoke("runPandoc", { direction: "import" });
      if (result?.text === undefined) return;
      return documentTransition(async () => {
        if (!(await mayLeave())) return;
        await loadDocument({ path: null, text: result.text, revision: null });
        savedText = "";
        changed();
      });
    }
    case "insertImage": {
      if (!current.path && !(await saveDocument())) return;
      assertAsyncMutation();
      const snapshot = {
        generation,
        doc: editor.view.state.doc,
        path: current.path,
      };
      const inserted = await invoke("insertImages", {
        imageFolder: readDocumentConfig(editor.getText()).imageFolder,
        imageRoot: readDocumentConfig(editor.getText()).imageRoot,
        documentPath: snapshot.path,
      });
      if (!inserted?.length) return;
      if (
        generation !== snapshot.generation ||
        editor.view.state.doc !== snapshot.doc ||
        mutationBlocked()
      )
        throw Error(
          t(
            "图片已复制，但文档已变化；请重新插入图片。",
            "Images were copied, but the document changed. Insert them again.",
          ),
        );
      editor.insert(inserted.map(imageReference).join("\n"));
      return;
    }
    case "insertImageURL": {
      const snapshot = {
        generation,
        doc: editor.view.state.doc,
        selection: editor.view.state.selection.main,
      };
      const value = await promptText(
        t("从 URL 插入图片", "Insert image from URL"),
        t("图片 URL（HTTP / HTTPS）", "Image URL (HTTP / HTTPS)"),
        "https://",
      );
      if (!value) return;
      let url;
      try {
        url = new URL(value.trim());
      } catch {
        throw Error(t("请输入有效图片 URL", "Enter a valid image URL"));
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error(
          t(
            "仅支持不含登录凭据的 HTTP / HTTPS 图片地址",
            "Use an HTTP / HTTPS image URL without credentials",
          ),
        );
      if (
        generation !== snapshot.generation ||
        editor.view.state.doc !== snapshot.doc ||
        mutationBlocked()
      )
        throw Error(
          t(
            "文档已变化，请重新插入图片",
            "The document changed. Insert the image again",
          ),
        );
      const markdown =
        "![](" + url.href.replaceAll("(", "%28").replaceAll(")", "%29") + ")";
      editor.view.dispatch({
        changes: {
          from: snapshot.selection.from,
          to: snapshot.selection.to,
          insert: markdown,
        },
        selection: { anchor: snapshot.selection.from + markdown.length },
        userEvent: "input.image-url",
      });
      editor.focus();
      return;
    }
    case "resizeImage": {
      const snapshot = mutationSnapshot();
      const sel = editor.view.state.selection.main;
      const line = editor.view.state.doc.lineAt(sel.head);
      const match = line.text.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (!match)
        throw Error(
          t(
            "请把光标放到 Markdown 图片所在行",
            "Place the cursor on a Markdown image line",
          ),
        );
      const width = await promptText(
        t("调整图片尺寸", "Resize image"),
        t("宽度（px）", "Width (px)"),
        "480",
      );
      if (!width) return;
      assertAsyncMutation(snapshot);
      if (!/^\d+$/.test(width) || +width < 1 || +width > 10000)
        throw Error(t("图片宽度无效", "Invalid image width"));
      const from = line.from + match.index;
      editor.view.dispatch({
        changes: {
          from,
          to: from + match[0].length,
          insert:
            '<img src="' +
            esc(match[2]) +
            '" alt="' +
            esc(match[1]) +
            '" width="' +
            width +
            '">',
        },
      });
      return;
    }
    case "collectImages":
    case "manageImages": {
      if (!current.path && !(await saveDocument())) return;
      return manageResources({
        invoke,
        locale: settings.locale,
        snapshot: () => ({ ...current, text: editor.getText(), generation }),
        commit: async (prepared, original) => {
          clearTimeout(saveTimer);
          if (busySave) await busySave;
          if (
            mutationBlocked() ||
            generation !== original.generation ||
            editor.getText() !== original.text ||
            current.revision !== original.revision
          ) {
            await invoke("cancelImageOperation", { id: prepared.id });
            throw Error(
              t(
                "文档已变化，没有提交资源操作",
                "Document changed; resources were not committed",
              ),
            );
          }
          resourceCommitting = true;
          editor.setSettings({ readOnly: true });
          try {
            const result = await invoke("commitImageOperation", {
              id: prepared.id,
            });
            const patches = result.patches || prepared.patches;
            editor.view.dispatch({
              changes: patches.map((patch) => ({
                from: normalizeSource(original.text.slice(0, patch.from))
                  .length,
                to: normalizeSource(original.text.slice(0, patch.to)).length,
                insert: patch.insert.replace(/\r\n|\r/g, "\n"),
              })),
              userEvent: "input.resource",
            });
            current = { ...current, ...result.document };
            savedText = result.document.text;
            conflict = false;
            $("#conflict-banner").hidden = true;
            await invoke("deleteRecovery", { id: recoveryId });
            await syncNativeDirty(true);

            await refreshFiles();
            updateStatus();
            return result;
          } finally {
            resourceCommitting = false;
            editor.setSettings({
              readOnly:
                lifecycleLocked ||
                navigationLocked ||
                resourceCommitting ||
                !!settings.readOnly,
            });
            flushExternalChange();
          }
        },
      });
    }
    case "downloadImage": {
      if (!current.path && !(await saveDocument())) return;
      const url = await promptText(
        t("下载网络图片", "Download remote image"),
        t("图片 URL（HTTP / HTTPS）", "Image URL (HTTP / HTTPS)"),
        "https://",
      );
      if (!url) return;
      assertAsyncMutation();
      const snapshot = {
        generation,
        doc: editor.view.state.doc,
        path: current.path,
      };
      const result = await invoke("downloadImage", {
        imageFolder: readDocumentConfig(editor.getText()).imageFolder,
        imageRoot: readDocumentConfig(editor.getText()).imageRoot,
        documentPath: snapshot.path,
        url,
      });
      const markdown = result.map(imageReference).join("\n");
      if (
        generation !== snapshot.generation ||
        editor.view.state.doc !== snapshot.doc ||
        mutationBlocked()
      ) {
        modal(
          t("图片已下载", "Images downloaded"),
          "<p>" +
            t(
              "下载期间文档已变化，可复制以下引用：",
              "Document changed during download. Copy these references:",
            ) +
            '</p><textarea readonly rows="5" style="width:100%">' +
            esc(markdown) +
            "</textarea>",
        );
        return;
      }
      editor.insert(markdown);
      return;
    }
    case "table": {
      const snapshot = mutationSnapshot();
      if (
        locateTable(
          editor.view.state.doc.toString(),
          editor.view.state.selection.main.head,
        )
      )
        return editTable(editor, settings.locale);
      const shape = await promptText(
        t("创建表格", "Create table"),
        t(
          "行 × 列（包括表头，例如 3x3）",
          "Rows x columns (including header, e.g. 3x3)",
        ),
        "3x3",
      );
      if (shape) {
        assertAsyncMutation(snapshot);
        const parts = shape.split(/[x×, ]+/).map(Number);
        if (
          parts.length !== 2 ||
          parts[0] < 2 ||
          parts.some((n) => !Number.isInteger(n) || n < 1 || n > 30)
        )
          throw Error(
            t(
              "行数范围为 2–30，列数范围为 1–30",
              "Rows must be 2–30 and columns 1–30",
            ),
          );
        editor.command("table", { rows: parts[0], columns: parts[1] });
      }
      return;
    }
    case "tableEdit":
      return editTable(editor, settings.locale);
    case "tableAction":
      return editor.command("tableAction", arg);
    case "codeFence":
      return editor.command("codeBlock");
    case "copyPath":
      if (!current.path)
        throw Error(t("请先保存文档", "Save this document first"));
      await invoke("writeClipboard", { text: current.path });
      toast(t("路径已复制", "Path copied"));
      return;
    case "clearRecent":
      await updateSettings({ recentFiles: [] });
      recentFiles = [];
      renderSidebar();
      return;
    case "copyCode": {
      const source = editor.view.state.doc.toString(),
        cursor = editor.view.state.selection.main.head;
      const blocks = [
        ...source.matchAll(
          /^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^ {0,3}\1[ \t]*$/gm,
        ),
      ];
      const block = blocks.find(
        (m) => cursor >= m.index && cursor <= m.index + m[0].length,
      );
      if (!block)
        throw Error(
          t("请把光标放在代码块内", "Place the cursor in a code block"),
        );
      await invoke("writeClipboard", { text: block[2] });
      toast(t("代码已复制", "Code copied"));
      return;
    }
    case "codeLanguage": {
      const snapshot = mutationSnapshot();
      const lang = await promptText(
        t("代码语言", "Code language"),
        t(
          "语言名称，例如 javascript / python / mermaid",
          "Language: javascript / python / mermaid",
        ),
        settings.defaultCodeLanguage || "javascript",
      );
      if (lang) {
        assertAsyncMutation(snapshot);
        if (!/^[\w+-]{0,80}$/.test(lang))
          throw Error(
            t(
              "语言名只能包含字母、数字、下划线、加减号",
              "Invalid language name",
            ),
          );
        editor.command("codeLanguage", lang);
        await updateSettings({ defaultCodeLanguage: lang });
      }
      return;
    }
    case "math":
      editor.insert("\n$$\nE = mc^2\n$$\n");
      return;
    case "toc":
      editor.insert("\n[TOC]\n");
      return;
    case "footnote": {
      const snapshot = mutationSnapshot();
      const id = await promptText(
        t("脚注", "Footnote"),
        t("脚注标识", "Footnote identifier"),
        "note",
      );
      if (id && /^[\w-]+$/.test(id)) {
        assertAsyncMutation(snapshot);
        editor.insert("[^" + id + "]\n\n[^" + id + "]: ");
      }
      return;
    }
    case "highlight":
    case "sup":
    case "sub": {
      const marks = { highlight: "==", sup: "^", sub: "~" };
      const s = editor.view.state.selection.main;
      editor.insert(
        marks[name] + editor.view.state.sliceDoc(s.from, s.to) + marks[name],
      );
      return;
    }
    case "pageBreak":
      editor.insert('\n<div style="page-break-after: always;"></div>\n');
      return;
    case "copyRich": {
      const s = editor.view.state.selection.main;
      await writeRichClipboard(
        s.empty ? editor.getText() : editor.view.state.sliceDoc(s.from, s.to),
        current,
      );
      toast(t("已复制富文本与 Markdown", "Rich text and Markdown copied"));
      return;
    }
    case "copyHTML": {
      const s = editor.view.state.selection.main;
      const text = s.empty
        ? editor.getText()
        : editor.view.state.sliceDoc(s.from, s.to);
      await invoke("writeClipboard", {
        text: renderMarkdown(text, { basePath: current.path }),
      });
      toast(t("HTML 已复制", "HTML copied"));
      return;
    }
    case "copyPlain": {
      const s = editor.view.state.selection.main;
      const text = s.empty
        ? editor.getText()
        : editor.view.state.sliceDoc(s.from, s.to);
      const el = document.createElement("div");
      el.innerHTML = renderMarkdown(text, { basePath: current.path });
      await invoke("writeClipboard", { text: el.textContent });
      toast(t("纯文本已复制", "Plain text copied"));
      return;
    }
    case "format": {
      const snapshot = mutationSnapshot();
      const result = await invoke("runPandoc", {
        direction: "format",
        text: editor.getText(),
      });
      if (result?.text) {
        const ok = await ask(
          t("整理 Markdown", "Format Markdown"),
          t(
            "Pandoc 会统一语法格式，可能改变未知扩展。此操作可撤销。",
            "Pandoc normalizes syntax and may change extensions. This is undoable.",
          ),
          [
            { label: t("应用", "Apply"), value: true },
            { label: t("取消", "Cancel"), value: false },
          ],
        );
        if (ok) {
          assertAsyncMutation(snapshot);
          editor.view.dispatch({
            changes: {
              from: 0,
              to: editor.view.state.doc.length,
              insert: result.text,
            },
          });
        }
      }
      return;
    }
    case "history":
      return historyDialog();
    case "recovery":
      return recoveryDialog();
    case "statistics": {
      const selected = editor.view.state.selection.main;
      const stats = countWords(
        selected.empty
          ? editor.getText()
          : editor.view.state.sliceDoc(selected.from, selected.to),
      );
      const labels = {
        words: t("字 / 词", "Words"),
        characters: t("字符数", "Characters"),
        charactersWithoutSpaces: t("非空白字符", "Non-space characters"),
        lines: t("行数", "Lines"),
        cjk: t("中日韩文字", "CJK characters"),
        readingMinutes: t("阅读分钟", "Reading minutes"),
      };
      return modal(
        selected.empty
          ? t("文档统计", "Document statistics")
          : t("选中内容统计", "Selection statistics"),
        '<div class="stat-grid">' +
          Object.entries(stats)
            .map(
              ([k, v]) =>
                "<div><strong>" +
                v +
                "</strong><span>" +
                (labels[k] || k) +
                "</span></div>",
            )
            .join("") +
          "</div>",
      );
    }
    case "followLink": {
      if (arg.startsWith("#")) {
        const heading = getOutline(editor.getText(), settings).find(
          (h) => h.id === decodeURIComponent(arg.slice(1)),
        );
        if (heading) {
          editor.setSelection({ anchor: heading.from, head: heading.from });
          editor.view.dispatch({ scrollIntoView: true });
        } else {
          const id = decodeURIComponent(arg.slice(1)),
            source = editor.view.state.doc.toString();
          const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          let position = source.search(
            new RegExp("(?:id|name)=[\"']" + escaped + "[\"']"),
          );
          if (position < 0 && /^fn\d+$/.test(id)) {
            const references = [
              ...new Set(
                [...source.matchAll(/\[\^([^\]]+)\](?!:)/g)].map(
                  (match) => match[1],
                ),
              ),
            ];
            const label = references[Number(id.slice(2)) - 1];
            if (label) position = source.indexOf("[^" + label + "]:");
          }
          if (position < 0) {
            const target = document
              .getElementById(id)
              ?.closest(".cm-live-block");
            if (target) position = Number(target.dataset.sourceFrom);
          }
          if (position >= 0) {
            editor.setSelection({ anchor: position, head: position });
            editor.view.dispatch({ scrollIntoView: true });
            editor.focus();
          }
        }
        return;
      }
      if (/^https?:|^mailto:/i.test(arg))
        return invoke("openExternal", { url: arg });
      const [path, hash] = arg.split("#");
      if (current.path) {
        const doc = await invoke("resolveLink", {
          documentPath: current.path,
          href: /^file:/i.test(path) ? path : decodeURIComponent(path),
        });
        if (doc?.path) {
          await openDocument(doc.path);
          if (hash) await execute("followLink", "#" + hash);
        }
      }
      return;
    }
    default:
      editor.command(name, name === "heading" ? Number(arg) : arg);
  }
}
document.addEventListener(
  "keydown",
  (e) => {
    if (e.isComposing || document.querySelector("dialog[open]")) return;
    const shortcuts = { ...defaultShortcuts, ...settings.shortcuts };
    for (const [command, key] of Object.entries(shortcuts)) {
      if (shortcutMatches(e, key)) {
        e.preventDefault();
        e.stopPropagation();
        run(command);
        break;
      }
    }
  },
  true,
);
let lastWheelZoom = 0;
document.addEventListener(
  "wheel",
  (e) => {
    if ((e.ctrlKey || e.metaKey) && settings.wheelZoom !== false) {
      e.preventDefault();
      if (Date.now() - lastWheelZoom > 100) {
        lastWheelZoom = Date.now();
        run(e.deltaY < 0 ? "zoomIn" : "zoomOut");
      }
    }
  },
  { passive: false },
);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
  applyAppearance(),
);
// Uncaught errors go to the diagnostic report (Tools → Copy diagnostic
// information); nothing leaves the computer unless the user pastes it.
function reportProblem(error) {
  const message =
    error?.stack || error?.message || String(error ?? "Unknown error");
  native
    ?.invoke("reportProblem", { message: message.slice(0, 4000) })
    .catch(() => {});
}
addEventListener("error", (event) =>
  reportProblem(event.error || event.message),
);
addEventListener("unhandledrejection", (event) => reportProblem(event.reason));

async function init() {
  shell();
  if (native) {
    bootstrapData = await invoke("bootstrap");
    settings = {
      ...defaults,
      ...bootstrapData.settings,
      exportOptions: {
        ...defaults.exportOptions,
        ...bootstrapData.settings?.exportOptions,
      },
    };
    recentFiles = settings.recentFiles || [];
    needsLanguageChoice =
      !bootstrapData.languageConfigured && !settings.firstRunComplete;
    shell();
  }
  const initialWelcome = getWelcome(settings.locale);
  bootstrapLoading = !!native;
  current = { ...current, text: initialWelcome };
  savedText = initialWelcome;
  makeEditor(initialWelcome);
  makeAIAssistant();
  applyAppearance();
  updateStatus();
  renderSidebar();
  window.__inkstone = {
    get editor() {
      return editor;
    },
    getDocument: () => ({
      ...current,
      text: editor.getText(),
      dirty: dirty(),
      conflict,
    }),
    execute,
    loadDocument,
    invoke,
  };
  if (!native) {
    toast(
      t(
        "请通过桌面应用打开 Inkstone。",
        "Open Inkstone as a desktop application.",
      ),
      true,
    );
    return;
  }
  native.on("command", (c) => run(typeof c === "string" ? c : c.name, c.arg));
  native.on("open-path", (p) =>
    guarded(openDocument)(typeof p === "string" ? p : p.path),
  );
  native.on("folder-change", () => guarded(refreshFiles)());
  native.on("settings-changed", (patch) => acceptSettings(patch));
  native.on("external-change", guarded(handleExternalChange));
  native.on("before-close", (request) => guarded(prepareClose)(request));
  native.on("before-close-commit", (request) => guarded(commitClose)(request));
  native.on("close-aborted", (request) => {
    if (closeRequest?.requestId !== request.requestId) return;
    resumeEditing();
    if (request.error) toast(request.error, true);
  });
  try {
    const session = bootstrapData.session || {};
    if (session.folder) {
      folder = session.folder;
      try {
        await refreshFiles();
      } catch {
        folder = null;
      }
    }
    if (session.mode) mode = session.mode;
    const startup = bootstrapData.openPath || session.path;
    if (startup)
      try {
        await documentTransition(async () =>
          loadDocument(
            await invoke("openFile", {
              path: startup,
              encoding: session.encoding,
            }),
            session.selection,
          ),
        );
      } catch (e) {
        toast(e.message, true);
      }
    else {
      editor.setMode(mode);
      // Start on the first plain paragraph below the welcome title, so neither
      // the title's "#" nor a quote's ">" is shown at the cursor.
      const welcomeText = editor.view.state.doc.toString();
      const body = welcomeText.search(/\n(?=[\p{L}\p{N}])/u);
      if (!current.path && body > 0)
        editor.setSelection({ anchor: body + 1 }, { scrollIntoView: false });
    }
  } finally {
    bootstrapLoading = false;
    applyAppearance();
    updateStatus();
    await invoke("windowAction", { action: "ready" });
  }
  startupRecoveryCount = (bootstrapData.recoverableAtStartup || []).length;
  renderRecoveryNotice();
  updateNotice = createUpdateNotice({ invoke, native });
  if (bootstrapData.warnings?.length)
    toast(bootstrapData.warnings.join("\n"), true);
  editor.focus();
  if (!needsLanguageChoice) await offerDefaultApp(invoke, settings.locale);
}
guarded(init)();
