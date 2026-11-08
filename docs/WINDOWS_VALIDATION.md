# Windows 原生验证与修复记录

> 版本归档说明：本记录保留首次执行时的 0.4.0 标签、日志和产物哈希；对应的 Windows 稳定化工作现编号为 0.5.0，重新构建结果见 [0.5.0 基线记录](RELEASE_0_5.md)。当前 0.6.0 功能更新单独记录在 [0.6.0 更新记录](RELEASE_0_6.md)。

日期：2026-11-08。版本：Inkstone 0.4.0。分支：`windows-validation`。

本轮在 Windows x64（系统构建 26200）、Node.js 22.23.4、Electron 45.2.3 上执行。浏览器验证使用 Chromium 158.0.8127.18，可选转换工具为本机 Pandoc 2.12。所有桌面及包内应用测试均使用正常沙箱，未设置 `INKSTONE_TEST_NO_SANDBOX`。

## 修复的产品问题

| 范围 | 修复后的行为 |
| --- | --- |
| 重做快捷键 | 编辑器明确绑定 Windows `Ctrl+Shift+Z`，与菜单及文档一致。 |
| 自定义快捷键 | 统一原生菜单、应用和编辑器的别名、大小写、空格、加减号解析；自定义 Ctrl+Space 优先于编辑器自动补全。拒绝继承属性名等无效绑定。 |
| 行格式命令 | 选区恰好结束于下一行开头时，不再格式化未选中的下一行；反向选区及 CRLF 撤销保真。 |
| 只读表格 | 最后一个单元格按 Tab 不再新增行或改变内容。 |
| 表格解析与导航 | 支持单列表格；缩进、多反引号代码和转义管道不再导致错列、错误光标位置或虚假列。 |
| 表格粘贴与弹窗 | 正文单元格、TSV 粘贴及表格弹窗共用奇偶反斜杠转义逻辑，避免重复转义或破坏列结构。 |
| 文件移动撤销 | 使用主进程返回的规范路径，识别 Windows 子目录。撤销重命名/目录移动前正确询问保存；取消后保留路径和未保存内容。 |
| 仅改大小写的重命名 | Windows 文件和文件夹可以仅改变名称大小写；仍检查源目标身份、目录授权及其他已存在目标，禁止覆盖其他文件。 |
| 原子保存与图片发布 | 目录 fsync 在 Windows 拒绝时仍关闭句柄，避免反复保存造成目录句柄泄漏。 |
| 另存为链接 | 同时更新链接中嵌套图片的目标；保留注释、无关 HTML 属性、未完成的 Markdown 和代码内容。处理引号内的 `>`、无引号属性、HTML 实体和特殊标点。 |
| 跨盘符本地资源 | 使用合法 file URL；图片经授权资源协议读取，本地链接在主进程授权后打开。支持百分号文件名、UNC 路径和 URL 查询/片段，禁止访问未授权目录。 |
| Pandoc 导入图片 | 同时识别原生 Windows 路径、正斜杠、URI 和转义路径；清理临时媒体前完成内嵌，DOCX 导入后图片不再失效。 |
| 安装器文件关联 | 改用专属 `Inkstone.Markdown` ProgID，只添加 OpenWith，不覆盖现有默认打开方式或其他编辑器的通用文档类。 |
| 安装路径引号 | 文件关联命令明确引用可执行文件；在包含空格及中文的安装目录中仍能正确解析程序与文档参数。 |

上述修复均有自动化或原生复现实验支撑。新的回归先验证失败行为，再验证修复结果；实际安装额外发现的未引用可执行路径问题也已加入原生 NSIS 回归。

## 最终自动化结果

| 验证层 | 通过项/组 |
| --- | ---: |
| Node 单元测试 | 109 |
| 编辑器浏览器测试 | 25 |
| 数学编辑 | 10 |
| UI | 12 |
| 编辑设计 | 7 |
| 品牌 | 6 |
| Mermaid 图表 | 25 |
| Electron 桌面集成 | 79 |
| VS Code/Cursor 扩展 | 13 |
| 合计 | 286 |

最终 Electron 报告为 79 通过、0 跳过、0 失败、0 flaky，用时 75.736 秒。浏览器验证期间 39 个源码文件哈希保持一致，浏览器错误为零。Mermaid 验证记录外部网络请求为零。浏览器 UI 中使用的桌面桥接桩不代替真实 Electron、本机安装及输入法验证。

桌面测试覆盖打开/保存、源文及编码保真、历史/恢复、外部修改冲突、异步编辑竞态、多窗口关闭、图片资源、权限边界、数学/图表、查找、文件树、快捷键和导出。Windows 目录越界检查使用了真实临时目录 junction，不再跳过这一分支。

