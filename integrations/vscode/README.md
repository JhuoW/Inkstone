# Open in Inkstone 墨石

独立的 VS Code / Cursor 扩展，提供命令面板、Markdown 编辑区及文件列表右键的“在墨石中打开”。它只调用本机墨石程序，只处理本地路径、不自动下载应用、不包含 Typora 的素材或代码。

当前版本 0.9.2（与 Inkstone 桌面应用版本一致），仅支持Windows和Linux。Linux 上13项Node行为测试及真实子进程参数测试已通过；尚未在 VS Code / Cursor 扩展宿主中人工验收，也未验证 Windows 实际启动。安装包生成不能替代这些验收。

## 安装

先安装 Inkstone 桌面应用。在 VS Code 的扩展菜单选择 **Install from VSIX… / 从 VSIX 安装…**，选择 `release/extensions/inkstone-open-0.9.2.vsix`。使用兼容 VSIX 的 Cursor 安装入口也可安装，但需单独验证。

也可在本机 VS Code 命令行执行：

```bash
code --install-extension release/extensions/inkstone-open-0.9.2.vsix
```

本包未发布到 Marketplace。`inkstone-local` 是本地打包使用的标识，不宣称已注册发布者或平台认证。

## 配置和使用

在 **用户设置** 配置应用路径。不要把可执行程序和参数合并成 shell 命令，不要给路径额外加引号。

```json
{
  "inkstone.executablePath": "/home/me/Applications/Inkstone.AppImage",
  "inkstone.args": []
}
```

Windows 示例路径为 `C:\\Users\\me\\AppData\\Local\\Programs\\Inkstone\\Inkstone.exe`。路径留空时，Linux 尝试 PATH 上的 `inkstone`，Windows 尝试当前用户 Programs 下的 Inkstone。便携版或自定义安装目录应显式设置。

`args` 的每个元素是一个完整参数，文档绝对路径自动追加。扩展使用参数数组和 `shell:false`，空格、中文、引号、`$()` 等字符作为普通路径传递。启动环境移除 `ELECTRON_RUN_AS_NODE`，防止 VS Code 环境把 Electron 当作 Node 程序运行。

执行命令后：已保存且未修改的文档直接打开；脏文档先通过宿主保存，保存取消/失败则停止；未命名 Markdown 使用宿主 Save As，取消后不会启动墨石。若保存期间又有输入，扩展提示重新执行，避免打开旧内容。此操作只由用户命令触发，激活扩展本身不保存或打开文件。

扩展图标直接取自用户提供的 `inkstone-brand/icon/png/inkstone-icon-256.png`，未重绘。

只支持本机文件；远程 SSH/容器/虚拟 URI 不会被自动复制到本机。只读取用户/机器级可执行路径与参数，忽略仓库提供的工作区覆盖。启动失败会显示系统错误并提供设置入口。成功启动进程只代表请求已交给程序，文件是否在桌面显示需实机验收。

## 构建与验证

在此目录使用 Node.js 22：

```bash
npm ci
npm test
npm run package
```

输出为根仓库 `release/extensions/inkstone-open-0.9.2.vsix`，没有运行时 npm 依赖。`@vscode/vsce` 只用于开发打包，不随扩展分发；没有执行 Marketplace 发布。

人工验收步骤：在目标宿主安装 VSIX，分别用命令面板、编辑区右键和文件树右键打开中文/空格/特殊字符文件；确认未命名 Save As 的保存与取消；确认保存失败不启动；确认另一个编辑器已激活时文件树命令仍打开选中文件；验证缺应用错误与路径设置。Windows/Linux、VS Code/Cursor 分别记录结果。其他操作系统会在保存文档或启动进程之前明确拒绝。

接口依据：[命令与菜单贡献点](https://code.visualstudio.com/api/references/contribution-points)、[文档保存 API](https://code.visualstudio.com/api/references/vscode-api#workspace)、[官方 VSIX 打包说明](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。源码许可为 AGPL-3.0-only，与 Inkstone 主程序一致，见 LICENSE。
