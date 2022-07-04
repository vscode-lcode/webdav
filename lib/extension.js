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
    vscode.commands.registerCommand("lcode.webdav.open", async () => {
      let link = await vscode.window.showInputBox({
        placeHolder:
          "webdav://[user:password@]host[:port][/path/to/file/or/folder]?ssl=0",
        prompt: "lcode webdav open",
      });
      if (!link) {
        return;
      }
      link = link.trim();
      if (link === "") {
        return;
      }
      let uri = vscode.Uri.parse(link);
      await vscode.commands.executeCommand("vscode.openFolder", uri);
    })
  );
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
