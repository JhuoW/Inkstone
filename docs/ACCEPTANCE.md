# Inkstone 0.4 历史验收

> 下文为 0.4 阶段的原始验收记录，保留其环境、计数和未完成事项。其后的 Windows 稳定化基线为 [0.5.0](RELEASE_0_5.md)，当前主要功能更新为 [0.6.0](RELEASE_0_6.md)。本页的“当前”均指当时执行环境。

2026-11-08，在Linux x64运行[完整回归](../artifacts/ui-redesign/after/regression.log)：90项单元、21组编辑器、10组公式、12组UI、7组编辑视觉及73组Electron全部通过（213项/组，无跳过），同时通过6项品牌检查。原0.3基线197项/组继续保留；新断言还扩充了已有测试中的校验内容。

- [功能对比](../artifacts/ui-redesign/after/inventory.json)：82固定命令、2默认片段、64应用分支、52编辑器命令、55原生动作、40设置、27导出格式没有减少；CRLF原文和模式选区保持。
- [桌面设计测试](UI_DESIGN_DESKTOP_TESTS.md)：菜单、焦点、快捷键、极限布局和主题对比度。15组真实前后截图及改动说明见[0.4 UI升级](UI_REDESIGN_0_4.md)。
- [真实IBus](../artifacts/os-ime-validation/result.json)：正式dist构建，候选期模式切换、关闭取消继续输入/撤销重做、表格候选关闭、保存后关闭均通过。新增历史边界断言先复现失败再验证修复，未用测试等待绕过。
- [导出PDF](../artifacts/backend-validation/export.pdf)实际确认两页A4、中文、图像、公式及书签；[第二页图像](../artifacts/ui-redesign/after/pdf-page-2.png)。实际主UI导出继续覆盖Mermaid，25类图表离线生产导出测试通过。

正常进程沙箱当前受宿主helper权限/user namespace配置限制；已纠正Playwright默认注入`--no-sandbox`造成的旧取证误判。本次明确记录测试绕过，不改变产品默认启动。Windows原生DPI/IME/安装、系统集成与辅助技术仍待对应环境；跨平台构建和Linux运行不替代这些结果。最新发行文件及验证看[交付记录](DELIVERY.md)。

以下保留此前验收步骤及历史记录，旧计数不是0.4新增测试总数。

---

# 墨石 0.3.0 验收步骤与记录

当前产品仅支持Windows与Linux，不提供账号、云同步、图片上传或上传器集成。下列是本地写作范围的验收要求。

验收基线：Typora 1.14.15 公开功能，核对日 2026-11-08。用例覆盖用户要求，也包含官方文档补充项。功能清单见 [FEATURE_PARITY.md](../FEATURE_PARITY.md)。本文的“预期”是通过条件，不能被当作已经通过。

## 环境与证据规则

| 环境 | 当前证据边界 |
| --- | --- |
| Ubuntu Linux x64 | 当前开发环境；具体自动化和导出检查结果需写入下面执行记录 |
| Windows x64（主平台） | 已配置原生CI；当前Linux环境不能执行Windows实机验收 |
| Linux X11 + IBus仓颉 | 本轮真实XTest输入已通过；Fcitx、拼音及Wayland待验 |

每次执行记录：源码版本/工作树、安装包 SHA-256、操作系统、CPU/内存、Electron 版本、输入法/版本、时间、用例编号、实际结果、截图或日志路径。`通过`仅适用于该条记录的环境和范围。程序插入中文、发送 `compositionstart` 事件或截图存在，都不能证明真实输入法通过。

## 准备

1. 使用普通用户与临时工作目录，复制整个 `samples` 目录。删除、移动、冲突、断电模拟都只操作副本。
2. 从源码运行 `npm ci`、`npm test`、`npm run build`、`npm start`；正式包另做独立运行测试。
3. 打开复制后的 `samples/acceptance.md`。暂时关闭自动保存，确认标题、文件路径、源模式和状态栏可见。
4. 备好第二个纯文本编辑器、系统剪贴板可复制的 PNG、PDF 阅读器、HTML 浏览器。Pandoc 导入导出另需配置 Pandoc；自动化用例从 `.tools/pandoc/bin/pandoc` 读取（缺少会跳过），本轮使用3.13。完整Linux套件还需Poppler命令和Playwright Chromium；不要把跳过或未安装时的失败计为转换通过。
5. 无图形界面的 Linux 可用 `xvfb-run -a npm run test:e2e` 做部分自动化；真实 IME、打印与文件关联仍需桌面人工操作。

