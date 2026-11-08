'use strict';
const vscode = require('vscode');
const {openFile} = require('./command.cjs');

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('inkstone.openFile', async uri => {
    try { return await openFile(vscode, uri); }
    catch (error) {
      const selected = await vscode.window.showErrorMessage(`Inkstone: ${error.message || error}`, 'Settings / 设置');
      if (selected) await vscode.commands.executeCommand('workbench.action.openSettings', 'inkstone.executablePath');
      return {error:true};
    }
  }));
}
function deactivate() {}
module.exports = {activate, deactivate};
