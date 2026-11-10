# 0.6.1 Windows 集成与关于窗口发布记录

日期：2026-11-08。状态：373 项/组自动化、四种程序形态的 12 项正常沙箱原生检查及最终包静态校验全部通过。用户手动完成当前用户范围的 0.6.1 安装后，实际安装版的独立配置验收通过；本轮未执行卸载或回滚。

这是 0.6.0 后的补丁更新；小更新递增 PATCH，主要功能更新递增 MINOR 并将 PATCH 归零，见 [发行与版本策略](RELEASE_POLICY.md)。[0.6.0 行内公式与右键菜单记录](RELEASE_0_6.md) 保留为历史基线，其验证结果不计入本版。

## 操作更新

- Windows 安装版注册为 Markdown 的可选编辑器：`RegisteredApplications`、Capabilities、`.md` / `.markdown` / `.mdown` / `.mkd` 的 OpenWith 及 `Applications\Inkstone.exe` 指向实际安装路径；不改写扩展名默认值或 `UserChoice`。
- 已正确注册的安装版在每个配置中首次启动时提供一次默认应用提示。选择“在 Windows 中设置”后，由用户在系统页面确认；“暂不设置”保留当前默认。以后可从 Tools → Default Markdown app 或 Preferences → Files 再次进入。
- 偏好设置中的状态来自 Windows Shell 对 `.md` 的有效关联查询，不把已注册 OpenWith 误报为已成为默认。查询失败或未指定处理器有明确提示；从系统设置返回后刷新状态。
- 支持应用页面深链的 Windows 11 根据用户/机器安装范围打开对应 Inkstone 默认应用页面；Windows 10、较早的 Windows 11 或未注册程序打开通用默认应用页面。未注册便携版说明需先安装，不为移动目录写入注册信息。
- Windows 首次语言遵循系统显示语言：中文使用简体中文，其他语言使用英语。NSIS 只在外层交互安装进程显示一次语言选择；提权进程继承选择，静默及卸载器生成阶段不显示选择器。有效安装语言直接完成应用首次语言选择，不再重复询问；已有偏好优先保留。便携版仍提供首次语言确认。
- Tools → About Inkstone 使用品牌化中英文窗口，显示实际运行版本、项目源码和贡献者信息。许可证全文来自安装包中的 LICENSE，可离线阅读和复制；可返回关于页、键盘关闭，并保留文稿选区及撤销历史。
- 本版应用源码许可为 `AGPL-3.0-only`，包清单、LICENSE、关于窗口和通知一致。依赖各自保留原许可；此前版本的发行件与证据保持当时标识。
- 修复右键菜单键盘导航期间静止鼠标悬停夺取子菜单焦点的问题；鼠标实际移动后恢复指针导航。

## 当前验证

| 验证层                       | 结果                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Node 单元测试                | 151 通过，包含语言、默认应用和关于窗口回归                                                       |
| 浏览器交互                   | 96 组通过：编辑器 25、数学 16、UI 12、编辑设计 7、品牌 6、Mermaid 25、关于窗口 5                 |
| 浏览器源码一致性             | 45 个源码文件在运行前后哈希不变                                                                  |
| NSIS 语言策略与本机钩子      | 12 个策略场景通过；英语/简体中文写入、UTF-8 JSON 和临时文件清理通过                              |
| NSIS 关联宏夹具              | 本机临时专用注册/注销夹具通过；不等同于实际安装                                                  |
| 关于与默认应用 Electron 专项 | 8 项通过，使用正常 Electron 沙箱                                                                 |
| 完整 Electron 桌面回归       | 113 通过，0 跳过、0 失败、0 flaky；上述 8 项已计入完整集，不重复相加                             |
| VS Code/Cursor 扩展          | 本轮重新执行 13 项通过                                                                           |
| 最终 PE 与包内源码           | 安装器与四种应用 PE/版本/图标通过；构建目录、ZIP、NSIS 负载、实际安装版各 300 个运行文件匹配源码 |
| 许可证与生产依赖             | 四种程序包清单及完整 AGPL/通知一致；9 个生产依赖完整，编码/解析/实体核心加载通过                 |
| 最终包内原生运行             | 四种程序各冒烟、交互、Windows 集成，共 12/12 通过，全部正常沙箱，页面错误为零                    |
| NSIS 安装语言页面手工观察    | 观察到单次语言弹窗，英语显示语言下默认 English；未观察展开的中文列表                             |
| 用户手动安装及实际安装版     | 用户确认手动完成当前用户安装；安装版 3 项隔离原生检查、语言种子与默认提示持久化通过              |
| 自动安装、升级、卸载及回滚   | 本轮未执行；既有全用户 0.6.0 保留，当前用户的 0.6.1 安装不卸载或回滚                             |
| 真实 Windows 输入法          | 本轮未重跑物理输入法                                                                             |

