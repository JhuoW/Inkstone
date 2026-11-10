import { $, $$, esc, modal, toast, promptText, ask } from "./ui.js";
import { resolveAsset } from "./markdown.js";
import { showAIModelSettings } from "./ai-model-settings.js";
import { displayError } from "./errors.js";
import {
  bindingFromEvent,
  formatShortcut,
  normalizeShortcut,
} from "./shortcuts.js";

// Font choices offered before the free-form CSS font list.
const fontPresets = [
  [
    "sans",
    "无衬线（默认）",
    "Sans serif (default)",
    '"Segoe UI", "Noto Sans", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
  ],
  [
    "serif",
    "衬线 / 宋体",
    "Serif / Song",
    'Georgia, "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif',
  ],
  [
    "kai",
    "楷体",
    "Kai",
    'Georgia, KaiTi, "Kaiti SC", STKaiti, "AR PL UKai CN", serif',
  ],
  [
    "mono",
    "等宽",
    "Monospace",
    '"Cascadia Code", Consolas, "Liberation Mono", "Microsoft YaHei", monospace',
  ],
];

export const defaults = {
  aiPanelOpen: false,
  aiPanelHeight: 260,
  locale: "en",
  firstRunComplete: false,
  defaultAppPrompted: false,
  theme: "light",
  fontFamily:
    '"Segoe UI", "Noto Sans", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
  fontSize: 17,
  lineHeight: 1.75,
  contentWidth: 780,
  lineNumbers: false,
  mathNumbering: false,
  autoPair: true,
  autoPairMarkdown: false,
  smartPunctuationInput: false,
  softBreaks: false,
  exportSoftBreaks: false,
  strictMarkdown: true,
  cjkEmphasis: false,
  codeWrap: true,
  defaultCodeLanguage: "javascript",
  outlineNumbering: false,
  themeLibrary: {},
  activeThemeName: "",
  sortDescending: false,
  foldersFirst: true,
  smartPunctuation: false,
  spellcheck: true,
  focusMode: false,
  typewriterMode: false,
  tabSize: 2,
  autoSave: false,
  autoSaveDelay: 1500,
  customCSS: "",
  pandocPath: "pandoc",
  sequenceTheme: "simple",
  recordRecent: true,
  wheelZoom: true,
  autoCheckUpdates: true,
  closeAction: "ask",
  showHidden: false,
  showAllFiles: false,
  includeGlobs: "",
  excludeGlobs: "",
  imageFolder: "assets",
  fileSort: "name",
  pins: [],
  snippets: { date: "{{date}}", note: "> [!NOTE]\n> " },
  shortcuts: {},
  exportOptions: {
    pageSize: "A4",
    landscape: false,
    margins: 18,
    header: "",
    footer: "",
    bookmarks: true,
  },
};
export function showPreferences(settings, apply, invoke, options = {}) {
  const { section = "writing", focus } = options;
  // Commands and built-in bindings come from the app, so the shortcut editor
  // shows the same names and defaults as the command palette and menus.
  const commandEntries = () =>
    (typeof options.commands === "function"
      ? options.commands()
      : options.commands || []
    ).filter((command) => !command.id.startsWith("snippet:"));
  const shortcutDefaults = options.shortcutDefaults || {};
  const en = settings.locale === "en";
  const t = (zh, english) => (en ? english : zh);
  const field = (key, label, type = "text", extra = "") => {
    const value = Array.isArray(settings[key])
      ? settings[key].join("\n")
      : (settings[key] ?? "");
    if (["includeGlobs", "excludeGlobs"].includes(key))
      return `<label class="setting-stack"><span>${label}</span><textarea name="${key}" rows="3" spellcheck="false" autocomplete="off">${esc(value)}</textarea></label>`;
    if (type === "checkbox")
      return `<label class="setting-toggle"><input name="${key}" type="checkbox" ${settings[key] ? "checked" : ""}><span>${label}</span></label>`;
    return `<label class="setting-row"><span>${label}</span><input name="${key}" type="${type}" value="${esc(value)}" autocomplete="off" ${type === "number" ? "required" : ""} ${extra}></label>`;
  };
  const select = (key, label, options) =>
    `<label class="setting-row"><span>${label}</span><select name="${key}">${options
      .map(
        ([value, text]) =>
          `<option value="${value}" ${settings[key] === value ? "selected" : ""}>${text}</option>`,
      )
      .join("")}</select></label>`;
  const group = (title, content) =>
    `<fieldset class="settings-group"><legend>${title}</legend>${content}</fieldset>`;
  const hint = (text, id = "") =>
    `<p class="setting-help muted"${id ? ` id="${id}" role="status"` : ""}>${text}</p>`;
  const areas = [
    ["writing", t("写作", "Writing")],
    ["appearance", t("外观", "Appearance")],
    ["files", t("文件", "Files")],
    ["tools", t("外部工具", "External tools")],
    ["ai", t("AI / 模型", "AI / Models")],
    ["advanced", t("自定义", "Customize")],
  ];
  const panes = {
    ai: group(
      t("AI写作助手", "AI Writing Assistant"),
      hint(
        t(
          "连接本地模型，或使用自己的 OpenAI、Claude、Gemini、DeepSeek 等服务商密钥。仅在主动分析或对话时发送当前文档。",
          "Connect a local model or use your own key for OpenAI, Claude, Gemini, DeepSeek and other providers. Document content is sent only when you analyze or chat.",
        ),
      ) +
        `<button type="button" id="configure-ai-models">${t("配置模型", "Configure models")}</button>`,
    ),
    writing:
      group(
        t("界面语言", "Language"),
        select("locale", t("应用语言", "Application language"), [
          ["en", "English"],
          ["zh-CN", "简体中文"],
        ]),
      ) +
      group(
        t("输入", "Typing"),
        field(
          "autoPair",
          t("自动补全括号与引号", "Auto pair brackets and quotes"),
          "checkbox",
        ) +
          field(
            "autoPairMarkdown",
            t("Markdown 符号自动配对", "Auto pair Markdown symbols"),
            "checkbox",
          ) +
          field(
            "smartPunctuationInput",
            t(
              "输入时转换智能标点（即时模式）",
              "Smart punctuation while typing (live mode)",
            ),
            "checkbox",
          ) +
          field(
            "spellcheck",
            t("本地拼写检查", "Local spellcheck"),
            "checkbox",
          ) +
          hint("", "spellcheck-status") +
          field(
            "tabSize",
            t("缩进宽度", "Tab size"),
            "number",
            'min="1" max="8"',
          ),
      ) +
      group(
        t("Markdown 与代码", "Markdown and code"),
        field(
          "strictMarkdown",
          t("严格 Markdown 解析", "Strict Markdown parsing"),
          "checkbox",
        ) +
          field(
            "cjkEmphasis",
            t(
              "允许中文标点相邻的强调",
              "Allow emphasis next to CJK punctuation",
            ),
            "checkbox",
          ) +
          field(
            "smartPunctuation",
            t("渲染时使用智能标点", "Smart punctuation in rendering"),
            "checkbox",
          ) +
          field(
            "softBreaks",
            t("软换行显示为换行", "Render soft line breaks"),
            "checkbox",
          ) +
          field(
            "exportSoftBreaks",
            t("导出时保留软换行", "Preserve soft line breaks in exports"),
            "checkbox",
          ) +
          field(
            "lineNumbers",
            t("源码行号与代码块行号", "Source and code block line numbers"),
            "checkbox",
          ) +
          field(
            "codeWrap",
            t("代码块自动换行", "Wrap code blocks"),
            "checkbox",
          ) +
          field(
            "defaultCodeLanguage",
            t("新代码块默认语言", "Default code language"),
          ) +
          field(
            "mathNumbering",
            t("公式自动编号", "Automatic equation numbering"),
            "checkbox",
          ) +
          select(
            "sequenceTheme",
            t("传统时序图主题", "Legacy sequence diagram theme"),
            [
              ["simple", t("简洁", "Simple")],
              ["hand", t("手绘", "Hand drawn")],
            ],
          ),
      ) +
      group(
        t("写作模式", "Writing modes"),
        field(
          "outlineNumbering",
          t("大纲自动编号", "Number outline headings"),
          "checkbox",
        ) +
          field("focusMode", t("专注模式", "Focus mode"), "checkbox") +
          field(
            "typewriterMode",
            t("打字机模式", "Typewriter mode"),
            "checkbox",
          ),
      ),
    appearance:
      group(
        t("主题", "Theme"),
        select("theme", t("界面外观", "Appearance"), [
          ["light", t("浅色", "Light")],
          ["dark", t("深色", "Dark")],
          ["system", t("跟随系统", "System")],
        ]),
      ) +
      group(
        t("编辑器排版", "Editor typography"),
        `<label class="setting-row"><span>${t("正文字体", "Font")}</span><select id="font-preset">${fontPresets
          .map(
            ([id, zh, english]) =>
              `<option value="${id}">${t(zh, english)}</option>`,
          )
          .join(
            "",
          )}<option value="custom">${t("自定义", "Custom")}</option></select></label>` +
          field(
            "fontFamily",
            t("字体列表（CSS font-family）", "Font list (CSS font-family)"),
          ) +
          field(
            "fontSize",
            t("字号（px）", "Font size (px)"),
            "number",
            'min="10" max="48"',
          ) +
          field(
            "lineHeight",
            t("行高", "Line height"),
            "number",
            'step="0.05" min="1" max="3"',
          ) +
          field(
            "contentWidth",
            t("写作区域宽度（px）", "Writing width (px)"),
            "number",
            'min="400" max="1400"',
          ) +
          field(
            "wheelZoom",
            t("Ctrl + 滚轮缩放", "Ctrl + wheel zoom"),
            "checkbox",
          ),
      ) +
      group(
        t("CSS 主题", "CSS themes"),
        `<div class="theme-library"><label class="visually-hidden" for="saved-themes">${t("已保存主题", "Saved themes")}</label><select id="saved-themes"></select><button type="button" id="save-theme">${t("保存为主题", "Save as theme")}</button><button type="button" id="delete-theme">${t("删除主题", "Delete theme")}</button></div>` +
          `<div class="theme-buttons"><button type="button" id="import-theme">${t("导入 CSS 主题", "Import CSS theme")}</button><button type="button" id="copy-theme">${t("复制主题 CSS", "Copy theme CSS")}</button></div>` +
          `<label class="setting-stack"><span>${t("自定义 CSS（即时应用）", "Custom CSS (live)")}</span><textarea name="customCSS" rows="7" spellcheck="false" autocomplete="off">${esc(settings.customCSS)}</textarea></label>`,
      ),
    files:
      group(
        t("Markdown 默认打开方式", "Default Markdown app"),
        hint(
          t(
            "在 Windows 中选择用 Inkstone 打开 Markdown 文件。",
            "Choose Inkstone to open Markdown files in Windows.",
          ),
        ) +
          '<p id="default-app-status" class="setting-help muted" role="status" aria-live="polite"></p>' +
          `<button type="button" id="set-default-markdown" disabled>${t("在 Windows 中设置", "Set in Windows")}</button>`,
      ) +
      group(
        t("保存与恢复", "Saving and recovery"),
        field(
          "autoSave",
          t("自动保存已有路径的文件", "Auto save named documents"),
          "checkbox",
        ) +
          field(
            "autoSaveDelay",
            t("自动保存延迟（毫秒）", "Auto save delay (ms)"),
            "number",
            'min="500" max="60000"',
          ) +
          hint(
            t(
              "未命名文档和未保存内容自动保留恢复草稿。外部修改冲突时暂停自动保存并提示处理。",
              "Recovery drafts preserve unsaved changes. External changes pause auto save until you resolve the conflict.",
            ),
          ) +
          field(
            "recordRecent",
            t("记录最近文档", "Remember recent documents"),
            "checkbox",
          ),
      ) +
      group(
        t("关闭窗口", "Closing the window"),
        select("closeAction", t("点击关闭按钮时", "When I close the window"), [
          ["ask", t("每次询问", "Ask every time")],
          ["tray", t("最小化到托盘", "Minimize to tray")],
          ["quit", t("退出 Inkstone", "Exit Inkstone")],
        ]) +
          hint(
            t(
              "最小化到托盘后 Inkstone 在后台运行，不占用任务栏，自动保存照常进行；点击托盘图标恢复窗口。从托盘菜单或“文件 > 退出”退出时，会先检查未保存的修改。打开多个窗口时，关闭按钮只关闭当前窗口。",
              "In the tray, Inkstone keeps running without a taskbar button and auto save continues; click the tray icon to reopen it. Exiting from the tray menu or File > Quit checks for unsaved changes first. With several windows open, the close button closes only that window.",
            ),
          ),
      ) +
      group(
        t("文件浏览", "File browser"),
        select("fileSort", t("排序", "Sort"), [
          ["name", t("名称", "Name")],
          ["modified", t("修改时间", "Modified")],
          ["created", t("创建时间", "Created")],
          ["size", t("文件大小", "Size")],
        ]) +
          field(
            "sortDescending",
            t("降序排列", "Descending order"),
            "checkbox",
          ) +
          field("foldersFirst", t("文件夹优先", "Folders first"), "checkbox") +
          field(
            "showHidden",
            t("显示隐藏文件", "Show hidden files"),
            "checkbox",
          ) +
          field(
            "showAllFiles",
            t("显示非 Markdown 文件", "Show non-Markdown files"),
            "checkbox",
          ) +
          field(
            "includeGlobs",
            t(
              "包含文件 glob（每行一个，留空为全部）",
              "Include file globs (one per line; empty for all)",
            ),
          ) +
          field(
            "excludeGlobs",
            t(
              "排除文件 glob（例如 **/archive/**）",
              "Exclude file globs (e.g. **/archive/**)",
            ),
          ),
      ) +
      group(
        t("本地图片", "Local images"),
        field("imageFolder", t("图片资源目录", "Image asset folder")) +
          hint(
            t(
              "相对于文档位置，支持 ${filename} 占位符。",
              "Relative to the document; supports the ${filename} placeholder.",
            ),
          ),
      ),
    tools: group(
      "Pandoc",
      field("pandocPath", t("可执行文件路径", "Executable path")) +
        `<button type="button" id="browse-pandoc">${t("浏览…", "Browse…")}</button>` +
        hint(
          t(
            "Pandoc 是本地文档转换程序，核心编辑和原生导出无需安装。填写 pandoc 时会在系统 PATH 中自动查找。",
            "Pandoc converts documents locally. Core editing and native exports work without it. With “pandoc”, Inkstone looks it up on your system PATH.",
          ),
        ) +
        `<button type="button" id="detect-tools">${t("检测外部工具", "Check tools")}</button><pre id="tool-results" role="status" aria-live="polite"></pre>`,
    ),
    advanced:
      group(
        t("键盘快捷键", "Keyboard shortcuts"),
        hint(
          t(
            "点击快捷键后直接按下新的组合键；Backspace 恢复默认，Esc 取消。",
            "Click a shortcut, then press the new keys. Backspace restores the default; Esc cancels.",
          ),
        ) +
          `<input type="search" id="shortcut-filter" placeholder="${t("搜索命令…", "Search commands…")}" aria-label="${t("搜索命令", "Search commands")}" autocomplete="off">` +
          `<div class="shortcut-list" id="shortcut-list" role="list"></div>` +
          hint("", "shortcut-status"),
      ) +
      group(
        t("文本片段", "Text snippets"),
        hint(
          t(
            "片段可从命令面板插入，也可在正文中输入分号加名称（如 ;date）触发。",
            "Insert snippets from the command palette, or type a semicolon and the name (for example ;date) in the document.",
          ),
        ) +
          `<div class="snippet-editor" id="snippet-editor"></div><button type="button" id="add-snippet">${t("添加片段", "Add snippet")}</button>` +
          hint("", "snippet-status"),
      ) +
      group(
        t("以 JSON 编辑（高级）", "Edit as JSON (advanced)"),
        `<label class="setting-stack"><span>${t('快捷键 JSON，如 {"bold":"Mod-b"}', 'Shortcuts JSON, e.g. {"bold":"Mod-b"}')}</span><textarea name="shortcuts" rows="4" spellcheck="false" autocomplete="off">${esc(JSON.stringify(settings.shortcuts, null, 2))}</textarea></label>` +
          hint(
            t(
              "Mod 表示 Ctrl。可组合 Shift 和 Alt。",
              "Mod means Ctrl. Combine with Shift and Alt.",
            ),
          ) +
          `<label class="setting-stack"><span>${t("文本片段 JSON", "Text snippets JSON")}</span><textarea name="snippets" rows="4" spellcheck="false" autocomplete="off">${esc(JSON.stringify(settings.snippets, null, 2))}</textarea></label>`,
      ) +
      group(
        t("更新", "Updates"),
        field(
          "autoCheckUpdates",
          t("自动检查更新", "Check for updates automatically"),
          "checkbox",
        ) +
          hint(
            t(
              "启动后及每天向 GitHub 查询一次新版本，只读取版本信息；下载和安装都需要你确认。",
              "Inkstone asks GitHub for a new version after starting and once a day. It only reads version information; downloading and installing wait for you.",
            ),
          ) +
          `<button type="button" id="check-updates-now">${t("立即检查", "Check now")}</button>`,
      ),
  };
  const d = modal(
    t("偏好设置", "Preferences"),
    `<div class="settings-grid"><nav class="settings-tabs" role="tablist" aria-label="${t("设置分类", "Preference categories")}" aria-orientation="vertical">${areas
      .map(
        ([key, label]) =>
          `<button type="button" role="tab" id="settings-tab-${key}" aria-controls="settings-pane-${key}" aria-selected="false" tabindex="-1" data-section="${key}">${label}</button>`,
      )
      .join("")}</nav>` +
      `<form class="settings-form" autocomplete="off">${areas
        .map(
          ([key, label]) =>
            `<section data-pane="${key}" id="settings-pane-${key}" role="tabpanel" aria-labelledby="settings-tab-${key}" hidden><h3>${label}</h3>${panes[key]}</section>`,
        )
        .join("")}</form></div>` +
      `<footer><span class="muted" id="settings-result" role="status" aria-live="polite">${t("设置即时生效并保存在本机", "Changes apply immediately and stay on this device")}</span><button class="primary" id="settings-done">${t("完成", "Done")}</button></footer>`,
    { wide: true },
  );
  d.el.classList.add("preferences-dialog");
  $("#configure-ai-models", d.el).onclick = () => {
    void showAIModelSettings({ invoke, t });
  };
  const tabs = $$("[data-section]", d.el);
  const activateTab = (button) => {
    tabs.forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    $$("[data-pane]", d.el).forEach((pane) => {
      pane.hidden = pane.dataset.pane !== button.dataset.section;
      if (!pane.hidden) pane.scrollTop = 0;
    });
    $(".settings-form", d.el).scrollTop = 0;
  };
  tabs.forEach((button, index) => {
    button.onclick = () => activateTab(button);
    button.onkeydown = (event) => {
      if (event.isComposing) return;
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : ["ArrowDown", "ArrowRight"].includes(event.key)
              ? (index + 1) % tabs.length
              : ["ArrowUp", "ArrowLeft"].includes(event.key)
                ? (index + tabs.length - 1) % tabs.length
                : -1;
      if (target < 0) return;
      event.preventDefault();
      activateTab(tabs[target]);
      tabs[target].focus();
    };
  });
  $(".settings-form", d.el).onsubmit = (event) => event.preventDefault();
  // Every named field saves through here, including values written by the
  // shortcut recorder, snippet list, font presets and sliders.
  const handleChange = async (e) => {
    const el = e.target,
      key = el.name;
    if (!key) return false;
    el.removeAttribute("aria-invalid");
    el.removeAttribute("aria-describedby");
    el.closest("label")?.querySelector(".setting-error")?.remove();
    try {
      let value =
        el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.value;
      if (["shortcuts", "snippets"].includes(key)) {
        value = JSON.parse(value);
        if (
          !value ||
          Array.isArray(value) ||
          typeof value !== "object" ||
          Object.values(value).some((v) => typeof v !== "string")
        )
          throw Error(t("需要字符串键值对象", "Expected an object of strings"));
      }
      if (el.type === "number" && !el.checkValidity())
        throw Error(t("数值超出范围", "Value is out of range"));
      const patch = {
        [key]: value,
        ...(key === "locale" ? { firstRunComplete: true } : {}),
      };
      await apply(patch);
      settings = { ...settings, ...patch };
      if (!d.el.isConnected) return true;
      if (key === "spellcheck") await refreshSpellcheckStatus();
      // Rebuild the lists only after a direct JSON edit; rebuilding after the
      // list's own save would take focus from the field being typed in.
      if (key === "shortcuts" && !e.fromEditor) renderShortcuts();
      if (key === "snippets" && !e.fromEditor) renderSnippets();
      if (key === "fontFamily") syncFontPreset();
      if (["fontSize", "lineHeight", "contentWidth"].includes(key))
        syncSlider(key);
      $("#settings-result", d.el).textContent = t("已保存", "Saved");
      return true;
    } catch (err) {
      if (!d.el.isConnected) return false;
      el.setAttribute("aria-invalid", "true");
      const error = document.createElement("small");
      error.className = "setting-error";
      error.id = `settings-error-${key}`;
      error.textContent = displayError(err);
      el.setAttribute("aria-describedby", error.id);
      el.closest("label")?.append(error);
      toast(err.message, true);
      $("#settings-result", d.el).textContent = t(
        "设置未保存，请修正",
        "Not saved; correct the value",
      );
      return false;
    }
  };
  $(".settings-form", d.el).onchange = handleChange;
  // Write a value into a named field and save it as if the user had edited it.
  const commitField = (name, value) => {
    const el = $(`[name="${name}"]`, d.el);
    el.value = value;
    return handleChange({ target: el, fromEditor: true });
  };

  // ----- Keyboard shortcuts: record a combination instead of writing JSON.
  const effectiveShortcuts = () => ({
    ...shortcutDefaults,
    ...(settings.shortcuts || {}),
  });
  const shortcutStatus = (text) => {
    $("#shortcut-status", d.el).textContent = text;
  };
  const renderShortcuts = () => {
    const list = $("#shortcut-list", d.el);
    if (!list) return;
    const filter = $("#shortcut-filter", d.el).value.trim().toLowerCase();
    const bindings = effectiveShortcuts();
    list.replaceChildren(
      ...commandEntries()
        .filter(
          (command) =>
            !filter ||
            command.label.toLowerCase().includes(filter) ||
            command.id.toLowerCase().includes(filter) ||
            formatShortcut(bindings[command.id]).toLowerCase().includes(filter),
        )
        .map((command) => {
          const row = document.createElement("div");
          row.className = "shortcut-row";
          row.setAttribute("role", "listitem");
          const name = document.createElement("span");
          name.textContent = command.label;
          const key = document.createElement("button");
          key.type = "button";
          key.className = "shortcut-key";
          key.dataset.shortcutFor = command.id;
          const custom = Object.hasOwn(settings.shortcuts || {}, command.id);
          key.classList.toggle("custom", custom);
          key.textContent =
            formatShortcut(bindings[command.id]) || t("未设置", "Not set");
          key.setAttribute(
            "aria-label",
            `${command.label}: ${key.textContent}. ${t("点击后按下新的快捷键", "Click, then press new keys")}`,
          );
          key.onclick = () => record(key, command);
          row.append(name, key);
          if (custom) {
            const reset = document.createElement("button");
            reset.type = "button";
            reset.className = "shortcut-reset";
            reset.textContent = t("恢复默认", "Default");
            reset.onclick = () => saveShortcut(command, null);
            row.append(reset);
          }
          return row;
        }),
    );
  };
  const saveShortcut = async (command, binding) => {
    const next = { ...(settings.shortcuts || {}) };
    if (binding) next[command.id] = binding;
    else delete next[command.id];
    const saved = await commitField("shortcuts", JSON.stringify(next, null, 2));
    if (!d.el.isConnected) return;
    shortcutStatus(
      saved
        ? binding
          ? t(
              `${command.label} 已设为 ${formatShortcut(binding)}`,
              `${command.label} is now ${formatShortcut(binding)}`,
            )
          : t(
              `${command.label} 已恢复默认`,
              `${command.label} restored to its default`,
            )
        : t("快捷键未保存", "Shortcut not saved"),
    );
    renderShortcuts();
    $(`[data-shortcut-for="${command.id}"]`, d.el)?.focus();
  };
  const record = (button, command) => {
    if (button.classList.contains("recording")) return;
    const previous = button.textContent;
    button.classList.add("recording");
    button.textContent = t("请按下快捷键…", "Press keys…");
    shortcutStatus(
      t(
        "按下新的组合键；Backspace 恢复默认，Esc 取消。",
        "Press the new combination; Backspace restores the default, Esc cancels.",
      ),
    );
    const stop = () => {
      button.classList.remove("recording");
      button.removeEventListener("keydown", onKey, true);
      button.removeEventListener("blur", onBlur);
    };
    const onBlur = () => {
      stop();
      button.textContent = previous;
    };
    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === "Escape" || event.key === "Tab") {
        onBlur();
        shortcutStatus("");
        return;
      }
      if (
        ["Backspace", "Delete"].includes(event.key) &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        stop();
        void saveShortcut(command, null);
        return;
      }
      const binding = bindingFromEvent(event);
      if (binding === undefined) return;
      if (!binding) {
        shortcutStatus(
          t(
            "请使用 Ctrl、Alt 组合键或 F1–F24（Shift 不能单独与符号键组合）。",
            "Use Ctrl or Alt with a key, or F1–F24. Shift with a symbol key is not supported.",
          ),
        );
        return;
      }
      const normalized = normalizeShortcut(binding);
      const owner = commandEntries().find(
        (other) =>
          other.id !== command.id &&
          normalizeShortcut(effectiveShortcuts()[other.id] || "") ===
            normalized,
      );
      if (owner) {
        shortcutStatus(
          t(
            `${formatShortcut(binding)} 已被“${owner.label}”使用，请先修改它。`,
            `${formatShortcut(binding)} is already used by “${owner.label}”. Change that one first.`,
          ),
        );
        return;
      }
      stop();
      void saveShortcut(command, binding);
    };
    button.addEventListener("keydown", onKey, true);
    button.addEventListener("blur", onBlur);
  };
  $("#shortcut-filter", d.el).oninput = renderShortcuts;
  renderShortcuts();

  // ----- Text snippets: editable name and text rows.
  const snippetStatus = (text) => {
    $("#snippet-status", d.el).textContent = text;
  };
  const renderSnippets = (
    entries = Object.entries(settings.snippets || {}),
  ) => {
    const editor = $("#snippet-editor", d.el);
    if (!editor) return;
    editor.replaceChildren(
      ...entries.map(([name, text]) => {
        const row = document.createElement("div");
        row.className = "snippet-row";
        const nameInput = document.createElement("input");
        nameInput.className = "snippet-name";
        nameInput.value = name;
        nameInput.placeholder = t("名称", "Name");
        nameInput.setAttribute("aria-label", t("片段名称", "Snippet name"));
        const textInput = document.createElement("textarea");
        textInput.className = "snippet-text";
        textInput.rows = 2;
        textInput.spellcheck = false;
        textInput.value = text;
        textInput.placeholder = t("插入的内容", "Text to insert");
        textInput.setAttribute("aria-label", t("片段内容", "Snippet text"));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "snippet-remove";
        remove.textContent = t("删除", "Delete");
        remove.onclick = () => {
          row.remove();
          void saveSnippets();
        };
        row.append(nameInput, textInput, remove);
        return row;
      }),
    );
  };
  const saveSnippets = async () => {
    const rows = $$(".snippet-row", d.el).map((row) => [
      $(".snippet-name", row).value.trim(),
      $(".snippet-text", row).value,
    ]);
    const complete = rows.filter(([name]) => name);
    const names = complete.map(([name]) => name);
    if (names.some((name) => /\s/.test(name))) {
      snippetStatus(
        t("片段名称不能包含空格", "Snippet names cannot contain spaces"),
      );
      return;
    }
    if (new Set(names).size !== names.length) {
      snippetStatus(t("片段名称不能重复", "Snippet names must be unique"));
      return;
    }
    const saved = await commitField(
      "snippets",
      JSON.stringify(Object.fromEntries(complete), null, 2),
    );
    if (d.el.isConnected)
      snippetStatus(saved ? t("片段已保存", "Snippets saved") : "");
  };
  $("#snippet-editor", d.el).addEventListener("change", (event) => {
    event.stopPropagation();
    void saveSnippets();
  });
  $("#add-snippet", d.el).onclick = () => {
    renderSnippets([...Object.entries(settings.snippets || {}), ["", ""]]);
    $$(".snippet-name", d.el).at(-1)?.focus();
  };
  renderSnippets();

  // ----- Typography: font presets and sliders that preview while dragging.
  const syncFontPreset = () => {
    const value = $('[name="fontFamily"]', d.el).value.trim();
    const preset = fontPresets.find(([, , , css]) => css === value);
    $("#font-preset", d.el).value = preset ? preset[0] : "custom";
  };
  $("#font-preset", d.el).onchange = (event) => {
    event.stopPropagation();
    const preset = fontPresets.find(([id]) => id === event.target.value);
    if (preset) void commitField("fontFamily", preset[3]);
    else $('[name="fontFamily"]', d.el).focus();
  };
  syncFontPreset();
  const sliders = {};
  for (const name of ["fontSize", "lineHeight", "contentWidth"]) {
    const number = $(`[name="${name}"]`, d.el);
    if (!number) continue;
    const range = document.createElement("input");
    range.type = "range";
    range.min = number.min;
    range.max = number.max;
    range.step = number.step || "1";
    range.value = number.value;
    range.className = "setting-slider";
    range.setAttribute(
      "aria-label",
      number.closest("label").firstChild.textContent,
    );
    let timer;
    range.addEventListener("input", (event) => {
      event.stopPropagation();
      number.value = range.value;
      clearTimeout(timer);
      timer = setTimeout(() => void handleChange({ target: number }), 120);
    });
    range.addEventListener("change", (event) => event.stopPropagation());
    number.after(range);
    number.closest("label").classList.add("setting-row-slider");
    sliders[name] = range;
  }
  const syncSlider = (name) => {
    if (sliders[name]) sliders[name].value = $(`[name="${name}"]`, d.el).value;
  };

  $("#check-updates-now", d.el).onclick = () => void options.checkUpdates?.();
  $("#check-updates-now", d.el).hidden =
    typeof options.checkUpdates !== "function";

  // ----- Pandoc: choose the executable with a file dialog.
  $("#browse-pandoc", d.el).onclick = async () => {
    try {
      const path = await invoke("pickPath", {
        title: t("选择 Pandoc 程序", "Choose the Pandoc program"),
        // Linux executables have no extension, so only Windows filters by .exe.
        filters: [
          ...(/Windows/.test(navigator.userAgent)
            ? [{ name: "Pandoc", extensions: ["exe"] }]
            : []),
          { name: t("全部文件", "All files"), extensions: ["*"] },
        ],
      });
      if (!path || !d.el.isConnected) return;
      if (await commitField("pandocPath", path))
        $("#detect-tools", d.el).click();
    } catch (error) {
      toast(error.message, true);
    }
  };
  const refreshSpellcheckStatus = async () => {
    try {
      const status = await invoke("spellcheckStatus");
      if (!d.el.isConnected) return;
      $("#spellcheck-status", d.el).textContent = status.available
        ? t("本机词典：", "Offline dictionaries: ") +
          status.languages.join(", ") +
          t(
            "。不会联网下载词典。",
            ". Dictionaries are never downloaded from the internet.",
          )
        : status.initializing
          ? t("正在加载本机词典。", "Loading the local dictionary.")
          : t(
              "没有可用的本机词典，拼写检查暂不可用。",
              "No local dictionary is available. Spellcheck is unavailable.",
            ) + (status.error ? " " + status.error : "");
    } catch (error) {
      const element = $("#spellcheck-status", d.el);
      if (element) element.textContent = displayError(error);
    }
  };
  refreshSpellcheckStatus();
  let defaultAppRefresh;
  const refreshDefaultApp = () => {
    if (defaultAppRefresh || !d.el.isConnected) return defaultAppRefresh;
    defaultAppRefresh = (async () => {
      const button = $("#set-default-markdown", d.el);
      const status = $("#default-app-status", d.el);
      try {
        const info = await invoke("getDefaultAppInfo");
        if (!d.el.isConnected) return;
        button.disabled = !info?.supported;
        if (!info?.supported) {
          status.textContent = t(
            "此入口适用于 Windows。",
            "This action is available on Windows.",
          );
        } else if (info.error) {
          status.textContent = t(
            "暂时无法查询默认应用，仍可打开 Windows 设置。",
            "The current default could not be checked. You can still open Windows Settings.",
          );
        } else if (info.requiresInstallation) {
          status.textContent = t(
            "请先安装 Inkstone，使它出现在系统的默认应用和打开方式列表中。",
            "Install Inkstone first so it appears in Default apps and Open with.",
          );
        } else {
          status.textContent = info.currentDefault?.name
            ? t("当前默认：", "Current default: ") + info.currentDefault.name
            : t(
                "Windows 尚未提供可确认的默认应用。",
                "Windows did not report a confirmed default app.",
              );
        }
      } catch (error) {
        if (d.el.isConnected) {
          status.textContent = displayError(error);
          button.disabled = true;
        }
      } finally {
        defaultAppRefresh = null;
      }
    })();
    return defaultAppRefresh;
  };
  refreshDefaultApp();
  window.addEventListener("focus", refreshDefaultApp);
  d.el.addEventListener(
    "close",
    () => window.removeEventListener("focus", refreshDefaultApp),
    { once: true },
  );
  $("#set-default-markdown", d.el).onclick = async () => {
    const button = $("#set-default-markdown", d.el);
    button.disabled = true;
    try {
      const result = await invoke("openDefaultApps");
      if (!result?.opened)
        throw Error(
          t(
            "Windows 默认应用设置不可用。",
            "Windows Default apps is unavailable.",
          ),
        );
      $("#default-app-status", d.el).textContent = t(
        result.requiresInstallation
          ? "已打开 Windows 设置。请先安装 Inkstone，使它出现在默认应用列表中。"
          : "请在 Windows 设置中选择 Inkstone；返回后将更新默认应用状态。",
        result.requiresInstallation
          ? "Windows Settings is open. Install Inkstone first so it appears in Default apps."
          : "Choose Inkstone in Windows Settings. The status refreshes when you return.",
      );
    } catch (error) {
      toast(error.message, true);
    } finally {
      if (d.el.isConnected) button.disabled = false;
    }
  };
  $("#detect-tools", d.el).onclick = async () => {
    const button = $("#detect-tools", d.el),
      result = $("#tool-results", d.el);
    button.disabled = true;
    result.textContent = t("正在检测本机工具…", "Checking local tools…");
    try {
      const tools = await invoke("detectTools");
      result.textContent = Object.entries(tools)
        .map(
          ([name, tool]) =>
            `${name === "pandoc" ? "Pandoc" : name}: ${tool.available ? t("可用", "Available") : t("未找到", "Not found")}\n${[
              tool.path,
              tool.version,
              tool.error,
              tool.inputFormats?.length
                ? t("导入格式：", "Input formats: ") +
                  tool.inputFormats.join(", ")
                : "",
              tool.outputFormats?.length
                ? t("导出格式：", "Output formats: ") +
                  tool.outputFormats.join(", ")
                : "",
            ]
              .filter(Boolean)
              .join("\n")}`,
        )
        .join("\n\n");
    } catch (e) {
      result.textContent = displayError(e);
      toast(e.message, true);
    } finally {
      button.disabled = false;
    }
  };
  $("#import-theme", d.el).onclick = async () => {
    try {
      const path = await invoke("pickPath", {
        title: t("导入 CSS 主题", "Import CSS theme"),
        filters: [{ name: "CSS", extensions: ["css"] }],
      });
      if (!path) return;
      const data = await invoke("readAsset", { path });
      const bytes = Uint8Array.from(atob(data.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      let css = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      css = css.replace(
        /url\(["']?([^"')]+)["']?\)/g,
        (_, url) => 'url("' + resolveAsset(url, path) + '")',
      );
      await apply({ customCSS: css });
      settings = { ...settings, customCSS: css };
      if (!d.el.isConnected) return;
      $('textarea[name="customCSS"]', d.el).value = css;
      toast(t("CSS 主题已应用", "CSS theme applied"));
    } catch (e) {
      toast(e.message, true);
    }
  };
  const refreshThemes = () => {
    $("#saved-themes", d.el).innerHTML =
      '<option value="">' +
      t("选择已保存主题", "Select saved theme") +
      "</option>" +
      Object.keys(settings.themeLibrary || {})
        .map(
          (name) =>
            '<option value="' +
            esc(name) +
            '"' +
            (settings.activeThemeName === name ? " selected" : "") +
            ">" +
            esc(name) +
            "</option>",
        )
        .join("");
  };
  refreshThemes();
  $("#saved-themes", d.el).onchange = async (event) => {
    try {
      const name = event.target.value;
      if (!Object.hasOwn(settings.themeLibrary || {}, name)) return;
      const patch = {
        customCSS: settings.themeLibrary[name],
        activeThemeName: name,
      };
      await apply(patch);
      settings = { ...settings, ...patch };
      $('textarea[name="customCSS"]', d.el).value = patch.customCSS;
    } catch (error) {
      toast(error.message, true);
    }
  };
  $("#save-theme", d.el).onclick = async () => {
    try {
      const name = (
        await promptText(
          t("保存主题", "Save theme"),
          t("主题名称", "Theme name"),
          settings.activeThemeName || "My theme",
        )
      )?.trim();
      if (!name) return;
      if (
        Object.hasOwn(settings.themeLibrary || {}, name) &&
        !(await ask(t("替换主题？", "Replace theme?"), name, [
          { label: t("替换", "Replace"), value: true },
          { label: t("取消", "Cancel"), value: false },
        ]))
      )
        return;
      const patch = {
        themeLibrary: {
          ...settings.themeLibrary,
          [name]: $('textarea[name="customCSS"]', d.el).value,
        },
        activeThemeName: name,
      };
      await apply(patch);
      settings = { ...settings, ...patch };
      refreshThemes();
    } catch (error) {
      toast(error.message, true);
    }
  };
  $("#delete-theme", d.el).onclick = async () => {
    try {
      const name = $("#saved-themes", d.el).value;
      if (
        !name ||
        !(await ask(t("删除已保存主题？", "Delete saved theme?"), name, [
          { label: t("删除", "Delete"), value: true },
          { label: t("取消", "Cancel"), value: false },
        ]))
      )
        return;
      const library = { ...settings.themeLibrary };
      delete library[name];
      const patch = { themeLibrary: library, activeThemeName: "" };
      await apply(patch);
      settings = { ...settings, ...patch };
      refreshThemes();
    } catch (error) {
      toast(error.message, true);
    }
  };
  $("#copy-theme", d.el).onclick = async () => {
    try {
      await invoke("writeClipboard", {
        text: $('textarea[name="customCSS"]', d.el).value,
      });
      toast(t("CSS 已复制", "CSS copied"));
    } catch (e) {
      toast(e.message, true);
    }
  };
  $("#settings-done", d.el).onclick = d.close;
  const initialTab =
    tabs.find((tab) => tab.dataset.section === section) || tabs[0];
  activateTab(initialTab);
  (focus ? d.el.querySelector(`[name="${focus}"]`) : initialTab)?.focus();
  const languageChanged = (event) => {
    if (!d.el.isConnected || event.detail.locale === settings.locale) return;
    const activeSection = d.el.querySelector("[data-section].active")?.dataset
      .section;
    const activeName = d.el.contains(document.activeElement)
      ? document.activeElement.name
      : null;
    d.close();
    showPreferences({ ...settings, ...event.detail }, apply, invoke, {
      ...options,
      section: activeSection,
      focus: activeName,
    });
  };
  document.addEventListener("inkstone:locale-change", languageChanged);
  d.el.addEventListener(
    "close",
    () =>
      document.removeEventListener("inkstone:locale-change", languageChanged),
    { once: true },
  );
  return d;
}