需要字节级测试夹具时，可在临时目录执行以下 Node 脚本。它只生成测试文件，包含 BOM、混合换行、未知标签与结尾空格：

```js
const fs = require('node:fs');
fs.writeFileSync('fidelity.md', '\ufeff---\r\ntitle: 中文\nunknown: keep\r\n---\r\n\r\n# 标题  \r\n第一段\n<custom x="1">未知</custom>\r\n![图](assets/inkstone-flow.svg)');
fs.copyFileSync('fidelity.md', 'fidelity.before.md');
```

比较文件可使用 `sha256sum`（Linux）、`Get-FileHash`（Windows PowerShell），或 Node `Buffer.equals`。不要用编辑器显示文本相同代替字节比较。

## 编辑与保真

| ID | 操作步骤 | 通过条件 |
| --- | --- | --- |
| A01 未编辑保存 | 打开 fidelity.md；进入/离开预览块；切换源码两次；保存；比较前后字节和 mtime | 字节、BOM、混合换行、尾部空白、无尾换行和 mtime 均不变 |
| A02 局部编辑 | 只将“第一段”改为“第二段”；保存并做字节差异 | 仅目标字节发生变化；YAML/HTML/路径/其他换行保持 |
| A03 连续输入与撤销 | 在空段落连续输入 200 个中英文字符；输入加粗与列表；逐次撤销/重做 | 文本不重复、不丢失；合理按输入组撤销；可恢复原文 |
| A04 跨块选区 | 用 Shift+方向键从段落跨过列表、公式、表格；复制；删除；撤销；另测鼠标拖选 | 选区端点正确、可见内容与复制范围一致；撤销完整恢复 |
| A05 模式稳定 | 在跨块选区中记录 anchor/head；切换源码与即时渲染 20 次；执行撤销 | 内容与选区不变；滚动无异常跳顶；撤销仍对应原编辑 |
| A06 嵌套列表 | 多级有序/无序/任务列表内 Enter、Tab、Shift+Tab、连续 Enter 退出；点击任务复选框 | 层级与续项正确；只修改选中的任务；邻近文字不变 |
| A07 格式命令 | 选中中文，执行粗体/斜体/删除线/高亮/上下标/链接；再撤销；快捷键重复一次 | 每个入口真实生效；选区包裹正确；不会格式化整个文档 |
| A08 富剪贴板 | 从浏览器复制含列表、表格和强调的 HTML；普通粘贴与纯文本粘贴分别测试；复制到纯文本编辑器与办公软件 | 记录实际提供的 MIME 格式；富粘贴转换正确或明确列为缺项；源码粘贴不解释 |
| A09 代码编辑 | 输入代码围栏；选择 Python/JavaScript/未知语言；开关行号；Tab 缩进；长行与复制代码 | 编辑/预览正确高亮；未知语言保留原文；长行可读；行号不进入源码 |
| A10 只读与范围操作 | 开启只读（若有）；重新聚焦；选择/复制/链接；删除段落/句/样式范围及移动段落 | 实际存在且满足语义才通过；缺入口记未实现 |

### 真实中文输入法：逐平台必须执行

分别使用 Windows 微软拼音、Linux IBus 或 Fcitx 拼音。Linux X11 与 Wayland 分开记录。**当前Linux IBus仓颉的真实系统键盘路径已验证；下列微软拼音、Linux拼音/Fcitx和Wayland用例仍待验，不能从仓颉结果外推。**

1. 在普通段落输入 `zhongwen shurufa`，候选尚未提交时连续翻页、Backspace 和 Esc；再提交“中文输入法”。不得丢失候选或重复文字。
2. 在 `**粗体**`、列表项、链接文本、表格单元格、行内公式周围分别输入“墨石写作”。候选框位置应靠近光标；提交后样式与源码都正确。
3. 选中现有中文，用拼音候选替换；在候选期间按方向键、切换中文/英文标点、取消候选。
4. 连续输入 50 次词组，穿插 Enter、撤销和重做。检查没有幽灵字符、丢首字、重复提交或错误合并撤销。
5. 在长文档中重复以上动作；记录输入法、窗口缩放、DPI 和多屏条件。

## 语法与呈现

