# UI 改版功能保留基线

记录对象：Inkstone **0.3.0**，2026-11-08，Linux x64 / Electron 45.2.3。此记录在UI改动前取得，作为后续专业桌面界面升级的保留约束。它不是新的完整Typora对标声明；功能已有边界沿用 [FEATURE_PARITY.md](../FEATURE_PARITY.md)，不得在改版中把“部分实现”擅自写成已完成。

## 改版前真实证据

- [完整回归日志](../artifacts/ui-redesign/before/regression.log)：**90项单测、21组编辑器浏览器、10组公式浏览器、9组UI浏览器、67项Electron测试全部通过**。Electron测试含34后端、14主UI、6增强和13生命周期/写作流程。无跳过项计作通过。
- [实际入口清单](../artifacts/ui-redesign/before/inventory.json)：64个应用分发分支、52个编辑器命令分支、82个固定命令面板条目及2个默认文本片段、55个有稳定ID/role的原生菜单动作、40项设置控件、15项导出参数控件、27种导出格式入口。命令分支数量不等于独立用户功能数量；格式分支和动态命令另外保留。
- [截图记录](../artifacts/ui-redesign/before/recapture.log)：15张真实Electron截图，使用真实桌面IPC。**隔离边界更正：该历史截图运行未显式设置 Playwright `chromiumSandbox:true`，Playwright 默认注入 `--no-sandbox`；不能将其视作操作系统进程沙箱验证。当前宿主 AppArmor 限制非特权 user namespace，Electron 本地 helper 未以 root/setuid 安装，新测试仅在显式 `INKSTONE_TEST_NO_SANDBOX=1` 时允许这个测试环境限制，默认仍要求沙箱。**临时本地文稿包含中文、标题、任务列表、引用、行内/块级数学、表格、代码、Mermaid和本地SVG。过程中没有改写原文，源码/即时模式切换保留选区，保存后CRLF源字节一致，pageerror为空。
- [固定文稿](../artifacts/ui-redesign/before/fixture.md)及inventory内SHA-256用于重复截屏。捕获前将光标放在首段并等待布局，避免CodeMirror延迟滚动把“写作首页”误拍成文尾。
- 原始src/electron/package的工作副本留在开发环境 `.tools/design-baseline-0.3`；inventory中的源文件hash对应该快照，`dist/index.html` hash对应实际运行的改版前构建。开发缓存不属于交付依赖。

浏览器组中的桌面IPC模拟只证明相应UI行为；本次截图脚本及Electron集成组才使用真实IPC。150%截图是Electron界面缩放，不等于Windows物理DPI或跨屏缩放验收。Windows原生安装、文件关联、微软拼音、DPI和系统控件未因截图而成为已验证。

## 必须保留的功能与入口

下表允许改变位置、图标、标签或菜单分组；命令行为、快捷键、持久设置以及安全约束必须保留。收起按钮时，应至少保留一个容易发现的菜单/上下文入口；不能只保留内部API。

