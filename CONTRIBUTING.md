# 参与开发

## 环境

需要 Node.js 22.12+。

```sh
npm ci
npm start
```

## 提交前

| 命令                      | 内容                                                  |
| ------------------------- | ----------------------------------------------------- |
| `npm run format`          | 用 Prettier 格式化；CI 用 `npm run format:check` 检查 |
| `npm test`                | 单元测试                                              |
| `npm run test:e2e`        | Electron 端到端测试（Windows 上运行全部用例）         |
| `node website/verify.mjs` | 修改网站后检查两种语言、导航和 320–1440 px 布局       |

Inkstone 对每个配置目录只运行一个实例。已安装的 Inkstone 正在运行时，`npm start` 会把启动交给它；开发时可设置 `INKSTONE_USER_DATA` 使用单独的配置目录。端到端测试默认设置 `INKSTONE_CLOSE_ACTION=quit`，关闭最后一个窗口时直接退出，不弹出托盘选择对话框。

测试和验证脚本的输出写到 `artifacts/runs/`，git 会忽略这个目录。如需写到别处，设置 `INKSTONE_ARTIFACT_ROOT`。`artifacts/` 下其他内容是各版本保留的验收记录和宣传素材，不要用测试输出覆盖。

## 代码组织

- **主进程**
  - `electron/main.cjs`：窗口、文件和 IPC 入口；
  - 独立模块：设置校验 `settings-schema.cjs`、菜单 `menu.cjs`、托盘 `tray.cjs`、关闭前的原生对话框 `close-prompts.cjs`、关闭与退出协调 `close-coordinator.cjs`、导入导出与 Pandoc `export.cjs`、更新 `updates.cjs`、诊断信息 `diagnostics.cjs`、AI `ai-*.cjs`。
- **渲染进程**：`src/app.js` 负责主流程。命令表和默认快捷键在 `src/commands.js`。
- **新增 IPC 方法**：同时加入 `electron/preload.cjs` 的白名单，并在 `electron/API.md` 中说明。
- **新增命令**：在 `src/app.js` 的 `execute()` 或 `src/editor.js` 的 `command()` 中处理。`tests/commands.test.js` 会检查菜单和命令面板里的每个命令都有处理代码。
- **错误信息**：主进程抛出带 `CODE:` 前缀的英文信息，中文对照写在 `src/errors.js`。

## 分支与发布

- 在功能分支上开发，提交 Pull Request，CI 通过后再合并到 `master`。建议在 GitHub 仓库设置中为 `master` 开启分支保护，要求 CI 通过。
- 发布步骤：
  1. 按 [发布与版本策略](docs/RELEASE_POLICY.md) 更新版本号，涉及 `package.json`、`package-lock.json` 和 `integrations/vscode`；
  2. 新增 `docs/releases/vX.Y.Z.md`；
  3. 推送 `vX.Y.Z` 标签。

  工作流会构建、验证并发布 Windows 与 Linux 安装包和自动更新清单。签名配置见 [发布签名](docs/RELEASE_SIGNING.md)。

- 截图和素材都由脚本生成，先运行 `npm run build`：
  - README：`scripts/capture-readme*.mjs`；
  - 网站：`scripts/capture-website.mjs`；
  - 宣传图：`scripts/capture-promo.mjs` 与 `artifacts/promo/render.sh`。