| ID | 操作步骤 | 通过条件 |
| --- | --- | --- |
| A11 Markdown 语法 | 逐节检查 acceptance.md 的标题、引用、上下标、高亮、脚注、Emoji、提示块、目录与重复标题 | 所有实现项呈现正确，源码不改写；引用/脚注需要全文上下文，不丢引用 |
| A12 数学 | 编辑行内与块级公式；标签/引用；化学；故意输入非法命令后修正；检查货币 $20 | 正常公式可辨认；错误明确；修正可恢复；编号/引用正确；货币不误解析 |
| A13 数学兼容 | 测试反斜杠定界符、math 围栏、宏、physics、AMS 编号和多行环境 | 每个语法单独记录，KaTeX 基础公式通过不能代表 MathJax 全兼容 |
| A14 Mermaid | 流程/时序/饼图显示；修改节点；输入非法图代码再修正；切换明暗主题 | 实时更新、无旧结果覆盖；错误可见；修正恢复；不残留重复 SVG |
| A15 扩展图表 | 分别测试其他 Mermaid 类型、flow 和 sequence 复杂语法；图表复制/保存 | 每种类型独立验收；旧图表原引擎选项与手绘主题单独记录 |
| A16 HTML 与安全 | details、ruby、kbd、注释、音视频；在副本加入 script/onerror/javascript 链接和 iframe | 合法内容可操作；脚本不能执行或调用桌面桥接；未知源码仍保留；iframe 隔离独立验收 |

安全夹具只在测试副本中使用无害标记，例如 `<script>document.title='SHOULD-NOT-RUN'</script>`。不读取真实隐私文件或向网络发送内容。预期是标题不变、原文件字符串保留。

## 表格与资源

| ID | 操作步骤 | 通过条件 |
| --- | --- | --- |
| A17 表格编辑 | 创建 3×3 表格；编辑中文和内联格式；增删行列；上下/左右移动；对齐；撤销 | 行列顺序、对齐分隔行正确；只修改目标表格；表外内容逐字节保留 |
| A18 表格键盘与粘贴 | Tab/Shift+Tab 遍历；末格 Tab；粘贴样例 TSV；包含转义竖线/代码/空格 | 不进入分隔行；末格新增行；扩展尺寸正确；竖线不拆错单元格 |
| A19 图片插入 | 保存文档后拖入图片、粘贴系统截图、选择多图；同名不同图；重复相同图片 | 文件真实落盘；引用相对；同名不覆盖；剪贴板图片可在重启后显示 |
| A20 图片管理 | 调整尺寸；重命名/移动/复制；另存文档；移动文档目录；测试空格/中文路径 | 图像与引用一致；不支持的批处理记缺项；失效路径有明确反馈 |
| A21 本地范围与旧设置迁移 | 用含退役上传/同步设置的副本启动；检查菜单、设置、IPC；比较文稿、图像、草稿与历史；全新用户配置开启拼写 | 退役入口和IPC不存在；旧键移除且提示，用户内容逐字节保留；英语拼写从随包词典工作，缺失词典不得联网回退 |
| A22 音视频 | 播放样例 WAV 与 WebM；暂停、拖进度；源码切换；离线重开 | 当前平台解码正常；不自动播放；文件引用保持；PDF 无播放能力不误判 |

## 文件安全与恢复

| ID | 操作步骤 | 通过条件 |
| --- | --- | --- |
| A23 文件操作 | 建临时目录/文档；重命名、移动、复制；冲突目标；删除到垃圾桶；重开文件 | 所有入口真实操作；重复目标不覆盖；取消无变化；当前文档路径跟随 |
| A24 导航与搜索 | 树/列表、大纲、快速打开、最近/固定；多层中文路径；普通/正则全局搜索 | 结果定位到正确文件/行；无效正则可恢复；数量限制有说明；重启保留设置 |
| A25 外部修改 | 文档干净时用第二编辑器修改；再于墨石输入未保存内容后在外部修改；外部用临时文件重命名替换 | 干净文档正确重载；脏文档提示冲突且暂停自动保存；不得覆盖任一版本 |
| A26 异步保存 | 自动保存开启后连续输入；保存期间继续编辑；短时间连续 Ctrl+S | 最新输入保持脏状态直到其保存；旧完成回调不能把新内容标为已保存 |
| A27 失败保存 | 对副本撤销目录写权限或设置只读；尝试保存；恢复权限后再保存 | 失败不破坏原文件；明确报错；临时文件妥善处理；脏内容保留 |
| A28 恢复草稿 | 新建未命名文档输入独特文本；等快照延迟后强制结束应用；重开并恢复 | 文本从磁盘恢复；原文件未被静默覆盖；未命名草稿存在；立即崩溃窗口单独记录 |
| A29 历史版本 | 保存 A→B→C；查看历史并恢复 A；恢复前编辑 D；关闭/重开检查草稿 | 恢复只先写入编辑器；D 保留草稿；原盘 C 在显式保存前不变 |
| A30 多窗口与退出 | 两窗口打开同文件；一边保存、一边保留脏文；取消关闭；保存失败后关闭；退出重开 | 跨窗口冲突可见；取消/失败不丢文；单/多窗口恢复范围如实记录 |

