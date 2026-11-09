# Inkstone 0.9.0 功能对标与验收矩阵

当前版本：0.9.0。本矩阵的逐行状态最初于 0.4 轮次建立，下文标注了 0.3/0.4 的条目为对应轮次的历史证据；0.5–0.9 的新增与修复见 [docs/releases](docs/releases/) 与各版本发布记录，其中 0.8.0 新增可选的 [AI 写作助手](docs/AI_ASSISTANT.md)。

核对日期：2026-11-08（Asia/Singapore）。对标依据为公开官方文档和稳定发布通道，不使用 Typora 的代码、图标、主题或其他受保护素材。独立产品的具体实现可以不同，但不得把入口或依赖库能力视为已交付功能。

## 当前产品范围

最新用户要求优先：Windows为主平台，Linux为附加平台；macOS不属于本产品支持目标。账号/云同步、图片上传和外部上传器已从0.2范围删除，不列为待补能力；0.8.0 起可选接入用户自行配置的 AI 模型服务（见 [AI 写作助手](docs/AI_ASSISTANT.md)）。I09–I13、X18及W21（外部搜索服务）编号退役，保留此说明便于核对旧矩阵。文稿远程图片/媒体读取与用户显式下载图片仍保留，本地全文搜索不受影响。品牌使用用户提供的inkstone-brand资源，详见[品牌来源](docs/BRANDING.md)。

## 版本与状态规则

- 官方 [稳定通道][STABLE] 顶部版本为 **1.14.15**；[总更新日志][LOG] 最近大版本为 **1.14**，发布于 2026-07-19。[1.14 页面][NEW14] 更新于 2026-10-31。稳定通道未给出 1.14.15 的明确发布日期；不推断该日期。1.14.6 是页面中最近带下载链接的条目，不应误写为最新版本。
- **已实现并验证**：存在具体测试或实际操作证据；只覆盖“验收结果”列声明的平台与范围。
- **已实现待验证**：真实逻辑已连接，但缺少适用环境或验收证据。
- **部分实现**：仅覆盖该行的一部分行为；缺项必须写明。
- **受阻**：存在明确外部条件限制，记录原因和下一步。
- **未实现**：尚无对应交付；不能用“架构支持”冒充实现，也不能把普通未完成工作归为外部受阻。
- `W/L`分别是Windows/Linux；`共同`不表示两个平台已经验证。Windows静态PE检查、跨平台打包、CI配置与真实Windows运行必须分别记录。
- 本表的预期交互与验收条件是工程验收标准；未附测试记录的行均不能认定通过。用户明确要求的增强项保留，即使 Typora 本身没有内建实现。

## 阶段进度

| 阶段 | 范围 | 状态 | 证据 |
| --- | --- | --- | --- |
| 0 | 官方范围、版本、平台与格式方向核对 | 已实现并验证 | 官方在线页面，详情见 [研究记录](docs/REFERENCE_RESEARCH.md) |
| 1 | 编辑内核、源文保真 | 部分实现，核心保真已验证 | U1/U2/D1/B1；Linux IBus仓颉真实输入及正文表格已验；其他输入法与复杂嵌套选区待验 |
| 2 | 语法与渲染 | 部分实现 | U3/D1/B1；严格/CJK、25类图表生产导出已验，MathJax4完整兼容尚缺 |
| 3 | 文件与资源 | 部分实现 | U2/D2；原子保存/冲突/历史及当前文稿资源批操作已验，跨稿资源联动尚缺 |
| 4 | 导入导出 | 部分实现 | D1/D2/PDF/PNG/DOCX实物；21格式基础输出与16类应用导入通过，复杂排版待验 |
| 5 | 设置与主题 | 部分实现 | D1/D2；持久主题库/语言/解析设置已验，目录自动扫描及部分细项尚缺 |
| 6 | 测试与打包 | Linux功能已验证；Windows原生与正常进程沙箱待验 | 0.4共213项/组：90单测、21核心、10公式、12UI、7编辑视觉、73Electron；实际IBus通过。当前包与源码一致性、静态/Wine/运行边界见[交付记录](docs/DELIVERY.md)。 |


## 0.4 UI/UX保留检查（2026-11-08）

本次保留0.3全部功能入口，见[完整基线](docs/UI_FUNCTION_BASELINE.md)和[0.4实现及截图](docs/UI_REDESIGN_0_4.md)。统一桌面色彩/排版/图标；改进侧栏、插入菜单、命令面板、设置、导出、表格与资源对话框的键盘及滚动行为。自动集合对比保留82固定命令、2默认片段、64应用分支、52编辑器命令、55原生动作、40设置与27导出格式；不以入口存在替代实际功能验收。原有部分实现项继续保留原状态，不因UI重绘升级为已完成。当前测试和发行件以[交付记录](docs/DELIVERY.md)的0.4部分为准。

取证修正：Playwright旧脚本默认注入`--no-sandbox`，0.3的“正常sandbox”断言不成立。现已显式控制并检查argv；当前宿主的沙箱helper未配置root/setuid且user namespace受限，正常沙箱启动失败，功能回归采用明确的测试绕过。没有修改宿主安全策略或产品启动参数，Windows原生/正常沙箱/系统安装依然待验。

## 历史证据快照（0.3，2026-11-08）

0.3新增正文公式编辑、界面整理、默认英语、双语安装种子与关闭/退出保护。本轮**90单测、21核心浏览器、10公式编辑、9UI、67Electron（34后端/14主UI/6增强/13流程）**全过，见[统一日志](artifacts/final-validation/regression.log)。最终五包均重新生成：Linux三包实际启动保存及品牌字节通过，Windows应用/NSIS PE与ZIP CRC通过；Wine完整安装器双语首屏已看但未安装。Windows原生仍待验，不从Wine/Linux推定。已独立通过[9组UI浏览器](artifacts/ui-polish-validation/results.json)、[10组公式编辑](artifacts/math-editing-validation/results.json)、[NSIS双语hook](artifacts/installer-language-validation/results.json)及扩展13项。UI浏览器IPC为模拟，NSIS hook由Wine执行，两者均不能代表Windows实机安装。详见[0.3变化](docs/UI_UX_0_3.md)。

- [U1：源文与表格单元测试][U1]；[U2：存储故障/恢复单元测试][U2]；[U3：Markdown渲染与安全测试][U3]。
- [D1：主UI桌面测试][D1]；[D2：原生文件/资源/导出桥接测试][D2]。
- [原生导出PDF][PDF] 已检查两页 A4、中文文字、图片、KaTeX、静态 SVG 和 /Outlines；这不能替代 Mermaid 完整性验收。
- [验收步骤与实际记录](docs/ACCEPTANCE.md)；[架构及可靠性边界](docs/ARCHITECTURE.md)。

下表只将本轮已运行用例覆盖的行为标为Linux验证；未覆盖交互继续标为待验证或部分实现。

## 一、编辑内核与保真

