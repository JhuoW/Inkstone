# Inkstone 墨石 0.3.0 历史交付记录

本版以Windows为主平台，同时支持Linux。继续使用用户提供的品牌资产，只处理本地Markdown、文件、图片、草稿、历史及导入导出；不包含账号、云同步、上传器或macOS支持。本轮改进默认英语、双语安装/首次启动、正文公式重编辑、界面布局、保存与退出保护，详见[0.3界面说明](UI_UX_0_3.md)。

**当前状态：0.3五个桌面包与VSIX已生成；90项单测、21组核心浏览器、10组公式、9组UI及67组Electron全部通过。Linux三包实际运行通过，Windows静态检查与Wine安装器语言界面检查通过；Windows实机运行仍待验。** 旧版文件不代表本版交付，不引用旧哈希或旧计数冒充通过。

## 交付文件

| 交付物 | 文件 | 字节数 | 验证边界 |
| --- | --- | ---: | --- |
| Windows x64 NSIS | [Inkstone-0.3.0-windows-x64.exe](../release/Inkstone-0.3.0-windows-x64.exe) | 115,075,328 | 应用与NSIS的PE/版本/原ICO通过；Wine双语选择/首屏/取消通过；Windows实机安装运行待验 |
| Windows x64 ZIP | [Inkstone-0.3.0-windows-x64.zip](../release/Inkstone-0.3.0-windows-x64.zip) | 159,582,148 | ZIP CRC及ASAR与解包目录一致；Windows运行待验 |
| Linux x64 AppImage | [Inkstone-0.3.0.AppImage](../release/Inkstone-0.3.0.AppImage) | 132,998,669 | 提取后测试模式（--no-sandbox）启动、精确编辑/原子保存、Node隔离及原图标通过 |
| Debian/Ubuntu x64 | [inkstone-editor_0.3.0_amd64.deb](../release/inkstone-editor_0.3.0_amd64.deb) | 106,785,544 | 提取后同上通过；系统安装/关联/卸载未验 |
| Linux x64 tar.gz | [inkstone-editor-0.3.0.tar.gz](../release/inkstone-editor-0.3.0.tar.gz) | 126,442,025 | 提取后同上通过；窗口PNG原字节一致 |
| Windows/Linux编辑器扩展 | [extensions/inkstone-open-0.3.0.vsix](../release/extensions/inkstone-open-0.3.0.vsix) | 38,578 | 13项行为测试、ZIP CRC及原256px图标通过；真实宿主待验 |
| 完整源码 | [Inkstone-0.3.0-source.tar.gz](../release/Inkstone-0.3.0-source.tar.gz) | 以归档文件为准 | 最终归档生成：白名单包含源码、锁、品牌副本、样例、测试与当前证据；排除依赖、缓存和旧发行件 |

五个桌面包与扩展的SHA-256：

```text
df8ee8c7e7e887930837acc16e9ea12a7f31d415107b6ea77ecd5ba5721c9951  Inkstone-0.3.0-windows-x64.exe
229539fb5dd526406fa0b97a920c385b6ba23cf4e6ee061b429cfd1be20a54be  Inkstone-0.3.0-windows-x64.zip
a46c1cfa53f1d21c327d30a759d0a465c06aa8a234fb00b0e5d5eb22c34aba96  Inkstone-0.3.0.AppImage
fc2bf9b3bf80a5736d2b7d58eb4c8ef8f43fe2e59eaaa8e8b039174c3945a7fd  inkstone-editor_0.3.0_amd64.deb
fd43c1d1ddb55a8bce1689f6f075ea41a59797860023ea1aefd425719567fe58  inkstone-editor-0.3.0.tar.gz
d03d7960d9fd579c6ca713ff2da9f0b17e2a471deb84a49272936b70621a0ac1  extensions/inkstone-open-0.3.0.vsix
```

统一校验文件为 [release/SHA256SUMS](../release/SHA256SUMS)，条目相对release目录。Linux运行 `cd release && sha256sum -c SHA256SUMS`；Windows以PowerShell `Get-FileHash -Algorithm SHA256` 对照。源码自身哈希仅写外部清单，不写入被归档文档形成自指。

## 构建与验证

Node22.12+；`npm ci`、`npm start`启动，`test:all`串行运行单测、核心浏览器、公式编辑浏览器、UI浏览器与Electron测试。`dist:win`输出NSIS/ZIP，`dist:linux`输出Linux三包；自动发布关闭。Windows构建未配置代码签名证书。

Linux交叉构建Windows需要可执行32位NSIS工具的Wine/WoW64，Wine不随应用分发。`verify:windows`只是PE版本和原ICO等静态检查；`test:native`运行当前真实系统的包内程序；两者不能互相替代。Windows CI已配置，但本Linux环境不能制造Windows实机运行证据。