| 功能域 | 现有入口 / 稳定命令 | 改版后必须复验 |
| --- | --- | --- |
| 新建、打开、保存 | 原生File菜单、`new/open/save/saveAs`；Ctrl+N/O/S、Ctrl+Shift+S | 当前文件与未命名文件保存正确；Save As取消/失败保留内容；未编辑字节/mtime不变 |
| 窗口与退出 | `newWindow/close/quit`；原生窗口关闭、File Quit、Ctrl+W/Q | Save/Don't Save/Cancel三种选择一致；多窗口退出先全部确认；Cancel恢复编辑，干净窗口直接关闭 |
| 启动与异步安全 | 初始文稿/目录扫描、恢复提示条、关闭只读保护 | 打开过程不允许输入被异步结果覆盖；已批准退出后不能插入迟到图片；提交时再核对文稿快照 |
| 源文编辑与即时渲染 | `source`、顶部模式按钮、Ctrl+/ | CRLF/LF/CR/BOM、YAML、HTML、空白、未知语法、相对资源引用保持；20次切换及选区、撤销链不重建 |
| 光标、选择与剪贴板 | CodeMirror键盘、跨块鼠标拖选、系统剪贴板、`copyRich/copyHTML/copyPlain` | 连续中英文输入、跨块选择、文本/HTML/TSV复制粘贴、撤销重做、组合输入期间不重复不丢字 |
| Markdown格式 | `heading1..6/bold/italic/strike/highlight/sub/sup/quote/bullet/ordered/task/link/code/hr/toc/footnote` | 菜单/工具栏/快捷键仍调用原命令；局部改动；嵌套列表Enter/Tab/Shift+Tab及任务状态可撤销 |
| 结构编辑 | `deleteBlock/deleteSentence/deleteWord/clearFormatting/moveParagraphUp/moveParagraphDown`；编辑器缩进、段落、删除样式命令 | 源文局部补丁、选区和混合换行撤销正确；不能因工具栏收起而失去可访问入口 |
| 数学公式 | `math/copyMathML/refresh`；点击/双击渲染公式、方向键、Ctrl+Enter | 行内与块级公式直接在正文重编辑；KaTeX/MathJax源区定位、实时预览、错误保留、撤销、保存重开；命中区域不能被CSS破坏 |
| 代码 | `codeFence/codeLanguage/copyCode`；高亮、行号、缩进、换行、默认语言设置 | 围栏正文可重新编辑；未知语言原样保留；长代码可横向滚动或换行；复制不带行号 |
| Mermaid与传统图表 | fenced mermaid/flow/sequence、`refresh`、图表明暗主题设置 | 渲染后可回到围栏正文；错误可修改；中文SVG和离线渲染；25类图表生产导出继续通过 |
| 正文表格 | 点击单元格、Tab/Shift+Tab、粘贴、`table/tableEdit/tableAction` | 行列增删、移动、对齐及TSV输入仍可访问；单元格IME/撤销；只读或关闭时旧表格对话框不能Apply |
| 图片插入 | `insertImage/insertImageURL/resizeImage`；拖放、系统PNG剪贴板 | 本地路径/URL、中文空格括号路径、尺寸及Save As相对路径重定位；禁止重引上传或云服务 |
| 图片资源管理 | `collectImages/manageImages/downloadImage` | 批量复制/移动/重命名/引用删除/文件删除/显式URL下载；准备取消、失败回滚、提交期间锁定与冲突提示 |
| 文件树与列表 | Files标签、筛选框、树/列表切换、`openFolder/newFile/newFolder/fileOperation` | 键盘roving focus、展开/收起、父节点、F2重命名；文件/目录复制、移动、垃圾桶与重命名撤销 |
| 工作区导航 | `pinFolder/quickOpen/reopenClosed/undoFileOperation/copyPath/clearRecent` | 固定/最近目录、最近文件、自然排序/过滤、快速打开搜索、重开关闭文稿与文件操作撤销仍可发现 |
| 大纲与文内链接 | Outline标签、`outline/followLink` | 层级/折叠/当前位置高亮、标题编号、锚点、脚注和跨文件相对链接；滚动不破坏编辑选区 |
| 搜索与替换 | Search标签、`find/replace/globalSearch`；Ctrl+F、Ctrl+Shift+F | 正则/大小写/整词、全文搜索取消、include/exclude；不因窄侧栏裁掉结果或输入控件 |
| 历史、恢复、冲突 | `history/recovery`、恢复提示条、外部冲突条 | 恢复前保护当前内容；Compare/Load disk/Save a copy可访问；外部读取遇新输入不覆盖；Don't Save草稿不复活 |
| 写作辅助 | `statistics/readOnly/focus/typewriter/fullscreen/sidebar/zoomIn/zoomOut/zoomReset`、F8/F9/F11 | 字数/选择统计、行列和编码状态；专注/打字机/全屏/缩放；只读可选择复制、不可修改 |
| 输入与拼写 | 自动配对、Markdown配对、智能标点、tabSize、本地spellcheck | 默认值与持久偏好不被视觉改版重置；本地词典继续离线；候选输入期间模式/关闭行为受保护 |
| 命令面板与快捷键 | `commands`、Ctrl+Shift+P、所有固定/动态命令、自定义shortcuts | 82固定命令及两个默认snippet均能搜索；键盘上下/Enter/Escape、焦点恢复、快捷键重定义 |
| 语言与主题 | `settings`、首次语言提示、`locale/theme/customCSS/themeLibrary` | 英语默认、English/简中即时切换、明暗/系统主题、CSS主题库保存导入导出删除；已有用户值不重置 |
| 字体与版式 | fontFamily/fontSize/lineHeight/contentWidth、lineNumbers/codeWrap | 字体回退、长中文/长代码、窄宽度与缩放；仅视觉变化不得重置文档、撤销栈或写入源文 |
| 导入与格式整理 | `import/format`，本机Pandoc检测与路径配置 | 真实转换入口、依赖缺失/错误反馈；格式整理需显式确认，不能变成普通保存的隐式重写 |
| 原生导出与打印 | `export/repeatExport/print`；PDF、styled/plain HTML、PNG/JPEG | 生成文件能重开；中文、公式、图表、图片、分页和PDF书签；参数、busy、失败、结果提示保持 |
| Pandoc导出与模板 | 22个Pandoc相关格式入口、模板/reference、参数与导出profiles | 所有27格式入口不减少；仅适用参数显示，但隐藏字段不得阻止其他格式；保留格式方向检测 |
| 桌面品牌与离线 | 提供的标志/图标、应用菜单/窗口metadata、本地数据目录 | 不替换为临时图形或网络字体；Windows主目标/Linux保留，原始inkstone-brand不改；本地核心不依赖网络 |