| ID | 功能与官方来源 | 预期交互 / 验收标准 | 平台差异 | 状态 | 验收结果 / 缺项 |
| --- | --- | --- | --- | --- | --- |
| E01 | 同区即时渲染 [HOME][HOME] | 输入后排版；光标进入相应内容可编辑源语法；非双栏预览 | 共同 | 部分实现 | [B1][B1]活动普通段落/标题已细粒度显隐粗体、斜体、删除线、行内代码/URL链接，光标/选区命中显示标记；非活动块同区呈现。0.3公式精确定位TeX与同区实时预览已由[专门用例](artifacts/math-editing-validation/results.json)覆盖；活动列表/引用、图片/脚注/引用式链接仍非全部细粒度，不能称Typora交互全等。 |
| E02 | 源码模式 [KEY][KEY] | 内容、光标、跨块选区、撤销栈及滚动位置切换稳定 | 共同；1.13 增强滚动保持 | 已实现并验证（Linux） | [D1][D1] 覆盖切换后的内容、跨块选区、撤销；精细滚动和复杂鼠标定位仍需 A05 人工回归。 |
| E03 | 键盘与跨块选区 [KEY][KEY] | 方向键、Home/End、Shift 选区、全选、跨列表/表格/公式连续编辑 | Windows/Linux均使用Ctrl | 已实现并验证（Linux） | [B1][B1]真实鼠标正/反向跨段落拖选、源码段→渲染块拖选与Ctrl+C保留完整中间Markdown通过；键盘跨块复制/粘贴/撤销通过。复杂嵌套表格/公式组合继续A04验收。 |
| E04 | 撤销重做 [KEY][KEY] | 连续输入、格式变化、粘贴和模式切换后可逆；一次输入合并合理 | 共同 | 已实现并验证（Linux） | [U5][U5]400个中间状态逐次撤销/重做保持BOM及LF/CRLF/CR；[B1][B1]真实浏览器分组撤销、[D1][D1]局部修改与模式切换通过。正常撤销深度由编辑器管理。 |
| E05 | 中文 IME 与组合输入 [HOME][HOME] | 候选期不得重建正在输入的 DOM；拼音、撤回、标点与选区替换需真机验收 | W微软拼音；L IBus/Fcitx | 已实现并验证（Linux） | [真实OS输入法记录](artifacts/os-ime-validation/result.json)：IBus table:cangjie3、XTest真实按键/候选窗、连续日/月commit、Esc取消、选区替换/正文单元格、撤销/重做、源码切换、保存与组合输入期间自动保存延后通过；0.3新增候选期模式切换、关闭取消继续输入、表格候选关闭与保存后真正退出四项也通过，不是CDP输入。Windows、拼音及Fcitx/Wayland待验；[B1][B1]另有CDP组合输入。 |
| E06 | 不编辑直接保存 [MD][MD] | UTF-8/BOM、CRLF/LF、尾部换行、空白、未知语法逐字节不变（用户要求） | 共同 | 已实现并验证（Linux） | [U1][U1]、[U2][U2]、[D1][D1] 比较字节与 mtime，含 UTF-8 BOM、CRLF、混合换行、未知语法。 |
| E07 | 局部编辑保真 [MD][MD] | 仅修改指定范围；保留 YAML、HTML、相对路径与未知扩展（用户要求） | 共同 | 已实现并验证（Linux） | [U1][U1]、[U2][U2]、[D1][D1] 验证只修改目标字符，表外与未知内容保留。 |
| E08 | 富文本复制 [COPY][COPY] | 剪贴板提供格式内容及纯文本；跨应用粘贴保留语义 | 系统剪贴板格式需各平台验收 | 部分实现 | [D1][D1]真实系统剪贴板HTML富复制与双MIME已验；跨Office/RTF、复杂公式/图表与Windows仍待验。 |
| E09 | 复制 Markdown / 纯文本 / HTML 代码 [COPY][COPY] | 明确选择复制格式；纯文本不带 Markdown 标记 | 共同；纯文本入口在 1.13 增强 | 已实现待验证 | 命令面板连接复制 HTML 代码/纯文本；源码视图可直接复制 Markdown。系统剪贴板实物 A08 待验。 |
| E10 | 粘贴富文本与源码 [COPY][COPY] | HTML 转 Markdown；源码模式与纯文本粘贴不自动解释；撤销一次恢复 | 共同 | 已实现并验证（Linux） | [D1][D1]真实系统HTML粘贴得到标题/强调/链接Markdown并一次撤销还原；源码/纯文本分流已接，跨应用复杂表格与公式需继续验收。 |
| E11 | 剪切、粘贴图片与表格 [COPY][COPY] | 图片真正落盘；表格 HTML/TSV 粘贴为有效表格 | 剪贴板需要桌面环境 | 部分实现 | [B1][B1]真实Chromium剪贴板TSV/文本粘贴及正文单元格处理通过；[增强UI测试](tests/enhancements.spec.js)真实系统PNG剪贴板粘贴落盘通过；跨Office HTML表格与各平台待验。 |
| E12 | 长文档性能 [HOME][HOME] | 大文档输入不阻塞；记录文件规模、首屏与编辑耗时（用户要求） | 按测试设备记录，不外推 | 部分实现 | [B1][B1]独立编辑器约1.16MB/10,001行：打开、10次编辑和模式往返的本轮耗时均记录于JSON；主UI性能另见[PERF][PERF]，峰值内存/更大复杂文档未测。 |
| E13 | 只读模式 [STABLE][STABLE] | 禁止修改但允许选择和打开链接；窗口重新聚焦保留只读 | 1.14.15 修复焦点回切 | 已实现并验证（Linux） | [B1][B1]真实键盘验证阻止输入/删除、允许复制/查找/刷新；[D1][D1]主UI只读切换、contenteditable与格式命令保护已验。跨窗口焦点回切继续人工验收。 |
| E15 | 移动行/段落 [NEW11][NEW11] | Alt+↑/↓ 在列表与普通块移动；选区与撤销正确 | 1.11 扩展至段落 | 已实现并验证（Linux） | [B1][B1]顶层块上/下移动（嵌套列表整体）保持选区与混合换行；真实Ctrl+Z/redo逐字恢复。跨层列表项所有交互未由此覆盖。 |
| E16 | 文件编码选择与保留 [NEW3][NEW3] | 读取并按原编码保存受支持文本；转码需明确选择，禁止静默替换 | 官方稳定1.3已修复非UTF-8保存保留 | 部分实现 | [U2][U2]/[D2][D2]UTF-8/BOM、UTF-16LE/BE、GB18030、Windows-1252、Shift-JIS无编辑保真/局部修改/不可表示字符拒绝已验；默认严格UTF-8并显式选择编码，更多编码及完整转码UI尚缺。 |
| E14 | 按块/句/样式范围删除 [DELETE][DELETE] | 提供删除段落、句、样式范围、单词命令；表格中按行 | 共同 | 已实现并验证（Linux） | [B1][B1]deleteWord/deleteSentence/deleteBlock/clearFormatting真实命令与一次Ctrl+Z通过；移除粗体/斜体/代码/删除线/行内链接标记时保留文本。复杂嵌套与各语种分句继续人工验收。 |

## 二、Markdown 与 HTML