环境为 Windows x64、Node.js 22.23.4、Electron 45.2.3、Chromium 158.0.8127.18。151 项单测、96 组浏览器、113 项 Electron 和 13 项扩展共 373 项/组；12 项包内原生检查另计。完整桌面运行用时约 130.8 秒，运行前后 344 个记录文件哈希不变；浏览器运行前后 45 个源码文件哈希不变。

四个程序形态均使用正常沙箱，各完成原生冒烟、交互和 Windows 集成检查。页面错误为零，全部测试应用已关闭，4 个既有用户进程的 PID 保持不变。浏览器 About 链接使用明确的外部打开桩，未发出远程请求。真实安装器只记录已观察到的单次弹窗及 English 默认值；简体中文选项由 NSIS 夹具验证，没有声称手动展开观察过该列表。

用户手动安装和选择后，原生 Shell 查询确认当前 `.md` 默认为 Inkstone，`isInkstone:true`，验收前后保持不变。验收没有替用户在系统页面选择默认，也没有写 `UserChoice`。既有全用户 0.6.0 与当前用户 0.6.1 均保留，不卸载或回滚；不把用户完成的安装写成自动安装、升级或完整提权流程验收。注册/注销逻辑另由临时专用关联夹具覆盖。

对实际安装程序使用新隔离配置，确认安装语言种子为 `locale:en, configured:true`，首次启动不再出现第二次语言选择。首次默认应用提示选择 Not now 后标记持久化，新窗口与重启不重复提示。固定 `ms-settings:defaultapps?registeredAppUser=Inkstone` 调用由捕获桩验证，不将调用捕获声称为已经修改系统默认设置。

现有证据（详细记录已从仓库移除，以下链接指向归档提交 `f821158`）：

- [浏览器汇总](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/browser-final/summary.json) 与 [About 浏览器结果](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/about-dialog/results.json)
- [NSIS 语言策略与钩子](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/installer-language-validation/results.json)
- [临时专用关联夹具](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/installer-association-validation/results.json)
- [完整 Electron 结果](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/electron-final/playwright-results.json) 与 [结果/哈希汇总](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/electron-final/summary.json)
- [扩展及安装器夹具汇总](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/extension-final/results.json) 与 [三种包内程序原生汇总](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/package-native-final-results.json)
- [PE 校验](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/windows-package-validation/static-results.json)、[包内源码一致性](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/ui-redesign/release/source-match.json) 及 [许可证与生产依赖校验](https://github.com/JhuoW/Inkstone/blob/f8211586bca40d549c63442c0aa59b19b0ac4089/artifacts/windows-validation/0.6.1/package-static-identity.json)

## Windows 产物

以下产物由当前冻结源码重新构建并通过最终静态检查，不通过重命名 0.6.0 二进制生成。

| 产物                             |      字节数 | SHA-256                                                            |
| -------------------------------- | ----------: | ------------------------------------------------------------------ |
| `Inkstone-0.6.1-windows-x64.exe` | 115,313,897 | `9980bd3c7f22baf235cbc2fdd3268b1bc1f5c26a2b365a36303b4d36a578827c` |
| `Inkstone-0.6.1-windows-x64.zip` | 159,532,512 | `7ce7aa0e5a71fc35ce66f2da9adb5f55164f9b17cc6ec26bdba29314ed126cf3` |

应用与安装器版本均为 0.6.1。构建目录、实际 ZIP、实际 NSIS 负载与实际安装版各有 300 个运行文件匹配当前源码，四者 ASAR SHA-256 均为 `857b42f66403aa74020fa23735a4768d6a832b889c9d3660561050d0e9940ad3`。包清单标识 `AGPL-3.0-only`，随包 LICENSE 与源码中的 34,020 字节全文完全一致；通知原文也一致。

构建目录、实际 ZIP、实际 NSIS 应用负载和用户手动安装版均通过原生运行。自动安装流程、升级、卸载、回滚及完整 UAC 提权流程本轮未验收；被动解包不是系统安装，单纯读取 PE 不是原生运行。本轮产物未配置代码签名。

当前应用源码许可为 [GNU Affero General Public License version 3，仅此版本](../LICENSE)。[依赖通知](../THIRD_PARTY_NOTICES.md) 保留各组件许可。源码、许可证与打包内容须在同一冻结版本中匹配。

本轮不新增 Linux 构建；未穷尽 Windows 版本、物理输入法、DPI、多显示器、真实打印设备或所有旧版本升级路径。此前 Windows/Linux 结果仅作对应版本的历史记录。
