// Errors raised by the desktop process are English and carry a CODE: prefix.
// The renderer shows them in the active UI language. The original text stays
// available on `error.raw` so code can still branch on codes such as CONFLICT.
import { getLocale } from "./i18n.js";

const REMOTE_PREFIX =
  /^(?:Error invoking remote method '[^']*':\s*)?(?:(?:[A-Z][A-Za-z]*)?Error:\s*)?/;
const HAN = /[㐀-鿿]/;

const exact = new Map(
  Object.entries({
    // Desktop access and validation
    "ACCESS: Choose this file or its containing folder in Inkstone before accessing it.":
      "请先在 Inkstone 中选择此文件或其所在文件夹，再访问它。",
    "ACCESS: Only the application main frame may use desktop operations.":
      "只有应用主窗口可以执行桌面操作。",
    "ACCESS: This resource operation belongs to another window.":
      "此资源操作属于另一个窗口。",
    "ACCESS: Unrecognized window.": "无法识别的窗口。",
    "ACCESS: Untrusted document.": "文档来源不受信任。",
    "INVALID_PATH: A valid local path is required.": "需要有效的本地路径。",
    "INVALID: A recovery ID or document path is required.":
      "需要恢复记录 ID 或文档路径。",
    "INVALID: Custom Pandoc arguments must be approved formatting options; filters and output overrides are not accepted.":
      "自定义 Pandoc 参数只能使用允许的格式选项，不接受过滤器或输出覆盖参数。",
    "INVALID: Document text must be a string.": "文档内容必须是文本。",
    "INVALID: Invalid history identifier.": "历史版本标识无效。",
    "INVALID: Operation payload must be an object.": "操作参数格式无效。",
    "INVALID: Recovery ID must contain letters, digits, _ or -.":
      "恢复记录 ID 只能包含字母、数字、_ 或 -。",
    "INVALID: Recovery text is required.": "恢复内容不能为空。",
    "INVALID: Unsupported desktop method.": "不支持的桌面操作。",
    "INVALID: Unsupported file operation.": "不支持的文件操作。",
    "Unsupported desktop operation": "不支持的桌面操作。",
    "Unsupported window action": "不支持的窗口操作。",
    "Settings must be a JSON object.": "设置必须是 JSON 对象。",
    "Invalid default code language": "默认代码语言无效。",
    "Invalid export options": "导出选项无效。",
    "Invalid file sort": "文件排序方式无效。",
    "Invalid file URL": "文件地址无效。",
    "Invalid language": "界面语言无效。",
    "Invalid sequence theme": "时序图主题无效。",
    "Invalid shortcuts": "快捷键设置无效。",
    "Invalid state key": "状态键无效。",
    "Invalid text snippets": "文本片段设置无效。",
    "Invalid theme": "主题无效。",
    "Invalid theme library": "主题库无效。",
    "Invalid Windows association response.": "Windows 文件关联返回了无效结果。",
    "Invalid Windows UI language.": "Windows 界面语言无效。",
    "The bundled dictionary did not pass its integrity check.":
      "内置词典未通过完整性校验。",
    // Files and saving
    "CONFLICT: Saving over an existing file requires its current revision. Use Save As or reopen the file.":
      "覆盖已有文件需要其当前版本。请使用“另存为”或重新打开该文件。",
    "CONFLICT: The file changed outside Inkstone. Your edits are retained; reopen the disk version or Save As a new file.":
      "文件已在 Inkstone 之外被修改。你的编辑仍保留，可重新打开磁盘版本或另存为新文件。",
    "CONFLICT: The file changed while saving. Your edits have not overwritten it.":
      "保存过程中文件被修改，你的编辑没有覆盖它。",
    "CONFLICT: Export destination changed while rendering. The existing file was not overwritten; choose a new destination.":
      "渲染期间导出目标已变化，已有文件未被覆盖，请选择新的保存位置。",
    "CONFLICT: An image changed after preparing this operation. No original files were removed.":
      "准备操作后图片发生了变化，原文件均未删除。",
    "CONFLICT: An image changed while publishing the batch. No original files were removed.":
      "批量处理期间图片发生了变化，原文件均未删除。",
    "CONFLICT: The document changed on disk. Reopen it before managing image resources.":
      "文档已在磁盘上被修改。请重新打开后再管理图片资源。",
    "CONFLICT: The document changed since preparing image resources. No original files were removed.":
      "准备图片资源后文档发生了变化，原文件均未删除。",
    "ENCODING: Supported encodings are UTF-8, UTF-16LE, UTF-16BE, GB18030, Windows-1252 and Shift-JIS.":
      "支持的编码为 UTF-8、UTF-16LE、UTF-16BE、GB18030、Windows-1252 和 Shift-JIS。",
    "ENCODING: This file contains NUL bytes. Choose UTF-16 explicitly if appropriate; binary files cannot be edited.":
      "此文件包含 NUL 字节。如确为 UTF-16 文本，请明确选择 UTF-16；二进制文件无法编辑。",
    "The selected encoding does not preserve these source bytes.":
      "所选编码无法完整保留这些原始字节。",
    "EXISTS: A file with this name already exists.": "同名文件已存在。",
    "EXISTS: Destination already exists.": "目标位置已存在同名项目。",
    "EXISTS: The image destination already exists; it was not overwritten.":
      "图片目标位置已存在文件，未覆盖。",
    "NOT_FILE: Please choose a file.": "请选择一个文件。",
    "TOO_LARGE: Documents are limited to 100 MB.": "文档大小不能超过 100 MB。",
    "PATH: Cannot copy a folder into itself.": "不能把文件夹复制到其自身内部。",
    "PATH: Destination is required.": "请指定目标位置。",
    "OPEN: Expected an exported file.": "请选择导出的文件。",
    "OPEN: Only supported document and image exports can be opened.":
      "只能打开受支持的文档或图片导出文件。",
    // Links, clipboard and spelling
    "LINK: Expected a local file path.": "链接应为本地文件路径。",
    "LINK: Expected a relative local file path or file URL.":
      "链接应为相对本地路径或 file 地址。",
    "LINK: Invalid local file URL.": "本地文件地址无效。",
    "LINK: Invalid URL.": "链接地址无效。",
    "LINK: Only HTTP(S) and mailto links can be opened externally.":
      "只能在外部打开 HTTP(S) 和 mailto 链接。",
    "CLIPBOARD: Text and HTML must be smaller than 10 MB.":
      "剪贴板中的文本和 HTML 必须小于 10 MB。",
    "CLIPBOARD: Text, HTML and Markdown must be strings smaller than 10 MB; Markdown must match plain text.":
      "剪贴板中的文本、HTML 和 Markdown 必须小于 10 MB，且 Markdown 需与纯文本一致。",
    "SPELLCHECK: A single word of at most 256 characters is required.":
      "请提供一个不超过 256 个字符的单词。",
    "SPELLCHECK: This word could not be added to the local dictionary.":
      "无法把此单词加入本地词典。",
    // Images, assets and export
    "ASSET: Only image, media, font and CSS resources can be loaded.":
      "只能加载图片、音视频、字体和 CSS 资源。",
    "ASSET: Resource exceeds 100 MB.": "资源超过 100 MB。",
    "DOWNLOAD: Image exceeds 25 MB.": "图片超过 25 MB。",
    "DOWNLOAD: Invalid image URL.": "图片地址无效。",
    "DOWNLOAD: Only HTTP(S) image URLs without credentials are accepted.":
      "只接受不含账号信息的 HTTP(S) 图片地址。",
    "DOWNLOAD: Only HTTP(S) URLs without credentials are accepted.":
      "只接受不含账号信息的 HTTP(S) 地址。",
    "DOWNLOAD: Unsupported image type or image exceeds 25 MB.":
      "图片类型不受支持，或图片超过 25 MB。",
    "Unsupported image URL protocol.": "不支持该图片地址协议。",
    "IMAGES: A rename destination is required.": "请指定新的图片名称。",
    "IMAGES: An image selection is no longer present in this document.":
      "所选图片已不在当前文档中。",
    "IMAGES: Conflicting shared reference definitions.":
      "共享的图片引用定义相互冲突。",
    "IMAGES: Destination conflicts with a source or another image.":
      "目标位置与源图片或其他图片冲突。",
    "IMAGES: Destination must retain a supported image extension.":
      "目标文件必须保留受支持的图片扩展名。",
    "IMAGES: Document text is missing or exceeds 100 MB.":
      "文档内容缺失或超过 100 MB。",
    "IMAGES: Download remote images before moving, renaming or deleting their files.":
      "请先下载远程图片，再移动、重命名或删除其文件。",
    "IMAGES: Download requires remote HTTP(S) image URLs.":
      "下载仅适用于远程 HTTP(S) 图片地址。",
    "IMAGES: Duplicate image selections were refused.":
      "选择中包含重复图片，已拒绝。",
    "IMAGES: Image exceeds 100 MB.": "图片超过 100 MB。",
    "IMAGES: Invalid clipboard image.": "剪贴板中的图片无效。",
    "IMAGES: Invalid destination folder.": "目标文件夹无效。",
    "IMAGES: Invalid image root.": "图片根目录无效。",
    "IMAGES: Only supported image files may be managed.":
      "只能管理受支持的图片文件。",
    "IMAGES: Overlapping image source patches were refused.":
      "图片引用修改范围重叠，已拒绝。",
    "IMAGES: Rename operates on one image at a time.":
      "一次只能重命名一张图片。",
    "IMAGES: Resource batch exceeds 100 MB.": "本批资源超过 100 MB。",
    "IMAGES: Resource exceeds 25 MB.": "资源超过 25 MB。",
    "IMAGES: Resource operation expired; prepare it again.":
      "资源操作已过期，请重新准备。",
    "IMAGES: Resource operation is already committing.": "资源操作正在提交中。",
    "IMAGES: This resource operation is already committing.":
      "此资源操作正在提交中。",
    "IMAGES: Save the document before inserting local images.":
      "请先保存文档，再插入本地图片。",
    "IMAGES: Save the document first.": "请先保存文档。",
    "IMAGES: Select between 1 and 100 images.": "请选择 1 到 100 张图片。",
    "IMAGES: Too many pending resource operations. Cancel an earlier operation first.":
      "待处理的资源操作过多，请先取消之前的操作。",
    "IMAGES: Unsupported image operation.": "不支持的图片操作。",
    "IMAGES: Unsupported image type.": "不支持的图片类型。",
    "The source changed while committing; it was kept.":
      "提交期间源文件发生变化，已保留源文件。",
    "EXPORT: A maximum of 100 diagram images can be embedded per export.":
      "每次导出最多嵌入 100 张图表图片。",
    "EXPORT: Diagram image is not PNG or exceeds export size limits.":
      "图表图片不是 PNG，或超出导出尺寸限制。",
    "EXPORT: diagramAssets must be an array.": "图表资源格式无效。",
    "EXPORT: Images or fonts did not finish loading within 15 seconds.":
      "图片或字体未在 15 秒内加载完成。",
    "EXPORT: Invalid diagram source or PNG data.": "图表源码或 PNG 数据无效。",
    "EXPORT: PNG output exceeds 32,760 pixels. Split the document or export PDF.":
      "PNG 输出超过 32,760 像素。请拆分文档或改为导出 PDF。",
    "EXPORT: Rendered document HTML is required.": "缺少渲染后的文档 HTML。",
    "FORMAT: This import format is unsupported. Choose a supported document format; PDF import is not provided.":
      "不支持此导入格式。请选择受支持的文档格式（不提供 PDF 导入）。",
    "FORMAT: Unsupported Pandoc export format.": "不支持该 Pandoc 导出格式。",
    // AI Writing Assistant
    "AI: Chat history is too large; start a new conversation.":
      "对话记录过长，请清空对话后重新开始。",
    "AI: Choose a model in AI / Models first.": "请先在“AI / 模型”中选择模型。",
    "AI: Choose a supported provider.": "请选择受支持的模型服务。",
    "AI: Configure an API endpoint first.": "请先配置 API 地址。",
    "AI: Configure an API key for this provider first.":
      "请先为此服务配置 API Key。",
    "AI: Could not contact the provider. Check the service, endpoint and connection.":
      "无法连接模型服务。请检查服务状态、API 地址和网络连接。",
    "AI: Could not encrypt the API key. Nothing was saved.":
      "无法加密 API Key，未保存任何内容。",
    "AI: Empty provider response.": "模型服务返回了空响应。",
    "AI: Endpoints must use HTTP or HTTPS, without credentials, query strings or fragments.":
      "API 地址必须使用 HTTP 或 HTTPS，且不能包含账号信息、查询参数或片段。",
    "AI: Enter a question under 8,000 characters.":
      "请输入不超过 8,000 个字符的问题。",
    "AI: Enter a valid API endpoint.": "请输入有效的 API 地址。",
    "AI: Invalid Anthropic workspace ID.": "Anthropic 工作空间 ID 无效。",
    "AI: Invalid API key.": "API Key 无效。",
    "AI: Invalid Gemini model ID. Use an ID from the model list.":
      "Gemini 模型 ID 无效，请从模型列表中选择。",
    "AI: Invalid model configuration.": "模型配置无效。",
    "AI: Invalid model list from provider.": "模型服务返回的模型列表无效。",
    "AI: Invalid model name.": "模型名称无效。",
    "AI: Invalid model-list pagination from provider.":
      "模型服务返回的模型列表分页无效。",
    "AI: Invalid request identifier.": "请求标识无效。",
    "AI: Invalid request type.": "请求类型无效。",
    "AI: Invalid streaming response from provider.":
      "模型服务返回的流式响应无效。",
    "AI: Model configuration is damaged or unreadable. Restore ai-models.json / ai-credentials.json from a backup; existing files were preserved.":
      "模型配置已损坏或无法读取。请从备份恢复 ai-models.json / ai-credentials.json；现有文件已保留。",
    "AI: Model settings could not be saved. Check disk space and permissions.":
      "无法保存模型设置，请检查磁盘空间和权限。",
    "AI: Provider did not return a model list.": "模型服务没有返回模型列表。",
    "AI: Provider response exceeded the safety limit.":
      "模型服务的响应超出安全上限。",
    "AI: Provider stopped the response. Check model availability and quota.":
      "模型服务中止了响应，请检查模型是否可用及额度。",
    "AI: Provider stream exceeded the safety limit.":
      "模型服务的流式响应超出安全上限。",
    "AI: Request cancelled.": "请求已取消。",
    "AI: Request timed out. Try a shorter selection or increase the timeout.":
      "请求超时。请缩短所选内容，或在高级设置中增加超时时间。",
    "AI: Response exceeded the safety limit.": "响应内容超出安全上限。",
    "AI: Response was truncated. Increase the output limit or review a shorter selection.":
      "响应被截断。请提高输出上限，或改为分析较短的内容。",
    "AI: Secure key storage is unavailable. Unlock your OS keyring or remove the saved key and use a local model.":
      "系统安全密钥存储不可用。请解锁系统密钥环，或删除已保存的 Key 并改用本地模型。",
    "AI: Secure OS key storage is unavailable. Configure a keyring or use a local model without a key.":
      "系统安全密钥存储不可用。请配置密钥环，或使用无需 Key 的本地模型。",
    "AI: Select a non-empty passage or a document under 200,000 characters.":
      "请选择非空段落，或使用不超过 200,000 个字符的文档。",
    "AI: The model did not return a valid review. Try again or choose another model.":
      "模型没有返回有效的分析结果。请重试或更换模型。",
    "AI: The provider could not complete this response. It may have been blocked by the model's content policy. Try a different selection or model.":
      "模型服务未能完成此响应，可能被内容策略拦截。请更换所选内容或模型。",
    "AI: The response ended before completion. Try again.":
      "响应在完成前中断，请重试。",
    "AI: The review has an invalid scoring format. Try another model.":
      "分析结果的评分格式无效，请更换模型。",
    "AI: The saved API key cannot be decrypted. Enter it again in AI / Models.":
      "无法解密已保存的 API Key，请在“AI / 模型”中重新输入。",
    "AI: This window has closed.": "此窗口已关闭。",
    "AI: Unexpected response content.": "模型返回了无法识别的内容。",
  }),
);

