"use strict";
/**
 * The native application menu as an Electron template. Most items send a
 * command to the focused window, which runs it like the command palette; the
 * rest are native roles or the newWindow and quit callbacks. Custom shortcuts
 * replace the default accelerators.
 */
const { nativeAccelerator } = require("./settings-schema.cjs");

function applicationMenu({ locale, shortcuts, sendCommand, newWindow, quit }) {
  const english = locale === "en";
  const label = (zh, en) => (english ? en : zh);
  const action = (text, command, accelerator) => ({
    id: command,
    label: text,
    accelerator: nativeAccelerator(shortcuts?.[command]) || accelerator,
    click: (_item, win) => {
      if (win) sendCommand(win, command);
    },
  });
  const template = [
    {
      label: label("文件", "File"),
      submenu: [
        action(label("新建文稿", "New document"), "new", "Ctrl+N"),
        {
          label: label("新建窗口", "New window"),
          accelerator: "Ctrl+Shift+N",
          click: () => {
            newWindow();
          },
        },
        action(label("打开…", "Open…"), "open", "Ctrl+O"),
        action(
          label("打开文件夹…", "Open folder…"),
          "openFolder",
          "Ctrl+Shift+O",
        ),
        { type: "separator" },
        action(label("保存", "Save"), "save", "Ctrl+S"),
        action(label("另存为…", "Save as…"), "saveAs", "Ctrl+Shift+S"),
        action(label("导入…", "Import…"), "import"),
        action(label("导出…", "Export…"), "export", "Ctrl+Shift+E"),
        action(label("打印…", "Print…"), "print", undefined),
        { type: "separator" },
        { role: "close", label: label("关闭窗口", "Close window") },
        {
          id: "quit",
          label: label("退出", "Quit"),
          accelerator: nativeAccelerator(shortcuts?.quit) || "Ctrl+Q",
          click: () => {
            quit();
          },
        },
      ],
    },
    {
      label: label("编辑", "Edit"),
      submenu: [
        action(label("撤销", "Undo"), "undo", "Ctrl+Z"),
        action(label("重做", "Redo"), "redo", "Ctrl+Shift+Z"),
        { type: "separator" },
        { role: "cut", label: label("剪切", "Cut") },
        { role: "copy", label: label("复制", "Copy") },
        { role: "paste", label: label("粘贴", "Paste") },
        {
          role: "pasteAndMatchStyle",
          label: label("粘贴为纯文本", "Paste as plain text"),
        },
        { role: "selectAll", label: label("全选", "Select all") },
        { type: "separator" },
        action(label("查找 / 替换", "Find / replace"), "find", "Ctrl+F"),
        action(
          label("全局搜索", "Search in folder"),
          "globalSearch",
          "Ctrl+Shift+F",
        ),
      ],
    },
    {
      label: label("段落", "Paragraph"),
      submenu: [
        ...Array.from({ length: 6 }, (_, i) =>
          action(
            label(`${i + 1} 级标题`, `Heading ${i + 1}`),
            `heading${i + 1}`,
            `Ctrl+${i + 1}`,
          ),
        ),
        { type: "separator" },
        action(label("引用", "Quote"), "quote"),
        action(label("无序列表", "Bullet list"), "bullet"),
        action(label("有序列表", "Numbered list"), "ordered"),
        action(label("任务列表", "Task list"), "task"),
        action(label("表格", "Table"), "table"),
        action(label("代码块", "Code fence"), "codeFence"),
        action(label("数学公式", "Math block"), "math"),
      ],
    },
    {
      label: label("格式", "Format"),
      submenu: [
        action(label("粗体", "Bold"), "bold", "Ctrl+B"),
        action(label("斜体", "Italic"), "italic", "Ctrl+I"),
        action(label("删除线", "Strikethrough"), "strike"),
        action(label("高亮", "Highlight"), "highlight"),
        action(label("行内代码", "Inline code"), "code", "Ctrl+Shift+`"),
        action(label("链接", "Link"), "link", "Ctrl+K"),
        action(label("图片…", "Image…"), "insertImage"),
        action(
          label("从 URL 插入图片", "Insert image from URL"),
          "insertImageURL",
        ),
      ],
    },
    {
      label: label("视图", "View"),
      submenu: [
        action(label("源码模式", "Source mode"), "source", "Ctrl+/"),
        action(label("侧边栏", "Sidebar"), "sidebar", "Ctrl+Shift+L"),
        action(label("大纲", "Outline"), "outline"),
        action(label("快速打开", "Quick open"), "quickOpen", "Ctrl+P"),
        action(
          label("命令面板", "Command palette"),
          "commands",
          "Ctrl+Shift+P",
        ),
        action(label("专注模式", "Focus mode"), "focus"),
        action(label("打字机模式", "Typewriter mode"), "typewriter"),
        action(label("沉浸模式", "Immersive mode"), "zen", "Ctrl+Shift+Enter"),
        action(
          label("AI写作助手", "AI Writing Assistant"),
          "aiAssistant",
          "Ctrl+Shift+A",
        ),
        { type: "separator" },
        action(label("重置缩放", "Reset zoom"), "zoomReset", "Ctrl+0"),
        action(label("放大", "Zoom in"), "zoomIn", "Ctrl+Plus"),
        action(label("缩小", "Zoom out"), "zoomOut", "Ctrl+-"),
        {
          role: "togglefullscreen",
          label: label("切换全屏", "Toggle fullscreen"),
        },
      ],
    },
    {
      label: label("工具", "Tools"),
      submenu: [
        action(label("偏好设置…", "Preferences…"), "settings", "Ctrl+,"),
        action(
          label("Markdown 默认打开方式…", "Default Markdown app…"),
          "defaultApps",
        ),
        action(label("版本历史…", "Version history…"), "history"),
        action(label("格式整理", "Format Markdown"), "format"),
        action(label("字数统计", "Statistics"), "statistics"),
        { type: "separator" },
        action(label("检查更新…", "Check for updates…"), "checkUpdates"),
        action(
          label("复制诊断信息", "Copy diagnostic information"),
          "copyDiagnostics",
        ),
        action(label("关于墨石", "About Inkstone"), "about"),
      ],
    },
  ];
  return template;
}

module.exports = { applicationMenu };