## 控件清单边界

40个当前设置表单字段：

```text
autoPair, autoPairMarkdown, autoSave, autoSaveDelay, cjkEmphasis, codeWrap,
contentWidth, customCSS, defaultCodeLanguage, excludeGlobs, exportSoftBreaks,
fileSort, focusMode, foldersFirst, fontFamily, fontSize, imageFolder,
includeGlobs, lineHeight, lineNumbers, locale, mathNumbering, outlineNumbering,
pandocPath, recordRecent, sequenceTheme, shortcuts, showAllFiles, showHidden,
smartPunctuation, smartPunctuationInput, snippets, softBreaks, sortDescending,
spellcheck, strictMarkdown, tabSize, theme, typewriterMode, wheelZoom
```

另外有主题库、资源选择、模板、快捷键/片段JSON等按钮驱动操作；上述字段计数不能代替这些流程。导出格式的完整ID和选项标签见inventory，动态工具探测和复杂Office/EPUB排版仍沿用已有验收边界。

## 截图检查表

改版前（0.3）的实物截图已在 0.9.0 清理历史截图时移出仓库，需要时可从 Git 历史中取回。检查重点保留如下：

| 场景 | 改版后检查重点 |
| --- | --- |
| 英语明亮写作与文件树（1280 / 800） | 标题/导航/正文层次；无需大面积空白或卡片；全部控件可访问 |
| 深色写作（1280 / 800） | 文本对比、选区、文件树当前项、公式与代码一致 |
| 中文与缩放（中文 / 150%） | 标签换行、控件溢出、中文回退；不当作Windows原生DPI证据 |
| 设置（明亮 / 深色 / 800） | 分类、字段密度、滚动区域、固定动作区与完整字段 |
| 导出与命令面板 | 格式/参数层级、键盘操作、busy及反馈、所有命令保持可发现 |
| 大纲与正文源码 | 结构树当前项、光标、选区、源码排版和模式稳定 |
| 公式及结构内容（公式编辑 / 数学、图表、图片） | 数学命中范围、同区编辑、错误、图表与资源排版不退化 |

实看基线发现：正文块间距较松、同一视图出现外层和编辑区滚动条、设置背板使用模糊效果、工具栏字形符号不统一。这些是可调整的视觉/布局问题，不构成删除命令或改变源文模型的理由。

## 改版后执行与通过条件

```bash
npm run build
npm run test:all
# 真实Electron；Linux无显示会话时用xvfb-run -a或已有DISPLAY
node scripts/capture-design-baseline.mjs --stage after
```

`capture-design-baseline`在临时profile和文件夹操作，不读写用户文稿。after读取已封存的before清单，逐一搜索82固定命令和默认片段，检查原生动作ID/role、应用/编辑器分支、设置与导出字段/格式集合不减少；同一固定文稿在主题、语言、宽度、缩放和源码模式变化后仍逐字节一致。缺项或pageerror导致非零退出，不能靠更新baseline来掩盖删除。若合法重构改变了模块位置或命令标识，需要提供旧→新映射及真实入口验证，不能仅删掉比较项。

最终还须重跑数学、文件安全和关闭保存专门测试，检查实际导出实物，并逐张比较before/after。功能清单、源码集合比较、截图和测试各证明不同方面；均不能独自代替完整功能保留。

## 取证修正

0.4独立复核发现Playwright的Electron launcher默认注入`--no-sandbox`，旧记录中“参数没有显式写这个标志”不能证明正常沙箱运行。现已显式控制`chromiumSandbox`并核对实际进程argv；本机AppArmor限制非特权user namespace，默认沙箱启动失败。本次功能/截图测试使用明确的`INKSTONE_TEST_NO_SANDBOX=1`，不修改宿主安全策略，也不把绕过加入产品启动流程。原0.3功能基线不变；为了修复150%截图被CDP裁截的问题，使用保留的0.3实际Linux包重新捕获同一文稿全部15张截图，`webContents.capturePage`记录完整窗口像素。after与before均标明此边界。