| ID | 功能与官方来源 | 预期交互 / 验收标准 | 平台差异 | 状态 | 验收结果 / 缺项 |
| --- | --- | --- | --- | --- | --- |
| M01 | 标题、段落与换行 [MD][MD] | H1–H6；Enter 与 Shift+Enter；软换行/硬换行可区分 | 共同 | 已实现并验证（Linux） | [U3][U3]、[D1][D1] 覆盖标题与段落基础渲染；Enter/Shift+Enter 的富编辑细节继续按 A03 回归。 |
| M02 | 引用与嵌套引用 [MD][MD] | 连续 Enter 延续；退出与嵌套稳定 | 共同 | 已实现待验证 | markdown-it 引用/嵌套渲染与 CodeMirror 续行已连接；连续退出引用 A06 待验。 |
| M03 | 有序/无序及嵌套列表 [MD][MD] | 自动续项；Tab/Shift+Tab 缩进；更改列表类型 | 共同 | 已实现并验证（Linux） | [B1][B1] 真实键盘Enter/Tab嵌套列表续项保持内容；[U3][U3]解析与渲染通过。复杂混合嵌套/鼠标编辑继续人工回归。 |
| M04 | 任务列表 [MD][MD] | 复选框可点击且只替换对应任务标记 | 共同 | 已实现待验证 | 任务列表渲染与点击源码补丁已连接；[U3][U3] 覆盖标记渲染，嵌套交互待验。 |
| M05 | 粗体、强调、行内代码、删除线 [MD][MD] | 实时样式与键盘格式命令；CJK 相邻字符正确 | 共同 | 已实现并验证（Linux） | [U3][U3] 覆盖粗体/强调/删除/代码基础，[D1][D1] 实际点击粗体按钮并撤销。 |
| M06 | 上下标与高亮 [MD][MD] | 语法开关；呈现与原文往返稳定 | 共同 | 部分实现 | [U3][U3] 已验证上下标/高亮渲染，命令已接；独立语法开关尚缺。 |
| M07 | 分隔线 [MD][MD] | 多种合法写法；不误把 YAML 分隔识别为横线 | 共同 | 已实现待验证 | 分隔线和顶部 YAML 分开解析，真实交互待 A11。 |
| M08 | 行内链接、引用链接和自动链接 [LINK][LINK] | 悬停/编辑地址；Ctrl 点击打开目标；引用定义保留 | 共同 | 部分实现 | [U3][U3]/[B1][B1]验证引用链接和全文上下文；打开链接逻辑已接，完整悬停编辑与外部应用待验。 |
| M09 | 标题锚点与同名标题 [LINK][LINK] | 目录跳转、重复锚点唯一、中文与 URL 编码正确 | 共同 | 已实现并验证（Linux） | [U3][U3] 验证中文、重复标题 ID 和全文上下文；交互导航代码已连接，Windows 待验。 |
| M10 | 跨文件链接及章节锚点 [LINK][LINK] | 相对路径打开文件并定位标题；缺失文件明确提示/创建 | 共同 | 部分实现 | [D2][D2] 验证相对文件解析，UI支持章锚点；不存在目标的创建引导尚缺，复杂路径需 A24。 |
| M11 | 脚注 [MD][MD] | 定义渲染、跳转返回、悬停预览 | 共同 | 部分实现 | [U3][U3] 已验证脚注和分块共享上下文；悬停预览与所有双向导航未完整实现。 |
| M12 | Emoji 语法与补全 [MD][MD] | 短代码呈现；候选补全不打断 IME | 字体呈现可能有平台差异 | 部分实现 | [U3][U3] 验证 Emoji 短码，补全存在常用候选；完整词库/关闭补全设置及真实 IME 待补。 |
| M13 | TOC [TOC][TOC] | [toc]/[TOC]/Azure `[[_TOC_]]` 自动更新、层级控制与可点击导航 | 共同 | 部分实现 | [U3][U3] 验证 TOC、中文和同名标题；可导航。Azure写法已补单测通过（来源[0.9.90日志][OLD990]）；层级控制设置未提供。 |
| M14 | YAML Front Matter [YAML][YAML] | 顶部元数据独立呈现与编辑；未知键和非法中间态保真 | 共同 | 已实现并验证（Linux） | [U1][U1]/[U2][U2] 保真与 [U3][U3] 独立呈现均覆盖；未知键保留。 |
| M15 | YAML 文档级设置 [YAML][YAML] | 图片根路径/复制位置；受控选择是否读取导出设置 | 共同；外部文档不能自动执行命令 | 部分实现 | [U4][U4]安全白名单解析typora-root-url/copy-images-to并保留未知键，全文/live图片根路径单测通过；UI资源拷贝整合与文档级导出覆盖待验。 |
| M16 | GitHub 提示块 [MD][MD] | NOTE/TIP/IMPORTANT/WARNING/CAUTION 的视觉语义 | 共同 | 已实现并验证（Linux） | [U3][U3]语法测试及[SAMPLE][SAMPLE]五类提示块全部实际呈现；源码原样保留。 |
| M17 | HTML 行内与实体 [HTML][HTML] | span/u/sup/sub/ruby/kbd 及实体；编辑时保留源码 | 共同 | 已实现并验证（Linux） | [SAMPLE][SAMPLE]实际桌面完整样例HTML包含行内HTML、ruby、kbd和实体；源文保真另由U1验证。所有视觉细节与Windows仍需独立验收。 |
| M18 | HTML 块与 details [HTML][HTML] | 进入块编辑源码；安全渲染；折叠内容可操作 | 共同 | 已实现待验证 | HTML 块消毒及 details 可交互逻辑已连接；进入源文/嵌套块操作待验。 |
| M19 | HTML 注释 [HTML][HTML] | 可编辑注释；导出与打印不显示 | 共同 | 已实现待验证 | 注释原文保留，渲染器不生成可见正文；实际导出样例检查待完成。 |
| M20 | 视频与音频 [HTML][HTML] | 本地相对路径、远程媒体与video track字幕；拖入媒体生成可编辑引用 | 各平台编解码器差异需验收 | 部分实现 | [U3][U3]track、video/audio相对资源路径已测试；完整样例保留本地媒体引用。0.2尚未单独重验播放到ended，平台编解码、媒体拖放仍待验。 |
| M21 | sandbox iframe 与许可嵌入 [HTML][HTML] | 嵌入内容隔离，不接触编辑内容和本地文件；失败提示 | 远程内容需网络；PDF 内嵌官方已移除 | 部分实现 | [U3][U3]验证iframe强制sandbox、不含allow-same-origin和srcdoc；远程嵌入实际播放/CSP兼容仍需A16，不允许访问桌面桥接。 |
| M22 | 严格模式与宽容解析 [STRICT][STRICT] | 切换标题空格、列表缩进兼容规则；不改写源文 | 共同 | 已实现并验证（Linux） | [解析策略](docs/MARKDOWN_PARSER_OPTIONS.md)8项单测含官方标题/列表例子、Tab/代码/原行映射；[增强UI测试](tests/enhancements.spec.js)设置即时切换与[B1][B1]严格/宽容标题显隐通过。并非关闭全部Markdown扩展。 |
| M23 | 空白、换行与 CJK 排版 [MD][MD] | 保留软换行、连续空白、CJK 标点与相邻强调 | 共同 | 部分实现 | 源文空白保真已验；[解析策略](docs/MARKDOWN_PARSER_OPTIONS.md)编辑/导出独立软换行和可选CJK相邻强调通过单测，桌面CJK开关实际验证。连续空格显示和所有CJK断行排版并非全等。 |

## 三、代码、数学、图表

| ID | 功能与官方来源 | 预期交互 / 验收标准 | 平台差异 | 状态 | 验收结果 / 缺项 |
| --- | --- | --- | --- | --- | --- |
| C01 | 代码围栏与语言选择 [CODE][CODE] | 可视语言选择器；支持常用语言；保留未知语言 | 共同 | 已实现待验证 | 代码语言命令和围栏解析已连接；语言选择/未知语言实际编辑 A09 待验。 |
| C02 | 语法高亮 [CODE][CODE] | 编辑中与预览/导出中均高亮；未知语言不报错 | 共同 | 已实现待验证 | CodeMirror 与 highlight.js 两条高亮路径已连接；常用语言和导出样式需 A09 验证。 |
| C03 | 代码行号与长行换行 [CODE][CODE] | 独立设置；打印长代码不被截断 | 共同 | 部分实现 | 代码块长行换行开关、源码行号与预览行号已接；[增强UI测试](tests/enhancements.spec.js)包含代码偏好操作。打印长代码/所有语言边界继续A09验收。 |
| C04 | 代码缩进与默认语言 [CODE][CODE] | 缩进宽度、自动缩进、复制代码、默认/最近语言 | 共同 | 部分实现 | 缩进宽度和默认代码语言偏好已接；[增强UI测试](tests/enhancements.spec.js)确认默认语言生效。最近语言、自动格式缩进与专用复制代码入口未完整覆盖。 |
| C05 | 行内/块级公式 [MATH][MATH] | 编辑源码与实时预览；语法错误可见且可恢复 | 共同 | 已实现并验证（Linux） | [U3][U3]基础数学与错误提示；[0.3公式编辑](artifacts/math-editing-validation/results.json)10组真实浏览器验证单/双击KaTeX及MathJax、方向键进入、同区TeX与预览、Ctrl+Enter、错误/撤销、20次模式切换与跨公式鼠标选择。CDP中文组合输入不代表所有OS输入法。 |
| C06 | 公式编号与交叉引用 [MATH][MATH] | 手动 tag/label/ref；全自动及 AMS 编号规则 | 共同 | 部分实现 | [U3][U3]/[B1][B1]已验label/ref/基本自动编号，偏好入口已接；AMS规则、全部复杂标签兼容与点击跳转尚缺。 |
| C07 | 化学公式 [MATH][MATH] | mhchem 的 ce/pu；中文相邻内容稳定 | 共同 | 已实现并验证（Linux） | [U3][U3] 已验证 mhchem 化学公式；单位/复杂嵌套可用样例继续扩充。 |
| C08 | 数学宏、Physics 与 MathJax v4 兼容 [MATH][MATH] | 宏、物理包、跨行公式及 v4 新包；对不支持命令提示 | 官方 1.13 为 MathJax v4；KaTeX 不能视作等价 | 部分实现 | [B1][B1]/[U3][U3]KaTeX失败时使用离线MathJax3.2.2 SVG fallback，已验physics的qty/dv、bbox、glyph和输出；MathJax4新增包不等价，宏与AMS规则仍需更多夹具。 |
| C09 | 公式强制刷新与兼容定界符 [MATH][MATH] | 刷新编号；旧/新行内定界规则可选 | 共同 | 部分实现 | [B1][B1]编辑器显式refresh已验，主UI刷新公式/图表命令已接；旧定界符兼容规则切换仍缺。 |
| C10 | Mermaid 基本图表 [DIAGRAM][DIAGRAM] | 流程、时序、Gantt、类、状态、饼图；实时预览/错误反馈 | 共同 | 已实现并验证（Linux） | [25类目录](docs/MERMAID_CATALOG.md)逐类实际渲染流程、时序、Gantt、类、状态、饼图中文/几何；[D1][D1]/[B1][B1]另验证错误恢复与导出。所有复杂语法/主题组合不在基础夹具承诺内。 |
| C11 | Mermaid 扩展图表 [STABLE][STABLE] | 需求、Gitgraph、C4、脑图、时间线、象限、桑基、XY、ZenUML、Venn/Ishikawa、Block、Radar、Treemap、Packet、Kanban、Architecture | 1.13 更新 Mermaid 11.13；按类型逐个验收 | 已实现并验证（Linux） | [25类目录](docs/MERMAID_CATALOG.md)全部真实离线SVG、中文标签、非零几何与严格CSP通过，零外网；ZenUML本地MIT插件已接，中文Sankey临时ID兼容不改源文。[生产导出记录](artifacts/desktop-validation/diagram-catalog-validation.json)25图HTML真实离线重开、PDF中文通过。全语法/C4子类型/所有主题与Windows仍待验。 |
| C12 | flow 传统流程图 [DIAGRAM][DIAGRAM] | 兼容 flowchart.js 语法，而非要求用户改 Mermaid | 共同 | 已实现并验证（Linux） | [B1][B1]原生flowchart.js验证条件/方向/子过程/flowstate/边JSON样式/独立箭头；native-legacy实物含中文。D1完整样例已验证桌面导出集成；非全部上游选项逐一验收。 |
| C13 | sequence 传统时序图 [DIAGRAM][DIAGRAM] | 兼容 js-sequence 语法；simple/hand 主题 | 共同 | 已实现并验证（Linux） | [B1][B1]原生引擎验证别名、注释/换行、四种箭头/虚线/自环；simple与hand SVG/PNG/PDF中文字通过，手绘几何配本地系统字体，不下载字体。设置入口已接，Windows待验。 |
| C15 | LaTeX 定界符与 math 围栏 [NEW11][NEW11] / [NEW9][NEW9] | `\(...\)`、`\[...\]`、math 围栏开关与渲染；普通反斜杠保真 | 1.9/1.11 新增 | 部分实现 | [U3][U3] 新增math围栏和反斜杠行内/块定界符测试通过；独立启用开关和旧版定界兼容未全覆盖。 |
| C16 | 复制数学为 MathML [STABLE][STABLE] | 复制公式到支持 MathML 的应用；内容正确 | 系统剪贴板需验收 | 部分实现 | [D1][D1]选中完整KaTeX公式后真实系统剪贴板包含MathML与公式文字；MathJax fallback公式的MathML、Word等外部应用互通仍待验。 |
| C14 | 图表主题、选项与保存复制 [DIAGRAM][DIAGRAM] | 对齐、编号、曲线；图表复制/另存；导出嵌入结果 | 共同 | 部分实现 | 明暗渲染已接；图表独立复制/保存、曲线/间距/编号 UI 尚缺。 |

