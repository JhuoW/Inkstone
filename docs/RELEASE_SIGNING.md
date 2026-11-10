# Windows 安装包签名（Azure Artifact Signing）

发布流水线已经接好 Azure Artifact Signing（原名 Trusted Signing），但尚未启用。按下文配置好 GitHub 的 Secrets 和 Variables 后，`v*` 标签构建会自动签名，并在发布前核对签名。未配置时一切照旧，发布的是未签名安装包。

## 先确认资格

Microsoft 官方 [Quickstart](https://learn.microsoft.com/azure/artifact-signing/quickstart)（2026-10-08 更新）写明：

- **组织**：美国、加拿大、欧盟、英国、澳大利亚、新西兰、日本、韩国、新加坡、瑞士、挪威、以色列的组织可申请 Public Trust 证书。
- **个人开发者**：仅限美国和加拿大。

因此在新加坡以个人身份无法通过验证，需要以依法注册的组织申请。组织验证需要：

- 法定名称；
- 属于该组织的网站；
- 商业登记号（新加坡为 UEN）；
- 该组织自有域名下的邮箱（主、次邮箱须同一域名）。

身份验证需要 1–20 个工作日。证书上的发布者名称（CN）就是验证通过的组织法定名称，Windows 安装提示和 SmartScreen 显示的也是这个名称。

## 一次性设置

1. 准备一个 Azure 订阅（按量付费），在订阅中注册资源提供程序 `Microsoft.CodeSigning`。
2. 创建 Artifact Signing 账户，记下账户概览页上的 Account URI，例如 `https://eus.codesigning.azure.net/`。创建账户后即开始按月计费：Basic 每月 5,000 次签名，价格以 Azure 官方价格页为准。
3. 给自己分配 **Artifact Signing Identity Verifier** 角色，提交 Public Trust 组织身份验证。
4. 验证通过后，在账户中创建一个 Public Trust 证书配置文件（certificate profile）。
5. 在 Microsoft Entra ID 中注册一个应用（App registration），为它创建客户端密码。
6. 在 Artifact Signing 账户或该证书配置文件上，为这个应用分配 **Artifact Signing Certificate Profile Signer** 角色。
7. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：

   | 类型 | 名称 | 内容 |
   |---|---|---|
   | Secret | `AZURE_TENANT_ID` | Entra 租户 ID |
   | Secret | `AZURE_CLIENT_ID` | 第 5 步应用的客户端 ID |
   | Secret | `AZURE_CLIENT_SECRET` | 第 5 步创建的客户端密码 |
   | Variable | `AZURE_SIGNING_ENDPOINT` | 第 2 步的 Account URI |
   | Variable | `AZURE_SIGNING_ACCOUNT` | Artifact Signing 账户名称（不是应用名称） |
   | Variable | `AZURE_SIGNING_PROFILE` | 第 4 步的证书配置文件名称 |
   | Variable | `AZURE_SIGNING_PUBLISHER` | 证书上的发布者名称（CN），与验证通过的组织名称逐字一致 |

## 流水线的行为

- **只在 `v*` 标签构建时签名**：推送到 master 和 PR 构建都不签名，既节省签名额度，也不会把密钥交给这些构建。
- **配置不完整就停止**：设置了 `AZURE_CLIENT_ID` 却缺少上表任一项时，构建直接失败，避免以为已签名、实际发布了未签名版本。
- **签名范围**：electron-builder 通过 `win.azureSignOptions` 签名 `Inkstone.exe`、安装程序和卸载程序。
- **发布前核对**：发布前用 `Get-AuthenticodeSignature` 确认安装程序和 `Inkstone.exe` 的签名有效，再用 `scripts/verify-update-metadata.mjs` 确认 `app-update.yml` 中的发布者与证书一致。
- **自动更新只接受同一发布者**：发布者名称会写入 `app-update.yml`。从第一个签名版本起，自动更新只安装由同一发布者签名的安装包。

## 注意

- 更换发布者名称（例如改用另一个组织）后，已安装的版本会拒绝新的安装包，用户需要手动安装一次新版本。
- 未签名期间，Windows SmartScreen 会提示“无法识别的应用 / 未知发布者”。用户可选择“更多信息 → 仍要运行”。安装包的 SHA-256 校验值随发布附在 `SHA256SUMS.txt` 中。
