const vscode = require("vscode");
const { WebdavFS } = require("./webdav");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const webdavFs = new WebdavFS();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("webdav", webdavFs, {
      isCaseSensitive: true,
    })
  );
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
