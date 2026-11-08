# Markdown 解析策略

核对日期：2026-11-08。模块 `src/markdown-options.js` 只改变解析规则和渲染选项，不转换用户原文。

## 官方范围和产品选择

Typora 的[严格模式文档](https://support.typora.io/Strict-Mode/)明确列举两个差异：严格模式要求 ATX 标题的 `#` 后有空格；列表续段和子列表需与内容列对齐。宽容模式接受 `###Header`，也接受 `10. aaa` 后只有两个空格缩进的子列表。墨石针对这些公开例子实现开关，不把“严格”解释为禁用所有扩展语法。任务列表、公式、HTML 等开关与此独立。

Typora 的[换行文档](https://support.typora.io/Line-Break/)区分编辑和打印/导出时的软换行；其默认编辑保留、导出忽略。墨石分别提供 `softBreaks` 和 `exportSoftBreaks`，为兼容既有墨石设置，两者缺省均为 `false`。显式两个尾随空格、反斜杠换行和 HTML `<br>` 继续作为硬换行。连续空格显示与 Enter 创建段落的行为不属于这个解析模块。

`cjkEmphasis` 是墨石的可选兼容增强，默认关闭。开启后，中文/日文/韩文相邻的强调符号可跨相邻标点完成配对，例如 `中文**强调。**中文`；英文单词内的 `_` 和代码原样保留。尚未找到 Typora 官方对同名设置或全部细节的承诺，不能把此扩展称为经过核对的 Typora 原样实现。

## 集成契约

```js
import { configureMarkdownParser } from './markdown-options.js';
configureMarkdownParser(md, settings, { target: 'editor' });
const tokens = md.parse(source, environment);
// 导出独立选项：
configureMarkdownParser(md, settings, { target: 'export' });
```

函数返回原 `md`，重复调用幂等；每个 markdown-it 实例的策略独立。需要在完整渲染、大纲、实时块解析、段落重解析和导出前传当前设置。不要在调用之后以 `md.set({breaks: ...})` 覆盖其策略。图块只重新渲染已有 token 时也应先配置当前渲染选项。共享解析器的调用均是同步的；若未来在异步任务间持有配置，应改为任务独享实例。

严格模式直接使用 markdown-it 原有规则。宽容标题产生标准 heading/inline token；宽容列表在递归解析期间调整缩进解释，保留原字符和原行坐标，对 marker 所在行单独消费完整前缀。结束或异常时恢复解析状态。没有整篇正则改写，没有重新序列化，不增加/删除输入行，`token.map` 仍指向原文。

列表规则结构改编自 markdown-it 15.0.3 的 MIT 实现；版权归属保留于模块头，完整许可在 `THIRD_PARTY_NOTICES.md`。

## 已执行验证与边界

`node --test tests/markdown-options.test.js`：8项通过，包含官方严格/宽容例子、长序号嵌套、源文行映射、引用/链接/任务文本、代码围栏和缩进代码、Tab/空项、独立编辑/导出换行、CJK 强调与英文/代码隔离、反复切换及多实例互不污染。该记录仅证明模块行为；完整桌面偏好设置、编辑模式切换和安装包的结果需由集成回归另行记录。
