const vscode = require("vscode");
const webdav = require("webdav");

/**
 * @implements {vscode.FileSystemProvider}
 */
class WebdavFS {
  constructor() {
    /**
     * @private
     * @type {{[k:string]:webdav.WebDAVClient}}
     */
    this.clients = {};

    /**
     * @private
     * @type {vscode.EventEmitter<vscode.FileChangeEvent[]>}
     */
    this._emitter = new vscode.EventEmitter();
    /**
     * @readonly
     * @type {vscode.Event<vscode.FileChangeEvent[]>}
     */
    this.onDidChangeFile = this._emitter.event;
  }

  /**
   * @param {vscode.Uri} _resource
   * @returns {vscode.Disposable}
   */
  // eslint-disable-next-line no-unused-vars
  watch(_resource) {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => {});
  }

  /**
   * @param {vscode.Uri} uri
   * @return {Promise<vscode.FileStat>}
   */
  async stat(uri) {
    const client = this.getClient(uri);
    const stat = await client.stat(uri.path).then(notD);
    return toVscodeFileStat(stat);
  }

  /**
   * @param {vscode.Uri} uri
   * @returns {Promise<[string, vscode.FileType][]>}
   */
  async readDirectory(uri) {
    const client = this.getClient(uri);

    const contents = await client.getDirectoryContents(uri.path).then(notD);

    return contents.map((f) => {
      return /**@type {[string,vscode.FileType]} */ ([
        f.basename,
        toVscodeFileType(f.type),
      ]);
    });
  }

  /**
   *
   * @param {vscode.Uri} uri
   * @returns {Promise<Uint8Array>}
   */
  async readFile(uri) {
    const client = this.getClient(uri);
    const buf = await client
      .getFileContents(uri.path, { format: "binary" })
      .then((r) => /**@type {webdav.BufferLike} */ (r));
    return new Uint8Array(buf);
  }

  /**
   *
   * @param {vscode.Uri} uri
   * @param {Uint8Array} content
   * @param {{ create: boolean, overwrite: boolean }} options
   */
  async writeFile(uri, content, options) {
    const client = await this.getClient(uri);
    let f = uri.path;
    if (options.create) {
      const fileExists = await client.exists(f);
      if (fileExists) {
        throw vscode.FileSystemError.FileExists(uri);
      }
    }
    let lock = await client.lock(f);
    try {
      await client.putFileContents(f, content, {
        overwrite: options.overwrite,
      });
    } finally {
      await client.unlock(f, lock.token);
    }
  }

  /**
   * @param {vscode.Uri} oldUri
   * @param {vscode.Uri} newUri
   * @param {{ overwrite: boolean }} options
   */
  async rename(oldUri, newUri, options) {
    const client = this.getClient(oldUri);
    if (client !== this.getClient(newUri)) {
      throw vscode.FileSystemError.NoPermissions;
    }
    let oldFilepath = oldUri.path;
    let newFilepath = newUri.path;
    if (options.overwrite == false) {
      const newFilepathExists = await client.exists(newFilepath);
      if (newFilepathExists) {
        throw vscode.FileSystemError.FileExists(newUri);
      }
    }
    await client.moveFile(oldFilepath, newFilepath);
  }

  /**
   * @param {vscode.Uri} uri
   */
  async delete(uri) {
    const client = this.getClient(uri);
    await client.deleteFile(uri.path);
  }

  /**
   *
   * @param {vscode.Uri} uri
   */
  async createDirectory(uri) {
    const client = this.getClient(uri);
    await client.createDirectory(uri.path, { recursive: true });
  }

  /**
   * format:
   *
   * webdav://[user:password@]host[:port][/path/to/file/or/folder]
   * @private
   * @param {vscode.Uri} uri -
   */
  getClient(uri) {
    const u = new URL("http:" + uri.toString().slice("webdav:".length));

    // ssl
    if (u.searchParams.has("ssl")) {
      switch (u.searchParams.get("ssl")) {
        case "":
        case "1":
          u.protocol = "https:";
          break;
        case "0":
          u.protocol = "http:";
          break;
      }
    }

    const key = getOriginWithAuth(u.toString());
    if (this.clients[key]) {
      return this.clients[key];
    }

    /**@type {webdav.WebDAVClientOptions} */
    const opt = {};

    // auth
    const AuthType = u.searchParams.get("authtype");
    switch (AuthType) {
      case "":
      case "b":
      case "basic":
        opt.authType = webdav.AuthType.Password;
        if (u.username !== "") {
          opt.username = u.username;
          opt.password = u.username;
        }
        break;
      case "d":
      case "digest":
        opt.authType = webdav.AuthType.Password;
        if (u.username !== "") {
          opt.username = u.username;
          opt.password = u.username;
        }
        break;
      default:
        throw new Error(`Authentication type '${AuthType}' is not supported!`);
    }

    let client = webdav.createClient(u.origin, opt);
    this.clients[key] = client;
    return client;
  }
}

/**
 *
 * @param {string} uri
 * @returns {string}
 */
function getOriginWithAuth(uri) {
  const u = new URL(uri);
  u.search = "";
  u.pathname = "";
  return u.toString();
}

/**
 * @param {webdav.FileStat['type']} ftype
 * @returns {vscode.FileType}
 */
function toVscodeFileType(ftype) {
  return ftype === "file" ? vscode.FileType.File : vscode.FileType.Directory;
}

/**
 * @param {webdav.FileStat} stat
 * @returns {vscode.FileStat}
 */
function toVscodeFileStat(stat) {
  const mtime = new Date(stat.lastmod).getTime();
  /**@type {vscode.FileStat} */
  const vstat = {
    type: toVscodeFileType(stat.type),
    mtime: mtime,
    ctime: mtime,
    size: stat.size,
  };
  return vstat;
}

/**
 * @template T
 * @param {T | webdav.ResponseDataDetailed<T>} r
 * @returns {T}
 */
function notD(r) {
  // @ts-ignore
  return r;
}

module.exports = {
  WebdavFS,
};