// Explanations appended to "AI: Provider returned HTTP <status>."
const providerExplanations = new Map(
  Object.entries({
    "The model or API route is unavailable, retired, or inaccessible to this account. Refresh the model list and check the endpoint.":
      "模型或 API 路径不可用、已下线，或此账户无权访问。请刷新模型列表并检查 API 地址。",
    "The API key is missing or invalid. Check the key for this provider and region.":
      "API Key 缺失或无效。请检查此服务及地域对应的 Key。",
    "This account or key cannot access the selected model, workspace or region.":
      "此账户或 Key 无权访问所选模型、工作空间或地域。",
    "The provider balance is insufficient. Check your API billing.":
      "服务余额不足，请检查 API 账单。",
    "Rate limit or quota reached. Check quota or retry later.":
      "已达到速率限制或额度上限。请检查额度或稍后重试。",
    "The provider rejected the model ID or request parameters. Choose an available chat model and check the endpoint.":
      "服务拒绝了模型 ID 或请求参数。请选择可用的对话模型并检查 API 地址。",
    "Check the endpoint, model and provider availability.":
      "请检查 API 地址、模型和服务是否可用。",
    "The provider is temporarily unavailable or overloaded. Retry in a moment.":
      "服务暂时不可用或负载过高，请稍后再试。",
  }),
);

