"use strict";
const { contextBridge, ipcRenderer, webUtils } = require("electron");
const methods = new Set([
  "bootstrap",
  "spellcheckStatus",
  "openFile",
  "saveFile",
  "chooseFolder",
  "listFiles",
  "searchFiles",
  "fileOperation",
  "readAsset",
  "insertImages",
  "listImageReferences",
  "prepareImageOperation",
  "commitImageOperation",
  "cancelImageOperation",
  "cancelSearch",
  "downloadImage",
  "clipboardImage",
  "writeClipboard",
  "saveRecovery",
  "deleteRecovery",
  "discardRecovery",
  "listHistory",
  "restoreHistory",
  "updateSettings",
  "saveSession",
  "exportFile",
  "detectTools",
  "runPandoc",
  "newWindow",
  "windowAction",
  "pickPath",
  "openExternal",
  "resolveLink",
  "setDirty",
  "showInFolder",
  "openExport",
  "contextMenu",
]);
const events = new Set([
  "command",
  "external-change",
  "before-close",
  "before-close-commit",
  "close-aborted",
  "settings-changed",
  "open-path",
  "folder-change",
]);
contextBridge.exposeInMainWorld("inkstone", {
  invoke(method, payload = {}) {
    if (!methods.has(method))
      return Promise.reject(new Error("Unsupported desktop operation"));
    return ipcRenderer.invoke("inkstone:invoke", method, payload);
  },
  on(event, callback) {
    if (!events.has(event) || typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(`inkstone:${event}`, listener);
    return () => ipcRenderer.removeListener(`inkstone:${event}`, listener);
  },
  filePath(file) {
    const filePath = webUtils.getPathForFile(file);
    if (filePath) ipcRenderer.send("inkstone:drop-path", filePath);
    return filePath;
  },
});
