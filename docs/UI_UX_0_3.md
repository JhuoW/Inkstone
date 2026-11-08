# Inkstone 0.3：界面、语言与安装体验

本轮保持用户提供的标志、图标和 Ink/Paper/Stone/Vermilion 品牌色，只调整应用布局、文字、控件与交互。Windows 为主平台，Linux 为附加平台；没有重新引入已退役的平台或联网服务。

## 可见变化

- 新用户默认英语，首次启动有不阻断写作的语言提示条，可选择 English 或简体中文；之后可在 Preferences → Writing 中立即切换。已有合法语言设置优先保留，不被安装选择覆盖。
- 界面使用 Segoe UI / Noto Sans 等本机无衬线字体；新用户正文为17px、1.75行距、780px内容宽度。已有字体设置不重置。代码字体采用 Cascadia Code / Consolas / Liberation Mono 回退。
- 顶部工具、文件树、状态栏及表单采用一致的间距、焦点边框与按钮尺寸。窄窗口保留格式命令，横向滚动访问，不隐藏尾部按钮；只显示一个完整原版品牌字标。
- 设置内容独立滚动，完成按钮始终位于滚动区外。导出仅显示当前格式相关选项，状态与操作按钮保持可见。表格操作按行、列和对齐分组，不可执行的动作禁用。
- 图片资源对话框显示选择数量、全选和空状态。准备阶段取消会撤销待执行事务；提交和导出期间锁住参数与关闭操作，避免重复执行或在结果未知时误退出。
- 保存询问默认聚焦主要动作；Enter执行该动作，Escape、关闭按钮与对话框外点击返回取消。点击对话框内留白不会取消。取消不会将编辑器置于丢失焦点的状态。
- 通知支持屏幕阅读状态、键盘关闭和文字安全呈现。首次发现恢复草稿显示紧凑提示条，避免启动时自动弹窗抢走正在输入的光标。
- 公式直接在原编辑区重编辑，旁边实时预览；单击/双击可进入精确TeX位置，双击选择公式内容，Ctrl+Enter结束编辑。公式错误可修正、撤销，模式切换保留原文和选区。详细测试独立记录，不由普通UI截图推断编辑正确。

## Windows安装语言与首次启动

NSIS安装程序配置为 English（1033）与简体中文（2052），显示语言选择，默认英语。`build/installer.nsh` 在安装文件就位后，将所选语言写为安装目录 `resources/installer-locale.json`，内容仅为 `{"locale":"en"}` 或 `{"locale":"zh-CN"}`。临时文件写完关闭后再替换正式文件，失败有对应语言提示。

应用只在没有已保存合法语言设置时读取此种子。新用户如果不经过NSIS，例如Windows ZIP或Linux AppImage/deb/tar.gz，默认英语并使用首次启动提示条选择语言。**Linux系统包管理器没有本应用可控制的NSIS语言页面**；不能声称deb或AppImage安装阶段提供了同样的选择器。

操作系统提供的文件选择器取消按钮、系统覆盖提示等遵循系统语言。应用控制的标题、说明、主要动作、原生菜单与右键菜单按应用语言设置；Electron不能逐个改写操作系统生成的所有控件。

语言种子测试使用同一个NSIS hook编译实际可执行夹具并在Wine执行，验证英语默认值、两种JSON及临时文件移除；**不等同于完整安装器界面或Windows实机安装验收**。完整发行包应按下列步骤另验：

1. 在无旧设置的Windows测试用户下运行NSIS，确认默认English，可切换简体中文，安装步骤为所选语言。
2. 安装完成打开应用，确认界面继承所选语言；退出重开仍保持。
3. 在应用内切换另一种语言，再升级安装并选择原语言；确认既有应用设置不被覆盖。
4. 测试取消安装、静默安装和非ASCII安装路径；安装失败不得声称已完成。
5. ZIP和Linux各包首次打开默认English，语言提示条可切换并完成，后续启动不再打扰。

## 可复跑证据

```bash
npm run test:ui
npm run test:math
# 需要本机NSIS编译器；Linux另需可工作的Wine/WoW64
INKSTONE_MAKENSIS=/path/to/makensis \
INKSTONE_WINE=/path/to/wine \
INKSTONE_WINEPREFIX=/path/to/initialized-prefix \
npm run verify:installer-language
```

Windows直接执行 `npm run verify:installer-language`；找不到编译器时设置 `INKSTONE_MAKENSIS`，不会自动下载工具。上述脚本仅写开发临时目录，不安装Inkstone应用。

