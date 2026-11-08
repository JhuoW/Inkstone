# Inkstone 墨石

**0.4.0：Windows 为主平台，同时提供 Linux 版本。** 墨石使用本地 Markdown 文件、恢复草稿和历史记录，保留原文作为编辑数据源；普通段落/标题的常用行内语法按光标显隐，正文表格可直接编辑，源码模式保持选区与撤销历史。

0.4统一桌面设计系统、工具图标、紧凑导航、命令菜单、明暗排版和任务对话框，保留所有既有操作与设置。改版前后截图与实现说明见[0.4 UI/UX升级](docs/UI_REDESIGN_0_4.md)，功能清单与保留检查见[回归基线](docs/UI_FUNCTION_BASELINE.md)。

本版采用用户提供的 `inkstone-brand` 标志、图标和品牌色，来源与接线见[品牌说明](docs/BRANDING.md)。没有把 Typora 的代码、图标或主题纳入应用。

按最新产品范围，**不提供账号、云同步、图片上传或上传器集成；不支持 macOS**。这些不是待补功能。Windows/Linux 本地编辑能力继续对照官方资料，尚存的交互差距与验证范围见[功能矩阵](FEATURE_PARITY.md)。旧版发行文件不代替0.4.0交付。

## 安装与启动

从源码运行需要 **Node.js 22.12+** 和 npm。首次取得开发依赖、Electron与构建工具需要网络；安装后的本地编辑、数学、图表与原生导出不需要这些开发工具。

```bash
npm ci
npm start
```

`npm start` 构建后启动真实 Electron 应用，清除继承的 `ELECTRON_RUN_AS_NODE`。`npm run dev` 仅用于前端调试，没有本地文件桥接。启动脚本和应用扩展仅接受 Windows/Linux。

Windows x64已生成NSIS安装程序与ZIP便携包，分别为 `Inkstone-0.4.0-windows-x64.exe`、`Inkstone-0.4.0-windows-x64.zip`；ZIP解压后运行 `Inkstone.exe`。Linux x64的AppImage、deb、tar.gz均已提取实际运行，测试模式（--no-sandbox）、编辑/保存及原图标通过。Windows最终EXE/NSIS与ZIP静态检查、Wine中英选择器与首屏检查通过；后者使用临时Wine前缀的本机CJK测试字体，未安装应用，不代表Windows原生运行。实际生成文件、大小、签名和验收边界以[交付记录](docs/DELIVERY.md)为准；跨平台生成EXE并不证明已在Windows运行。

```bash
# Linux AppImage
chmod +x release/Inkstone-0.4.0.AppImage
./release/Inkstone-0.4.0.AppImage

# Debian/Ubuntu
sudo apt install ./release/inkstone-editor_0.4.0_amd64.deb
```

Linux需要图形会话与GTK/NSS/ATK/GBM等Electron系统库。开发环境没有Node时，可运行 `bash scripts/bootstrap-dev.sh`，从Node官方源取得22版并核对SHA-256。已有本仓库本地工具时，可用 `export PATH="$PWD/.tools/node/bin:$PATH"`。Windows请安装Node.js；源码归档不依赖 `.tools` 缓存。Linux交叉生成Windows安装程序还需能执行32位NSIS工具的Wine（含WoW64）；可使用 `USE_SYSTEM_WINE=true` 配合有效Wine的PATH。原生Windows构建不需要Wine，Wine不随应用分发。

新用户默认英语。Windows NSIS提供English/简体中文安装选择，并将选择传给无既有语言设置的首次启动；ZIP和Linux在首次启动提示条选择语言。已有偏好优先保留，之后可在Preferences → Writing切换。Linux系统包管理器没有NSIS语言页面，系统文件选择器自身控件遵循系统语言。[界面和安装说明](docs/UI_UX_0_3.md)。

## 在 Windows 克隆并继续开发

在 Windows 本机安装 Git 和 Node.js 22.12+，使用 PowerShell：

```powershell
git clone https://github.com/JhuoW/Inkstone.git
cd Inkstone
npm.cmd ci
npm.cmd start
```

依赖应在 Windows 上重新安装，不复制 Linux 的 `node_modules` 或 `.tools`。仓库通过 `.gitattributes` 固定源码换行，同时保留测试文稿、词典和许可证的原始字节。安装包不放入 Git 历史；需要时在本机生成：

