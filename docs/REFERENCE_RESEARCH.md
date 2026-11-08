# 官方功能调研记录（0.2适用范围）

核对日期：2026-11-08，时区 Asia/Singapore。范围：Typora 官网、官方支持目录、官方稳定通道、当前大版本更新说明。以下均为短篇归纳，非复制官方文档。产品实现与实际验收状态见 [FEATURE_PARITY.md](../FEATURE_PARITY.md)。

最新用户范围覆盖旧计划：只保留Windows与Linux本地写作能力，Windows为主平台；macOS、账户/云同步、图片上传及上传器集成不属于本产品功能或后续待办。本记录仍保留版本来源与Markdown兼容研究。

## 当前稳定版本

[官网][HOME] 的下载入口链接到 [历史发布页](https://typora.io/releases/all)，其 Stable iframe 链接至 [稳定通道][STABLE]。该通道首个条目为 **1.14.15**，随后为 1.14.10、1.14.9 等。1.14.6 是最近附具体各平台下载链接的条目，不能把它当作最新稳定版。官方页面没有明确标出 1.14.15 的发布日期，故只报告核对日与版本，不臆造发布日期。

[更新日志][LOG] 列出最近大版本 **1.14（2026-07-19）**。[1.14 说明][NEW14] 在 2026-10-31 更新，新增浮动编辑工具栏、侧栏隐藏文件/非 Markdown/glob 筛选、文件树键盘导航。稳定通道还说明 1.14.15 修复外部原子替换后的重载、只读模式焦点恢复、iframe 隔离和数学边界问题，故这些属于回归验收重点。[稳定通道][STABLE]

1.13 已升级 MathJax v4 与 Mermaid 11.13，包含 Venn/Ishikawa。采用 KaTeX 的产品可以实现常见数学，但不能仅因为“支持 LaTeX”就宣称 MathJax v4 / physics / 宏 / AMS 编号全等价。[稳定通道][STABLE]

## 与用户基线相比必须补齐的范围

| 范围 | 调研新增项 | 来源 |
| --- | --- | --- |
| 编辑 | 只读、非UTF-8编码选择/保留、删除段落/句/样式范围、复制纯文本/Markdown/HTML、富剪贴板与源码粘贴 | [删除][DELETE]、[剪贴板][COPY]、[稳定通道][STABLE]、[1.3][NEW3] |
| 解析 | 引用链接、自动 URL、HTML 实体/ruby/kbd、HTML 注释、严格模式、文档级 YAML 配置 | [链接][LINK]、[HTML][HTML]、[严格模式][STRICT]、[YAML][YAML] |
| 数学 | physics、用户宏、AMS/全部自动编号、强制刷新、旧定界符兼容 | [数学][MATH] |
| 图表 | 传统 flow/sequence 与 Mermaid 分属不同语法；图表保存/复制及主题选项 | [图表][DIAGRAM] |
| 代码 | 默认/最近语言、代码复制、自动缩进、长行换行独立设置 | [代码][CODE] |
| 图片 | 图片根路径、路径转义、批量下载/移动/复制、引用删除与原文件删除区别 | [图片][IMAGE] |
| 文件 | 文件操作撤销、打开缺失链接时创建、自然排序、目录分组、固定、JumpList、在系统文件管理器显示 | [文件][FILE] |
| 大纲 | 当前章节高亮、过滤、折叠/平铺、编号；导出 PDF 书签与 HTML 大纲不同 | [大纲][OUTLINE] |
| 写作 | 选区统计、阅读速度、扩展自动配对、智能标点输入/渲染两种模式、词典学习 | [统计][COUNT]、[配对][PAIR]、[标点][SMART]、[拼写][SPELL] |
| 外观 | 独立明暗主题、自定义 CSS、字体/段落版式、RTL 实验支持、CSS 调试 | [主题][THEME]、[RTL][RTL] |
| 导出 | 重复上次、导出后操作、YAML 显式授权覆盖、参考文档/模板、原生与 Pandoc PDF 区别 | [导出][EXPORT] |

## 不能从概括描述推出的能力

- **文本片段并非 Typora 内建功能**。官方推荐系统替换或第三方应用。该项目仍需按用户要求自行提供，矩阵标注为增强要求。[片段][SNIPPET]
- **格式化/lint 也非 Typora 内建**。官方使用 Pandoc 的其他 Markdown 导出或外部格式化命令；转换可能丢失源格式细节。日常保存必须和显式格式整理区分。[格式转换][FORMAT]
- **Windows/Linux的恢复草稿不等于完整版本控制**。本地历史恢复需要另外实现并验证。[历史][RECOVER]
- **HTML 支持不是执行任意 HTML/JS**。编辑内容禁脚本；iframe 隔离；PDF 内嵌已撤除。用户 HTML 可保留源码，但呈现层应隔离/消毒。[HTML][HTML]
- **Pandoc 可读与可写集合不相同**。不能对每个下拉选项都宣称双向；需运行时检测并逐向测试。[Pandoc][PANDOC]

## 导入与导出方向的证据

官方 FAQ 明确列出的导入扩展为 `.docx`、`.latex`、`.tex`、`.ltx`、`.rst`、`.rest`、`.org`、`.wiki`、`.dokuwiki`、`.textile`、`.opml`、`.epub`。[Pandoc][PANDOC]

导出文档列出原生 PDF/HTML/无样式 HTML/图片；Pandoc 提供 Word、ODT、RTF、EPUB、LaTeX、Wiki、RST、Textile、OPML、Reveal.js、其他 Markdown 及自定义格式。Pandoc PDF 需要额外引擎和配置。演示文稿不能笼统理解成 PPTX 原生导入支持。[导出][EXPORT]

FAQ的明确导入列表没有ODT/RTF，但简介和Export正文有较宽泛的表述。进一步查阅[1.3稳定日志][NEW3]，其中明确修复Windows/Linux导入对话框无法选择RTF的问题，因此RTF官方导入方向可确认，FAQ属于漏列；ODT仍保留“FAQ未列”的限定。实现采用已安装Pandoc的 `--list-input-formats` 和 `--list-output-formats` 分别检测。[Pandoc][PANDOC]、[导出][EXPORT]

## Windows/Linux差异与外部依赖

| 项目 | 官方Windows/Linux行为 | 墨石验收要求 |
| --- | --- | --- |
| 自动保存/恢复 | 应用定时与恢复草稿 | 独立验证历史、草稿与冲突保护 |
| 快速打开 | Ctrl+P | 真实键盘与中文路径验证 |
| 文件操作撤销 | 重命名/移动；删除不可撤销 | 垃圾桶失败明确，文稿Undo不冒称恢复原资源 |
| 拼写 | 系统或Hunspell词典 | 本版打包英语词典；禁止隐式下载，不存在的词典有明确状态 |
| 自定义快捷键 | 配置文件 | 本地持久配置与原生菜单实际生效 |
| PDF/打印 | 1.10起支持深色，旧Export文档滞后 | 中文字体、书签、分页分别验收 |
| 系统集成 | Windows JumpList；Linux desktop/MIME | 构建配置不能代替实际安装/关联 |

来源：[自动保存][SAVE]、[恢复][RECOVER]、[文件][FILE]、[快捷键][KEY]、[拼写][SPELL]、[导出][EXPORT]。

Pandoc为可选本地程序，需独立检测路径、版本与可读/可写格式；缺失不影响编辑。文稿引用的远程图像/媒体和显式下载不属于云同步或上传功能，但仍需要对应网络资源可达。

## 更新日志优先与排除项

部分专题文档虽显示新的站点更新时间，正文仍陈旧：Export 声称 Windows/Linux PDF 只支持浅色，而 [1.10 更新][NEW10] 明确已支持深色 PDF；About Themes 的早期正文对跟随系统平台描述不完整，而 [1.8 更新][NEW8] 明确 Linux 已支持。较新的明确功能变更优先于滞后的概括正文。

[1.11][NEW11] 补充 LaTeX 反斜杠定界符、段落上下移动、Radar/Treemap 与 Wayland 选项；[1.10][NEW10] 增加 Packet/Kanban/Architecture；[1.9][NEW9] 增加 math 围栏、Block 图表和 EPUB 章节深度。

[系统要求](https://support.typora.io/System-Requirements/)仍保留旧Windows版本，而官网写Windows10/11；本产品应按所选Electron版本与实际平台验收说明范围，不机械复制旧系统门槛。

TextBundle/TextPack 在 1.8/1.10 明确属于 dev 实验功能，未纳入稳定版强制基线。Typora 账号、购买、商业激活不属于独立编辑器需复制的授权机制。上述区分防止把广告或实验能力误当稳定编辑功能。[1.8][NEW8]、[1.10][NEW10]

补充核对：[1.3][NEW3]明确修复非UTF-8文件保存保持编码，属于源文件兼容范围；本项目现提供UTF-8及明确指定的常用编码，并以往返比较阻止损坏。[0.9.90][OLD990]已支持Azure `[[_TOC_]]` 与HTML `id` 锚点；[1.13][NEW13]补充video内track字幕相对路径、侧栏尺寸交互和VSCode/Cursor官方扩展。外部编辑器扩展需以墨石自身身份另行实现。

## 调研与交付边界

本记录核对的是公开资料，不表示已对 Typora 商业二进制逐项做黑盒测试。官网未明确说明的行为以用户要求和工程验收标准补足。产品采用用户提供的独立品牌素材，不复制Typora素材；Markdown 语法兼容不要求复制界面像素。最终必须保留未实现项，标出平台未验证项和实际外部依赖限制。

## 官方来源

[HOME]: https://typora.io/ "Typora 官网"
[INDEX]: https://support.typora.io/ "官方文档目录"
[LOG]: https://support.typora.io/what's-new/ "更新日志"
[STABLE]: https://typora.io/releases/stable?no-warning= "稳定通道"
[NEW14]: https://support.typora.io/What's-New-1.14/ "Typora 1.14"
[MD]: https://support.typora.io/Markdown-Reference/ "Markdown Reference"
[LINK]: https://support.typora.io/Links/ "Links"
[HTML]: https://support.typora.io/HTML/ "HTML Support"
[YAML]: https://support.typora.io/YAML/ "YAML Front Matter"
[CODE]: https://support.typora.io/Code-Fences/ "Code Fences"
[MATH]: https://support.typora.io/Math/ "Math and Academic Functions"
[DIAGRAM]: https://support.typora.io/Draw-Diagrams-With-Markdown/ "Draw Diagrams"
[TABLE]: https://support.typora.io/Table-Editing/ "Table Editing"
[IMAGE]: https://support.typora.io/Images/ "Images"
[FILE]: https://support.typora.io/File-Management/ "File Management"
[SAVE]: https://support.typora.io/Auto-Save/ "Auto Save"
[RECOVER]: https://support.typora.io/Version-Control/ "Version Control"
[SEARCH]: https://support.typora.io/Search/ "Search"
[COPY]: https://support.typora.io/Copy-and-Paste/ "Copy and Paste"
[KEY]: https://support.typora.io/Shortcut-Keys/ "Shortcut Keys"
[OUTLINE]: https://support.typora.io/Outline/ "Outline"
[TOC]: https://support.typora.io/TOC/ "Table of Contents"
[COUNT]: https://support.typora.io/Word-Count/ "Word Count"
[SPELL]: https://support.typora.io/Spellcheck/ "Spellcheck"
[PAIR]: https://support.typora.io/Auto-Pair/ "Auto Pair"
[SMART]: https://support.typora.io/SmartyPants/ "Smart Punctuation"
[SNIPPET]: https://support.typora.io/Text-Snippet/ "Text Snippets"
[FORMAT]: https://support.typora.io/Markdown-Export/ "Convert & Reformat Markdown"
[FOCUS]: https://support.typora.io/Focus-and-Typewriter-Mode/ "Focus and Typewriter"
[THEME]: https://support.typora.io/About-Themes/ "About Themes"
[EXPORT]: https://support.typora.io/Export/ "Export"
[PANDOC]: https://support.typora.io/Install-and-Use-Pandoc/ "Install and Use Pandoc"
[CLI]: https://support.typora.io/Launch-Arguments/ "Launch Arguments"
[RTL]: https://support.typora.io/RTL/ "RTL"
[STRICT]: https://support.typora.io/Strict-Mode/ "Strict Mode"
[DELETE]: https://support.typora.io/Delete-Range/ "Delete Range"

[NEW11]: https://support.typora.io/What's-New-1.11/ "Typora 1.11"
[NEW10]: https://support.typora.io/What's-New-1.10/ "Typora 1.10"
[NEW9]: https://support.typora.io/What's-New-1.9/ "Typora 1.9"
[NEW8]: https://support.typora.io/What's-New-1.8/ "Typora 1.8"
[WIN]: https://support.typora.io/Typora-on-Windows/ "Typora on Windows"
[SPACE]: https://support.typora.io/Line-Break/ "Whitespace and Line Breaks"
[LAUNCH]: https://support.typora.io/Launch-Options/ "Launch Options"
[WEBSEARCH]: https://support.typora.io/Add-Search-Service/ "Add Search Service"

[NEW3]: https://support.typora.io/What's-New-1.3/ "Typora 1.3"
[NEW13]: https://support.typora.io/What's-New-1.13/ "Typora 1.13"
[OLD990]: https://support.typora.io/What's-New-0.9.90/ "历史语法依据"


解析严格/宽容规则已按官方示例实现独立模块，源文坐标保持策略、编辑/导出换行差异与原创CJK增强的边界见[解析策略核对](MARKDOWN_PARSER_OPTIONS.md)。模块单测通过不等于桌面集成通过。

Mermaid补验已逐类真实离线渲染25个基础中文夹具，含外部ZenUML插件以及Sankey中文兼容。当前依赖版本为12.3.0，与Typora1.13记录的11.13不同；具体状态和实物见[图表目录](MERMAID_CATALOG.md)，不由版本高低推定完全兼容。
