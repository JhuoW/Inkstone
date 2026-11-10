# 0.6.0 行内公式与右键菜单发布记录

日期：2026-11-08。状态：Windows 0.6.0 已完成构建和本轮发行验证。330 项/组自动化、四种程序形态的 8 项正常沙箱原生检查及实际安装/关联/卸载验证全部通过。

本次属于主要功能更新，版本由上一轮 Windows 稳定化基线 0.5.0 提升到 0.6.0。后续小更新递增 PATCH，主要功能更新递增 MINOR 并将 PATCH 归零；见 [发行与版本策略](RELEASE_POLICY.md)。

## 已完成的交互更新

- 行内公式输入结束的 `$` 后只显示一份渲染结果；进入公式后显示同一编辑器中的 TeX 源码，`Ctrl+Enter` 结束编辑。源码模式保留原始内容及选区。
- 点击公式内部按字形定位源码光标。已验证线性公式、Unicode 字符、重复符号、分子/分母、嵌套分数及上下标；不支持的 TeX 布局采用有界近似，并避免落入控制命令中间。这不是任意 TeX 的通用精确映射保证。
- 分层右键菜单按正文、选区和表格上下文提供剪切/复制/粘贴、复制或粘贴为不同格式、格式工具、段落、插入及表格结构操作；保留拼写建议和用户词典入口。
- 右键点击定位到对应源码，已有选区和表格单元格内选区按上下文保留。表格菜单支持行列增删、移动、复制、美化源码和删除；代码围栏内的表格示例不作为正文表格操作。
- 菜单支持键盘导航、子菜单、Esc 关闭、窗口边缘布局及明暗/中英文界面。只读状态保留复制并禁止编辑；文档切换或异步操作后会重新检查上下文。
- 格式、结构和剪贴板操作隔离撤销历史，空剪贴板不会误触发保存新文稿；原有 BOM/CRLF、编辑撤销、组合输入与模式切换均有回归覆盖。
- 墨石自身复制的 Markdown 在键盘与右键菜单之间保留原文，不将 HTML 回转误当成原始源码；外部富文本仍可显式转换为 Markdown。表格粘贴优先识别 TSV，普通多行内容保留在单元格内；部分选区的粘贴、剪切和删除保持转义管道及表格列结构。

## 当前冻结源码验证

| 验证层                        | 结果                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Node 单元测试                 | 121 通过                                                                                                |
| 浏览器交互                    | 91 组通过：编辑器 25、数学 16、UI 12、编辑设计 7、品牌 6、Mermaid 25                                    |
| 菜单/剪贴板专项               | 22 通过，使用正常 Electron 沙箱；属于下列完整回归的一部分                                               |
| Electron 桌面集成             | 105 通过，0 跳过、0 失败、0 flaky                                                                       |
| VS Code/Cursor 扩展           | 本轮重新执行 13 通过，0 跳过、0 失败                                                                    |
| PE 与包内一致性               | NSIS 与应用版本/图标/架构通过；构建目录、ZIP、NSIS 负载和实际安装版各 299 个运行文件匹配源码            |
| Windows 窗口手工交互          | 行内公式点击/编辑/结束、保存 BOM/CRLF、表格插列及撤销、空白处插入菜单已确认                             |
| 真实 Windows 输入法           | 0.6.0 未重跑物理输入法；自动化组合输入用例通过                                                          |
| NSIS 语言与关联宏夹具         | 英语、简体中文钩子及临时专用关联注册/注销夹具通过；不等同于实际安装                                     |
| 四种程序形态原生检查          | 8/8 通过，全部正常沙箱，页面错误为零，结束后无残留 Inkstone 测试进程                                    |
| NSIS 实际安装、文件关联及卸载 | 安装与卸载退出码均为 0；四种扩展 OpenWith、引用中文路径的命令通过，卸载后受保护注册信息与安装前完全一致 |

