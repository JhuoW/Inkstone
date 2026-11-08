import { $, $$, esc, modal, toast, promptText, ask } from "./ui.js";
import { resolveAsset } from "./markdown.js";

export const defaults = {
  locale: "en",
  firstRunComplete: false,
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
export function showPreferences(
  settings,
  apply,
  invoke,
  { section = "writing", focus } = {},
) {
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
    ["advanced", t("自定义", "Customize")],
  ];
  const panes = {
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
        field(
          "fontFamily",
          t("正文字体（CSS font-family）", "Font family (CSS)"),
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
        hint(
          t(
            "Pandoc 是本地文档转换程序，核心编辑和原生导出无需安装。",
            "Pandoc converts documents locally. Core editing and native exports work without it.",
          ),
        ) +
        `<button type="button" id="detect-tools">${t("检测外部工具", "Check tools")}</button><pre id="tool-results" role="status" aria-live="polite"></pre>`,
    ),
    advanced:
      group(
        t("文本片段", "Text snippets"),
        hint(
          t(
            "在命令面板中插入片段。以 JSON 对象配置片段名称与内容。",
            "Insert snippets from the command palette. Use a JSON object of snippet names and text.",
          ),
        ) +
          `<label class="setting-stack"><span>${t("文本片段 JSON", "Text snippets JSON")}</span><textarea name="snippets" rows="7" spellcheck="false" autocomplete="off">${esc(JSON.stringify(settings.snippets, null, 2))}</textarea></label>`,
      ) +
      group(
        t("键盘快捷键", "Keyboard shortcuts"),
        `<label class="setting-stack"><span>${t('快捷键 JSON，如 {"bold":"Mod-b"}', 'Shortcuts JSON, e.g. {"bold":"Mod-b"}')}</span><textarea name="shortcuts" rows="7" spellcheck="false" autocomplete="off">${esc(JSON.stringify(settings.shortcuts, null, 2))}</textarea></label>` +
          hint(
            t(
              "Mod 表示 Ctrl。可组合 Shift 和 Alt。",
              "Mod means Ctrl. Combine with Shift and Alt.",
            ) +
              "<br>bold, italic, save, open, quickOpen, source, focus, typewriter, settings, export, find",
          ),
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
  $(".settings-form", d.el).onchange = async (e) => {
    const el = e.target,
      key = el.name;
    if (!key) return;
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
      if (!d.el.isConnected) return;
      if (key === "spellcheck") await refreshSpellcheckStatus();
      $("#settings-result", d.el).textContent = t("已保存", "Saved");
    } catch (err) {
      if (!d.el.isConnected) return;
      el.setAttribute("aria-invalid", "true");
      const error = document.createElement("small");
      error.className = "setting-error";
      error.id = `settings-error-${key}`;
      error.textContent = err.message;
      el.setAttribute("aria-describedby", error.id);
      el.closest("label")?.append(error);
      toast(err.message, true);
      $("#settings-result", d.el).textContent = t(
        "设置未保存，请修正",
        "Not saved; correct the value",
      );
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
      if (element) element.textContent = error.message;
    }
  };
  refreshSpellcheckStatus();
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
      result.textContent = e.message;
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
