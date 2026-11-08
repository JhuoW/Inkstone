# Mermaid 类别与离线验收（Inkstone 0.2）

核对日期：2026-11-08。Typora 官方[图表文档](https://support.typora.io/Draw-Diagrams-With-Markdown/)和[稳定更新日志](https://typora.io/releases/stable?no-warning=)列出的图表按类别独立验证。当前墨石打包 Mermaid 12.3.0；不能由版本号或依赖存在推断功能通过。

## 复现与范围

```bash
node scripts/verify-mermaid.mjs
```

脚本读取 [JSON夹具](../samples/mermaid-catalog.json)，在真实 Chromium 中调用应用 `renderMarkdown/hydrateDiagrams`，启用 `script-src 'self'` CSP，允许本机 loopback 加载源码依赖并阻断外部网络。逐类断言成功状态、真实 SVG 几何、非零尺寸和指定中文标签，生成 PNG、HTML、15页A4 PDF 和 [JSON结果](../artifacts/mermaid-validation/results.json)。25/25通过，远程请求与页面错误均为0。另验证Sankey中HTML样式节点名只是文本，不生成事件或图片元素。

此处证明 Linux/Chromium 源码渲染器中每类基础夹具的实际离线呈现，不等同所有语法、所有主题、全部C4子类别或Windows安装包验收。生产Electron另通过全部25类导出测试：HTML在独立BrowserWindow中以file://实际重开，25个SVG及全部中文标签完整、脚本和外部图片为0；15页PDF含中文Zen文字，末页已实际打开核对。[生产验证JSON](../artifacts/desktop-validation/diagram-catalog-validation.json)、[HTML](../artifacts/desktop-validation/diagram-catalog.html)、[PDF](../artifacts/desktop-validation/diagram-catalog.pdf)。供用户直接打开的示例见 [mermaid-catalog.md](../samples/mermaid-catalog.md)。

## 逐类记录

| 图表类型 | 官方语法 | 本轮结果 | 实物 |
| --- | --- | --- | --- |
| flowchart | [官方](https://mermaid.js.org/syntax/flowchart.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/flowchart.png) |
| sequenceDiagram | [官方](https://mermaid.js.org/syntax/sequenceDiagram.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/sequenceDiagram.png) |
| gantt | [官方](https://mermaid.js.org/syntax/gantt.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/gantt.png) |
| classDiagram | [官方](https://mermaid.js.org/syntax/classDiagram.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/classDiagram.png) |
| stateDiagram | [官方](https://mermaid.js.org/syntax/stateDiagram.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/stateDiagram.png) |
| pie | [官方](https://mermaid.js.org/syntax/pie.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/pie.png) |
| requirementDiagram | [官方](https://mermaid.js.org/syntax/requirementDiagram.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/requirementDiagram.png) |
| gitGraph | [官方](https://mermaid.js.org/syntax/gitgraph.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/gitGraph.png) |
| C4Context | [官方](https://mermaid.js.org/syntax/c4.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/C4Context.png) |
| mindmap | [官方](https://mermaid.js.org/syntax/mindmap.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/mindmap.png) |
| timeline | [官方](https://mermaid.js.org/syntax/timeline.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/timeline.png) |
| quadrantChart | [官方](https://mermaid.js.org/syntax/quadrantChart.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/quadrantChart.png) |
| sankey | [官方](https://mermaid.js.org/syntax/sankey.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/sankey.png) |
| xychart | [官方](https://mermaid.js.org/syntax/xyChart.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/xychart.png) |
| block | [官方](https://mermaid.js.org/syntax/block.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/block.png) |
| radar | [官方](https://mermaid.js.org/syntax/radar.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/radar.png) |
| treemap | [官方](https://mermaid.js.org/syntax/treemap.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/treemap.png) |
| packet | [官方](https://mermaid.js.org/syntax/packet.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/packet.png) |
| kanban | [官方](https://mermaid.js.org/syntax/kanban.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/kanban.png) |
| architecture | [官方](https://mermaid.js.org/syntax/architecture.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/architecture.png) |
| venn | [官方](https://mermaid.js.org/syntax/venn.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/venn.png) |
| ishikawa | [官方](https://mermaid.js.org/syntax/ishikawa.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/ishikawa.png) |
| erDiagram | [官方](https://mermaid.js.org/syntax/entityRelationshipDiagram.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/erDiagram.png) |
| journey | [官方](https://mermaid.js.org/syntax/journey.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/journey.png) |
| zenuml | [官方](https://mermaid.js.org/syntax/zenuml.html) | 已实现并验证（Linux Chromium基础中文夹具） | [PNG](../artifacts/mermaid-validation/zenuml.png) |

## 接入与兼容差异

ZenUML并非Mermaid核心自带；按[官方接入方法](https://mermaid.js.org/syntax/zenuml.html#integrating-with-your-library-website)动态注册本地 `@mermaid-js/mermaid-zenuml@1.0.1`，锁定依赖解析为 `@zenuml/core@3.50.1`。两个包均为MIT；core完整版权许可随 `THIRD_PARTY_NOTICES.md` 分发。未使用CDN、网络字体或在线渲染服务。

Mermaid 12.3.0的Sankey上游CSV词法只接受ASCII文本，直接中文节点会报错。墨石的 `src/diagram-compatibility.js` 仅在渲染阶段将有效CSV节点名映射到临时ASCII ID，渲染后通过DOM文本节点恢复原名；用户的Markdown不变。支持CSV引号、双引号转义、引用内换行和重复节点；不合法CSV仍由上游给出错误。3项独立单测加真实浏览器中文/安全夹具覆盖此兼容层。

已实际打开Sankey、ZenUML、Venn、Architecture的PNG核对中文字与连线，并从 [catalog.pdf](../artifacts/mermaid-validation/catalog.pdf) 提取文字确认中文保留。其他类别有独立PNG、几何和标签断言，但不把这些断言扩大成完整视觉/打印排版验收。Beta图表的语法仍可能随上游版本变化，本次结果绑定锁文件版本。
