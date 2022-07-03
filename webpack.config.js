const path = require("path");
const fs = require("fs");

void (function fixWebdavBrowserField() {
  const f = require.resolve("webdav/package.json");
  const data = require(f);
  if (!!data["browser"]) {
    return;
  }
  data["browser"] = "./web/index.js";
  fs.writeFileSync(f, JSON.stringify(data, null, 2));
})();

/** @typedef {import('webpack').Configuration} WebpackConfig **/
/** @type WebpackConfig */
const webExtensionConfig = {
  mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: "webworker", // extensions run in a webworker context
  entry: {
    extension: "./lib/extension.js", // source of the web extension main file
  },
  output: {
    filename: "web-bundle.js",
    path: path.join(__dirname, "./dist"),
    libraryTarget: "commonjs",
    devtoolModuleFilenameTemplate: "../../[resource-path]",
  },
  resolve: {
    mainFields: ["browser", "module", "main"], // look for `browser` entry point in imported node modules
    extensions: [".js"], // support ts-files and js-files
    alias: {
      // provides alternate implementation for node module and source files
    },
    fallback: {},
  },
  plugins: [],
  externals: {
    vscode: "commonjs vscode", // ignored because it doesn't exist
  },
  performance: {
    hints: false,
  },
  devtool: "nosources-source-map", // create a source map that points to the original source file
};
module.exports = [webExtensionConfig];
