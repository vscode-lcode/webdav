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

  context.subscriptions.push(
    // for debug
    vscode.commands.registerCommand("lcode.webdav.open", async () => {
      try {
        const uri = await vscode.window.showInputBox({
          placeHolder:
            "webdav://[user:password@]host[:port][/path/to/file/or/folder]?ssl=0",
          prompt: "Open Webdav URI",
        });
        if (uri.trim() === "") {
          return;
        }
        let name = await vscode.window.showInputBox({
          placeHolder: "Press ENTER to use default ...",
          prompt: "Custom Name For Remote Workspace",
        });
        name = name.trim();
        if (name == "") {
          name = undefined;
        }
        const URI = vscode.Uri.parse(uri);
        vscode.workspace.updateWorkspaceFolders(0, 0, { uri: URI, name: name });
      } catch (err) {
        showError(err);
      }
    })
  );
}

// this method is called when your extension is deactivated
function deactivate() {}

/**
 * Shows an error popup.
 *
 * @param {any} err The error to show.
 */
async function showError(err) {
  if (err) {
    return await vscode.window.showErrorMessage(`ERROR: ${err}`);
  }
}

module.exports = {
  activate,
  deactivate,
};