const settingNames = {
  temperature: "温度",
  maxTokens: "输出上限",
  timeoutMs: "超时时间",
};

const patterns = [
  [
    /^AI: Provider returned HTTP (\d{3})\.\s*(.*)$/s,
    (m) =>
      `AI：模型服务返回 HTTP ${m[1]}。` +
      (providerExplanations.get(m[2].trim()) || m[2]),
  ],
  [
    /^AI: Invalid (\w+)\.$/,
    (m) => `AI 设置无效：${settingNames[m[1]] || m[1]}。`,
  ],
  [
    /^DOWNLOAD: HTTP (\d{3})(?: for (.+))?\.?$/,
    (m) => `下载失败：服务器返回 HTTP ${m[1]}${m[2] ? `（${m[2]}）` : ""}。`,
  ],
  [
    /^DOWNLOAD: Unsupported content type (.+)\.$/,
    (m) => `下载失败：不支持的内容类型 ${m[1]}。`,
  ],
  [
    /^ENCODING: (\S+) cannot represent one or more characters without loss\./,
    (m) =>
      `${m[1]} 编码无法无损表示部分字符。请选择 UTF-8 或其他兼容编码；未保存任何内容。`,
  ],
  [
    /^ENCODING: The file is not valid (\S+), or contains bytes that cannot roundtrip\./,
    (m) =>
      `文件不是有效的 ${m[1]} 编码，或包含无法往返转换的字节。请明确选择正确的编码。`,
  ],
  [
    /^STATE_BACKUP: The original (.+?)\.json could not be backed up\./,
    (m) =>
      `无法备份原始 ${m[1]}.json，未覆盖任何内容。请先修复文件权限或磁盘错误再重试。`,
  ],
  [
    /^Invalid setting: (\S+) must contain paths as strings$/,
    (m) => `设置 ${m[1]} 必须是路径文本列表。`,
  ],
  [/^Invalid setting: (\S+)$/, (m) => `设置项无效：${m[1]}。`],
  [
    /^Invalid shortcut for (\S+):/,
    (m) =>
      `${m[1]} 的快捷键无效：请使用 Mod/Ctrl/Meta/Alt/Shift 修饰键和受支持的按键。`,
  ],
  [/^Invalid (\S+)$/, (m) => `${m[1]} 无效。`],
  [/^OPEN: (.+)$/s, (m) => `无法打开文件：${m[1]}`],
];

