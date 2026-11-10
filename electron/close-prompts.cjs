"use strict";
/**
 * Native dialogs shown before Inkstone closes: what the close button should
 * do with the last window, and one choice for several unsaved documents.
 * Each builder returns dialog.showMessageBox options and a function that
 * turns the dialog result into a decision.
 */

/** "Minimize to tray" or "Exit", with "Remember my choice". */
function closeChoice(localize) {
  return {
    options: {
      type: "question",
      title: "Inkstone",
      message: localize(
        "Minimize Inkstone to the tray, or exit?",
        "最小化到托盘，还是退出 Inkstone？",
      ),
      detail: localize(
        "In the tray, Inkstone keeps running and auto save continues. Click the Inkstone icon in the notification area to reopen it. You can change this later in Preferences > Files.",
        "最小化到托盘后，Inkstone 会在后台继续运行，自动保存照常进行；点击通知区域中的 Inkstone 图标即可恢复窗口。之后可在“偏好设置 > 文件”中更改。",
      ),
      buttons: [
        localize("Minimize to Tray", "最小化到托盘"),
        localize("Exit Inkstone", "退出 Inkstone"),
        localize("Cancel", "取消"),
      ],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      checkboxLabel: localize("Remember my choice", "记住我的选择"),
      checkboxChecked: false,
    },
    decide: ({ response, checkboxChecked }) => {
      const action = ["tray", "quit"][response] || "cancel";
      return { action, remember: action !== "cancel" && !!checkboxChecked };
    },
  };
}

/** Save all, review each document, discard all, or cancel exiting. */
function unsavedDocuments(localize, names) {
  const shown = names.slice(0, 10);
  const more = names.length - shown.length;
  return {
    options: {
      type: "warning",
      title: "Inkstone",
      message: localize(
        `${names.length} documents have unsaved changes.`,
        `有 ${names.length} 个文档包含未保存的修改。`,
      ),
      detail:
        shown.map((name) => `• ${name}`).join("\n") +
        (more > 0
          ? "\n" + localize(`…and ${more} more`, `……以及另外 ${more} 个`)
          : "") +
        "\n\n" +
        localize(
          "Save the changes before exiting? New documents ask where to save.",
          "退出前要保存这些修改吗？尚未保存过的新文档会询问保存位置。",
        ),
      buttons: [
        localize("Save All", "全部保存"),
        localize("Review Each…", "逐个确认…"),
        localize("Don't Save", "全部不保存"),
        localize("Cancel", "取消"),
      ],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    },
    decide: ({ response }) =>
      ["save", "review", "discard"][response] || "cancel",
  };
}

module.exports = { closeChoice, unsavedDocuments };
