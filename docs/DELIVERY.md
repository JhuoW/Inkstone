# Inkstone 墨石 0.4.0 交付记录

本次完成桌面UI/UX升级，并保留0.3全部现有功能入口。采用既有品牌素材，不加入云服务或macOS支持；Windows为主目标，Linux为附加目标。设计系统、前后截图、交互修复和使用的Skills见[0.4升级记录](UI_REDESIGN_0_4.md)。

**完整回归213项/组通过，真实Linux IBus通过；五种桌面发行件已生成，双平台299个运行文件与最终源码逐字节一致。** Linux测试在明确的沙箱绕过模式执行；Windows完成静态检查和Wine安装界面检查，原生Windows、正常Linux进程沙箱及系统级安装仍未验收。

## 当前交付文件

| 交付物 | 文件 | 字节数 | 已验证范围 |
| --- | --- | ---: | --- |
| Windows x64 NSIS | [Inkstone-0.4.0-windows-x64.exe](../release/Inkstone-0.4.0-windows-x64.exe) | 115,078,679 | 应用/安装器PE版本、原ICO通过；Wine中英语言选择与首屏/取消通过，未执行安装 |
| Windows x64 ZIP | [Inkstone-0.4.0-windows-x64.zip](../release/Inkstone-0.4.0-windows-x64.zip) | 159,588,981 | CRC与ASAR一致；Windows原生运行待验 |
| Linux x64 AppImage | [Inkstone-0.4.0.AppImage](../release/Inkstone-0.4.0.AppImage) | 133,006,729 | 提取后二进制在测试模式启动、编辑/保存、Node隔离与原图标通过 |
| Debian/Ubuntu x64 | [inkstone-editor_0.4.0_amd64.deb](../release/inkstone-editor_0.4.0_amd64.deb) | 106,790,300 | 提取后同上；未执行系统安装/卸载/关联 |
| Linux x64 tar.gz | [inkstone-editor-0.4.0.tar.gz](../release/inkstone-editor-0.4.0.tar.gz) | 126,448,188 | 提取后同上，原图标与包内源码一致 |
| 完整源码 | [Inkstone-0.4.0-source.tar.gz](../release/Inkstone-0.4.0-source.tar.gz) | 见最终归档 | 源码、锁、品牌副本、设计规范、样例、测试与证据；排除缓存/依赖/旧发行件 |

Windows ZIP解压后运行`Inkstone.exe`；Linux AppImage先赋予执行权限，deb可交给系统包管理器。源码运行和系统依赖见[README](../README.md)。应用及Windows安装包未配置代码签名证书。原有0.3本地编辑器扩展未修改，继续保留在`release/extensions`，不冒充0.4新增发行件。

[SHA256SUMS](../release/SHA256SUMS)只列当前0.4产物。在`release`目录执行`sha256sum -c SHA256SUMS`；Windows使用PowerShell `Get-FileHash 文件 -Algorithm SHA256`对照。旧版本安装包保留，文件名版本明确，不能替代当前交付。

## 最终验证

- [统一回归](../artifacts/ui-redesign/after/regression.log)：90单元、21编辑器、10公式、12UI、7编辑视觉、73Electron（34后端、14主UI、6增强、13写作/退出、6新桌面交互）全过，无跳过。另有6品牌检查与真实IBus。
- [完整功能对比](../artifacts/ui-redesign/after/inventory.json)：82固定命令、2默认片段、64应用分支、52编辑器命令、55原生动作、40设置、27导出格式保持。15组before/after实际截图、原文和模式选区检查通过。
- [IBus正式构建](../artifacts/os-ime-validation/result.json)：候选期模式切换、关闭取消继续输入和撤销重做、表格关闭及保存后退出均通过；不是模拟输入法。
- [Linux三包](../artifacts/package-validation/results.json)：逐包提取并启动，编辑/原子保存、Node隔离、窗口PNG及多尺寸图标通过；`normalSandbox:false`明确记录，不声称系统级安装通过。
- [包内原生冒烟](../artifacts/native-validation/linux/results.json)：中文路径、未编辑字节/mtime、局部编辑/撤销、模式选区、本地词典、数学图表、HTML/PDF和HTML重开通过。
- [Windows PE](../artifacts/windows-package-validation/static-results.json)：最终应用和NSIS的版本、架构与原ICO；[ZIP](../artifacts/windows-package-validation/zip-results.json)：CRC与ASAR一致。
- [完整NSIS界面](../artifacts/windows-installer-ui/results.json)：最终0.4安装器在Wine显示English/简中选择及对应首屏，均取消后退出，未安装。CJK字体仅映射到临时Wine测试前缀；不改变产品字体，不代替Windows实机。
- [最终包源码一致性](../artifacts/ui-redesign/release/source-match.json)：两平台299文件分别核对当前dist、electron、品牌和许可证；共同ASAR SHA-256为`0faf828c31f042ba5fc5b05e967ebc377294bf2f04d5497e90ec2709c664ba20`。
- [实际两页PDF](../artifacts/backend-validation/export.pdf)：中文、图片、数学、静态SVG、A4分页与书签已检查；主UI的Mermaid导出和25类型离线生产导出也在回归范围。

## 构建与复验

```bash
npm ci
npm run build
npm run test:all
npm run dist:win
npm run dist:linux
npm run verify:windows
npm run verify:source
npm run verify:packages
npm run test:native
npm run package:source
npm run checksums
```

Node22.12+。源码需要npm开发依赖；安装后的核心编辑、数学、图表与原生导出离线运行。Linux交叉构建Windows还需Wine/WoW64；本环境使用预先校验的Electron45.2.3缓存，构建自动发布关闭。构建日志为[Windows](../artifacts/ui-redesign/windows-build.log)和[Linux](../artifacts/ui-redesign/linux-build.log)。

当前宿主的Chrome沙箱helper未配置为root/setuid，且user namespace受限，默认启动的实际错误见[宿主记录](../artifacts/ui-redesign/release/sandbox-host.json)。本机运行设计测试、截图、原生及包验证时显式设置`INKSTONE_TEST_NO_SANDBOX=1`并核对argv；没有修改宿主安全策略或在产品启动脚本加入绕过。正常环境默认保持`chromiumSandbox:true`。旧0.3报告中“正常sandbox”来自Playwright默认参数误判，已纠正；Node隔离与进程沙箱是不同验收项。

## 尚需验证及原有差距

| 范围 | 当前状态 | 下一步 |
| --- | --- | --- |
| Windows原生运行/安装/关联/卸载 | 已实现待验证；仅交叉构建、PE和Wine界面证据 | 在Windows CI及实机安装并测试DPI、微软拼音、升级保留语言、文件关联和卸载 |
| Linux正常沙箱与系统安装 | 当前环境受阻；提取后的功能测试通过 | 使用支持的主机/系统包安装验证helper权限、AppArmor配置及正常启动，不以测试绕过代替日常配置 |
| 辅助技术与其他输入法 | 部分验证 | 实测屏幕阅读器、Fcitx/Wayland及其他输入法 |
| 原有精细编辑与复杂转换 | 保持功能矩阵中的部分实现状态 | 活动列表/引用/图片的细粒度交互、表格矩形选区/拖动、MathJax4和复杂Office/EPUB排版继续逐项验收 |
| 系统打印/扩展宿主 | 已实现待验证 | 在有打印机和真实VS Code/Cursor的环境复验 |

历史0.3交付记录保留在[归档说明](DELIVERY_0_3.md)。本轮没有把“入口存在”“库支持”“成功打包”或其他平台测试改写成已验证的完整Typora对等能力。
