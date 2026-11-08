# Inkstone 墨石品牌素材

当前界面和安装包使用用户提供的 `inkstone-brand` 品牌包。标志是带水滴形墨池的随形砚，字标与图形均直接采用提供的 SVG / PNG / ICO；没有重新绘制、改色、拉伸或重新栅格化。

## 界面

`src/branding.js` 是应用的品牌入口，运行时仅引用 `src/assets/brand/` 内的本地资源，不依赖原始素材目录或网络。

| 用途         | 提供包中的原文件                                            | 应用资源                                                    |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------------------- |
| 中文浅色界面 | `logo/svg/inkstone-logo-horizontal.svg`                     | `src/assets/brand/inkstone-logo-horizontal.svg`             |
| 中文深色界面 | `logo/svg/inkstone-logo-horizontal-reversed.svg`            | `src/assets/brand/inkstone-logo-horizontal-reversed.svg`    |
| 英文浅色界面 | `logo/svg/inkstone-logo-horizontal-en.svg`                  | `src/assets/brand/inkstone-logo-horizontal-en.svg`          |
| 英文深色界面 | `logo/svg/inkstone-logo-horizontal-en-reversed.svg`         | `src/assets/brand/inkstone-logo-horizontal-en-reversed.svg` |
| 独立图形     | `logo/svg/inkstone-mark.svg` / `inkstone-mark-reversed.svg` | `src/assets/brand/` 中的同名文件                            |
| 浏览器图标   | `icon/web/favicon.svg` / `favicon.ico`                      | `src/assets/brand/` 中的同名文件                            |

侧栏的完整组合标志已经包含产品名，中文版本还包含“墨石”，因此不会再叠加一份文字产品名。标志具有一个无障碍名称；两张明暗图片作为装饰内容，不重复向读屏软件播报。界面根据应用实际的 `data-theme` 选择浅色或反白原图，favicon 保留提供包原有的系统明暗适配。

组合标志宽度不小于品牌包规定的 120 px；图形保持比例，侧栏支持 180 px 的最小宽度。品牌区保留周围留白。界面字体优先使用 Windows 的 Segoe UI，再使用 Linux 常见的 Noto Sans；字标本身已经转为轮廓，不依赖安装字体。

## Windows 与 Linux 图标

| 用途                      | 原文件                                                      | 发布资源                        |
| ------------------------- | ----------------------------------------------------------- | ------------------------------- |
| Windows 程序与安装包      | `icon/windows/Inkstone.ico`                                 | `build/icon.ico`                |
| Linux / Electron 窗口     | `icon/png/inkstone-icon-1024.png`                           | `build/icon.png`                |
| Linux桌面逐尺寸图标 | `icon/png/inkstone-icon-{16,32,48,64,128,256,512,1024}.png` | `build/icons/{size}x{size}.png` |

ICO 原样保留 16、20、24、32、40、48、64、128、256 px 图层及提供包的 NSIS 兼容编码，不从大图重新生成。小尺寸 PNG 也是提供包的原文件。图标是否已写入某一发布物，以该发布物的验证报告为准。

产品发布目标是 **Windows 和 Linux**。提供包原目录中的其他平台素材保持完整，既不表示支持这些平台，也不作为应用运行或发布的依赖。

## 色彩与来源

- 墨 Ink `#1C1A21`：文字、深色背景和图形。
- 宣 Paper `#F4F0E6`：浅色侧栏、反白图形和按钮文字。
- 石 Stone `#76717D`：辅助文字、选区及中性色阶的基准。
- 朱 Vermilion `#C8402B`：少量主要操作按钮。不会用 CSS 重染图形或水滴。

以上规范来源于提供包的 [README](../inkstone-brand/README.md)。该说明记载字标轮廓源自 Noto Serif SC：英文 SemiBold、中文 Medium，字体采用 SIL Open Font License 1.1；其余图形来自提供包的原创几何设计。项目没有重新生成字体或图形，也没有修改提供包的说明和资产。

验证证据位于 `artifacts/branding-validation/`：`asset-manifest.json` 记录已选文件与来源文件的 SHA-256 一致性和图标尺寸；界面截图与浏览器报告记录浅色、深色、中英文及窄侧栏的实际显示情况。

## 0.3发行物核对

Linux构建直接使用 `build/icons` 中提供的各尺寸原PNG，窗口图标仍用 `build/icon.png`。Windows程序与NSIS继续使用原ICO。最终0.3各包已重新匹配：Linux三包窗口PNG一致，AppImage/deb全部8种桌面尺寸PNG一致；Windows应用EXE与NSIS各ICO图像逐字节匹配，见[包报告](../artifacts/package-validation/results.json)及[Windows PE报告](../artifacts/windows-package-validation/static-results.json)。静态资源验证不代表原生Windows安装、任务栏和文件关联已经通过。

0.3 VSIX已重新打包，实际解包验证提供的256px PNG字节一致，见[扩展包记录](../artifacts/documentation-validation/extension-package.json)。本轮UI的中英明暗/窄窗口截图见[0.3 UI报告](../artifacts/ui-polish-validation/results.json)，原18份源资产均未修改。品牌资产一致性、界面视觉与操作系统安装呈现分别记录，不互相替代。