## 四、表格与图片资源

| ID | 功能与官方来源 | 预期交互 / 验收标准 | 平台差异 | 状态 | 验收结果 / 缺项 |
| --- | --- | --- | --- | --- | --- |
| T01 | 可视表格创建 [TABLE][TABLE] | 选择行列数创建有效 GFM 表格；也可直接写语法 | 共同 | 已实现并验证（Linux） | [U1][U1] 验证表格生成有效，[D1][D1] 表格实际呈现；创建入口支持尺寸输入。 |
| T02 | 可视单元格编辑 [TABLE][TABLE] | 直接编辑单元格；保留内联格式和转义竖线 | 共同 | 已实现并验证（Linux） | [B1][B1]正文单元格点击直接输入、CDP中文composition、粗体、普通多行粘贴/管道转义、Undo/Redo通过；局部编辑保持BOM/混合换行/原管道空格。鼠标矩形多格选择与复制尚缺；独立可视网格另由D1验证。 |
| T03 | 增删行列和改变尺寸 [TABLE][TABLE] | 上下/左右插入、删除、明确尺寸；撤销可逆 | 共同 | 已实现并验证（Linux） | [U1][U1] 验证局部表格增列等，[D1][D1] 通过 UI 命令增行并撤销；复杂边界继续 A17。 |
| T04 | 重排行列 [TABLE][TABLE] | 拖动或明确移动命令；标题与数据完整 | 共同 | 部分实现 | [U1][U1] 行重排已测，行列移动命令已接；拖动手柄尚未提供。 |
| T05 | 列对齐 [TABLE][TABLE] | 左/中/右对齐同步 Markdown 分隔行 | 共同 | 已实现并验证（Linux） | [U1][U1] 验证列对齐修改分隔行，菜单命令已接。 |
| T06 | 表格键盘导航 [TABLE][TABLE] | Tab/Shift+Tab；末格 Tab 新行；Mod+Enter 新行 | Windows/Linux | 已实现并验证（Linux） | [B1][B1]正文单元格Tab/Shift+Tab、末格Tab增行与撤销通过。Mod+Enter及全部复杂表格边界继续A18。 |
| T07 | 表格粘贴 [COPY][COPY] | 电子表格 TSV/HTML 导入；包含换行和管道的内容不丢 | 桌面剪贴板各平台验收 | 部分实现 | [B1][B1]真实TSV贴入正文单元格、跨格/增行与普通换行转br、管道转义通过；鼠标矩形多格选择复制、跨Office富HTML表格仍不完整。 |
| I01 | 图片输入与显示 [IMAGE][IMAGE] | 本地选择、拖放、多图和网络 URL；失败占位 | 共同 | 已实现待验证 | 本地选择/多图、拖放和 URL 渲染代码已接；原生拖放与错误占位需 A19。 |
| I02 | 剪贴板图片 [IMAGE][IMAGE] | 持久落盘后插入路径；未命名文档需可追踪资源位置 | Windows/Linux本地剪贴板 | 已实现并验证（Linux） | [增强UI测试](tests/enhancements.spec.js)真实系统PNG剪贴板粘贴落盘、路径插入通过；[D2][D2]去重已验。未命名文稿需先保存；Windows剪贴板仍待验。 |
| I03 | 图片尺寸 [IMAGE][IMAGE] | 可视修改宽高并写入 HTML 图片属性；保持比例 | 共同 | 已实现待验证 | 宽度命令写入 HTML img；比例由 CSS 保持；操作与不同尺寸导出需 A20。 |
| I04 | 相对路径与转义 [IMAGE][IMAGE] | 相对路径、./ 前缀、空格/中文 URL；不静默重写旧引用 | 共同；路径分隔符差异 | 已实现并验证（Linux） | [U3][U3] 验证中文/空格/父目录解析，[D2][D2] 验证相对图片真实落盘；./策略未单独提供。 |
| I05 | 资源目录与根路径 [IMAGE][IMAGE] | 全局/文档目录模板与图片根目录；保存后引用稳定 | 共同 | 部分实现 | 图片目录/${filename}偏好与YAML根路径白名单已接；[U2][U2]/[D2][D2]Save As局部链接重写保BOM已验，遇自定义根提示检查。图片目录自动迁移和全UI配置组合待验。 |
| I06 | 图片移动/复制/重命名 [IMAGE][IMAGE] | 操作资源后同步引用；覆盖冲突明确提示 | 共同 | 已实现并验证（Linux） | [D2][D2]资源copy/move/rename真实执行，版本/哈希冲突和失败回滚通过；[增强UI测试](tests/enhancements.spec.js)复制含内联/引用式/HTML图并保混合EOL、跳过代码围栏。其他文稿引用不自动重写，Undo不还原垃圾桶。 |
| I07 | 批量移动/复制/下载图片 [IMAGE][IMAGE] | 所有引用一致更新；远程失败可恢复 | 远程需网络 | 已实现并验证（Linux） | [D2][D2]批量复制/移动/下载，HTTP404回滚、目标不覆盖、图像限额通过；内联/有效引用式/HTML img-src同步修改。[增强UI测试](tests/enhancements.spec.js)资源复制UI通过。picture/srcset与其他文稿引用不在扫描范围。 |
| I08 | 图片删除与原文件 [IMAGE][IMAGE] | 区分仅移除引用与删除实际资源 | 垃圾桶行为按系统 | 已实现并验证（Linux） | [D2][D2]区别unlink引用和delete原图，实际系统trash通过；先原子保存文稿，再处理旧资源。文稿Undo不恢复垃圾桶图片，其他文稿引用不检查。 |

## 五、文件与数据安全