## 设置、导出与平台

| ID | 操作步骤 | 通过条件 |
| --- | --- | --- |
| A31 设置 | 明/暗/系统、中/英、字体/字号/行距/宽度、自定义 CSS、快捷键与片段；重启 | 每个设置即时生效或有明确提示；重启保留；无效 JSON 不报成功；界面翻译范围准确 |
| A32 写作模式 | 专注、打字机、全屏、缩放；选区与鼠标点击；长文档首尾 | 当前块/光标显示合理；打字机稳定；操作可逆；菜单实际状态一致 |
| A33 原生导出 | 样例分别导出带/不带样式 HTML、PDF、PNG/JPEG；移动导出文件到其他目录；断网打开 | 中文、图片、公式、图表完整；无加载占位；本地资源自包含；HTML 样式策略正确 |
| A34 PDF 详细检查 | 在真实 PDF 阅读器打开；检查书签、中文搜索/复制、A4/横向、边距、页眉页脚、页码与手动分页 | 可跳转书签；无乱码/裁切；总页数正确；分页位置符合设置；公式和 SVG 不丢 |
| A35 Pandoc 各方向 | 逐个可读格式导入、逐个可写格式导出；实际用目标阅读器打开；图片和中文重点检查 | 生成文件可读；格式警告明确；输入/输出分别记录，文件存在不算通过 |
| A36 打印 | 打开系统打印对话框；取消；另选真实或虚拟打印机输出 | 取消不报成功；页纸、边距与内容实际检查；无服务时标受阻 |
| A37 安装与关联 | 安装当前平台包；双击 .md；CLI 打开文件/目录；含空格中文路径；卸载 | 实际启动与文件关联正确；未验证平台保持待验证；卸载不误删用户文档 |
| A38 离线与长文档 | 断网重开样例；打开至少 1 MB/10,000 行文档；输入、查找、滚动、撤销、切模式、保存 | 记录首屏/输入/切换耗时与峰值内存；能到达尾标记；无丢文或长时间冻结 |

| A39 VSCode / Cursor 扩展 | 安装VSIX；文件树/编辑区/命令面板打开；中文与特殊路径；未命名保存/取消；缺可执行文件 | 仅明确命令触发保存/启动；取消不启动；工作区配置不能替换执行程序；每宿主/平台独立验收 |
| A40 编码与转码保护 | UTF-16LE/BE、GB18030、Windows-1252、Shift-JIS分别显式选择；未编辑保存；局部修改；插入该编码不支持字符 | 字节/BOM/EOL保真；不支持字符报错且原文件不变；不自动猜编码或写替换字符 |

## 0.3导出检查记录

以下来自0.3重新执行的真实Electron回归；基本转换与目标阅读器完整排版分别记录。

| 格式 / 平台 | 本轮检查 | 证据与限制 |
| --- | --- | --- |
| HTML / Linux | 主样例5图、数学及图片完成；独立file://重开导出图像；25类图表重开中文标签齐全、零脚本/外部图片 | [acceptance.html](../artifacts/desktop-validation/acceptance.html)、[重开截图](../artifacts/backend-validation/html-reopened.png)、[25类结果](../artifacts/desktop-validation/diagram-catalog-validation.json)；不代表全部远程媒体可离线 |
| 无样式 HTML / Linux | 真实窗口重开无style页面，MathML节点与SVG文字保留 | [HTML](../artifacts/backend-validation/plain-mathml.html)、[截图](../artifacts/backend-validation/plain-mathml.png) |
| PDF / Linux | 两页A4中文/图片/数学/书签；视口外延迟图像；25类图表15页，中文ZenUML末页实际查看 | [PDF](../artifacts/backend-validation/export.pdf)、[文字](../artifacts/backend-validation/pdf-text.txt)、[15页PDF](../artifacts/desktop-validation/diagram-catalog.pdf)、[末页](../artifacts/desktop-validation/diagram-catalog-page-15.png) |
| PNG/JPEG / Linux | 真编码、尺寸与导出内容；主UI中文数学图表 | [PNG](../artifacts/desktop-validation/writing.png)、[JPEG](../artifacts/backend-validation/export.jpg) |
| Pandoc DOCX / Linux | 应用双向，图片解包导入，Mermaid物化PNG嵌入并回读中文 | [DOCX](../artifacts/desktop-validation/writing.docx)、[回读](../artifacts/backend-validation/roundtrip-import.md)；Office整页排版待验 |
| Pandoc其余20种输出 / Linux | 每种实际生成、按对应reader回读；其中16种经过应用导入路径 | [21格式manifest](../artifacts/backend-validation/formats/manifest.json)；复杂数学/图片/分页与目标阅读器排版另验 |
| Windows各格式 | 当前没有Windows运行环境证据 | Linux交叉生成Windows包与PE图标检查不算导出运行验收 |

