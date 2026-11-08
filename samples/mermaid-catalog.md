# Mermaid 离线图表验收

25种图表的基础中文夹具。完整类别结果和边界见[验收说明](../docs/MERMAID_CATALOG.md)。这些示例均使用本地打包渲染器，不加载远程字体或图标。

## flowchart

```mermaid
flowchart LR
A[中文写作] --> B[保存]
```

## sequenceDiagram

```mermaid
sequenceDiagram
participant A as 中文作者
participant B as 编辑器
A->>B: 保存文稿
B-->>A: 已保存
```

## gantt

```mermaid
gantt
dateFormat YYYY-MM-DD
title 中文计划
section 写作
初稿 :a1,2026-01-01,2d
修订 :after a1,1d
```

## classDiagram

```mermaid
classDiagram
class Document["中文文稿"]
class Editor
Document --> Editor
Document : +String title
```

## stateDiagram

```mermaid
stateDiagram-v2
state "中文草稿" as Draft
[*] --> Draft
Draft --> [*]
```

## pie

```mermaid
pie title 中文进度
"完成": 7
"待办": 3
```

## requirementDiagram

```mermaid
requirementDiagram
requirement writing {
id: 1
text: "中文写作"
risk: low
verifymethod: test
}
element editor {
type: application
}
editor - satisfies -> writing
```

## gitGraph

```mermaid
gitGraph
commit id: "中文初稿"
branch revise
checkout revise
commit
checkout main
merge revise
```

## C4Context

```mermaid
C4Context
Person(author, "中文作者")
System(editor, "编辑器", "离线写作")
Rel(author, editor, "编辑")
```

## mindmap

```mermaid
mindmap
  root((中文写作))
    初稿
    修订
      校对
```

## timeline

```mermaid
timeline
title 中文计划
2026 : 初稿
2027 : 修订
```

## quadrantChart

```mermaid
quadrantChart
title 中文四象限
x-axis 少 --> 多
y-axis 低 --> 高
quadrant-1 优先
quadrant-2 评估
quadrant-3 暂缓
quadrant-4 改进
项目: [0.3, 0.6]
```

## sankey

```mermaid
sankey-beta

"中文输入","编辑",20
"编辑","输出",15
"编辑","草稿",5
```

## xychart

```mermaid
xychart-beta
title "中文统计"
x-axis ["一", "二", "三"]
y-axis "字数" 0 --> 10
bar [3, 5, 8]
line [2, 4, 9]
```

## block

```mermaid
block-beta
columns 2
a["中文初稿"] b["修订"]
a --> b
```

## radar

```mermaid
radar-beta
title 中文能力
axis a["写作"], b["校对"], c["整理"]
curve x["作者"]{8,6,7}
max 10
```

## treemap

```mermaid
treemap-beta
"中文文库"
  "初稿": 10
  "修订": 5
```

## packet

```mermaid
packet-beta
0-7: "中文头部"
8-31: "正文"
```

## kanban

```mermaid
kanban
  todo[中文待办]
    draft[写初稿]
  done[完成]
    outline[提纲]
```

## architecture

```mermaid
architecture-beta
group app(cloud)[中文应用]
service db(database)[文库] in app
service editor(server)[编辑] in app
db:R -- L:editor
```

## venn

```mermaid
venn-beta
set A["中文写作"]
set B["阅读"]
union A,B["思考"]
```

## ishikawa

```mermaid
ishikawa-beta
    中文写作问题
    内容
        缺少例子
    结构
        顺序混乱
```

## erDiagram

```mermaid
erDiagram
AUTHOR ||--o{ DOCUMENT : "中文创作"
DOCUMENT {
string title
}
```

## journey

```mermaid
journey
title 中文写作流程
section 起步
拟提纲: 5: 作者
写初稿: 4: 作者
```

## zenuml

```mermaid
zenuml
title 中文协作
Author->Editor: 保存文稿
```