| ID | 功能与官方来源 | 预期交互 / 验收标准 | 平台差异 | 状态 | 验收结果 / 缺项 |
| --- | --- | --- | --- | --- | --- |
| F01 | 文件树 [FILE][FILE] | 展开折叠、当前项、打开文件；键盘导航 | 共同；键盘导航为 1.14 新增 | 已实现并验证（Linux） | [增强UI测试](tests/enhancements.spec.js)真实Arrow/Home/End、F2重命名与撤销通过；树展开/打开已接。所有深嵌套与Windows仍需A24。 |
| F02 | 文件列表 [FILE][FILE] | 递归文章列表与树视图切换 | 共同 | 已实现待验证 | 树/列表切换与递归文件数据已接；真实操作 A24 待验。 |
| F03 | 大纲导航 [OUTLINE][OUTLINE] | 按标题层级导航与当前节标记 | 共同 | 已实现待验证 | 大纲层级导航和当前节高亮已补；滚动/选择联动实际A24待验。 |
| F04 | 大纲折叠、过滤与编号 [OUTLINE][OUTLINE] | 树/平铺、搜索标题、折叠、可选编号 | 共同 | 部分实现 | 大纲折叠/过滤/当前节点已接；[增强UI测试](tests/enhancements.spec.js)标题编号设置与呈现通过。全部滚动/选区联动仍需A24。 |
| F05 | 快速打开 [SEARCH][SEARCH] | 文件名模糊匹配、最近和固定文件夹；键盘选择 | Windows/Linux Ctrl+P | 已实现待验证 | 已补子序列模糊匹配排序与键盘选择，含当前目录/最近文件；固定目录跨目录搜索仍需验收。 |
| F06 | 最近文件/目录和固定 [FILE][FILE] | 重启保存；移除、清空和固定不丢失 | Windows JumpList另验收 | 部分实现 | 最近文件/固定目录状态与 [D2][D2] 持久化已接；清空历史/目录独立列表与Windows JumpList集成未完整覆盖。 |
| F07 | 排序与分组 [FILE][FILE] | 自然/字母/修改/创建；升降序；文件夹优先/分组 | 共同 | 部分实现 | [D2][D2]自然名称、创建/修改时间/大小、升降序、文件夹优先实际排序通过；独立纯字母排序选项尚缺。 |
| F08 | 过滤隐藏、非 MD 文件、glob [NEW14][NEW14] | 显示隐藏项、全部文件、自定义包含/排除规则 | 共同；1.14 新增 | 已实现并验证（Linux） | [D2][D2]验证隐藏项及include/exclude glob对文件树/全局搜索一致；非MD显示设置已接，Windows待验。 |
| F09 | 文件/目录创建与重命名 [FILE][FILE] | 验证路径、冲突提示；当前文档路径跟随 | 共同 | 已实现并验证（Linux） | [D2][D2] 实际创建/重命名并拒绝同名覆盖；当前路径跟随 UI 待补人工回归。 |
| F10 | 文件/目录移动与复制 [FILE][FILE] | 树中拖动或命令；明确目标；防止递归移动自身 | 跨分区处理需验收 | 部分实现 | [D2][D2] 复制及路径操作验证；移动命令已接，树内拖动/跨分区移动未完整测试。 |
| F11 | 删除至垃圾桶 [FILE][FILE] | 真实垃圾桶；取消与失败不丢内容 | 各系统实现不同 | 已实现待验证 | 真实 shell.trashItem 与确认提示已连接；系统垃圾桶、取消与恢复需 A23 人工验收。 |
| F12 | 撤销文件操作 [FILE][FILE] | 至少上一项重命名/移动可逆；冲突不覆盖 | 删除撤销不在当前本地实现范围 | 已实现并验证（Linux） | [增强UI测试](tests/enhancements.spec.js)F2文件重命名后撤销恢复名称通过；后端移动冲突保护已验。目录/跨分区/多步移动与删除撤销不在该结果内。 |
| F13 | 外部文件与目录变化 [FILE][FILE] | 新增/删除/原子替换自动刷新；无脏内容可重载 | watcher 在 W/L 分别验收 | 部分实现 | [D2][D2]600ms stat轮询实际检测原子替换/删除、目录新增，并释放不再使用的watcher；D1覆盖脏文冲突/重载。海量目录与各平台变化仍待回归。 |
| F14 | 外部编辑冲突 [SAVE][SAVE] | 本地脏内容禁止静默覆盖；另存/重载/保留均可选择（用户要求） | 共同 | 已实现并验证（Linux） | [U2][U2]、[D1][D1]、[D2][D2] 确认冲突不覆盖磁盘/本地，加载前保留恢复草稿。 |
| F15 | 原子保存 [SAVE][SAVE] | 同目录临时写入、刷盘、替换；失败保留原文（用户要求） | 文件系统/权限与平台差异 | 已实现并验证（Linux） | [U2][U2] 验证原子写失败保原文/清临时，排队保存冲突；文件系统末次检查到rename竞争边界见架构说明。 |
| F16 | 自动保存 [SAVE][SAVE] | 可设置间隔；进行中输入不丢；冲突暂停自动保存 | W/L使用应用定时设置 | 已实现待验证 | 延迟自动保存、保存中继续输入脏状态和冲突暂停已实现；需完整 A26 时序压力测试。 |
| F17 | 恢复草稿与崩溃恢复 [RECOVER][RECOVER] | 具路径/时间的草稿；未命名文件也恢复；不自动覆盖磁盘 | W/L提供应用恢复草稿 | 已实现并验证（Linux） | [D1][D1]真实SIGKILL后重启发现恢复草稿、载入为脏文再保存通过，原文件在明确保存前不变；[U2][U2]补并发写/丢弃不复活。延迟落盘前窗口仍存在。 |
| F18 | 历史版本与恢复 [RECOVER][RECOVER] | 查看、比较/恢复历史；恢复前保留当前版本（用户增强） | 本产品提供本地独立历史 | 已实现并验证（Linux） | [U2][U2]/[D2][D2] 实际历史写入和读取不改当前磁盘；UI恢复前草稿逻辑存在。 |
| F19 | 启动会话恢复 [FILE][FILE] | 重开文件、目录与位置；损坏会话配置可恢复 | 本地会话配置 | 部分实现 | [D2][D2] 会话路径/选区/模式落盘；启动恢复逻辑已接；[启动单次投递](artifacts/backend-validation/startup-single-delivery-validation.json)验证CLI/新窗口各读一次、初始化尾部早输入/dirty/取消关闭/保存稳定。全部多窗口会话未实现。 |
| F20 | 多窗口与多文档 [KEY][KEY] | 新窗口；重复打开文件冲突安全；切换窗口 | W/L多窗口 | 已实现待验证 | 实际 newWindow 与独立脏状态/共享文件冲突逻辑已接；双窗口并行人工 A30 待验。 |
| F21 | 全局搜索 [SEARCH][SEARCH] | 大小写、整词、正则；结果带文件/行定位；取消/错误提示 | 共同 | 已实现并验证（Linux） | [D2][D2]跨文件行号、Unicode整词、正则错误/超时、worker取消实际通过；glob过滤与大小写已接。巨大目录的全部上限/取消UI仍需人工验收。 |
| F22 | 复制路径、显示系统位置 [FILE][FILE] | 可从文件树操作；打开 Finder/Explorer/文件管理器 | 系统命令不同 | 已实现待验证 | 显示系统文件位置桥接已接；复制路径和菜单流程需 A23。 |
| F24 | 启动行为与默认文件扩展 [LAUNCH][LAUNCH] | 新文档、恢复目录、恢复文件、自定义目录；默认扩展可设 | W/L启动配置 | 部分实现 | 单会话恢复已接；默认扩展、自定义启动行为和重新打开选项未完整提供。 |
| F25 | 最近记录隐私与重开关闭文件 [STABLE][STABLE] | 可关闭最近历史记录；重新打开最后关闭文档 | 共同 | 已实现待验证 | 新增recordRecent持久设置与reopenClosed文档栈/命令；清除系统最近记录、重启边界和实际重开流程待验。 |
| F23 | 未保存关闭保护 [SAVE][SAVE] | 关闭/切换/退出时保存、放弃、取消；失败保持窗口 | 共同 | 已实现待验证 | 保存/保留恢复草稿/取消及before-close协议已接；所有失败关闭路径需 A30。 |

## 六、写作、界面与设置