```powershell
git switch -c windows-validation
npm.cmd run dist:win
Remove-Item Env:INKSTONE_TEST_NO_SANDBOX -ErrorAction SilentlyContinue
$env:INKSTONE_EXECUTABLE = "$PWD\release\win-unpacked\Inkstone.exe"
npm.cmd run test:native
```

原生报告写入 `artifacts\native-validation\win32\`。自动化以临时文稿和独立配置运行，真实微软拼音、系统DPI、安装/关联/卸载仍需桌面操作验证。开发过程中按具体改动运行相应测试；`test:all`中的完整集成用例当前以Linux验收为基线，不能假定全部用例已经适配Windows。

确认修改后提交到自己的工作分支，再推送：

```powershell
git add src electron tests docs
git commit -m "Fix Windows native validation issues"
git push -u origin windows-validation
```

## 日常使用

1. 打开本地文稿或文件夹，用文件树、列表、大纲、快速打开和本地全文搜索导航。
2. 同区写作；`Ctrl+/`切换源码，`Ctrl+S`保存。表格中点击单元格编辑，Tab/Shift+Tab导航；点击公式在正文中编辑TeX并实时预览，双击选择公式内容，Ctrl+Enter结束。
3. 顶部工具、右键和命令面板提供格式、图片、数学、表格、导出、历史及恢复草稿。
4. 自动保存需在偏好设置中开启。外部修改有冲突时，先比较或另存；不会把未保存文字静默覆盖。关闭脏文档会明确询问Save / Don’t Save / Cancel；取消或保存失败保持窗口与内容，多窗口退出在全部确认后才提交。
5. 图片选择、拖放、剪贴板和资源管理只处理本地文件；明确选择下载现有文稿的远程图片时会读取该地址，不发送文稿或图片到服务端。

文稿本身引用的HTTP(S)图片、远程媒体/嵌入及用户打开外部链接仍可能访问对应地址。它们是文稿资源读取，不是同步服务；“本地优先”不表示远程内容会在离线状态凭空可用。

复制整个 [samples](samples/README.md) 目录后，可用 `acceptance.md` 检查中文、嵌套列表、表格、数学、图表、本地图像、音视频和分页，或打开 `mermaid-catalog.md` 检查25类图表。

## 快捷键

Windows/Linux中`Mod`均为`Ctrl`，自定义键绑定仍可使用`Mod`名称。

| 操作 | 快捷键 |
| --- | --- |
| 新建 / 打开 / 保存 | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| 另存为 | `Ctrl+Shift+S` |
| 快速打开 / 命令面板 | `Ctrl+P` / `Ctrl+Shift+P` |
| 偏好设置 / 源码切换 | `Ctrl+,` / `Ctrl+/` |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z` |
| 查找 / 导出 | `Ctrl+F` / `Ctrl+Shift+E` |
| 粗体 / 斜体 / 链接 | `Ctrl+B` / `Ctrl+I` / `Ctrl+K` |
| 专注 / 打字机 / 全屏 | `F8` / `F9` / `F11` |
| 表格下一格 / 上一格 | `Tab` / `Shift+Tab` |

## 导入导出与本地数据

PDF、带/不带样式HTML、PNG、JPEG使用本机渲染。Word、ODT、RTF、EPUB、LaTeX、Wiki、RST及演示格式通过可选本地Pandoc处理，读写方向分别检测。偏好中可配置Pandoc路径；缺失或转换失败有明确错误，核心编辑不受影响。

```bash
pandoc --version
pandoc --list-input-formats
pandoc --list-output-formats
```

英语拼写随包提供本地词典，不自动从CDN下载；缺少的语言会显示不可用。新用户会话已实测原生建议，Chromium网络记录没有外部HTTP请求。

默认严格UTF-8，另外支持显式选择UTF-16LE/BE、GB18030、Windows-1252、Shift-JIS；不能表示的字符会阻止保存。未编辑保存保持字节和mtime；局部编辑保持未修改的空白、换行、YAML与未知语法。原子写入和外部版本检查的边界见[架构说明](docs/ARCHITECTURE.md)。显式“整理Markdown”属于转换操作，会规范化语法。

文稿、图片、草稿、历史、会话与设置保存在本机。用户数据目录通常为Windows `%APPDATA%/Inkstone`、Linux `~/.config/Inkstone`，以Electron实际路径为准。0.2启动迁移只移除退役设置键，保留文稿、图片、草稿及历史；未知业务内容不按关键词删除。

## 测试、构建与校验