## 0.3实际执行记录

| 环境 | 命令 / 范围 | 结果与证据 |
| --- | --- | --- |
| Linux / Node22 | `npm test` | **90/90通过**；[统一日志](../artifacts/final-validation/regression.log) |
| Linux / Chromium | `npm run test:editor` | **21/21组通过**；正文表格/行内/源码保真/跨块与剪贴板；[结果](../artifacts/editor-validation/results.json) |
| Linux / Electron45 Xvfb | `npm run test:e2e` | **67/67通过**（34后端、14主UI、6增强、13写作与退出流程）；[统一日志](../artifacts/final-validation/regression.log) |
| Linux / Chromium | `npm run test:ui` | **9/9组通过**；焦点/Enter/取消、IME取消保护、双语prompt、通知、只读表格Apply保护、资源取消、格式相关导出与设置页脚布局；[结果](../artifacts/ui-polish-validation/results.json)。这组桌面IPC显式模拟 |
| Linux / Chromium | `npm run test:math` | **10/10组通过**；精确点击/双击公式、TeX与预览、错误/撤销、键盘、模式切换、跨块选择与CDP中文组合；[结果](../artifacts/math-editing-validation/results.json) |
| Linux / Wine11 Xvfb独立显示 | `node scripts/verify-installer-ui.mjs` | 完整NSIS实际EN/简中列表、默认英语、XTest选择、首个安装页本地化与取消通过；[结果](../artifacts/windows-installer-ui/results.json)。临时Wine前缀配置本机Noto CJK后截图实际可读；未执行安装，不等同Windows实机 |
| Linux / NSIS与Wine | `npm run verify:installer-language` | 英语默认、两种语言JSON与临时文件清理通过；[结果](../artifacts/installer-language-validation/results.json)。只验证实际hook，不代表完整安装器UI或Windows安装 |
| Linux / Node22 | 扩展行为与VSIX | **13/13通过**，0.3 VSIX ZIP CRC与原256px图标一致；[记录](../artifacts/documentation-validation/extension-package.json)。实际宿主与Windows启动待验 |
| Linux / Electron | 原生应用定义菜单及对话框语言 | 目标用例已通过，[记录](../artifacts/backend-validation/native-language-validation.json)；系统文件选择器内部控件由OS语言决定 |
| Linux X11 / IBus仓颉 | 真实XTest输入及4项生命周期 | 本轮通过候选/连续提交/取消/选区/表格/撤销/自动保存延后，新增候选期间模式切换、关闭取消后继续输入、表格关闭、保存后真实退出；[结果](../artifacts/os-ime-validation/result.json)。不外推Windows或其他输入法 |
| 最终Linux发行包 | `test:native`、`verify:packages` | 三包测试模式（--no-sandbox）启动、精确编辑/原子保存、Node隔离、原PNG通过；包内原生另通过中文路径/未编辑字节/撤销/选区/词典/数学图表/HTML与PDF。见[交付记录](DELIVERY.md) |
| 最终Windows发行包 | `verify:windows`及ZIP检查 | 应用EXE和NSIS版本/原ICO通过；ZIP CRC/ASAR一致。完整NSIS Wine双语首屏另验通过但未安装；原生Windows仍待验 |

## 0.3交互与语言补充用例