Windows安装默认英语并提供简体中文，选择仅在用户没有合法已保存语言时用于首次启动。ZIP/Linux使用首次启动语言提示条；Linux包管理器没有NSIS式语言页。应用控制的菜单/标题/主要按钮随应用语言，系统文件选择器内部控件遵循系统语言。

## 本轮已经取得的证据

[统一回归](../artifacts/final-validation/regression.log)90/21/10/9/67分别全部通过；Electron包含34后端、14主UI、6增强及13写作/退出流程。真实Linux IBus仓颉本轮重跑并覆盖候选期模式切换/关闭/保存四项生命周期，见[结果](../artifacts/os-ime-validation/result.json)。

- [UI9组](../artifacts/ui-polish-validation/results.json)：主要动作/取消/焦点、busy、通知、双语、资源选择/取消、表格、导出字段、设置滚动区和窄窗口；桌面IPC显式模拟，不代表文件系统验收。
- [公式10组](../artifacts/math-editing-validation/results.json)：正文精准定位、同区预览、错误恢复、键盘/鼠标/撤销/模式与组合输入；实际系统IME另记。
- [完整安装器Wine UI](../artifacts/windows-installer-ui/results.json)：实际语言列表、默认英语、EN/简中首屏和取消通过；临时前缀本机CJK字体映射后截图已看，未安装应用，不等同Windows实机。
- [安装hook](../artifacts/installer-language-validation/results.json)：真实NSIS编译与Wine执行、默认英语、两种UTF-8 JSON和临时文件清除；不包含完整安装器界面验收。
- [原生应用语言](../artifacts/backend-validation/native-language-validation.json)：真实Electron应用定义菜单/对话框；系统控件边界单列。
- [扩展](../artifacts/documentation-validation/extension-package.json)：0.3 VSIX、13项测试、安全argv、ZIP和原图标；真实VSCode/Cursor及Windows启动待验。

## 最终发行物验证

最终计数、包哈希核对、双平台299个打包文件与源码一致性、Linux运行及验收边界汇总于[最终验证摘要](../artifacts/final-validation/summary.json)。

- [Linux三包](../artifacts/package-validation/results.json)全部提取并运行实际程序，测试模式（--no-sandbox）、Node隔离、精确编辑/原子保存、提供的窗口PNG一致；AppImage/deb全部桌面尺寸PNG也一致。三包ASAR SHA-256为 `0f50808867ef58c77f688ddb9fe7945139c45b410b214303aa63b6712c09317f`。
- [Linux包内原生冒烟](../artifacts/native-validation/linux/results.json)通过中文路径、未编辑字节/mtime、局部编辑/撤销、模式选区、本地词典、数学图表、HTML/PDF及HTML重开；不代替系统安装/打印/文件关联。
- [Windows PE](../artifacts/windows-package-validation/static-results.json)同时验证最终应用EXE与NSIS的版本和提供ICO；[ZIP](../artifacts/windows-package-validation/zip-results.json)CRC及ASAR一致。没有执行原生Windows应用。
- 最终NSIS `df8ee8c7…` 已重新执行完整[Wine UI检查](../artifacts/windows-installer-ui/results.json)，中英截图再次查看；取消退出，未安装。测试字体及Wine局限已明确记录。
- [Windows当前源码一致性](../artifacts/final-validation/win-current-source.json)与[Linux当前源码一致性](../artifacts/final-validation/linux-current-source.json)逐字节核对打包的dist、electron、品牌与许可证，避免发行包滞后于最终源码。

## 尚需对应环境验证的范围

| 范围 | 当前边界 | 后续动作 |
| --- | --- | --- |
| Windows安装与应用 | Linux交叉构建/Wine hook/PE检查不能代表Windows实机 | 原生CI与设备安装、语言选择、升级保留语言、文件关联/卸载、DPI、微软拼音 |
| 输入法与辅助技术 | CDP组合、Linux IBus与所有平台真实候选不同 | 本轮IBus已通过；另验微软拼音/Fcitx/Wayland、屏幕阅读器 |
| 精细写作交互 | 公式同区编辑已改进；活动列表/引用/图片、鼠标多格选择与行列拖动仍有差距 | 逐项增强并保持源文补丁/撤销稳定 |
| 数学与转换 | MathJax3不等同完整MathJax4；Office/EPUB复杂排版需目标阅读器 | 逐格式打开实物；Pandoc PDF另需本机TeX引擎 |
| 打印与扩展宿主 | 没有物理打印机或真实VSCode/Cursor实例证据 | 按[验收步骤](ACCEPTANCE.md)独立执行 |

恢复草稿延迟窗口与文件系统竞争边界见[架构说明](ARCHITECTURE.md)。界面截图、入口存在或构建成功都不作为跨平台功能验收替代。