测试环境为 Windows x64、Node.js 22.23.4、Electron 45.2.3 和 Chromium 158.0.8127.18。121 项单测、91 组浏览器、105 项桌面及 13 项扩展合计 330 项/组；22 项菜单/剪贴板专项已包含在 105 项桌面测试中。105 项桌面和 8 项包内原生检查均使用正常进程沙箱；浏览器辅助用例中的桌面桥接桩不代替真实桌面或系统安装验证。

浏览器验证期间 42 个源码文件、最终桌面回归前后的 20 个关键文件哈希均保持一致。测试与构建使用同一冻结源码。

Windows 真实窗口的专用测试文稿显示单份 `a+b=c`，点击 `b` 后在同一编辑器进入源码，输入后得到 `a+bq=c`，`Ctrl+Enter` 在原位结束编辑；保存后仍为 UTF-8 BOM（`EF BB BF`）与 CRLF，孤立 LF 为零。表格右键经“表格 → 在右侧插入列”由两列变为三列，一次撤销恢复两列；空白处右键的插入菜单显示包括表格在内的完整入口。最终构建目录程序、实际解压 ZIP、实际 NSIS 应用负载及实际安装版还分别通过原生冒烟与交互检查，共 8 项。

实际 NSIS 在独立的中文及空格目录完成新安装，英语语言交接、四种扩展的 OpenWith 及正确引用路径的打开命令通过，原有默认关联和其他编辑器的类保持安装前状态。卸载退出码为 0，测试安装程序文件、自身 ProgID 和卸载项均移除；受保护注册信息与本次安装前快照逐字一致，未留下测试安装。被动解出的 NSIS 应用负载与实际安装版是分别验证的程序形态。

主要证据（详细记录已从仓库移除，以下链接指向归档提交 `f821158`）：

- [浏览器结果](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/browser-final/summary.json)
- [Electron 结果](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/playwright-results.json) 与 [源码记录](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/source-provenance.json)
- [PE 校验](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/windows-package-validation/static-results.json) 与 [包内源码一致性](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/ui-redesign/release/source-match.json)
- [Windows 窗口手工记录](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/manual-windows/results.json) 与 [扩展及 NSIS 夹具汇总](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/extension-final/results.json)
- [NSIS 中英语言钩子](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/installer-language-validation/results.json) 与 [临时专用关联夹具](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/installer-association-validation/results.json)
- [四种程序形态原生检查](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/package-native-final-results.json) 与 [实际安装/卸载汇总](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.0/actual-installer-validation/summary.json)

## Windows 产物

以下为当前冻结源码重新构建并通过最终静态校验的 Windows 产物。

| 产物                             |      字节数 | SHA-256                                                            |
| -------------------------------- | ----------: | ------------------------------------------------------------------ |
| `Inkstone-0.6.0-windows-x64.exe` | 115,311,274 | `bf73b1c19a4d860f5860d233e2f876de3e9be6cd3dd264ebc4ec2b2420c681b2` |
| `Inkstone-0.6.0-windows-x64.zip` | 159,515,033 | `ea47b99aade001f7fc54a1fb7382ab7c83c98e364fc133af70115b828e48a4c2` |

应用、安装器及包内清单均为 0.6.0。构建目录、实际解压 ZIP、被动解出的 NSIS 负载和卸载前的实际安装版均有 299 个运行文件匹配冻结源码；四者 ASAR SHA-256 均为 `0bd679923c390c9ca8a5913fb10f3af11d31df5ce321cd6c58bd330948b2c894`。NSIS 负载和实际安装程序均在含中文及空格的独立路径运行验证；负载解包不冒充系统安装。

本轮产物未配置代码签名。0.6.0 未重跑物理 Windows 输入法，组合输入自动化不能替代该项验证。本轮没有新增 Linux 构建，也没有穷尽其他 Windows 版本、DPI、多显示器、所有 TeX 布局或旧版本升级路径。0.5.0 的验收记录仅作为前一版本基线。
