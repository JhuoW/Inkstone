# 错误与安全负例（不用于正常导出验收）

本文件故意包含无效公式、图表、图片和不可执行的 HTML。请只在副本中操作。正确行为是显示错误并允许修正，保留原文；不得声称这份文档能无错误导出。日常完整样例请用 [acceptance.md](acceptance.md)。

## 非法数学

$\InkstoneUnknownMathCommand{x}$

$$
\begin{not-an-environment}
x+1
\end{not-an-environment}
$$

修正为 `$x+1$` 后错误应消失，不得重载整篇导致丢文。

## 非法图表

```mermaid
this is deliberately not a diagram
```

```flow
this is deliberately not a flowchart
```

```sequence
not a valid message
```

错误块需显示原因且源码仍可编辑。把 Mermaid 内容改为 `flowchart LR` 下一行 `A[开始] --> B[结束]` 后应恢复。

## 不存在的图片

![有意缺失的本地资源](assets/INTENTIONALLY-MISSING-IMAGE.png)

导出应说明缺失资源，不能生成文件后虚称完整成功；此链接不属于正常样例。

## 无害脚本探针

<script>document.title = 'INKSTONE-SHOULD-NOT-RUN';</script>

<img src="data:image/png;base64,invalid" onerror="document.title='INKSTONE-SHOULD-NOT-RUN'" alt="无害事件探针">

<a href="javascript:document.title='INKSTONE-SHOULD-NOT-RUN'">危险协议应被移除</a>

<iframe srcdoc="<script>parent.document.title='INKSTONE-SHOULD-NOT-RUN'</script>"></iframe>

检查：窗口标题保持原值；预览和导出不执行代码；脚本字符串在源文件中仍保留。上述代码不读取或发送任何用户内容。
