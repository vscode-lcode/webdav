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
    const stat = await client
      .stat(uri.path)
      .then(notD)
      .catch(NotFoundError(uri));
    return toVscodeFileStat(stat);
  }

  /**
   * @param {vscode.Uri} uri
   * @returns {Promise<[string, vscode.FileType][]>}
   */
  async readDirectory(uri) {
    const client = this.getClient(uri);

    const contents = await client
      .getDirectoryContents(uri.path)
      .then(notD)
      .catch(NotFoundError(uri));

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
      .then((r) => /**@type {webdav.BufferLike} */ (r))
      .catch(NotFoundError(uri));
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
    const exists = await client.exists(f);
    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (exists && options.create && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }
    if (exists) {
      const stat = await client.stat(f).then(notD);
      if (stat.type === "directory") {
        throw vscode.FileSystemError.FileIsADirectory(uri);
      }
    }
    await client.putFileContents(f, content, {
      overwrite: options.overwrite,
    });
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
   * @param {vscode.Uri} oldUri
   * @param {vscode.Uri} newUri
   * @param {{ overwrite: boolean }} options
   */
  async copy(oldUri, newUri, options) {
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
    await client.copyFile(oldFilepath, newFilepath);
  }

  /**
   * @param {vscode.Uri} uri
   */
  async delete(uri) {
    const client = this.getClient(uri);
    await client.deleteFile(uri.path).catch(NotFoundError(uri));
  }

  /**
   *
   * @param {vscode.Uri} uri
   */
  async createDirectory(uri) {
    const client = this.getClient(uri);
    if (await client.exists(uri.path)) {
      throw vscode.FileSystemError.FileExists(uri);
    }
    await client.createDirectory(uri.path);
  }

  /**
   * format:
   *
   * webdav://[user:password@]host[:port][/path/to/file/or/folder]
   * @private
   * @param {vscode.Uri} uri
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
    if (u.searchParams.has("authtype")) {
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
          throw new Error(
            `Authentication type '${AuthType}' is not supported!`
          );
      }
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
 * @type {(uri:vscode.Uri)=>(err:{status:number})=>never}
 */
const NotFoundError = (uri) => (err) => {
  if (err.status === 404) {
    throw vscode.FileSystemError.FileNotFound(uri);
  }
  throw err;
};

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
