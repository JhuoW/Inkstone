# 桌面设计系统交互回归

对象：Inkstone 0.4.0，Linux x64、真实 Electron 45.2.3 与桌面 IPC。独立测试文件 [design-system-desktop.spec.js](../tests/design-system-desktop.spec.js) 已加入默认 Playwright 配置，保护重设计后的交互约束。

## 已执行结果

本轮单独运行 **6 组全部通过，7.7 秒，未出现 renderer pageerror**。证据：[运行日志](../artifacts/ui-redesign/desktop-interactions/run.log)、[结构化结果与几何/对比度数据](../artifacts/ui-redesign/desktop-interactions/results.json)。测试使用临时 profile、CRLF 中文文稿与本地工作区，不读取或修改用户文稿。

| 组 | 实际验证行为 |
| --- | --- |
| 原工具栏及编辑保真 | 原 11 个格式命令全部保留 SVG 与无障碍名称；选择文字后点击 Bold；两次源码/即时模式切换保持选区；撤销恢复完整 CRLF 源文；实际保存后磁盘内容逐字一致 |
| Insert 菜单 | 鼠标打开/再次点击关闭；方向键、Home、End、Escape；Escape 恢复触发器焦点且保持正文选区；键盘选择 Highlight 直接修改正文并回焦编辑器，无临时编辑对话框；真实 Ctrl+Z / Ctrl+Shift+Z 撤销重做 |
| 侧栏标签 | Files/Outline/Search 三项 roving tabindex；方向键及首尾循环；Home/End；唯一 aria-selected 与键盘入口；大纲/搜索内容随标签切换；源文不变 |
| 命令面板 | Ctrl+Shift+P 打开；combobox/listbox/option 及 aria-activedescendant 一致；快捷键展示；方向键选择与 Enter 执行 Focus；自定义快捷键即时生效；无匹配结果状态；Escape 返回正文；选区与源文保留 |
| 小窗与界面缩放 | 800×600、800×800、1280×900@150%、800×800@150%、720×500 且侧栏 500px；无外层文档溢出；状态栏动作可横向滚动访问；Source/Export/Insert 可达；插入菜单位于触发器下方且二次点击不会误选菜单项；设置分类键盘操作与 Done 始终可达 |
| 明暗对比度 | 两主题共 20 对主要 UI 文字/实际合成背景，计算对比度全部 ≥4.5:1，最低 **5.72:1**；主题切换和设置开关不改源文 |

截图直接使用 `webContents.capturePage()` 保存完整物理像素，避免 CDP 在缩放状态裁切窗口。150% 测试同时记录实际 CSS viewport：1280px 窗口对应约 853 CSS px、800px 窗口对应约 533 CSS px；亲看图片中 256 CSS px 侧栏变为 384 物理 px。

- [150% / 1280×900 设置](../artifacts/ui-redesign/desktop-interactions/preferences-1280x900-zoom150-sidebar256.png)
- [150% / 800×800 设置](../artifacts/ui-redesign/desktop-interactions/preferences-800x800-zoom150-sidebar256.png)
- [720×500 / 侧栏 500 设置](../artifacts/ui-redesign/desktop-interactions/preferences-720x500-zoom100-sidebar500.png)
- [明亮主题](../artifacts/ui-redesign/desktop-interactions/contrast-light.png)、[深色主题](../artifacts/ui-redesign/desktop-interactions/contrast-dark.png)

## 运行与验证边界

```bash
npm run build
npx playwright test tests/design-system-desktop.spec.js
```

测试默认显式启用 `chromiumSandbox:true`，同时核对实际进程 argv。当前 Linux 宿主 AppArmor 禁止非特权 user namespace，本地 Electron 的 `chrome-sandbox` 未安装为 root/setuid，正常进程沙箱启动失败。此次运行显式设置 `INKSTONE_TEST_NO_SANDBOX=1`，结果 JSON 如实记录 `normalSandbox:false` 和原因；未修改宿主安全策略，未将绕过写入产品启动逻辑。沙箱正常的开发/CI 主机不应设置这个变量。

```bash
DISPLAY=:91 INKSTONE_TEST_NO_SANDBOX=1 npx playwright test tests/design-system-desktop.spec.js \
  --reporter=line --output=artifacts/ui-redesign/desktop-targets
```

上述测试补充已有数学重新编辑、文件安全、退出保存、真实输入法和导出测试，不替代它们。界面缩放不是 Windows 原生 DPI 或跨屏测试；此处对比度只覆盖所列主要文字，不构成完整 WCAG 认证。Windows 原生窗口控件、安装、文件关联和系统输入法需继续使用 Windows 实机验收。
