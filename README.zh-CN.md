<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/inkstone-logo-horizontal-reversed.png">
    <img src="docs/images/inkstone-logo-horizontal.png" alt="Inkstone 墨石" width="520">
  </picture>
</p>

<p align="center"><strong>让想法落在纸上</strong></p>
<p align="center"><a href="README.md">English</a> · 简体中文</p>
<p align="center"><a href="https://wei2hu0.github.io/inkstone-website/zh.html">访问墨石官网 ↗</a></p>

墨石是一款专注写作的本地 Markdown 编辑器。你的笔记始终以普通文件保存在自己的电脑上。

![墨石 — 中文界面](docs/images/main-zh-CN.png)

## 下载

**[下载最新 Windows 安装版](https://github.com/JhuoW/Inkstone/releases/latest)**

运行安装程序即可安装或升级。右击 Markdown 文件，在“打开方式”中选择 Inkstone；也可通过“工具 → 默认 Markdown 应用”打开 Windows 默认应用设置。

## 功能

- Markdown 即时编辑与源码模式，保留选区和撤销记录。
- 行内公式、LaTeX 公式块、Mermaid 图表与可直接编辑的表格。
- 持续显示的代码块，支持语法高亮与语言下拉选择。
- 本地文件夹、搜索、自动保存、恢复及 HTML/PDF 导出。
- 简体中文和英文界面，浅色与深色主题。

### 让公式融入文字

公式在原位渲染，点击即可在当前段落中直接编辑表达式。

![行内公式编辑与独立公式渲染](docs/images/math-zh-CN.png)

### 始终可编辑的代码块

直接输入或粘贴代码，选择语言即可获得对应的语法高亮。

![支持语言选择的 Python 与 SQL 代码块](docs/images/code-zh-CN.png)

### 右键就能编辑表格

插入表格后，通过右键菜单添加、移动或删除行与列。

![通过右键菜单编辑表格](docs/images/tables-zh-CN.png)

## 开发

需要 **Node.js 22.12+**。主要发布 Windows 版本，也可从源码构建 Linux 版本。

```sh
npm ci
npm start
```

使用 `npm test` 运行单元测试，`npm run dist:win` 构建 Windows 安装程序。详细信息见[验证记录](docs/RELEASE_0_6_4.md)和 [Electron API](electron/API.md)。

## 许可证与贡献者

[AGPL-3.0-only](LICENSE) · [第三方许可](THIRD_PARTY_NOTICES.md) · [Wei Zhuo](https://wei2hu0.github.io/)