// Node.js system errors that may reach the renderer from file operations.
const systemErrors = {
  ENOENT: "找不到文件或文件夹。",
  EACCES: "没有访问权限。",
  EPERM: "操作不被允许，请检查权限或文件是否被占用。",
  EBUSY: "文件正被其他程序占用。",
  ENOSPC: "磁盘空间不足。",
  EEXIST: "目标已存在。",
  EISDIR: "目标是文件夹，不是文件。",
  ENOTDIR: "路径中的某一部分不是文件夹。",
  ENOTEMPTY: "文件夹不为空。",
  EMFILE: "打开的文件过多，请稍后重试。",
  EROFS: "目标位于只读文件系统。",
  ETIMEDOUT: "操作超时。",
  ECONNREFUSED: "连接被拒绝。",
};

const codeLabels = {
  ACCESS: "访问受限",
  AI: "AI",
  ASSET: "资源",
  CLIPBOARD: "剪贴板",
  CLOSE: "关闭",
  CONFLICT: "文件冲突",
  DOWNLOAD: "下载失败",
  ENCODING: "编码",
  EXISTS: "已存在",
  EXPORT: "导出失败",
  FORMAT: "格式",
  IMAGES: "图片",
  INVALID: "无效操作",
  LINK: "链接",
  OPEN: "打开失败",
  PATH: "路径",
  PREFERENCES: "偏好设置",
  SPELLCHECK: "拼写检查",
  STATE_BACKUP: "备份失败",
  TOO_LARGE: "文件过大",
};

