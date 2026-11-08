'use strict';
const {launch} = require('./launcher.cjs');
const supported = /\.(?:md|markdown|mdown|mkd)$/i;
const sameURI = (left, right) => left?.toString() === right?.toString();

// This module has no VS Code import, so command behavior can be exercised with host doubles.
async function openFile(vscode, requestedURI, dependencies = {}) {
  if (!['win32','linux'].includes(dependencies.platform || process.platform)) throw new Error('Inkstone supports Windows and Linux only. / 墨石仅支持Windows和Linux。');
  const active = vscode.window.activeTextEditor?.document;
  let uri = requestedURI || active?.uri;
  if (!uri) throw new Error('Open a Markdown document first. / 请先打开Markdown文档。');
  const document = vscode.workspace.textDocuments.find(item => sameURI(item.uri, uri));
  if (uri.scheme !== 'file' && uri.scheme !== 'untitled') throw new Error('Only local files can be opened in Inkstone; remote/virtual documents are not copied automatically. / 仅支持本地文件。');
  if (!(supported.test(uri.fsPath || '') || document?.languageId === 'markdown')) throw new Error('Select a Markdown document. / 请选择Markdown文档。');
  if (uri.scheme === 'untitled') {
    // workspace.save returns the resulting URI, unlike TextDocument.save's boolean.
    // This system Save As operation happens only after the explicit Open command.
    if (typeof vscode.workspace.save !== 'function') throw new Error('Save this untitled document first, then open it in Inkstone. / 请先保存未命名文档。');
    uri = await vscode.workspace.save(uri);
    if (!uri) return {cancelled:true};
  } else if (document?.isDirty) {
    if (!await document.save()) return {cancelled:true};
    if (document.isDirty) throw new Error('The document changed while saving. Run Open in Inkstone again to include the newest edits. / 保存期间又有修改，请重新执行打开。');
  }
  if (uri.scheme !== 'file') throw new Error('The saved document must be a local file. / 保存目标必须是本地文件。');
  const settings = vscode.workspace.getConfiguration('inkstone');
  // Read global/default values explicitly: an opened repository must not choose a program.
  const userValue = key => { const inspected = settings.inspect(key); return inspected?.globalValue ?? inspected?.defaultValue; };
  const configuration = {executablePath:userValue('executablePath'), args:userValue('args')};
  const result = await (dependencies.launch || launch)(uri.fsPath, configuration);
  return {cancelled:false, ...result};
}
module.exports = {openFile};