本机大文稿样例为 564,000 字符、1,188,000 UTF-8 字节；该次测量打开约 189 ms、编辑约 25 ms、模式切换约 82 ms。它是本次样例测量，不是所有文稿的性能保证。

## 原生与安装验证

- 真实微软拼音：观察到 `ni` 候选窗口并提交“你”；候选期快捷键保持输入，提交后可切换源码；撤销、Ctrl+Shift+Z 重做及 Ctrl+S 保存正确，BOM/CRLF 保留。输入候选期间点击关闭，再取消关闭，内容和撤销能力保留。
- 构建目录程序、实际解压 ZIP 程序及实际安装后的程序分别通过原生冒烟：中文路径、离线拼写、字节/mtime 保真、编辑/撤销、模式选区、公式/图表及 HTML/PDF 导出。
- NSIS 安装到含中文和空格的专用目录后，四种扩展的 OpenWith 注册存在，命令引号及默认英语交接正确。安装前后检查原有扩展和其他编辑器的注册信息；卸载后与安装前完整快照一致，测试程序及自身注册项已清理。
- 英语/简体中文语言钩子和关联宏均编译为真实 NSIS 程序执行。关联夹具只使用随机专用注册表命名空间，并验证清理完成。
- 三种程序形态中各有 299 个运行文件与当前源码构建逐字节一致，ASAR SHA-256 均为 `a1958b6837a27bf0e8c7b6bb05cdcb8e87c1650f643e4e87b6db305a2a0d0bf1`。PE 版本、架构和嵌入图标校验通过。

## 测试体系改进

移除 Linux 专属浏览器缓存猜测，使用 Playwright 的平台解析；保留显式 Chromium 覆盖。Pandoc 测试支持原生 exe/PATH/环境变量定位，并按工具实际报告的读写能力验证。DOCX 检查改用 Node 解包，不再要求 python3。Windows 崩溃恢复用例终止完整测试进程树；外部重载用例等待编辑器解锁后再导出。ASAR 文件校验使用原生路径分隔符。

Windows 证据统一写入 `artifacts/windows-validation/`，保留既有 Linux 验收文件。Windows CI 已加入六个文件操作/本地 URL 回归和原生安装器语言/关联检查；本轮报告来自本机执行，未发起远程工作流。

主要证据：

- `artifacts/windows-validation/playwright-results.json` 与 `playwright-report/`
- `artifacts/windows-validation/browser-final/summary.json`
- `artifacts/windows-validation/native-validation/{unpacked,portable,installed}/results.json`
- `artifacts/windows-validation/installer-association-validation/results.json`
- `artifacts/windows-validation/installer-language-validation/results.json`
- `artifacts/windows-validation/ui-redesign/release/source-match.json`

## 复现命令

Windows 完整导出测试需要 PATH 中可运行的 Pandoc 和 Poppler（pdfinfo、pdftotext、pdftoppm）。以下命令从项目根目录执行：

```powershell
npm.cmd ci
node node_modules/electron/install.js
npx.cmd playwright install chromium
npm.cmd run build
npm.cmd run test:all
node tests/branding-browser.mjs
node scripts/verify-mermaid.mjs
npm.cmd ci --prefix integrations/vscode
npm.cmd test --prefix integrations/vscode
npm.cmd run dist:win
npm.cmd run verify:windows
node scripts/verify-installer-language.mjs
node scripts/verify-installer-associations.mjs
$env:INKSTONE_EXECUTABLE = "$PWD\release\win-unpacked\Inkstone.exe"
npm.cmd run test:native
node scripts/verify-release-source.mjs release/win-unpacked/resources/app.asar
```

## 验证边界

本轮已修复已发现并能复现的问题，不能据此证明软件永远没有其他 bug。尚未穷尽其他 Windows 版本、输入法、系统 DPI/多显示器组合、真实打印设备、旧版本升级及全部 Office 阅读器。跨盘符与 UNC 路径语义有回归验证，未挂载第二物理卷或真实网络共享逐一验证。

本机 Pandoc 2.12 完成 21 种输出验证、18 种命令行回读及 13 种应用内导入；RTF、PPTX、AsciiDoc 的读取器在该版本中不可用，其输出按结构/中文内容验证，并验证不支持的导入明确失败。不能把这些格式的导出成功称为相应导入成功。

本轮未在 Linux 主机重跑全部测试。安装包沿用 0.4.0 版本，项目没有配置代码签名证书，因此此次产物未签名。