| ID | 功能与官方来源 | 预期交互 / 验收标准 | 平台差异 | 状态 | 验收结果 / 缺项 |
| --- | --- | --- | --- | --- | --- |
| W01 | 文内查找替换 [SEARCH][SEARCH] | 大小写/整词/正则；替换分组；下一/上一/全部 | Mod 系统差异 | 已实现待验证 | CodeMirror 搜索替换面板与正则能力已连接；[D1][D1] 只检查面板出现，分组替换实际 A01 待验。 |
| W02 | 字数/字符/行/阅读时间 [COUNT][COUNT] | 全文与选区；中文每字一词；可配置阅读速度 | W/L状态栏 | 部分实现 | [U1][U1] 验证中文/英文/行/字符统计；当前统计包含源语法，选区统计和可配阅读速度不足。 |
| W03 | 拼写检查 [SPELL][SPELL] | 语言、建议、词典缺失反馈；词汇学习/撤销学习 | W系统或本地词典；L Hunspell | 部分实现 | 随包本地英语词典、原生建议/开关与缺失状态已实现；[新用户离线记录](artifacts/backend-validation/offline-spelling-validation.json)真实mispelled→misspelled建议通过，Chromium外部HTTP请求0，词典不会回退CDN。更多语言选择和撤销学习未完整覆盖。 |
| W04 | 括号引号自动配对 [PAIR][PAIR] | 输入/跳过闭合/退格删除；IME 中不错误配对 | 共同 | 已实现待验证 | CodeMirror 括号引号自动配对开关已接；实际配对、退格、IME交互 A03/IME 待验。 |
| W05 | Markdown 自动配对与包裹选区 [PAIR][PAIR] | 星号、反引号、下划线、数学等；开关细分 | 共同 | 部分实现 | [B1][B1]新增星号等Markdown自动配对与包裹选区通过；偏好入口已接；数学符号/细分规则仍不全等价。 |
| W06 | 智能标点 [SMART][SMART] | 弯引号、破折号、省略号；输入或仅渲染；代码/YAML/公式不转换 | W/L内建设置 | 部分实现 | [B1][B1]新增输入时弯引号/省略号测试，源码模式保留ASCII；渲染转换和设置已接；en dash/引号样式/Unicode重映射不全。 |
| W07 | 文本片段 [SNIPPET][SNIPPET] | 用户维护模板与快捷插入（用户要求，Typora 无内建） | Typora推荐外部替换；本产品提供本地片段 | 已实现待验证 | 可持久维护片段并从命令面板插入；[D2][D2] 证明配置落盘，插入与快捷触发需实际验收。 |
| W08 | Markdown 格式整理 [FORMAT][FORMAT] | 显式命令，可撤销；说明重排影响；不自动格式化保存 | Typora 使用 Pandoc/外部命令，非内建 | 已实现并验证（Linux） | [D2][D2] 真实 Pandoc 格式整理与缺工具错误通过；UI应用使用一次可撤销文本事务。 |
| W09 | 专注模式 [FOCUS][FOCUS] | 淡化非当前块；保留可访问性 | 共同 | 已实现待验证 | 专注淡化CSS与菜单设置已接；当前块视觉和可访问性 A32 待验。 |
| W10 | 打字机模式 [FOCUS][FOCUS] | 输入时光标居中；鼠标选择是否居中可配置 | 共同 | 已实现待验证 | 输入/选区变化居中滚动实现；稳定持续输入、鼠标选项 A32 待验。 |
| W11 | 全屏、缩放、置顶 [KEY][KEY] | 菜单/快捷键控制；重置缩放；文字完整 | 快捷键/系统全屏不同 | 部分实现 | [D2][D2] 实际缩放/复位已验；全屏逻辑存在；置顶入口尚缺。 |
| W12 | 原生菜单与右键菜单 [KEY][KEY] | 所有入口真实连接；操作可用状态准确 | W/L窗口菜单 | 部分实现 | 原生菜单与右键按应用语言单语显示，[原生语言记录](artifacts/backend-validation/native-language-validation.json)验证应用定义标题/主动作；所有命令与各平台禁用态仍需分别验收。 |
| W13 | 浮动格式工具栏 [NEW14][NEW14] | 选择/编辑时格式操作；开关；不抢夺 IME 焦点 | 1.14 新增 | 部分实现 | 选区浮动工具栏与顶部工具已接，[D1][D1] 粗体按钮实际生效；开关/IME焦点待补。 |
| W14 | 自定义快捷键 [KEY][KEY] | 持久配置；冲突反馈；即时生效或明确重启提示 | W/L应用内快捷键配置 | 部分实现 | [D2][D2]真实原生菜单accelerator随自定义替换、非法按键拒绝、恢复默认及设置持久化通过；完整快捷键冲突检测与所有系统组合键尚未覆盖。 |
| W15 | 中英文界面 [INDEX][INDEX] | 主界面、菜单、设置、错误及对话框语言一致 | 共同；用户最低要求中英 | 部分实现 | 新用户默认英语；[真实Electron流程](tests/ux.spec.js)验证首次语言条/设置即时切换且保留文本选区撤销，表格/资源/导出/公共对话框已接双语，[9组UI](artifacts/ui-polish-validation/results.json)及[原生语言](artifacts/backend-validation/native-language-validation.json)有实际证据。系统文件选择器自身控件遵循OS语言；所有异常分支文案与Windows实机仍待全量核对。 |
| W16 | 明暗与系统主题 [THEME][THEME] / [NEW8][NEW8] | 明/暗/跟随系统；可单独配置主题 | 1.8 起 Linux 也支持跟随系统；旧主题文档有滞后 | 已实现并验证（Linux） | [D1][D1] 明暗主题实际切换，[D2][D2] 配置落盘；系统主题事件已接，Windows待验。 |
| W17 | 原创 CSS 主题与自定义 CSS [THEME][THEME] | 导入/选择 CSS；错误反馈；主题目录；保存即生效 | 不得复制 Typora 自带主题素材 | 部分实现 | [增强UI测试](tests/enhancements.spec.js)CSS主题库选择与持久化通过；[D1][D1]真实CSS导入/明暗切换已验。自定义CSS即时应用；外部目录实时扫描和全部主题兼容未覆盖。 |
| W18 | 字体、宽度、行距与段间距 [THEME][THEME] | 设置写作区版式；字体回退；导出可保持 | 字体是否安装由系统决定 | 已实现待验证 | 字体/宽度/字号/行高CSS已接；各平台字体回退与导出一致性待 A31/A33。 |
| W19 | RTL 排版 [RTL][RTL] | 双向文字、光标与段落方向；导出保持 | Typora 官方标为实验性 | 部分实现 | CodeMirror 基础双向文本与用户CSS可用；独立RTL设置和光标/导出未验。 |
| W20 | 设置持久化与即时生效 [INDEX][INDEX] | 重启还原；损坏配置回退；适用选项无重启生效 | 各平台用户数据目录不同 | 已实现并验证（Linux） | [D2][D2]参数校验/设置持久化，损坏theme/recentFiles类型可正常启动、备份并明确警告；备份失败则原文件不变、暂停自动设置持久化，显式更改必须先完成备份；[D1][D1]主题/语言即时生效及侧栏/导出预设持久化通过。 |
| W23 | 换行符与编辑/导出空白策略 [SPACE][SPACE] / [WIN][WIN] | 新文档 LF/CRLF；编辑/导出分别配置空白和软换行，不修改未编辑文件 | 默认换行遵循平台/设置 | 部分实现 | 原换行/空白保真已验；[解析策略](docs/MARKDOWN_PARSER_OPTIONS.md)编辑/导出独立软换行通过8项策略测试的相关用例。新文档LF/CRLF选择和连续空格独立排版仍有差距。 |
| W24 | 鼠标滚轮与触控板缩放 [NEW8][NEW8] | Ctrl+滚轮可开关 | 平台输入设备差异 | 部分实现 | 新增Mod+滚轮缩放及持久开关，带触发节流；真实鼠标/触控板仍待平台验收。 |
| W25 | 侧栏尺寸调整 [NEW13][NEW13] | 拖动侧栏边界、合理最小宽度与持久恢复 | 共同 | 已实现并验证（Linux） | [D1][D1]真实方向键调整到266px并读取持久设置通过；拖动分隔条与180–500px边界已接，鼠标/触控/窄窗口需补验。 |
| W22 | 主题调试与高级设置 [THEME][THEME] | 打开主题/配置目录；开发工具用于 CSS 检查 | W/L Chromium DevTools | 部分实现 | 开发时可调试CSS；面向用户的主题/高级配置目录与调试入口未完整提供。 |

## 七、导出、打印与系统集成