export function rawErrorMessage(error) {
  if (error == null) return "";
  if (typeof error === "string") return error;
  return String(error.raw ?? error.message ?? error);
}

/** Remove the IPC wrapper Electron adds around main-process errors. */
export function cleanErrorMessage(error) {
  let message = rawErrorMessage(error).trim();
  for (let i = 0; i < 2; i++) message = message.replace(REMOTE_PREFIX, "");
  return message.trim();
}

/** The leading CODE of a desktop error, for example "CONFLICT". */
export function errorCode(error) {
  return /^([A-Z][A-Z_]+):/.exec(cleanErrorMessage(error))?.[1] || "";
}

/**
 * Text for display in the active UI language. English keeps the original text
 * without the IPC wrapper. Chinese translates known messages, keeps messages
 * that are already Chinese and labels unknown coded errors in Chinese.
 */
export function localizeError(error, locale = getLocale()) {
  const message = cleanErrorMessage(error);
  if (locale !== "zh-CN" || !message || HAN.test(message)) return message;
  const known = exact.get(message);
  if (known) return known;
  for (const [pattern, format] of patterns) {
    const match = pattern.exec(message);
    if (match) return format(match);
  }
  const system = /\b(E[A-Z]{2,})\b/.exec(message)?.[1];
  if (system && systemErrors[system]) return systemErrors[system];
  const code = /^([A-Z][A-Z_]+):\s*(.*)$/s.exec(message);
  if (code) return `${codeLabels[code[1]] || "操作失败"}：${code[2]}`;
  return message;
}

/**
 * Text to show people: localized and without the internal "CODE:" prefix.
 * Code that branches on errors should use error.code or error.raw instead.
 */
export function displayError(error, locale = getLocale()) {
  return localizeError(error, locale).replace(/^[A-Z][A-Z_]+:\s+/, "");
}

/** An Error whose message is localized while code and raw text stay available. */
export function localizedError(error, locale = getLocale()) {
  const raw = rawErrorMessage(error);
  const result = new Error(localizeError(raw, locale));
  result.raw = raw;
  result.code = errorCode(raw);
  if (error && typeof error === "object" && "cause" in error)
    result.cause = error.cause;
  return result;
}