0.4统一回归已通过：**90项单测、21组核心浏览器、10组公式编辑、12组UI、7组编辑视觉、73组Electron**（含新增6组桌面设计交互），共213项/组。品牌6项通过，真实Linux IBus仓颉重新验证了候选期模式切换、关闭取消继续输入/撤销、表格候选关闭和保存后退出。改版前后功能集合完整，15组截图覆盖中英、明暗与缩放。当前环境为Ubuntu x64；Windows原生CI已配置但未执行。详见[验收记录](docs/ACCEPTANCE.md)与[交付边界](docs/DELIVERY.md)。

```bash
npm test
npm run build
npm run test:editor
npm run test:math
npm run test:ui
npm run test:editor-design
npm run test:e2e
npm run test:all
npm run test:native
node scripts/verify-mermaid.mjs
npm run licenses

# Windows为主构建目标；可交叉生成但仍需Windows实际运行
npm run dist:win
npm run verify:windows
# Linux发行件
npm run dist:linux
npm run verify:packages
# 源码归档及当前版本所有产物校验表
npm run package:source
npm run checksums
```

完整Electron回归脚本目前在Linux验收，需要Xvfb与Poppler命令（pdfinfo/pdftotext/pdftoppm）；独立浏览器测试先用 `npx playwright install chromium` 安装浏览器，或通过 `INKSTONE_CHROMIUM` 指定已有程序。Pandoc用例使用 `.tools/pandoc/bin/pandoc`（本轮3.13），缺少时明确跳过，跳过不计为通过；Windows CI另跑单元测试与原生包冒烟。

无显示服务器时，用 `xvfb-run -a` 执行Linux桌面测试。新桌面设计测试、原生冒烟和截图脚本默认显式开启进程沙箱；当前宿主的chrome-sandbox未配置root/setuid，且AppArmor限制非特权user namespace，验证时明确使用 `INKSTONE_TEST_NO_SANDBOX=1`，结果记录为测试绕过。没有修改产品启动参数；旧0.3报告的“正常sandbox”已更正，正常沙箱启动需在具备对应系统条件的主机验收。`test:native`在当前真实宿主验证中文路径、源文保真、编辑/撤销、模式切换、数学/图表及HTML/PDF；指定 `INKSTONE_EXECUTABLE` 可测试实际包内程序。`verify:windows`只读取PE版本与内嵌ICO字节，不能冒充Windows运行。CI分别运行Windows包内程序与Linux测试；不会发布应用到外部服务。

校验下载文件：Linux执行 `cd release && sha256sum -c SHA256SUMS`；Windows可用PowerShell `Get-FileHash 文件路径 -Algorithm SHA256` 对照 [SHA256SUMS](release/SHA256SUMS)。源码归档排除依赖缓存、旧发行件、原品牌素材目录中的无关平台资源，但包含实际使用的品牌副本、原包来源README、测试和当前证据。

## 验收边界

- Windows实机编辑、安装/文件关联/卸载、微软拼音、DPI与系统打印仍需原生验证。本轮Linux IBus仓颉真实XTest路径已通过，不代表其他输入法或Wayland。
- 公式支持正文内精确源码编辑和实时预览；活动列表/引用、图片等细粒度交互仍有差距；正文表格没有完整鼠标矩形选择和行列拖动手柄。
- 数学使用KaTeX与离线MathJax3回退，不能宣称完全等同MathJax4。导出Office/EPUB的复杂排版仍需对应阅读器验收。
- 系统字体、可选Pandoc及其PDF引擎是外部组件。缺少TeX引擎会阻止对应Pandoc PDF导出。

提供Windows/Linux [VS Code/Cursor本地扩展](integrations/vscode/README.md)，从命令或文件右键打开墨石。扩展宿主实际使用另行验收。

应用源码为[MIT](LICENSE)；品牌来源见[BRANDING](docs/BRANDING.md)，随包依赖见 `THIRD_PARTY_NOTICES.md`。electron-builder的部分传递依赖包含其他平台构建工具，仅存在于开发依赖中，不构成本产品的平台支持或云服务能力。

- [0.4专业桌面UI升级与截图对照](docs/UI_REDESIGN_0_4.md)
- [0.3界面与安装语言](docs/UI_UX_0_3.md)
- [交付记录](docs/DELIVERY.md)
- [功能矩阵](FEATURE_PARITY.md)
- [官方研究](docs/REFERENCE_RESEARCH.md)
- [验收步骤](docs/ACCEPTANCE.md)
- [解析策略](docs/MARKDOWN_PARSER_OPTIONS.md)
- [25类图表](docs/MERMAID_CATALOG.md)