| ID | 操作步骤 | 通过条件 |
| --- | --- | --- |
| A41 首次语言 | 新用户目录打开ZIP/Linux应用；切换English/简体中文，完成并重开 | 默认英语；语言即时生效并持久保存；语言提示不阻断写作；既有合法偏好不被覆盖 |
| A42 Windows安装语言 | 无旧配置用户运行NSIS；分别选English/简体中文；再次升级安装 | 默认English；安装步骤及新用户首次应用使用选定语言；既有应用语言优先；系统控件跟随OS的边界单独记录 |
| A43 主要动作与取消 | 触发保存询问，分别Enter、Escape、X、外点击；在对话框内留白点击；恢复编辑 | Enter触发当前主要按钮；取消不丢文；内留白不关闭；关闭后焦点恢复；异步操作不重复执行 |
| A44 公式重编辑 | 单/双击行内分式及块级MathJax SVG；方向键进入；改错并撤销；Ctrl+Enter结束；跨公式拖选 | 精确TeX位置，同区预览；双击仅选内容；相邻公式保持渲染；不丢字节/选区；错误可恢复 |
| A45 保存与退出 | 未命名/已命名脏文档，菜单退出/窗口X/多窗口；保存成功/取消/失败/外部冲突；候选未提交时关闭 | 保存完成后才退出；取消与失败保留窗口/dirty/输入；不丢IME候选；多窗口只关闭已确认文稿 |
| A46 布局与反馈 | 800px窗口及更短高度；明暗/中英；打开设置、表格、资源、导出；执行可取消及busy任务 | 主要动作不裁切，选项可滚动；格式相关字段正确；可见选择数量/错误/成功；busy期间不更改正在执行的参数 |
| A47 启动恢复提示 | 留下崩溃草稿后重开并立即输入；另一窗口保持活动草稿 | 恢复条不抢输入焦点；只列可恢复的孤立草稿，不把另一活跃窗口的草稿当崩溃内容 |

以上预期不能代替对应结果。原生Windows、真实屏幕阅读器、物理打印与其他输入法仍需适用环境。

## 性能快照

| 场景 | 文档 | 本轮结果 | 证据 |
| --- | --- | --- | --- |
| 独立编辑器 / Chromium | 1,158,890 UTF-8字节，10,001行 | 记录打开、10次局部编辑、模式往返与源码编辑耗时；精确结果见JSON | [JSON](../artifacts/editor-validation/performance.json) |
| 主UI / Electron | 1,188,000 UTF-8字节 | 记录打开、局部编辑和模式往返耗时；精确结果见JSON | [JSON](../artifacts/desktop-validation/performance.json) |

测量是当前开发机单轮快照，不是跨硬件保证。峰值内存、更多真实输入法、复杂长表格/图表文档仍待测。

## 已知边界与下一步

先处理会造成丢文、错误覆盖、候选输入损坏、选区错误和导出缺内容的问题，再补齐交互细节与平台扩展。单元测试通过的局部逻辑、模拟事件通过的组合输入、无头截图可见的渲染，应分别记录，不合并成“所有功能已验证”。新增测试应覆盖真实回归与用户行为，不仅复述实现。


## 真实Linux IBus验收复现

这条测试使用已安装的 `ibus-daemon`、IBus表格仓颉引擎 `table:cangjie3`、`dbus-run-session`、Xvfb与`xdotool`，通过XTest向系统窗口发真实键盘输入；不调用CDP组合输入接口。Python3/Pillow仅用于捕获包含系统候选窗的完整X11截图。测试前先完成生产构建，避免运行期间重新清理dist。

```bash
npm run build
# 在独立终端启动；若:92已占用，应选择空闲显示号并同步DISPLAY
Xvfb :92 -screen 0 1440x1000x24 -nolisten tcp
# 另一终端运行
DISPLAY=:92 dbus-run-session -- node tests/os-ime.mjs
```

`INKSTONE_XDOTOOL`可指定xdotool可执行文件。当前开发机曾使用 `.tools/ime` 中局部解压的xdotool/libxdo；新环境应安装本机系统工具，不依赖该缓存目录。脚本需要可用的IBus GTK面板与内存配置组件，Ubuntu之外发行版可能要调整路径。成功结果包含真实 `compositionstart/update/end`、连续“日/月”、Escape取消、选区替换、单元格输入、撤销/重做、源码/即时模式与实际保存；候选未提交期间500ms自动保存延后（等待900ms文件不变），提交后再保存。它没有证明拼音候选翻页、多屏/DPI、Wayland或所有输入法均通过。

本轮统一回归日志保存在 [regression.log](../artifacts/final-validation/regression.log)。25种图表另经生产Electron导出后在独立file://窗口重开，全部标签、零脚本/外部图片通过；[验证JSON](../artifacts/desktop-validation/diagram-catalog-validation.json)、[HTML](../artifacts/desktop-validation/diagram-catalog.html)、[15页PDF](../artifacts/desktop-validation/diagram-catalog.pdf)与末页实际看图证据均保留。