| ID | 功能与官方来源 | 预期交互 / 验收标准 | 平台差异 | 状态 | 验收结果 / 缺项 |
| --- | --- | --- | --- | --- | --- |
| X01 | HTML 带样式 [EXPORT][EXPORT] | 离线打开含中文、图片、公式、图表；可附目录 | 共同 | 部分实现 | [D1][D1]完整样例5图、数学与图片生成；[H2][H2]25类图表导出HTML经独立file://窗口重开，全部中文标签、零脚本/外部图片通过；独立HTML大纲/附加内容配置尚未完整实现。 |
| X02 | HTML 无样式 [EXPORT][EXPORT] | 语义 HTML，不含主题；可选择附加内容 | 共同 | 已实现并验证（Linux） | [D2][D2]真实窗口打开无style的HTML，恰好一个原生MathML公式和保留的SVG文字可见，已看[实物图][PLAIN]；自定义附加内容配置另列X13。 |
| X03 | PDF [EXPORT][EXPORT] / [NEW10][NEW10] | 实际渲染；中文、图像、公式、图表及长内容完整 | 1.10 起 W/L 均支持深色 PDF；旧 Export 文档有滞后 | 已实现并验证（Linux） | [D2][D2]两页A4中文/图片/数学/静态SVG与书签已验；[D1][D1]主UI重导出Mermaid中文字通过；长文档视口外lazy图片加载也有真实PDF回归。Windows未验。 |
| X04 | PDF 书签与元数据 [OUTLINE][OUTLINE] | 标题书签可跳转；title/author/keywords 等 | 逐环境验收 | 部分实现 | [D2][D2] PDF /Outlines存在且文字可提取；完整书签点击与YAML author/keywords元数据映射未完。 |
| X05 | 纸张、边距、分页 [EXPORT][EXPORT] | A4/A5/自定义、方向、H1 分页、CSS 分页、表格跨页 | 打印引擎差异 | 部分实现 | [D2][D2] A4两页、手动分页实物通过；纸张/方向/边距设置已接，自定义尺寸/H1自动分页未覆盖。 |
| X06 | 页眉页脚与页码 [EXPORT][EXPORT] | 文档变量、总页数、边距，不遮正文 | 共同 | 已实现待验证 | Chromium页眉/页脚HTML和页码占位已接；实际多页结果、变量与遮挡待验。 |
| X07 | 图片导出 [EXPORT][EXPORT] | PNG/JPEG 及尺寸/质量/字体设置；超长文档明确限制 | 设备像素比影响 | 已实现并验证（Linux） | [D1][D1]主UIPNG含正确中文/公式/Mermaid并实际打开；[D2][D2]JPEG真编码与打开检查通过，质量/宽度参数已接。超长尺寸会明确拒绝，未提供分段。 |
| X08 | 打印 [EXPORT][EXPORT] | 系统打印对话框、预览、取消不报成功 | 需要打印服务/设备验证 | 已实现待验证 | 独立窗口webContents.print真实逻辑已接；当前无真实打印机/系统对话框验收，需A36。 |
| X09 | Pandoc 检测与路径配置 [PANDOC][PANDOC] | 版本、路径、缺失/失败/超时反馈；核心编辑不依赖 | 各平台二进制路径不同 | 已实现并验证（Linux） | [D2][D2]检测本地Pandoc3.13、成功转换、无效路径清晰失败；不依赖网络。 |
| X10 | 导出模板与参考文档 [EXPORT][EXPORT] | LaTeX template、docx reference-doc、ODT 模板、EPUB CSS/封面 | Pandoc 格式能力不同 | 已实现待验证 | 模板/参考文档选择及后端参数已接；每种模板/EPUB封面CSS组合需实际文件验收。 |
| X11 | 自定义导出配置与命令 [EXPORT][EXPORT] | 增删/排序/命名配置；参数与变量；结果和错误展示 | 外部工具需安装；明确命令执行范围 | 部分实现 | [D1][D1]命名预设保存、持久化及选择后恢复JPEG格式/质量78已验；删除入口已接；排序/重命名/任意自定义导出命令仍缺。 |
| X12 | 重复上次导出 [EXPORT][EXPORT] | 当前文档记录设置；重复导出/明确覆盖前一目标 | 共同 | 已实现待验证 | 独立export模块已保存成功导出参数并接repeatExport命令；重复目标确认/文档变化与失败分支需主UI回归。 |
| X13 | 导出主题、YAML 覆盖与额外 HTML [EXPORT][EXPORT] | 独立主题；默认不从不信任文档执行附加脚本 | 共同 | 部分实现 | 导出有独立CSS并禁用户脚本；YAML元数据覆盖、附加HTML和独立主题选择未完整实现。 |
| X14 | 导出后操作 [EXPORT][EXPORT] | 成功后打开文件/目录或明确配置命令；失败不报成功 | 系统默认应用不同 | 部分实现 | openExport已实现文件/目录OS opener，D2验证白名单和失败传播但shell使用stub，真实系统阅读器未打开；任意成功后命令尚未提供。 |
| X15 | 文件关联与命令行 [CLI][CLI] | 双击 .md、命令行文件/目录、第二实例转发 | W注册表；L desktop/MIME | 部分实现 | [D1][D1]/[D2][D2] CLI传入中文文件启动通过，fileAssociations配置存在；安装关联/第二实例仍需真实包验收。 |
| X16 | 新窗口/重开命令行参数 [CLI][CLI] | --new / --reopen-file 或等价能力有说明 | 官方主要 W/L | 部分实现 | CLI文件/目录已接；--new/--reopen-file等价参数未提供。 |
| X17 | Windows JumpList 最近项 [FILE][FILE] | 最近文档与固定入口可用并可清空 | W专属 | 部分实现 | app.addRecentDocument已连接；原生JumpList固定及清理未在Windows验收。 |
| X19 | Windows/Linux安装包 [HOME][HOME] | W安装包/ZIP、L包；实际启动及卸载验证 | 签名与架构按平台独立验收 | 部分实现 | 最终五包已生成；[交付记录](docs/DELIVERY.md)含大小/SHA。Linux三包提取后测试模式（--no-sandbox）、最早编辑/保存与图标SHA通过；Windows PE/ICO/ZIP静态通过，原生运行、安装/文件关联/卸载待验，Windows包未签名。 |
| X21 | Windows 安装选项与新建 Markdown [WIN][WIN] | 每用户免管理员安装、静默安装、新建菜单注册 | W 专属 | 已实现待验证 | 0.3 NSIS配置English/简体中文选择、默认英语、安装后写语言种子；[实际hook](artifacts/installer-language-validation/results.json)双语JSON已编译并由Wine执行。[完整安装器Wine UI](artifacts/windows-installer-ui/results.json)已验证实际两项语言/默认英语/本地化首屏/取消，临时前缀本机CJK字体下截图可读；没有执行安装。每用户/静默安装、新建菜单注册和Windows实机待验。Linux在首次启动选择应用语言，不虚构包管理器语言页面。 |
| X22 | Linux Wayland 与 IME [NEW11][NEW11] | Wayland 启动、文字输入协议、中文组合输入 | L；X11 通过不代表 Wayland 通过 | 受阻 | 当前仅Linux Xvfb/X11自动化环境，无真实Wayland+IME。需在Wayland会话实测，不由Xvfb结果外推。 |
| X23 | VSCode / Cursor 编辑器扩展 [NEW13][NEW13] | 从编辑器文件右键启动本产品；不借用Typora扩展商标 | 官方1.13提供独立扩展 | 已实现待验证 | [VSIX][VSIX]独立源码/中英文菜单/本机路径与参数设置已交付；[EXTTEST][EXTTEST]13项Node测试及真实安全argv通过，0.3 VSIX已打包且提供品牌PNG逐字节一致。未在VSCode/Cursor宿主或Windows实机验收。 |
| X20 | 离线运行与资源打包 [HOME][HOME] | 断网启动编辑、公式/图表、主题和原生导出可用 | 远程媒体/Pandoc安装下载另需网络 | 部分实现 | 核心资源本地打包，D1离线桌面渲染可见；断网完整冷启动/全部图表/字体及原生导出需A38覆盖。 |

0.2范围验收补充：退役上传/同步字段安全迁移、旧IPC拒绝、文稿/图片原字节保留，见[迁移记录](artifacts/backend-validation/settings-migration-validation.json)。品牌18份应用资产哈希及6项视觉验证见[品牌记录](docs/BRANDING.md)。

