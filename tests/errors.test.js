import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanErrorMessage,
  displayError,
  errorCode,
  localizeError,
  localizedError,
} from "../src/errors.js";

const remote = (message) =>
  new Error(
    `Error invoking remote method 'inkstone:invoke': Error: ${message}`,
  );

test("Desktop errors lose the IPC wrapper in every language", () => {
  const error = remote(
    "CONFLICT: The file changed while saving. Your edits have not overwritten it.",
  );
  assert.equal(
    cleanErrorMessage(error),
    "CONFLICT: The file changed while saving. Your edits have not overwritten it.",
  );
  assert.equal(errorCode(error), "CONFLICT");
  assert.equal(
    localizeError(error, "en"),
    "CONFLICT: The file changed while saving. Your edits have not overwritten it.",
  );
});

test("Chinese UI translates known AI and file errors", () => {
  assert.equal(
    localizeError(remote("AI: Request cancelled."), "zh-CN"),
    "请求已取消。",
  );
  assert.equal(
    localizeError(
      "AI: Request timed out. Try a shorter selection or increase the timeout.",
      "zh-CN",
    ),
    "请求超时。请缩短所选内容，或在高级设置中增加超时时间。",
  );
  assert.match(
    localizeError(
      "AI: Provider returned HTTP 401. The API key is missing or invalid. Check the key for this provider and region.",
      "zh-CN",
    ),
    /^AI：模型服务返回 HTTP 401。API Key 缺失或无效/,
  );
  assert.equal(
    localizeError("AI: Invalid timeoutMs.", "zh-CN"),
    "AI 设置无效：超时时间。",
  );
  assert.match(
    localizeError(
      "ENCODING: GB18030 cannot represent one or more characters without loss. Choose UTF-8 or another compatible encoding; nothing was saved.",
      "zh-CN",
    ),
    /GB18030 编码无法无损表示/,
  );
  assert.equal(
    localizeError("EXISTS: Destination already exists.", "zh-CN"),
    "目标位置已存在同名项目。",
  );
});

test("Unknown coded errors get a Chinese label; Chinese messages pass through", () => {
  assert.equal(
    localizeError("EXPORT: Something new happened.", "zh-CN"),
    "导出失败：Something new happened.",
  );
  assert.equal(
    localizeError("CLOSE: 请先完成或取消当前关闭操作，再打开新窗口。", "zh-CN"),
    "CLOSE: 请先完成或取消当前关闭操作，再打开新窗口。",
  );
  assert.equal(
    localizeError(
      "ENOENT: no such file or directory, open 'C:\\a.md'",
      "zh-CN",
    ),
    "找不到文件或文件夹。",
  );
  // Plain renderer text without a code is never relabelled.
  assert.equal(localizeError("notes.md", "zh-CN"), "notes.md");
});

test("Localized errors keep the raw message and code for branching", () => {
  const error = localizedError(
    remote(
      "ENCODING: This file contains NUL bytes. Choose UTF-16 explicitly if appropriate; binary files cannot be edited.",
    ),
    "zh-CN",
  );
  assert.match(error.message, /NUL 字节/);
  assert.equal(error.code, "ENCODING");
  assert.match(error.raw, /ENCODING:/);
  // Localizing twice is stable.
  assert.equal(
    localizeError(error, "zh-CN"),
    localizeError(error.raw, "zh-CN"),
  );
});

test("Displayed errors drop internal codes in both languages", () => {
  assert.equal(
    displayError(
      remote(
        "CONFLICT: The file changed while saving. Your edits have not overwritten it.",
      ),
      "en",
    ),
    "The file changed while saving. Your edits have not overwritten it.",
  );
  assert.equal(
    displayError("AI: Request cancelled.", "en"),
    "Request cancelled.",
  );
  assert.equal(
    displayError("CLOSE: 请先完成或取消当前关闭操作，再打开新窗口。", "zh-CN"),
    "请先完成或取消当前关闭操作，再打开新窗口。",
  );
  // Ordinary sentences are left alone.
  assert.equal(
    displayError("Open a folder first", "en"),
    "Open a folder first",
  );
});