- [UI实际浏览器记录](../artifacts/ui-polish-validation/results.json)：9组，包括Enter/取消/焦点、busy与组合输入保护、双语prompt、通知、表格局部源文/只读Apply保护、资源取消、格式相关导出字段、设置滚动区及中英明暗/800px窗口。桌面IPC在这组中显式模拟，不据此宣称文件或系统能力通过。
- [公式编辑记录](../artifacts/math-editing-validation/results.json)：实际浏览器点击、键盘、TeX/MathJax、撤销、跨块选择和模式行为；CDP组合输入与真正系统IME证据分别记录。
- [安装hook记录](../artifacts/installer-language-validation/results.json)：真实NSIS编译与Wine执行，范围仅限hook。
- [原生菜单语言记录](../artifacts/backend-validation/native-language-validation.json)：真实Electron应用定义菜单与对话框语言，不能外推Windows系统组件。

本轮统一回归90项单测、21组核心浏览器、10组公式、9组UI及67组Electron全部通过；[真实桌面流程](../tests/ux.spec.js)另外覆盖首次英语/语言切换、关闭保存/不保存/取消、多窗口退出、异步保存与导航输入保护。真实IBus仓颉还验证候选输入期间切换模式、关闭取消、表格候选与保存后真正退出，见[系统IME记录](../artifacts/os-ime-validation/result.json)。

本轮UI截图已逐一检查设置、导出及窄窗口；布局证据不代表满足完整WCAG认证。真实屏幕阅读器、高对比度、触控、多屏DPI、Windows实机安装/升级/卸载与操作系统原生控件仍需对应环境验收。

## 官方参考与差异

Typora [1.14更新](https://support.typora.io/What's-New-1.14/)描述浮动工具栏和侧栏过滤/键盘改进；[快捷键](https://support.typora.io/Shortcut-Keys/)与[专注/打字机模式](https://support.typora.io/Focus-and-Typewriter-Mode/)用于核对可发现性和写作行为。本轮使用独立界面与原提供品牌，并不宣称逐像素或所有精细交互等同Typora。

安装配置对照 [electron-builder NSIS](https://www.electron.build/nsis/)及 [NSIS Modern UI 2](https://nsis.sourceforge.io/Docs/Modern%20UI%202/Readme.html)。同时核对锁定构建器本地模板中 `preInit`、`MUI_LANGDLL_DISPLAY` 与 `customInstall` 的实际执行位置；NSIS夹具进一步验证生成的语言JSON字节。

## 完整NSIS安装器的Wine界面检查

生成当前版本Windows安装程序后，可执行 `node scripts/verify-installer-ui.mjs`。脚本要求Linux、可用Wine/Winegcc及系统C编译器、已初始化的Wine前缀、Xvfb、xdotool与Python/Pillow，不自动下载任何工具。可用 `INKSTONE_WINE`、`INKSTONE_WINEGCC`、`INKSTONE_WINEPREFIX`、`INKSTONE_XVFB`、`INKSTONE_XDOTOOL` 指定本地路径，`INKSTONE_INSTALLER` 指定当前版本安装文件。

它在独立X显示（默认`:95`，可用`INKSTONE_INSTALLER_DISPLAY`覆盖）和复制的临时Wine前缀中运行。先校验实际PE产品/版本，再用真实XTest键鼠检查两个语言选项、默认英语与选定后的首个安装页面，截图及只读Win32控件文字写入 `artifacts/windows-installer-ui/`。构建器默认首屏是“安装选项”，不会把它伪称额外存在的欢迎页。脚本只点击语言确认与取消，不点击Next/Install，且检查指定目标没有应用EXE/ASAR；不会绕过安装器进程检查。

只读辅助程序源码在 `scripts/helpers/windows-ui-probe.c`，使用微软文档的 [EnumChildWindows](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumchildwindows)、[WM_GETTEXT](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-gettext) 和 [CB_GETLBTEXT](https://learn.microsoft.com/en-us/windows/win32/controls/cb-getlbtext) 读取真实控件，组合框先获取长度再分配缓冲区。它不设置语言或伪造页面文字，语言选择由XTest按键完成。

检查失败保存控件树、截图和原因，并返回非零退出状态。Wine结果仍不是Windows原生安装、升级、卸载或文件关联验收；最终结果需以当前版本实际执行记录为准。


本轮完整安装器已在Wine执行两次：实际语言列表为English与中文(简体)，默认English；XTest分别选择后进入对应语言的“安装选项”页，按钮与文案按语言变化，随后取消，未执行安装。控件树和[结果](../artifacts/windows-installer-ui/results.json)与[人工截图检查](../artifacts/windows-installer-ui/visual-review.json)分别记录。

原始Wine工具前缀没有可用的中文对话框字体回退，最初截图为方框；自动化文字检查不能证明字形可见。脚本现仅在复制的临时前缀内使用本机已有Noto Sans CJK SC，并配置对话框字体别名，之后中文首屏与选项实际截图可读。可用 `INKSTONE_WINE_CJK_FONT` / `INKSTONE_WINE_CJK_FAMILY` 指定本地字体；不下载字体、不改安装器、不把测试字体打进应用。报告记录字体来源与SHA。此结果仍限Wine及该字体环境，Windows实际字体/DPI需另验。
