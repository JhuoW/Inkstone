# 验收素材

复制整个目录再测试，避免把原始测试素材当作日常文档覆盖。

- `acceptance.md`：中文、嵌套语法、表格、公式、Mermaid、旧图表、HTML、分页及未知语法。
- `mermaid-catalog.md` / `mermaid-catalog.json`：25类真实离线图表夹具，与 `node scripts/verify-mermaid.mjs` 共用。
- `linked-note.md`：跨文件与章节锚点导航。
- `assets/inkstone-flow.svg`：原创 SVG，兼测中文和相对资源路径。
- `assets/tone.wav`：原创生成的 0.5 秒 440 Hz 轻音。
- `assets/inkstone-bars.webm`：原创几何图形视频，1 秒，VP9，无音轨。

素材使用本项目 MIT 许可证。样例包含兼容性探针，存在样例不表示对应功能已通过。实际人工验收步骤见 [ACCEPTANCE.md](../docs/ACCEPTANCE.md)。

`error-cases.md` 是单独的负例集合，含有意无效公式/图表/不存在图片及无害脚本探针；它不用于正常导出成功验收。