## 八、Pandoc 格式方向（必须分开验收）

官方 [Pandoc FAQ][PANDOC] 给出导入扩展清单；[Export][EXPORT] 给出更广的导出项及自定义 Pandoc 机制。下表“未列”不等于 Pandoc 本身不能读，而是官方未承诺原生入口。ODT的导入方向在FAQ未列；RTF虽也漏列，但[1.3稳定日志][NEW3]明确修复其导入选择器，足以确认官方RTF导入入口。运行时仍按Pandoc实际reader/writer分别检测。

| ID | 格式 | reader/writer 或扩展 | Typora 官方导入 | Typora 官方导出 | 本项目导入状态 | 本项目导出状态 | 独立验收结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | Word [来源][PANDOC] / [导出][EXPORT] | `docx` | 是 | 是 | 已实现并验证（Linux） | 已实现并验证（Linux） | [D2][D2]DOCX双向及资源导入data URI通过；[D1][D1]主UI真实Mermaid→PNG嵌入DOCX并回读，已实际检查DOCX内嵌PNG非空及中文回读；[DOCX实物][DOCXPNG]保留。复杂Office整页排版待验。 |
| P02 | OpenOffice [来源][PANDOC] / [导出][EXPORT] | `odt` | FAQ 未列为导入 | 是 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]ODT实际应用导出/导入和reader回读中文均成功；ODT阅读器样式与复杂内容待验。 |
| P03 | RTF [来源][NEW3] / [导出][EXPORT] | `rtf` | 是，1.3日志明确（FAQ漏列） | 是 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]RTF应用导出/导入与reader回读成功；Pandoc3.13具RTF reader，不沿用旧版读写限制。 |
| P04 | EPUB [来源][PANDOC] / [导出][EXPORT] | `epub` | 是 | 是 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]EPUB应用导出/导入和中文回读成功；封面/章节/资源与EPUB阅读器排版待验。 |
| P05 | LaTeX [来源][PANDOC] / [导出][EXPORT] | `latex / tex / ltx` | 是 | 是 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]LaTeX应用双向和中文回读通过；.tex/.latex/.ltx别名已接，宏/图片/模板需独立验收。 |
| P06 | MediaWiki [来源][PANDOC] / [导出][EXPORT] | `wiki / mediawiki` | 是（.wiki） | 是 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]MediaWiki应用双向与reader回读成功；扩展语法不保证等价。 |
| P07 | DokuWiki [来源][PANDOC] / [导出][EXPORT] | `dokuwiki` | 是 | 可由其他 Wiki 配置 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]DokuWiki应用双向与reader回读成功；复杂语法待验。 |
| P08 | reStructuredText [来源][PANDOC] / [导出][EXPORT] | `rst / rest` | 是 | 是 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]RST应用双向与reader回读成功；rst/rest别名已接，复杂表格待验。 |
| P09 | Org mode [来源][PANDOC] / [导出][EXPORT] | `org` | 是 | 可由其他 Pandoc 配置 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]Org应用双向与reader回读成功；高级Org元数据和任务语义待验。 |
| P10 | Textile [来源][PANDOC] / [导出][EXPORT] | `textile` | 是 | 是 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]Textile应用双向与reader回读成功；复杂内容待验。 |
| P11 | OPML [来源][PANDOC] / [导出][EXPORT] | `opml` | 是 | 是 | 已实现并验证（Linux） | 已实现并验证（Linux基础转换） | [FMT][FMT]OPML应用双向与reader回读成功；深层大纲与应用互通待验。 |
| P12 | Reveal.js 演示 [来源][PANDOC] / [导出][EXPORT] | `revealjs / html` | 未列 | 是 | 已实现并验证（按HTML导入） | 部分实现 | [FMT][FMT]Reveal.js HTML输出/HTML应用导入回读成功；浏览器演示和离线Reveal资源待验，不能仅凭HTML文字算演示完整。 |
| P13 | 其他演示（PPTX/Beamer 等） [来源][PANDOC] / [导出][EXPORT] | `pptx / beamer` | 未列 | 可由自定义 Pandoc 配置 | 已实现并验证（Linux） | 部分实现 | [FMT][FMT]PPTX应用双向、Beamer导出并经LaTeX应用导入回读成功；PowerPoint/TeX引擎实际渲染待验，PDF引擎另列受阻。 |
| P14 | 其他 Markdown 方言 [来源][PANDOC] / [导出][EXPORT] | `gfm / commonmark / markdown 等` | 原生文本打开 | 可配置导出 | 已实现并验证（原生文本打开） | 已实现并验证（Linux） | [FMT][FMT]markdown/gfm/commonmark/markdown_strict/markdown_mmd均输出回读中文；日常原生Markdown打开另由D1验证。转换允许重序列化。 |
| P15 | PDF（Pandoc/LaTeX） [来源][PANDOC] / [导出][EXPORT] | `pdf` | 未列 | 是，需添加配置 | 不列为原生导入 | 受阻 | 独立pandoc-pdf桥接已接；当前无TeX/PDF引擎，需安装并配置中文字体后验收。PDF导入不列为官方支持。 |
| P16 | 其他 Pandoc 格式 [来源][PANDOC] / [导出][EXPORT] | `运行时格式列表` | 以 reader 为准 | 以 writer 为准 | 部分实现 | 部分实现 | [FMT][FMT]额外AsciiDoc/JSON应用双向与reader回读通过；动态reader/writer检测已接。其他注册格式与任意自定义配置需逐方向验收。 |


## 九、稳定版范围与差距

TextBundle/TextPack 在 [1.8][NEW8]、[1.10][NEW10] 仍被明确限定为 dev 实验功能，不纳入稳定版强制基线；保留为后续候选。购买、激活与 Typora 账号管理属于该商业产品授权机制，不复制到独立产品。无内建 Quick Look 插件，官方建议第三方，因此不冒充原生对标缺项。

### 验收边界

实现过程中需要逐行更新状态和证据。桌面端“已实现并验证”不能仅依据浏览器界面截图；中文输入法不能仅依据程序插入中文字符串；文件恢复不能仅依据内存状态；PDF 不能仅依据文件存在。跨平台配置文件及 CI 工作流不等于 Windows 已测试。

优先补齐顺序：编辑保真与冲突安全 → 同区交互和 IME → 表格/资源 → 导出实物检查 → 平台原生能力。未实现项应保留在矩阵，说明其缺少的真实行为和可执行后续步骤。

## 官方来源索引

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

[U1]: tests/editor-core.test.js "源文/表格单元测试"
[U2]: tests/storage.test.cjs "存储单元测试"
[U3]: tests/markdown.test.js "Markdown渲染测试"
[D1]: tests/desktop.spec.js "主UI Electron测试"
[D2]: tests/backend-e2e.spec.js "后端Electron测试"
[PERF]: artifacts/desktop-validation/performance.json "1.19MB性能测量"
[PDF]: artifacts/backend-validation/export.pdf "2页中文导出PDF"
[PNG]: artifacts/backend-validation/export.png "中文导出PNG"
[DOCX]: artifacts/backend-validation/roundtrip.docx "Pandoc DOCX"
[DOCXMD]: artifacts/backend-validation/roundtrip-import.md "DOCX回读文本"

[B1]: artifacts/editor-validation/results.json "独立Chromium编辑21组回归与性能报告"

[FMT]: artifacts/backend-validation/formats/manifest.json "21种Pandoc输出与回读验证"

[NEW3]: https://support.typora.io/What's-New-1.3/ "Typora 1.3"
[NEW13]: https://support.typora.io/What's-New-1.13/ "Typora 1.13"
[OLD990]: https://support.typora.io/What's-New-0.9.90/ "早期稳定继承语法依据"

[U4]: tests/document-config.test.js "安全YAML图片设置测试"
[SAMPLE]: artifacts/desktop-validation/acceptance.html "真实Electron完整样例HTML"
[VSIX]: integrations/vscode/README.md "独立VSCode/Cursor扩展"
[EXTTEST]: artifacts/documentation-validation/extension-tests.tap "扩展13项Node行为测试"

[U5]: tests/source-history.test.js "换行图与400状态逐字节撤销回归"

[DOCXPNG]: artifacts/desktop-validation/writing.docx "真实DOCX内嵌图表"

[H2]: artifacts/desktop-validation/diagram-catalog-validation.json "Electron25类图表HTML实际离线重开"
[PLAIN]: artifacts/backend-validation/plain-mathml.png "无样式HTML原生MathML与SVG实物"
