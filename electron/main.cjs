"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
  clipboard,
  ClipboardItem,
  nativeTheme,
  protocol,
  net,
  session,
  safeStorage,
} = require("electron");
const { AIService } = require("./ai-service.cjs");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { pathToFileURL, fileURLToPath } = require("node:url");
const { execFile } = require("node:child_process");
const { Worker } = require("node:worker_threads");
const { FileStore, atomicWrite, hash, exists } = require("./storage.cjs");
const { filterPaths, patterns } = require("./glob.cjs");
const { rebaseLocalLinks } = require("./links.cjs");
const { embedExportDiagrams } = require("./export-diagrams.cjs");
const { removeRetiredSettings } = require("./settings-migration.cjs");
const { CloseCoordinator } = require("./close-coordinator.cjs");
const { initialLanguage, resolveSystemLanguage } = require("./language.cjs");
const { createDefaultApps } = require("./default-apps.cjs");
const {
  restrictDictionarySource,
  installDictionaryCache,
  configureOfflineSpellcheck,
} = require("./offline-spellcheck.cjs");
app.on("session-created", restrictDictionarySource);
const {
  ImageResourceManager,
  referencePath,
  atomicCreate,
} = require("./image-resources.cjs");

if (!["win32", "linux"].includes(process.platform)) {
  console.error("Inkstone supports Windows and Linux only.");
  app.exit(1);
}

if (process.env.INKSTONE_USER_DATA)
  app.setPath("userData", path.resolve(process.env.INKSTONE_USER_DATA));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "inkstone-dictionary",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: "inkstone-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
const defaults = {
  theme: "system",
  locale: "en",
  firstRunComplete: false,
  defaultAppPrompted: false,
  fontFamily:
    '"Segoe UI", "Noto Sans", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
  fontSize: 17,
  lineHeight: 1.75,
  contentWidth: 780,
  sidebarWidth: 256,
  aiPanelOpen: false,
  aiPanelHeight: 260,
  lineNumbers: false,
  strictMarkdown: true,
  cjkEmphasis: false,
  codeWrap: true,
  defaultCodeLanguage: "javascript",
  themeLibrary: {},
  activeThemeName: "",
  outlineNumbering: false,
  sortDescending: false,
  foldersFirst: true,
  exportSoftBreaks: false,
  autoPair: true,
  smartPunctuation: false,
  spellcheck: true,
  focusMode: false,
  typewriterMode: false,
  tabSize: 2,
  customCSS: "",
  pandocPath: "",
  includeGlobs: "",
  excludeGlobs: "",
  autoSave: true,
  autoSaveDelay: 1500,
  recentFiles: [],
  pinnedFolders: [],
  shortcuts: {},
  snippets: { date: "{{date}}", note: "> [!NOTE]\n> " },
  exportProfiles: [],
  imageFolder: "assets",
  sequenceTheme: "simple",
  recordRecent: true,
  wheelZoom: true,
  showHidden: false,
  showAllFiles: false,
  fileSort: "name",
  pins: [],
  exportOptions: {
    pageSize: "A4",
    landscape: false,
    margins: 18,
    header: "",
    footer: "",
    bookmarks: true,
  },
};
const states = new Map();
const roots = new Set();
const watchers = new Map();
const folderWatchers = new Map();
let resourceManager, offlineSpellcheck;
let settingsPersistenceBlocked = false;
let languageConfigured = false;
let defaultAppPromptClaimed = false;
const defaultApps = createDefaultApps({ app, shell });
let quitApproved = false;
const activeSearches = new Map();
let store,
  settings = { ...defaults },
  savedSession = {};
const pendingPaths = [];
const startupWarnings = [];
const localize = (en, zh) => (settings.locale === "zh-CN" ? zh : en);
const markdownFilters = () => [
  {
    name: localize("Markdown / Text", "Markdown / 文本"),
    extensions: ["md", "markdown", "mdown", "mkd", "txt"],
  },
  { name: localize("All files", "所有文件"), extensions: ["*"] },
];
const mimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".css": "text/css",
  ".vtt": "text/vtt",
};
const isWithin = (file, root) => {
  const rel = path.relative(root, file);
  return (
    rel === "" ||
    (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
  );
};
async function grant(target, directory = false) {
  const resolved = await fs.realpath(target);
  roots.add(directory ? resolved : path.dirname(resolved));
  return resolved;
}
async function authorized(file) {
  if (typeof file !== "string" || !file || file.includes("\0"))
    throw new Error("INVALID_PATH: A valid local path is required.");
  file = path.resolve(file);
  let real = file,
    probe = file,
    tail = [];
  while (true) {
    try {
      real = path.join(await fs.realpath(probe), ...tail.reverse());
      break;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      const parent = path.dirname(probe);
      if (parent === probe) throw e;
      tail.push(path.basename(probe));
      probe = parent;
    }
  }
  if (![...roots].some((root) => isWithin(real, root)))
    throw new Error(
      "ACCESS: Choose this file or its containing folder in Inkstone before accessing it.",
    );
  return real;
}
const windowFor = (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !states.has(win.id))
    throw new Error("ACCESS: Unrecognized window.");
  return win;
};
const send = (win, event, payload) => {
  if (!win.isDestroyed()) win.webContents.send(`inkstone:${event}`, payload);
};
function broadcast(event, payload) {
  for (const win of BrowserWindow.getAllWindows())
    if (states.has(win.id)) send(win, event, payload);
}
const closeCoordinator = new CloseCoordinator({
  isOpen: (id) => states.has(id) && !!BrowserWindow.fromId(id),
  send: (id, event, payload) => {
    const win = BrowserWindow.fromId(id);
    if (win) {
      send(win, event, payload);
      if (states.get(id)?.unresponsive && event !== "close-aborted")
        setImmediate(() => closeCoordinator.unresponsive(id));
    }
  },
  onUnready: async (id) => {
    const win = BrowserWindow.fromId(id);
    if (!win || win.isDestroyed()) return "cancel";
    const choice = await dialog.showMessageBox(win, {
      type: "warning",
      title: localize("Editor is not responding", "编辑器未响应"),
      message: localize(
        "The editor could not start or respond to the close request.",
        "编辑器无法完成启动或响应关闭请求。",
      ),
      detail: localize(
        "You can keep waiting or cancel closing. Closing without saving may lose unsaved edits. Recovery drafts already written to disk will be kept.",
        "您可以继续等待或取消关闭。未保存即关闭可能丢失编辑内容；已写入磁盘的恢复草稿将保留。",
      ),
      buttons: [
        localize("Wait", "继续等待"),
        localize("Close without saving", "不保存并关闭"),
        localize("Cancel", "取消"),
      ],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return ["retry", "close", "cancel"][choice.response] || "cancel";
  },
  close: (ids, reason, forcedIds = []) => {
    if (reason === "quit") quitApproved = true;
    for (const id of ids) {
      const win = BrowserWindow.fromId(id);
      if (win && states.has(id)) {
        states.get(id).confirmed = true;
        if (forcedIds.includes(id)) win.destroy();
        else win.close();
      }
    }
    if (reason === "quit") app.quit();
  },
});
const boundedString = (value, max = 1024) =>
  typeof value === "string" && value.length <= max;
function nativeAccelerator(binding) {
  if (typeof binding !== "string" || !binding.trim() || binding.length > 128)
    return null;
  const raw = binding.trim(),
    parts = raw.endsWith("--")
      ? [...raw.slice(0, -2).split("-").filter(Boolean), "-"]
      : raw.split("-");
  const key = parts.pop();
  if (!key || parts.some((part) => !part)) return null;
  const modifiers = {
    mod: "Ctrl",
    ctrl: "Ctrl",
    alt: "Alt",
    shift: "Shift",
    meta: "Super",
  };
  const converted = parts.map((part) =>
    Object.hasOwn(modifiers, part.toLowerCase())
      ? modifiers[part.toLowerCase()]
      : null,
  );
  if (
    converted.some((part) => !part) ||
    new Set(converted).size !== converted.length
  )
    return null;
  const named = {
    arrowup: "Up",
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
    enter: "Enter",
    return: "Enter",
    escape: "Escape",
    esc: "Escape",
    tab: "Tab",
    space: "Space",
    backspace: "Backspace",
    delete: "Delete",
    insert: "Insert",
    plus: "Plus",
    minus: "-",
  };
  let nativeKey = Object.hasOwn(named, key.toLowerCase())
    ? named[key.toLowerCase()]
    : null;
  if (!nativeKey && /^f(?:[1-9]|1[0-9]|2[0-4])$/i.test(key))
    nativeKey = key.toUpperCase();
  if (
    !nativeKey &&
    key.length === 1 &&
    "abcdefghijklmnopqrstuvwxyz0123456789,./;=[]\\'`+-".includes(
      key.toLowerCase(),
    )
  )
    nativeKey = key === "+" ? "Plus" : key.toUpperCase();
  return nativeKey ? [...converted, nativeKey].join("+") : null;
}
function validateSettings(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw Error("Settings must be a JSON object.");
  patch = removeRetiredSettings(patch).settings;
  const value = { ...removeRetiredSettings(settings).settings };
  const booleans = [
    "aiPanelOpen",
    "lineNumbers",
    "strictMarkdown",
    "cjkEmphasis",
    "codeWrap",
    "outlineNumbering",
    "sortDescending",
    "foldersFirst",
    "exportSoftBreaks",
    "autoPair",
    "smartPunctuation",
    "spellcheck",
    "focusMode",
    "typewriterMode",
    "autoSave",
    "showHidden",
    "showAllFiles",
    "mathNumbering",
    "autoPairMarkdown",
    "smartPunctuationInput",
    "softBreaks",
    "recordRecent",
    "wheelZoom",
    "firstRunComplete",
    "defaultAppPrompted",
  ];
  const strings = [
    "fontFamily",
    "activeThemeName",
    "customCSS",
    "pandocPath",
    "imageFolder",
  ];
  for (const key of booleans)
    if (key in patch) {
      if (typeof patch[key] !== "boolean")
        throw Error(`Invalid setting: ${key}`);
      value[key] = patch[key];
    }
  for (const key of strings)
    if (key in patch) {
      if (!boundedString(patch[key], key === "customCSS" ? 200000 : 4096))
        throw Error(`Invalid setting: ${key}`);
      value[key] = patch[key];
    }
  for (const [key, min, max] of [
    ["sidebarWidth", 180, 500],
    ["aiPanelHeight", 100, 1200],
    ["fontSize", 10, 64],
    ["lineHeight", 1, 3],
    ["contentWidth", 360, 1800],
    ["tabSize", 1, 8],
    ["autoSaveDelay", 300, 60000],
  ])
    if (key in patch) {
      if (!Number.isFinite(patch[key]) || patch[key] < min || patch[key] > max)
        throw Error(`Invalid setting: ${key}`);
      value[key] = patch[key];
    }
  if ("sequenceTheme" in patch) {
    if (!["simple", "hand"].includes(patch.sequenceTheme))
      throw Error("Invalid sequence theme");
    value.sequenceTheme = patch.sequenceTheme;
  }
  if ("theme" in patch) {
    if (!["light", "dark", "system"].includes(patch.theme))
      throw Error("Invalid theme");
    value.theme = patch.theme;
  }
  if ("locale" in patch) {
    if (!["zh-CN", "en"].includes(patch.locale))
      throw Error("Invalid language");
    value.locale = patch.locale;
  }
  for (const key of ["pinnedFolders", "pins", "recentFiles", "exportProfiles"])
    if (key in patch) {
      if (!Array.isArray(patch[key]) || patch[key].length > 100)
        throw Error(`Invalid setting: ${key}`);
      if (
        key !== "exportProfiles" &&
        patch[key].some((item) => !boundedString(item, 4096))
      )
        throw Error(`Invalid setting: ${key} must contain paths as strings`);
      value[key] = patch[key];
    }
  for (const key of ["includeGlobs", "excludeGlobs"])
    if (key in patch) {
      if (!(typeof patch[key] === "string" || Array.isArray(patch[key])))
        throw Error(`Invalid ${key}`);
      value[key] = patterns(patch[key]);
    }
  if ("defaultCodeLanguage" in patch) {
    if (
      typeof patch.defaultCodeLanguage !== "string" ||
      patch.defaultCodeLanguage.length > 80 ||
      !/^[\w+-]*$/.test(patch.defaultCodeLanguage)
    )
      throw Error("Invalid default code language");
    value.defaultCodeLanguage = patch.defaultCodeLanguage;
  }
  if ("themeLibrary" in patch) {
    const library = patch.themeLibrary;
    if (
      !library ||
      typeof library !== "object" ||
      Array.isArray(library) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(library)) ||
      Object.keys(library).length > 30 ||
      Object.entries(library).some(
        ([name, css]) =>
          !name ||
          name.length > 200 ||
          ["__proto__", "constructor", "prototype"].includes(name) ||
          !boundedString(css, 1024 * 1024),
      )
    )
      throw Error("Invalid theme library");
    value.themeLibrary = Object.fromEntries(Object.entries(library));
  }
  if ("fileSort" in patch) {
    if (!["name", "modified", "created", "size"].includes(patch.fileSort))
      throw Error("Invalid file sort");
    value.fileSort = patch.fileSort;
  }
  if ("exportOptions" in patch) {
    if (
      !patch.exportOptions ||
      typeof patch.exportOptions !== "object" ||
      Array.isArray(patch.exportOptions)
    )
      throw Error("Invalid export options");
    value.exportOptions = patch.exportOptions;
  }
  if ("snippets" in patch) {
    if (
      !patch.snippets ||
      typeof patch.snippets !== "object" ||
      Array.isArray(patch.snippets) ||
      Object.values(patch.snippets).some((v) => typeof v !== "string")
    )
      throw Error("Invalid text snippets");
    value.snippets = patch.snippets;
  }
  if ("shortcuts" in patch) {
    if (
      !patch.shortcuts ||
      typeof patch.shortcuts !== "object" ||
      Array.isArray(patch.shortcuts)
    )
      throw Error("Invalid shortcuts");
    for (const [command, binding] of Object.entries(patch.shortcuts))
      if (!nativeAccelerator(binding))
        throw Error(
          `Invalid shortcut for ${command}: use Mod/Ctrl/Meta/Alt/Shift modifiers and a supported key.`,
        );
    value.shortcuts = patch.shortcuts;
  }
  return value;
}
async function remember(file) {
  if (settings.recordRecent === false) return;
  settings.recentFiles = [
    file,
    ...settings.recentFiles.filter((item) => item !== file),
  ].slice(0, 30);
  if (!settingsPersistenceBlocked) await store.writeJson("settings", settings);
  app.addRecentDocument(file);
}
function pruneWatchers() {
  const activeFiles = new Set(
    [...states.values()].map((state) => state.path).filter(Boolean),
  );
  for (const [file, watcher] of watchers)
    if (!activeFiles.has(file)) {
      watcher.close();
      watchers.delete(file);
    }
  const activeFolders = new Set(
    [...states.values()].map((state) => state.folder).filter(Boolean),
  );
  for (const [root, group] of folderWatchers)
    if (!activeFolders.has(root)) {
      clearTimeout(group.timer);
      for (const [dir, listener] of group.directories)
        fsSync.unwatchFile(dir, listener);
      folderWatchers.delete(root);
    }
}
function watchFolders(root, directories) {
  let group = folderWatchers.get(root);
  if (!group) {
    group = { directories: new Map(), timer: null };
    folderWatchers.set(root, group);
  }
  const wanted = new Set([root, ...directories].slice(0, 128));
  for (const [dir, listener] of group.directories)
    if (!wanted.has(dir)) {
      fsSync.unwatchFile(dir, listener);
      group.directories.delete(dir);
    }
  for (const dir of wanted) {
    if (group.directories.has(dir)) continue;
    const listener = (current, previous) => {
      if (
        current.mtimeMs === previous.mtimeMs &&
        current.ino === previous.ino &&
        current.nlink === previous.nlink
      )
        return;
      clearTimeout(group.timer);
      group.timer = setTimeout(() => {
        for (const win of BrowserWindow.getAllWindows())
          if (states.get(win.id)?.folder === root)
            send(win, "folder-change", { path: root, external: true });
      }, 120);
    };
    fsSync.watchFile(dir, { interval: 2500, persistent: false }, listener);
    group.directories.set(dir, listener);
  }
  pruneWatchers();
}
function watch(file) {
  if (watchers.has(file)) return;
  let lastRevision = store.documents.get(file)?.revision;
  let checking = false,
    pending = false;
  const check = async () => {
    if (checking) {
      pending = true;
      return;
    }
    checking = true;
    try {
      const revision = await store.revision(file);
      if (revision !== lastRevision) {
        lastRevision = revision;
        broadcast("external-change", {
          path: file,
          revision,
          deleted: revision === null,
        });
      }
    } catch (error) {
      broadcast("external-change", {
        path: file,
        revision: null,
        deleted: false,
        error: error.message,
      });
    } finally {
      checking = false;
      if (pending) {
        pending = false;
        void check();
      }
    }
  };
  // Stat polling does not depend on the host's per-user inotify quota and detects
  // atomic replacements and deletions. Hash only after metadata changes.
  fsSync.watchFile(file, { interval: 600, persistent: false }, check);
  watchers.set(file, {
    close() {
      fsSync.unwatchFile(file, check);
    },
  });
}

async function open(file, win, encoding) {
  if (!file && encoding && states.get(win.id).pendingOpenPath)
    file = states.get(win.id).pendingOpenPath;
  if (!file) {
    const choice = await dialog.showOpenDialog(win, {
      title: localize("Open Markdown", "打开文稿"),
      buttonLabel: localize("Open", "打开"),
      properties: ["openFile"],
      filters: markdownFilters(),
    });
    if (choice.canceled) return null;
    file = await grant(choice.filePaths[0]);
  } else file = await authorized(file);
  states.get(win.id).pendingOpenPath = file;
  const document = await store.read(file, {
    encoding: encoding || store.documents.get(file)?.encoding || "utf8",
  });
  states.get(win.id).pendingOpenPath = null;
  states.get(win.id).path = file;
  watch(file);
  pruneWatchers();
  await remember(file);
  return document;
}
async function listFiles(payload, win) {
  const root = await authorized(
    payload.path || savedSession.folder || [...roots][0],
  );
  if (win) states.get(win.id).folder = root;
  const output = [],
    directories = [];
  const accept = filterPaths(
    payload.includeGlobs ?? settings.includeGlobs,
    payload.excludeGlobs ?? settings.excludeGlobs,
  );
  let count = 0;
  async function visit(dir, depth) {
    if (depth > 30) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (
        (!payload.showHidden && entry.name.startsWith(".")) ||
        ["node_modules", "dist", "release"].includes(entry.name) ||
        entry.isSymbolicLink()
      )
        continue;
      const file = path.join(dir, entry.name);
      if (!accept(path.relative(root, file), entry.isDirectory())) continue;
      if (
        !payload.showAllFiles &&
        !entry.isDirectory() &&
        !/\.(md|markdown|mdown|mkd|txt)$/i.test(entry.name)
      )
        continue;
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) continue;
      if (
        !payload.filter ||
        entry.isDirectory() ||
        entry.name.toLowerCase().includes(String(payload.filter).toLowerCase())
      )
        output.push({
          path: file,
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stat.size,
          mtime: stat.mtimeMs,
          birthtime: stat.birthtimeMs,
          depth,
        });
      if (++count > 10000) return;
      if (entry.isDirectory() && directories.length < 127)
        directories.push(file);
      if (payload.recursive && entry.isDirectory())
        await visit(file, depth + 1);
    }
  }
  await visit(root, 0);
  if (win) watchFolders(root, directories);
  const sort = payload.sort || settings.fileSort || "name";
  const descending = payload.descending ?? settings.sortDescending ?? false;
  const foldersFirst = payload.foldersFirst ?? settings.foldersFirst ?? true;
  const collator = new Intl.Collator(
    settings.locale === "zh-CN" ? "zh-CN" : "en",
    { numeric: true },
  );
  output.sort((a, b) => {
    const grouping = foldersFirst
      ? Number(b.isDirectory) - Number(a.isDirectory)
      : 0;
    const compared =
      sort === "modified"
        ? a.mtime - b.mtime
        : sort === "created"
          ? a.birthtime - b.birthtime
          : sort === "size"
            ? a.size - b.size
            : collator.compare(a.name, b.name);
    return (
      grouping ||
      (descending ? -1 : 1) * (compared || collator.compare(a.name, b.name))
    );
  });
  return output;
}
function run(command, args, options = {}) {
  if (!boundedString(command, 4096) || !command.trim())
    return Promise.reject(
      Error("DEPENDENCY: Configure an executable path first."),
    );
  if (!Array.isArray(args) || args.some((arg) => !boundedString(arg, 32768)))
    return Promise.reject(
      Error("INVALID: Command arguments must be an array of strings."),
    );
  return new Promise((resolve, reject) =>
    execFile(
      command,
      args,
      {
        timeout: options.timeout || 60000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        shell: false,
        cwd: options.cwd || undefined,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error)
          reject(
            Error(
              `DEPENDENCY: ${path.basename(command)} failed (${error.code || error.signal || "unknown"}). ${stderr || error.message}`,
            ),
          );
        else resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    ),
  );
}
async function downloadImage(payload, win) {
  if (!payload.documentPath) throw Error("IMAGES: Save the document first.");
  await authorized(payload.documentPath);
  let url;
  try {
    url = new URL(payload.url);
  } catch {
    throw Error("DOWNLOAD: Invalid image URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error(
      "DOWNLOAD: Only HTTP(S) image URLs without credentials are accepted.",
    );
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`DOWNLOAD: HTTP ${response.status}.`);
  const mime = (response.headers.get("content-type") || "")
    .split(";")[0]
    .toLowerCase();
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  }[mime];
  if (!extension) {
    await response.body?.cancel();
    throw Error(`DOWNLOAD: Unsupported content type ${mime || "(missing)"}.`);
  }
  const limit = 25 * 1024 * 1024;
  if (Number(response.headers.get("content-length") || 0) > limit) {
    await response.body?.cancel();
    throw Error("DOWNLOAD: Image exceeds 25 MB.");
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw Error("DOWNLOAD: Image exceeds 25 MB.");
    chunks.push(Buffer.from(chunk));
  }
  const filename = path
    .basename(decodeURIComponent(new URL(response.url).pathname))
    .replace(/[^\p{L}\p{N}_.-]/gu, "-");
  const stem =
    path.basename(filename, path.extname(filename)) || `download-${Date.now()}`;
  return images(
    {
      documentPath: payload.documentPath,
      imageFolder: payload.imageFolder,
      imageRoot: payload.imageRoot,
      images: [
        {
          name: `${stem}.${extension}`,
          dataUrl: `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`,
        },
      ],
    },
    win,
  );
}
async function detectTools() {
  const command = settings.pandocPath || "pandoc";
  try {
    const output = await run(command, ["--version"], { timeout: 6000 });
    const input = await run(command, ["--list-input-formats"], {
      timeout: 6000,
    });
    const formats = await run(command, ["--list-output-formats"], {
      timeout: 6000,
    });
    return {
      pandoc: {
        available: true,
        path: command,
        version: output.stdout.split("\n")[0],
        inputFormats: input.stdout.trim().split(/\r?\n/),
        outputFormats: formats.stdout.trim().split(/\r?\n/),
      },
    };
  } catch (error) {
    return {
      pandoc: { available: false, path: command, error: error.message },
    };
  }
}
const importFormats = {
  ltx: "latex",
  rest: "rst",
  rtf: "rtf",
  pptx: "pptx",
  adoc: "asciidoc",
  asciidoc: "asciidoc",
  dokuwiki: "dokuwiki",
  t2t: "t2t",
  fb2: "fb2",
  docbook: "docbook",
  json: "json",
  docx: "docx",
  odt: "odt",
  epub: "epub",
  tex: "latex",
  latex: "latex",
  rst: "rst",
  html: "html",
  htm: "html",
  wiki: "mediawiki",
  org: "org",
  textile: "textile",
  opml: "opml",
};
const exportFormats = {
  "pandoc-pdf": "latex",
  markdown: "markdown",
  gfm: "gfm",
  commonmark: "commonmark",
  markdown_strict: "markdown_strict",
  markdown_mmd: "markdown_mmd",
  ltx: "latex",
  rest: "rst",
  dokuwiki: "dokuwiki",
  text: "plain",
  txt: "plain",
  plain: "plain",
  s5: "s5",
  slidy: "slidy",
  slideous: "slideous",
  dzslides: "dzslides",
  docbook: "docbook",
  fb2: "fb2",
  texinfo: "texinfo",
  man: "man",
  t2t: "t2t",
  docx: "docx",
  odt: "odt",
  rtf: "rtf",
  epub: "epub",
  tex: "latex",
  latex: "latex",
  rst: "rst",
  wiki: "mediawiki",
  mediawiki: "mediawiki",
  org: "org",
  textile: "textile",
  opml: "opml",
  pptx: "pptx",
  revealjs: "revealjs",
  beamer: "beamer",
  asciidoc: "asciidoc",
  json: "json",
};
async function writeExport(file, bytes, revision) {
  await atomicWrite(file, bytes, {
    beforeRename: async () => {
      if ((await store.revision(file)) !== revision)
        throw Error(
          "CONFLICT: Export destination changed while rendering. The existing file was not overwritten; choose a new destination.",
        );
    },
  });
}
async function runPandoc(payload, win) {
  const command = settings.pandocPath || "pandoc";
  if (payload.direction === "format") {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-format-"));
    try {
      const input = path.join(temp, "input.md");
      await fs.writeFile(input, payload.text || "", "utf8");
      const result = await run(command, [
        "--from",
        "markdown",
        "--to",
        "markdown",
        "--wrap=none",
        input,
      ]);
      return { text: result.stdout, warnings: result.stderr };
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  if (payload.direction === "import") {
    let source = payload.path;
    if (!source) {
      const result = await dialog.showOpenDialog(win, {
        title: localize("Import with Pandoc", "使用 Pandoc 导入"),
        buttonLabel: localize("Import", "导入"),
        properties: ["openFile"],
        filters: [
          {
            name: localize("Pandoc documents", "Pandoc 文档"),
            extensions: Object.keys(importFormats),
          },
        ],
      });
      if (result.canceled) return null;
      source = await grant(result.filePaths[0]);
    } else source = await authorized(source);
    const format =
      importFormats[payload.format] ||
      payload.format ||
      importFormats[path.extname(source).slice(1).toLowerCase()];
    if (!Object.values(importFormats).includes(format))
      throw Error(
        "FORMAT: This import format is unsupported. Choose a supported document format; PDF import is not provided.",
      );
    const temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), "inkstone-import-"),
    );
    try {
      const mediaDir = path.join(temporary, "media");
      const output = await run(
        command,
        [
          "--from",
          format,
          "--to",
          "gfm+tex_math_dollars",
          "--wrap=none",
          "--extract-media",
          mediaDir,
          source,
        ],
        { cwd: path.dirname(source) },
      );
      let text = output.stdout;
      async function embed(dir) {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) await embed(file);
          else {
            const mime = mimeTypes[path.extname(file).toLowerCase()];
            if (mime && mime.startsWith("image/")) {
              const data = `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
              const forwardPath = file.split(path.sep).join("/");
              const references = new Set([
                file,
                forwardPath,
                encodeURI(file),
                encodeURI(forwardPath),
                pathToFileURL(file).href,
                file.replaceAll("\\", "\\\\"),
              ]);
              // Pandoc versions emit native Windows paths, URI paths, or escaped
              // Markdown paths. Embed every form before deleting extracted media.
              // Longest first prevents matching a path inside its file: URL.
              for (const reference of [...references].sort(
                (a, b) => b.length - a.length,
              ))
                text = text.replaceAll(reference, data);
            }
          }
        }
      }
      if (await exists(mediaDir)) await embed(mediaDir);
      return {
        path: null,
        text,
        revision: null,
        importedFrom: source,
        warnings: output.stderr,
      };
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  const format = exportFormats[payload.format];
  if (!format) throw Error("FORMAT: Unsupported Pandoc export format.");
  let target = payload.path;
  const extension =
    payload.format === "pandoc-pdf"
      ? "pdf"
      : payload.format === "latex"
        ? "tex"
        : ["revealjs", "s5", "slidy", "slideous", "dzslides"].includes(
              payload.format,
            )
          ? "html"
          : [
                "markdown",
                "gfm",
                "commonmark",
                "markdown_strict",
                "markdown_mmd",
              ].includes(payload.format)
            ? "md"
            : payload.format;
  if (!target) {
    const result = await dialog.showSaveDialog(win, {
      title: localize("Export with Pandoc", "使用 Pandoc 导出"),
      buttonLabel: localize("Export", "导出"),
      defaultPath: `${payload.title || "Untitled"}.${extension}`,
      filters: [{ name: payload.format, extensions: [extension] }],
    });
    if (result.canceled) return null;
    target = result.filePath;
    await grant(path.dirname(target), true);
  } else target = await authorized(target);
  const targetRevision = await store.revision(target);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-pandoc-"));
  try {
    const input = path.join(tempDir, "source.md");
    const output = path.join(tempDir, `output${path.extname(target)}`);
    const diagrams = await embedExportDiagrams(
      payload.text || "",
      payload.diagramAssets,
      tempDir,
    );
    await fs.writeFile(input, diagrams.text, "utf8");
    const args = [
      "--from",
      "markdown+tex_math_dollars+yaml_metadata_block+raw_html+footnotes+superscript+subscript+task_lists",
      "--to",
      format,
      "--standalone",
      "--output",
      output,
    ];
    if (payload.documentPath) {
      const doc = await authorized(payload.documentPath);
      args.push("--resource-path", path.dirname(doc));
    }
    if (payload.template)
      args.push("--template", await authorized(payload.template));
    if (payload.referenceDoc)
      args.push("--reference-doc", await authorized(payload.referenceDoc));
    if (payload.toc) args.push("--toc");
    if (payload.numberSections) args.push("--number-sections");
    // Custom options are separate argv values; output/input and filter execution are never overridden.
    if (payload.args?.length) {
      if (
        !Array.isArray(payload.args) ||
        payload.args.some(
          (arg) =>
            !boundedString(arg, 4096) ||
            !/^--(?:metadata=|variable=|pdf-engine=|slide-level=|highlight-style=|columns=|wrap=|mathjax(?:=|$)|katex(?:=|$)|self-contained$|embed-resources$)/.test(
              arg,
            ),
        )
      )
        throw Error(
          "INVALID: Custom Pandoc arguments must be approved formatting options; filters and output overrides are not accepted.",
        );
      args.push(...payload.args);
    }
    args.push(input);
    const result = await run(command, args, {
      timeout: 120000,
      cwd: payload.documentPath ? path.dirname(payload.documentPath) : tempDir,
    });
    await writeExport(target, await fs.readFile(output), targetRevision);
    return {
      path: target,
      format,
      warnings: [
        ...diagrams.warnings,
        ...(result.stderr ? [result.stderr] : []),
      ],
      embeddedDiagrams: diagrams.count,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
function htmlEscape(text) {
  return String(text || "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}
async function assetData(file) {
  file = await authorized(file);
  const mime = mimeTypes[path.extname(file).toLowerCase()];
  if (!mime)
    throw Error(
      "ASSET: Only image, media, font and CSS resources can be loaded.",
    );
  const stat = await fs.stat(file);
  if (stat.size > 100 * 1024 * 1024)
    throw Error("ASSET: Resource exceeds 100 MB.");
  return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
}
async function sanitizeExportHTML(html, { plain = false } = {}) {
  const sandbox = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  sandbox.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    await sandbox.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'\">",
        ),
    );
    const purifier = await fs.readFile(
      path.join(__dirname, "vendor/purify.min.js"),
      "utf8",
    );
    await sandbox.webContents.executeJavaScript(purifier);
    return await sandbox.webContents.executeJavaScript(
      `(()=>{const content=document.createElement('template');content.innerHTML=DOMPurify.sanitize(${JSON.stringify(html)}, {USE_PROFILES:{html:true,svg:true,svgFilters:true,mathMl:true},ADD_TAGS:['foreignObject','foreignobject'],HTML_INTEGRATION_POINTS:{foreignobject:true,'annotation-xml':true},ADD_ATTR:['xmlns','xmlns:xlink'],ADD_DATA_URI_TAGS:['audio','video','source'],FORBID_TAGS:['script','iframe','object','embed','form','base','meta','link'],ALLOWED_URI_REGEXP:/^(?:(?:https?|mailto|inkstone-asset):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))/i});for(const image of content.content.querySelectorAll('img'))image.setAttribute('loading','eager');if(${JSON.stringify(plain)})for(const formula of content.content.querySelectorAll('.katex')){const math=formula.querySelector('math');if(math)formula.replaceWith(math.cloneNode(true));}return content.innerHTML;})()`,
    );
  } finally {
    sandbox.destroy();
  }
}
async function exportFile(payload, win) {
  const format = payload.format || "pdf";
  if (
    !["html", "html-plain", "pdf", "png", "jpg", "jpeg", "print"].includes(
      format,
    )
  )
    return runPandoc({ ...payload, direction: "export" }, win);
  if (typeof payload.html !== "string")
    throw Error("EXPORT: Rendered document HTML is required.");
  let target = payload.path;
  if (format !== "print") {
    if (!target) {
      const result = await dialog.showSaveDialog(win, {
        title: localize("Export", "导出"),
        buttonLabel: localize("Export", "导出"),
        defaultPath: `${payload.title || localize("Untitled", "未命名")}.${format.startsWith("html") ? "html" : ["jpg", "jpeg"].includes(format) ? "jpg" : format}`,
      });
      if (result.canceled) return null;
      target = result.filePath;
      await grant(path.dirname(target), true);
    } else target = await authorized(target);
  }
  const targetRevision = target ? await store.revision(target) : null;
  const warnings = [];
  let html = await sanitizeExportHTML(payload.html, {
    plain: format === "html-plain",
  });
  // Embed local resources so exported documents remain useful after moving them.
  const references = [
    ...new Set(
      [...html.matchAll(/(?:src|poster)=["']([^"']+)["']/g)].map((m) => m[1]),
    ),
  ];
  for (const ref of references) {
    try {
      let file;
      if (ref.startsWith("inkstone-asset:"))
        file = new URL(ref.replaceAll("&amp;", "&")).searchParams.get("path");
      else if (ref.startsWith("file:")) file = fileURLToPath(ref);
      else if (
        !/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(ref) &&
        payload.documentPath
      )
        file = path.resolve(
          path.dirname(await authorized(payload.documentPath)),
          decodeURIComponent(ref),
        );
      if (file) html = html.replaceAll(ref, await assetData(file));
    } catch (e) {
      warnings.push(`Missing resource ${ref}: ${e.message}`);
    }
  }
  let css = format === "html-plain" ? "" : String(payload.css || "");
  const distDir = path.resolve(__dirname, "../dist");
  // Bundle Vite-generated font/image URLs present in the exported theme CSS.
  const cssRefs = [
    ...new Set(
      [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]),
    ),
  ];
  for (const ref of cssRefs) {
    if (/^(?:data:|https?:)/.test(ref)) continue;
    if (ref.startsWith("inkstone-asset:")) {
      try {
        css = css.replaceAll(
          ref,
          await assetData(new URL(ref).searchParams.get("path")),
        );
      } catch (error) {
        warnings.push(`Missing CSS resource ${ref}: ${error.message}`);
      }
      continue;
    }
    let file = path.resolve(
      distDir,
      ref.replace(/^\.\//, "").replace(/^\//, ""),
    );
    if (!(await exists(file))) {
      const alternate = path.resolve(
        distDir,
        "assets",
        ref.replace(/^\.\//, ""),
      );
      if (isWithin(alternate, distDir)) file = alternate;
    }
    if (isWithin(file, distDir) && (await exists(file))) {
      const mime = mimeTypes[path.extname(file)] || "application/octet-stream";
      css = css.replaceAll(
        ref,
        `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`,
      );
    }
  }
  const baseCSS = `body{margin:0;color:#202322;background:white;font:18px/1.7 ${String(settings.fontFamily).replace(/[<>]/g, "")};}article{max-width:900px;margin:0 auto;padding:40px;}img,svg,video{max-width:100%;}pre{white-space:pre-wrap;}table{border-collapse:collapse;}td,th{border:1px solid #aaa;padding:6px;}@media print{article{max-width:none;padding:0;}h1,h2,h3,h4{break-after:avoid;}pre,blockquote,figure,tr{break-inside:avoid;}.page-break{break-before:page;}}`;
  const style =
    format === "html-plain"
      ? ""
      : `<style>${(baseCSS + css).replace(/<\/style/gi, "<\\/style")}</style>`;
  const document = `<!doctype html><html lang="${settings.locale}"${payload.rtl ? ' dir="rtl"' : ""}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http: inkstone-asset:; style-src 'unsafe-inline'; font-src data: inkstone-asset:; media-src data: https: http: inkstone-asset:; script-src 'none'"><title>${htmlEscape(payload.title || "Inkstone document")}</title>${style}</head><body><article class="markdown-body">${html}</article></body></html>`;

  if (format.startsWith("html")) {
    await writeExport(target, document, targetRevision);
    return { path: target, format, warnings };
  }
  const exportWindow = new BrowserWindow({
    show: false,
    width: Math.max(600, Math.min(2400, payload.width || 1200)),
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  exportWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  exportWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  try {
    await exportWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(document)}`,
    );
    const resourceStatus = await exportWindow.webContents.executeJavaScript(
      `Promise.race([Promise.all([document.fonts.ready,...[...document.images].map(i=>i.complete?Promise.resolve(i.naturalWidth>0):new Promise(r=>{i.onload=()=>r(true);i.onerror=()=>r(false)}))]).then(r=>({ready:true,missing:r.slice(1).filter(x=>!x).length})),new Promise(r=>setTimeout(()=>r({ready:false}),15000))])`,
    );
    if (!resourceStatus.ready)
      throw Error(
        "EXPORT: Images or fonts did not finish loading within 15 seconds.",
      );
    if (resourceStatus.missing)
      warnings.push(`${resourceStatus.missing} image(s) could not be loaded.`);
    if (format === "print") {
      const marginInput =
        typeof payload.margins === "number"
          ? Object.fromEntries(
              ["top", "bottom", "left", "right"].map((key) => [
                key,
                payload.margins / 25.4,
              ]),
            )
          : payload.margins || {};
      const printMargins = {
        marginType: "custom",
        ...Object.fromEntries(
          ["top", "bottom", "left", "right"].map((key) => [
            key,
            Math.round(
              Math.max(0, Math.min(5, Number(marginInput[key]) || 0.5)) * 96,
            ),
          ]),
        ),
      };
      await new Promise((resolve, reject) =>
        exportWindow.webContents.print(
          {
            printBackground: true,
            silent: false,
            pageSize: [
              "A0",
              "A1",
              "A2",
              "A3",
              "A4",
              "A5",
              "A6",
              "Legal",
              "Letter",
              "Tabloid",
            ].includes(payload.pageSize)
              ? payload.pageSize
              : "A4",
            landscape: !!payload.landscape,
            margins: printMargins,
            header: String(payload.header || "").replace(/<[^>]*>/g, ""),
            footer: String(payload.footer || "").replace(/<[^>]*>/g, ""),
          },
          (success, reason) =>
            success ? resolve() : reject(Error(`PRINT: ${reason}`)),
        ),
      );
      return { format, warnings };
    }
    if (format === "pdf") {
      const pageSize = [
        "A0",
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "Legal",
        "Letter",
        "Tabloid",
        "Ledger",
      ].includes(payload.pageSize)
        ? payload.pageSize
        : "A4";
      const margins =
        typeof payload.margins === "number"
          ? Object.fromEntries(
              ["top", "bottom", "left", "right"].map((key) => [
                key,
                payload.margins / 25.4,
              ]),
            )
          : payload.margins || {};
      const marginValues = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
      for (const key of Object.keys(marginValues))
        if (
          Number.isFinite(margins[key]) &&
          margins[key] >= 0 &&
          margins[key] <= 5
        )
          marginValues[key] = margins[key];
      const data = await exportWindow.webContents.printToPDF({
        printBackground: true,
        pageSize,
        landscape: !!payload.landscape,
        margins: marginValues,
        preferCSSPageSize: true,
        displayHeaderFooter: !!(payload.header || payload.footer),
        headerTemplate: payload.header || "<span></span>",
        footerTemplate: payload.footer || "<span></span>",
        generateDocumentOutline: payload.bookmarks !== false,
        generateTaggedPDF: true,
        scale: Math.max(0.5, Math.min(2, payload.scale || 1)),
      });
      await writeExport(target, data, targetRevision);
    } else {
      const height = await exportWindow.webContents.executeJavaScript(
        "Math.ceil(document.documentElement.scrollHeight)",
      );
      if (height > 32760)
        throw Error(
          "EXPORT: PNG output exceeds 32,760 pixels. Split the document or export PDF.",
        );
      exportWindow.setContentSize(
        Math.max(600, Math.min(2400, payload.width || 1200)),
        Math.max(200, height),
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      const image = await exportWindow.webContents.capturePage();
      await writeExport(
        target,
        ["jpg", "jpeg"].includes(format)
          ? image.toJPEG(
              Math.max(
                0,
                Math.min(
                  100,
                  Number.isFinite(payload.quality) ? payload.quality : 90,
                ),
              ),
            )
          : image.toPNG(),
        targetRevision,
      );
    }
    return { path: target, format, warnings };
  } finally {
    exportWindow.destroy();
  }
}
async function images(payload, win) {
  if (!payload.documentPath)
    throw Error("IMAGES: Save the document before inserting local images.");
  const documentPath = await authorized(payload.documentPath);
  const configured = String(
    payload.imageFolder ?? settings.imageFolder ?? "assets",
  ).replaceAll(
    "${filename}",
    path.basename(documentPath, path.extname(documentPath)),
  );
  const folder = await authorized(
    path.resolve(path.dirname(documentPath), configured),
  );
  await fs.mkdir(folder, { recursive: true });
  let sources = payload.paths || [];
  if (!sources.length && !payload.images?.length) {
    const result = await dialog.showOpenDialog(win, {
      title: localize("Insert images", "插入图片"),
      buttonLabel: localize("Insert", "插入"),
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: localize("Images", "图片"),
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"],
        },
      ],
    });
    if (result.canceled) return [];
    sources = result.filePaths;
    for (const file of sources) await grant(file);
  }
  const items = [];
  for (const source of sources) {
    const file = await authorized(source);
    const ext = path.extname(file).toLowerCase();
    if (!mimeTypes[ext]?.startsWith("image/"))
      throw Error("IMAGES: Unsupported image type.");
    items.push({ name: path.basename(file), bytes: await fs.readFile(file) });
  }
  for (const image of payload.images || []) {
    const match =
      /^data:image\/(png|jpeg|webp|gif|svg\+xml|avif);base64,([A-Za-z0-9+/=\s]+)$/.exec(
        image.dataUrl || "",
      );
    if (!match) throw Error("IMAGES: Invalid clipboard image.");
    const ext =
      match[1] === "jpeg" ? "jpg" : match[1] === "svg+xml" ? "svg" : match[1];
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 100 * 1024 * 1024)
      throw Error("IMAGES: Image exceeds 100 MB.");
    items.push({
      name: path.basename(image.name || `image-${Date.now()}.${ext}`),
      bytes,
    });
  }
  const result = [];
  for (const item of items) {
    const ext = path.extname(item.name) || ".png";
    const stem =
      path
        .basename(item.name, ext)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
        .replace(/[ .]+$/g, "") || "image";
    let target = path.join(folder, `${stem}${ext}`),
      counter = 1;
    while (true) {
      try {
        const current = await fs.readFile(target);
        if (hash(current) === hash(item.bytes)) break;
        target = path.join(folder, `${stem}-${counter++}${ext}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        try {
          await atomicCreate(target, item.bytes);
          break;
        } catch (creationError) {
          if (creationError.code !== "EEXIST") throw creationError;
        }
      }
    }
    const markdownPath = referencePath(target, documentPath, payload.imageRoot);
    result.push({
      path: target,
      markdownPath,
      relativePath: payload.imageRoot
        ? markdownPath
        : path
            .relative(path.dirname(documentPath), target)
            .split(path.sep)
            .join("/"),
    });
  }

  return result;
}
async function searchFiles(payload, win) {
  const root = await authorized(payload.path || savedSession.folder);
  if (!boundedString(payload.query, 500) || !payload.query) return [];
  const key = `${win.id}:${String(payload.id || "default")}`;
  activeSearches.get(key)?.cancel();
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "search-worker.cjs"), {
      workerData: {
        root,
        query: payload.query,
        regex: !!payload.regex,
        caseSensitive: !!payload.caseSensitive,
        wholeWord: !!payload.wholeWord,
        includeGlobs: payload.includeGlobs ?? settings.includeGlobs,
        excludeGlobs: payload.excludeGlobs ?? settings.excludeGlobs,
        showHidden: payload.showHidden ?? settings.showHidden,
        showAllFiles: payload.showAllFiles ?? settings.showAllFiles,
      },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (activeSearches.get(key)?.worker === worker)
        activeSearches.delete(key);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result || []);
    };
    const timer = setTimeout(
      () =>
        finish(
          Error(
            "SEARCH: Search exceeded 10 seconds. Simplify the regular expression or narrow the folder.",
          ),
        ),
      10000,
    );
    activeSearches.set(key, { worker, cancel: () => finish(null, []) });
    worker.once("message", (message) =>
      finish(
        message.error ? Error(`SEARCH: ${message.error}`) : null,
        message.results,
      ),
    );
    worker.once("error", (error) => finish(error));
  });
}
async function fileOperation(payload) {
  const file = await authorized(payload.path);
  let target = payload.target ? await authorized(payload.target) : null;
  switch (payload.operation) {
    case "createFile":
      await store.save({
        path: file,
        text: payload.text || "",
        createOnly: true,
      });
      break;
    case "createFolder":
      await fs.mkdir(file, { recursive: false });
      break;
    case "rename":
    case "move": {
      if (!target) throw Error("PATH: Destination is required.");
      if (await exists(target)) {
        const requestedTarget = path.resolve(payload.target);
        const caseOnlyRename =
          process.platform === "win32" &&
          target === file &&
          requestedTarget.toLowerCase() === file.toLowerCase() &&
          path.basename(requestedTarget) !== path.basename(file);
        if (!caseOnlyRename) throw Error("EXISTS: Destination already exists.");
        const [sourceStat, targetStat] = await Promise.all([
          fs.stat(file, { bigint: true }),
          fs.stat(requestedTarget, { bigint: true }),
        ]);
        if (
          sourceStat.dev !== targetStat.dev ||
          sourceStat.ino !== targetStat.ino
        )
          throw Error("EXISTS: Destination already exists.");
        // realpath restores the old casing of an existing Windows entry.
        // Retain only the requested basename after authorizing its real parent.
        target = path.join(
          await authorized(path.dirname(requestedTarget)),
          path.basename(requestedTarget),
        );
      }
      await fs.rename(file, target);
      break;
    }
    case "copy": {
      if (!target) throw Error("PATH: Destination is required.");
      if (await exists(target))
        throw Error("EXISTS: Destination already exists.");
      if (isWithin(target, file))
        throw Error("PATH: Cannot copy a folder into itself.");
      await fs.cp(file, target, {
        recursive: true,
        errorOnExist: true,
        force: false,
        dereference: false,
      });
      break;
    }
    case "trash":
      await shell.trashItem(file);
      break;
    default:
      throw Error("INVALID: Unsupported file operation.");
  }
  broadcast("folder-change", { path: path.dirname(file) });
  return {
    path: target || file,
    operation: payload.operation,
    ...(payload.operation === "move" &&
    target &&
    path.dirname(file) !== path.dirname(target)
      ? {
          warnings: [
            "Moved across folders. Relative image and file links may need updating; use Save As with preserved links when moving a document with assets.",
          ],
        }
      : {}),
  };
}
function menu() {
  const english = settings.locale === "en";
  const label = (zh, en) => (english ? en : zh);
  const action = (text, command, accelerator) => ({
    id: command,
    label: text,
    accelerator:
      nativeAccelerator(settings.shortcuts?.[command]) || accelerator,
    click: (_item, win) => {
      if (win) send(win, "command", command);
    },
  });
  const template = [
    {
      label: label("文件", "File"),
      submenu: [
        action(label("新建文稿", "New document"), "new", "Ctrl+N"),
        {
          label: label("新建窗口", "New window"),
          accelerator: "Ctrl+Shift+N",
          click: () => {
            if (!closeCoordinator.busy) createWindow();
          },
        },
        action(label("打开…", "Open…"), "open", "Ctrl+O"),
        action(
          label("打开文件夹…", "Open folder…"),
          "openFolder",
          "Ctrl+Shift+O",
        ),
        { type: "separator" },
        action(label("保存", "Save"), "save", "Ctrl+S"),
        action(label("另存为…", "Save as…"), "saveAs", "Ctrl+Shift+S"),
        action(label("导入…", "Import…"), "import"),
        action(label("导出…", "Export…"), "export", "Ctrl+Shift+E"),
        action(label("打印…", "Print…"), "print", undefined),
        { type: "separator" },
        { role: "close", label: label("关闭窗口", "Close window") },
        {
          id: "quit",
          label: label("退出", "Quit"),
          accelerator: nativeAccelerator(settings.shortcuts?.quit) || "Ctrl+Q",
          click: () => {
            void closeCoordinator.request([...states.keys()], "quit");
          },
        },
      ],
    },
    {
      label: label("编辑", "Edit"),
      submenu: [
        action(label("撤销", "Undo"), "undo", "Ctrl+Z"),
        action(label("重做", "Redo"), "redo", "Ctrl+Shift+Z"),
        { type: "separator" },
        { role: "cut", label: label("剪切", "Cut") },
        { role: "copy", label: label("复制", "Copy") },
        { role: "paste", label: label("粘贴", "Paste") },
        {
          role: "pasteAndMatchStyle",
          label: label("粘贴为纯文本", "Paste as plain text"),
        },
        { role: "selectAll", label: label("全选", "Select all") },
        { type: "separator" },
        action(label("查找 / 替换", "Find / replace"), "find", "Ctrl+F"),
        action(
          label("全局搜索", "Search in folder"),
          "globalSearch",
          "Ctrl+Shift+F",
        ),
      ],
    },
    {
      label: label("段落", "Paragraph"),
      submenu: [
        ...Array.from({ length: 6 }, (_, i) =>
          action(
            label(`${i + 1} 级标题`, `Heading ${i + 1}`),
            `heading${i + 1}`,
            `Ctrl+${i + 1}`,
          ),
        ),
        { type: "separator" },
        action(label("引用", "Quote"), "quote"),
        action(label("无序列表", "Bullet list"), "bullet"),
        action(label("有序列表", "Numbered list"), "ordered"),
        action(label("任务列表", "Task list"), "task"),
        action(label("表格", "Table"), "table"),
        action(label("代码块", "Code fence"), "codeFence"),
        action(label("数学公式", "Math block"), "math"),
      ],
    },
    {
      label: label("格式", "Format"),
      submenu: [
        action(label("粗体", "Bold"), "bold", "Ctrl+B"),
        action(label("斜体", "Italic"), "italic", "Ctrl+I"),
        action(label("删除线", "Strikethrough"), "strike"),
        action(label("高亮", "Highlight"), "highlight"),
        action(label("行内代码", "Inline code"), "code", "Ctrl+Shift+`"),
        action(label("链接", "Link"), "link", "Ctrl+K"),
        action(label("图片…", "Image…"), "insertImage"),
        action(
          label("从 URL 插入图片", "Insert image from URL"),
          "insertImageURL",
        ),
      ],
    },
    {
      label: label("视图", "View"),
      submenu: [
        action(label("源码模式", "Source mode"), "source", "Ctrl+/"),
        action(label("侧边栏", "Sidebar"), "sidebar", "Ctrl+Shift+L"),
        action(label("大纲", "Outline"), "outline"),
        action(label("快速打开", "Quick open"), "quickOpen", "Ctrl+P"),
        action(
          label("命令面板", "Command palette"),
          "commands",
          "Ctrl+Shift+P",
        ),
        action(label("专注模式", "Focus mode"), "focus"),
        action(label("打字机模式", "Typewriter mode"), "typewriter"),
        action(label("沉浸模式", "Immersive mode"), "zen", "Ctrl+Shift+Enter"),
        action(
          label("AI写作助手", "AI Writing Assistant"),
          "aiAssistant",
          "Ctrl+Shift+A",
        ),
        { type: "separator" },
        action(label("重置缩放", "Reset zoom"), "zoomReset", "Ctrl+0"),
        action(label("放大", "Zoom in"), "zoomIn", "Ctrl+Plus"),
        action(label("缩小", "Zoom out"), "zoomOut", "Ctrl+-"),
        {
          role: "togglefullscreen",
          label: label("切换全屏", "Toggle fullscreen"),
        },
      ],
    },
    {
      label: label("工具", "Tools"),
      submenu: [
        action(label("偏好设置…", "Preferences…"), "settings", "Ctrl+,"),
        action(
          label("Markdown 默认打开方式…", "Default Markdown app…"),
          "defaultApps",
        ),
        action(label("版本历史…", "Version history…"), "history"),
        action(label("格式整理", "Format Markdown"), "format"),
        action(label("字数统计", "Statistics"), "statistics"),
        { type: "separator" },
        action(label("关于墨石", "About Inkstone"), "about"),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function contextMenu(win, params = {}) {
  const template = [];
  for (const word of (params.dictionarySuggestions || []).slice(0, 5))
    template.push({
      label: word,
      click: () => win.webContents.replaceMisspelling(word),
    });
  if (params.misspelledWord)
    template.push({
      label: settings.locale === "en" ? "Add to dictionary" : "加入词典",
      click: () =>
        win.webContents.session.addWordToSpellCheckerDictionary(
          params.misspelledWord,
        ),
    });
  if (template.length) template.push({ type: "separator" });
  template.push(
    { role: "cut", label: localize("Cut", "剪切") },
    { role: "copy", label: localize("Copy", "复制") },
    { role: "paste", label: localize("Paste", "粘贴") },
    {
      role: "pasteAndMatchStyle",
      label: localize("Paste as plain text", "粘贴为纯文本"),
    },
    { type: "separator" },
    ...["bold", "italic", "link", "image", "table"].map((command) => ({
      label: {
        bold: localize("Bold", "粗体"),
        italic: localize("Italic", "斜体"),
        link: localize("Link", "链接"),
        image: localize("Image", "图片"),
        table: localize("Table", "表格"),
      }[command],
      click: () =>
        send(win, "command", command === "image" ? "insertImage" : command),
    })),
    { type: "separator" },
    { role: "selectAll", label: localize("Select all", "全选") },
  );
  Menu.buildFromTemplate(template).popup({ window: win });
}
async function usesEditorContextMenu(win, params) {
  const x = Number.isFinite(params.x) ? params.x : 0;
  const y = Number.isFinite(params.y) ? params.y : 0;
  return win.webContents.executeJavaScript(`(() => {
    if (document.querySelector('[data-inkstone-context-menu="true"][role="menu"]:not([hidden])')) return true;
    const target = document.elementFromPoint(${x}, ${y});
    if (!target?.closest('[data-inkstone-context-menu="true"]')) return false;
    return !target.closest('input,select,textarea') || !!target.closest('.inkstone-table-cell-editor');
  })()`);
}
function createWindow(file) {
  if (closeCoordinator.busy || quitApproved)
    throw Error(
      localize(
        "CLOSE: Finish or cancel closing the current windows before opening another window.",
        "CLOSE: 请先完成或取消当前关闭操作，再打开新窗口。",
      ),
    );
  const win = new BrowserWindow({
    icon: path.join(
      __dirname,
      process.platform === "win32" ? "../build/icon.ico" : "../build/icon.png",
    ),
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 500,
    title: localize("Inkstone", "Inkstone 墨石"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1C1A21" : "#F4F0E6",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: settings.spellcheck,
      webSecurity: true,
    },
  });
  states.set(win.id, {
    dirty: false,
    confirmed: false,
    path: file || null,
    recoveryIds: new Set(),
  });
  win.once("ready-to-show", () => win.show());
  win.on("close", (event) => {
    const state = states.get(win.id);
    if (state && !state.confirmed) {
      event.preventDefault();
      void closeCoordinator.request([win.id], "close");
    }
  });
  win.on("closed", () => {
    aiService?.close(win.id);
    closeCoordinator.removed(win.id);
    states.delete(win.id);
    pruneWatchers();
    void resourceManager?.close(win.id);
    for (const [key, search] of activeSearches)
      if (key.startsWith(`${win.id}:`)) search.cancel();
  });
  win.webContents.on("context-menu", (_event, params) => {
    void (async () => {
      // Native context coordinates include page zoom; DOM hit testing and
      // renderer spelling suggestions use unzoomed CSS coordinates.
      const zoom = win.webContents.getZoomFactor();
      const point = { x: params.x / zoom, y: params.y / zoom };
      let custom = false;
      try {
        custom = await usesEditorContextMenu(win, point);
      } catch {}
      if (win.isDestroyed()) return;
      if (custom)
        send(win, "context-menu-details", {
          x: point.x,
          y: point.y,
          misspelledWord: params.misspelledWord || "",
          dictionarySuggestions: (params.dictionarySuggestions || []).slice(
            0,
            5,
          ),
          editFlags: params.editFlags,
        });
      else contextMenu(win, params);
    })();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  win.on("unresponsive", () => {
    states.get(win.id).unresponsive = true;
    closeCoordinator.unresponsive(win.id);
  });
  win.on("responsive", () => {
    if (states.has(win.id)) states.get(win.id).unresponsive = false;
  });
  win.webContents.on("render-process-gone", () => {
    aiService?.cancel(win.id);
    closeCoordinator.removed(win.id);
    dialog
      .showMessageBox({
        type: "error",
        title: "Inkstone",
        message: localize(
          "The editor process stopped. Restart Inkstone to recover saved drafts.",
          "编辑器进程已停止。请重启 Inkstone 以恢复已保存的草稿。",
        ),
        buttons: [localize("Close window", "关闭窗口")],
      })
      .then(() => {
        if (!win.isDestroyed()) {
          states.get(win.id).confirmed = true;
          win.close();
        }
      });
  });
  if (process.env.INKSTONE_DEV_URL) win.loadURL(process.env.INKSTONE_DEV_URL);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
  // bootstrap.session.path is the single initial-file delivery for every new
  // window. Sending open-path as well can race a second stale read against the
  // user's first edits and replace them after the document is already visible.
  return win;
}
let pendingClipboardWrite = Promise.resolve();
let aiService;
const ai = () =>
  (aiService ||= new AIService({
    directory: app.getPath("userData"),
    safeStorage,
  }));
const handlers = {
  aiGetSettings: (payload) => ai().getSettings(payload),
  aiSaveSettings: (payload) => ai().saveSettings(payload),
  aiListModels: (payload, win) => ai().models(win.id, payload),
  aiTestConnection: (payload, win) => ai().test(win.id, payload),
  aiStart: (payload, win) =>
    ai().start(win.id, payload, (event) => send(win, "ai-response", event)),
  aiCancel: (payload, win) => ai().cancel(win.id, payload.id),
  async getAboutInfo() {
    return {
      name: "Inkstone",
      version: app.getVersion(),
      repository: "https://github.com/JhuoW/Inkstone",
      contributors: ["Wei Zhuo"],
      contributorURL: "https://wei2hu0.github.io/",
      license: "AGPL-3.0-only",
      copyright: "Copyright © 2026 Inkstone contributors",
      licenseText: await fs.readFile(
        path.join(__dirname, "../LICENSE"),
        "utf8",
      ),
    };
  },
  getDefaultAppInfo: () => defaultApps.info(),
  openDefaultApps: () => defaultApps.openSettings(),
  async claimDefaultAppPrompt() {
    if (
      process.platform !== "win32" ||
      !app.isPackaged ||
      settings.defaultAppPrompted ||
      defaultAppPromptClaimed
    )
      return { offered: false };
    defaultAppPromptClaimed = true;
    try {
      const info = await defaultApps.info();
      if (!info.registered) {
        defaultAppPromptClaimed = false;
        return { offered: false };
      }
      await handlers.updateSettings({ defaultAppPrompted: true });
      return { offered: true, currentDefault: info.currentDefault };
    } catch (error) {
      defaultAppPromptClaimed = false;
      throw error;
    }
  },
  spellcheckStatus: () => offlineSpellcheck.status(),
  async bootstrap(payload, win) {
    const state = states.get(win.id);
    const recovery = await store.recoveries();
    const liveRecoveryIds = new Set(
      [...states.values()].flatMap((current) => [...current.recoveryIds]),
    );
    return {
      settings,
      languageConfigured,
      spellcheck: offlineSpellcheck.status(),
      warnings: startupWarnings,
      session: { ...savedSession, ...(state.path ? { path: state.path } : {}) },
      recovery,
      recoverableAtStartup: recovery.filter(
        (record) => !liveRecoveryIds.has(record.id),
      ),
      version: app.getVersion(),
      platform: process.platform,
      diagnostics: {
        activeFileWatchers: watchers.size,
        activeDirectoryWatchers: [...folderWatchers.values()].reduce(
          (sum, group) => sum + group.directories.size,
          0,
        ),
      },
    };
  },
  openFile: (payload, win) => open(payload.path, win, payload.encoding),
  async saveFile(payload, win) {
    let file = payload.path,
      revision = payload.revision;
    if (!file || payload.saveAs) {
      const choice = await dialog.showSaveDialog(win, {
        title: localize("Save Markdown", "保存文稿"),
        buttonLabel: localize("Save", "保存"),
        defaultPath: file || localize("Untitled.md", "未命名.md"),
        filters: markdownFilters(),
      });
      if (choice.canceled) return null;
      file = choice.filePath;
      await grant(path.dirname(file), true);
      revision = await store.revision(file); // The native dialog explicitly confirmed any replacement.
    } else file = await authorized(file);
    const rebased =
      payload.saveAs && payload.preserveLinks && payload.path
        ? rebaseLocalLinks(payload.text, await authorized(payload.path), file)
        : { text: payload.text, changed: 0, warnings: [] };
    const document = await store.save({
      path: file,
      text: rebased.text,
      revision: revision === null ? undefined : revision,
      createOnly: revision === null,
      bom:
        payload.saveAs && payload.path
          ? store.documents.get(path.resolve(payload.path))?.bom
          : undefined,
      encoding:
        payload.encoding ||
        (payload.saveAs && payload.path
          ? store.documents.get(path.resolve(payload.path))?.encoding
          : undefined),
      preserveExistingEndings: !payload.saveAs,
    });
    if (rebased.changed) document.rebasedLinks = rebased.changed;
    if (rebased.warnings.length) document.warnings = rebased.warnings;
    await remember(file);
    states.get(win.id).path = file;
    watch(file);
    pruneWatchers();
    return document;
  },
  async chooseFolder(_payload, win) {
    const result = await dialog.showOpenDialog(win, {
      title: localize("Open folder", "打开文件夹"),
      buttonLabel: localize("Open", "打开"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    return grant(result.filePaths[0], true);
  },
  listFiles,
  searchFiles,
  fileOperation,
  readAsset: (payload) => assetData(payload.path),
  insertImages: images,
  listImageReferences: (payload) => resourceManager.list(payload),
  prepareImageOperation: (payload, win) =>
    resourceManager.prepare(payload, win.id),
  cancelImageOperation: (payload, win) =>
    resourceManager.cancel(payload.id, win.id),
  async commitImageOperation(payload, win) {
    const result = await resourceManager.commit(payload.id, win.id);
    watch(result.document.path);
    broadcast("folder-change", { path: path.dirname(result.document.path) });
    return result;
  },
  async cancelSearch(payload, win) {
    const entry = activeSearches.get(
      `${win.id}:${String(payload.id || "default")}`,
    );
    if (entry) entry.cancel();
    return !!entry;
  },
  downloadImage,
  addDictionaryWord(payload, win) {
    if (
      !boundedString(payload.word, 256) ||
      !payload.word ||
      /[\s\x00-\x1f\x7f]/.test(payload.word)
    )
      throw Error(
        "SPELLCHECK: A single word of at most 256 characters is required.",
      );
    if (!win.webContents.session.addWordToSpellCheckerDictionary(payload.word))
      throw Error(
        "SPELLCHECK: This word could not be added to the local dictionary.",
      );
    return true;
  },
  async readClipboard() {
    await pendingClipboardWrite.catch(() => {});
    const limit = 10 * 1024 * 1024;
    let text = "",
      html = "",
      markdown = null,
      hasImage = false;
    if (ClipboardItem && typeof clipboard.read === "function") {
      const items = await clipboard.read();
      hasImage = items.some((item) =>
        item.types.some((type) => type.startsWith("image/")),
      );
      const read = async (types, missing = "") => {
        if (typeof types === "string") types = [types];
        const item = items.find((item) =>
          item.types.some((type) => types.includes(type)),
        );
        if (!item) return missing;
        const type = item.types.find((type) => types.includes(type));
        const blob = await item.getType(type);
        if (blob.size > limit)
          throw Error("CLIPBOARD: Text and HTML must be smaller than 10 MB.");
        return blob.text();
      };
      [text, html, markdown] = await Promise.all([
        read("text/plain"),
        read("text/html"),
        read(
          [
            "text/x-inkstone-markdown",
            "web text/x-inkstone-markdown",
            'electron application/osclipboard;format="text/x-inkstone-markdown"',
          ],
          null,
        ),
      ]);
    } else {
      text = await clipboard.readText();
      html =
        typeof clipboard.readHTML === "function"
          ? await clipboard.readHTML()
          : "";
      hasImage =
        typeof clipboard.readImage === "function" &&
        !clipboard.readImage().isEmpty();
    }
    if (
      Buffer.byteLength(text, "utf8") > limit ||
      Buffer.byteLength(html, "utf8") > limit ||
      (markdown !== null && Buffer.byteLength(markdown, "utf8") > limit)
    )
      throw Error("CLIPBOARD: Text and HTML must be smaller than 10 MB.");
    if (
      markdown !== null &&
      markdown.replace(/\r\n|\r/g, "\n") !== text.replace(/\r\n|\r/g, "\n")
    )
      markdown = null;
    return { text, html, markdown, hasImage };
  },
  async writeClipboard(payload) {
    const limit = 10 * 1024 * 1024;
    if (
      !boundedString(payload.text, limit) ||
      Buffer.byteLength(payload.text, "utf8") > limit ||
      ("html" in payload &&
        (!boundedString(payload.html, limit) ||
          Buffer.byteLength(payload.html, "utf8") > limit)) ||
      ("markdown" in payload &&
        (!boundedString(payload.markdown, limit) ||
          Buffer.byteLength(payload.markdown, "utf8") > limit ||
          payload.markdown !== payload.text))
    )
      throw Error(
        "CLIPBOARD: Text, HTML and Markdown must be strings smaller than 10 MB; Markdown must match plain text.",
      );
    const operation = pendingClipboardWrite
      .catch(() => {})
      .then(async () => {
        if (ClipboardItem)
          await clipboard.write([
            new ClipboardItem({
              "text/plain": payload.text,
              ...(payload.html ? { "text/html": payload.html } : {}),
              ...("markdown" in payload
                ? { "text/x-inkstone-markdown": payload.markdown }
                : {}),
            }),
          ]);
        else
          clipboard.write({
            text: payload.text,
            ...(payload.html ? { html: payload.html } : {}),
          });
      });
    pendingClipboardWrite = operation;
    await operation;
    return true;
  },
  async clipboardImage(payload, win) {
    if (ClipboardItem) {
      const items = await clipboard.read();
      const item = items.find((item) => item.types.includes("image/png"));
      if (!item) return [];
      const blob = await item.getType("image/png");
      return images(
        {
          ...payload,
          images: [
            {
              name: `clipboard-${Date.now()}.png`,
              dataUrl: `data:image/png;base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`,
            },
          ],
        },
        win,
      );
    }
    const image = clipboard.readImage();
    if (image.isEmpty()) return [];
    return images(
      {
        ...payload,
        images: [
          { name: `clipboard-${Date.now()}.png`, dataUrl: image.toDataURL() },
        ],
      },
      win,
    );
  },
  saveRecovery: (payload, win) => {
    states.get(win.id).recoveryIds.add(payload.id);
    return store.recovery({
      ...payload,
      encoding:
        payload.encoding ||
        (payload.path
          ? store.documents.get(path.resolve(payload.path))?.encoding
          : null) ||
        "utf8",
    });
  },
  deleteRecovery: (payload) => store.recovery({ ...payload, discard: true }),
  async discardRecovery(payload, win) {
    const excludeIds = [...states.entries()]
      .filter(([id]) => id !== win.id)
      .flatMap(([, state]) => [...state.recoveryIds]);
    return store.discardRecoveries({
      id: payload.id,
      path: payload.path ? await authorized(payload.path) : undefined,
      excludeIds,
    });
  },
  async listHistory(payload) {
    return store.history(await authorized(payload.path));
  },
  async restoreHistory(payload, win) {
    return store.historical({
      ...payload,
      path: await authorized(payload.path || states.get(win.id).path),
    });
  },
  async updateSettings(payload) {
    if (settingsPersistenceBlocked) {
      try {
        const original = path.join(app.getPath("userData"), "settings.json");
        let bytes = await fs.readFile(original);
        try {
          const migration = removeRetiredSettings(
            JSON.parse(bytes.toString("utf8")),
          );
          if (migration.removed.length)
            bytes = JSON.stringify(migration.settings, null, 2);
        } catch {}
        await atomicWrite(
          path.join(
            app.getPath("userData"),
            `settings.invalid-${Date.now()}-${crypto.randomUUID()}.json`,
          ),
          bytes,
        );
        settingsPersistenceBlocked = false;
        store.blockedStateKeys.delete("settings");
      } catch (error) {
        throw Error(
          localize(
            `PREFERENCES: The original settings cannot be backed up. No preferences were saved. Correct the file permissions or disk error and retry. ${error.message}`,
            "PREFERENCES: 无法备份原偏好设置，未写入任何更改。请修复文件权限或磁盘错误后重试。",
          ),
        );
      }
    }
    settings = validateSettings(payload);
    if (
      payload.firstRunComplete === true ||
      ["en", "zh-CN"].includes(payload.locale)
    )
      languageConfigured = true;
    if (settings.recordRecent === false) {
      settings.recentFiles = [];
      app.clearRecentDocuments();
    }
    await store.writeJson("settings", settings);
    nativeTheme.themeSource = settings.theme;
    offlineSpellcheck.setEnabled(settings.spellcheck);
    menu();
    broadcast("settings-changed", settings);
    return settings;
  },
  async saveSession(payload, win) {
    await store.preserveBlockedState("session");
    savedSession = payload;
    if (Object.hasOwn(payload, "path"))
      states.get(win.id).path = payload.path || null;
    if (Object.hasOwn(payload, "folder"))
      states.get(win.id).folder = payload.folder || null;
    pruneWatchers();
    await store.writeJson("session", payload);
    return true;
  },
  exportFile,
  detectTools,
  runPandoc,
  async newWindow(payload) {
    if (closeCoordinator.busy)
      throw Error(
        localize(
          "CLOSE: Finish or cancel closing the current windows before opening another window.",
          "CLOSE: 请先完成或取消当前关闭操作，再打开新窗口。",
        ),
      );
    const file = payload.path ? await authorized(payload.path) : null;
    return { id: createWindow(file).id };
  },
  async windowAction(payload, win) {
    switch (payload.action) {
      case "ready":
        closeCoordinator.ready(win.id);
        return true;
      case "requestClose":
        void closeCoordinator.request([win.id], "close");
        return true;
      case "quit":
        void closeCoordinator.request([...states.keys()], "quit");
        return true;
      case "closeResponse":
        return closeCoordinator.respond(
          win.id,
          payload.requestId,
          "prepare",
          payload.allow,
          payload.error,
        );
      case "closeCommit":
        return closeCoordinator.respond(
          win.id,
          payload.requestId,
          "commit",
          payload.allow,
          payload.error,
        );
      case "closeConfirmed":
        return closeCoordinator.respond(
          win.id,
          payload.requestId ||
            closeCoordinator.current?.requests.get(win.id)?.requestId,
          "prepare",
          true,
        );
      case "fullscreen":
        win.setFullScreen(!win.isFullScreen());
        break;
      case "minimize":
        win.minimize();
        break;
      case "maximize":
        win.isMaximized() ? win.unmaximize() : win.maximize();
        break;
      case "zoomIn":
      case "zoomOut":
      case "zoomReset": {
        const factor =
          payload.action === "zoomReset"
            ? 1
            : Math.max(
                0.5,
                Math.min(
                  3,
                  win.webContents.getZoomFactor() +
                    (payload.action === "zoomIn" ? 0.1 : -0.1),
                ),
              );
        win.webContents.setZoomFactor(factor);
        return factor;
      }
      case "zoom":
        win.webContents.setZoomFactor(
          Math.max(0.5, Math.min(3, Number(payload.factor) || 1)),
        );
        break;
      default:
        throw Error("Unsupported window action");
    }
    return true;
  },
  async pickPath(payload, win) {
    const result = await dialog.showOpenDialog(win, {
      title: payload.title || localize("Choose file", "选择文件"),
      buttonLabel: localize("Choose", "选择"),
      properties: [payload.directory ? "openDirectory" : "openFile"],
      ...(payload.filters ? { filters: payload.filters } : {}),
    });
    if (result.canceled) return null;
    return grant(result.filePaths[0], !!payload.directory);
  },
  async resolveLink(payload) {
    const doc = await authorized(payload.documentPath);
    if (!boundedString(payload.href, 8192))
      throw Error("LINK: Expected a local file path.");
    let destination;
    if (/^file:/i.test(payload.href)) {
      try {
        const url = new URL(payload.href);
        if (url.protocol !== "file:" || url.username || url.password)
          throw Error("Invalid file URL");
        url.search = "";
        url.hash = "";
        destination = fileURLToPath(url);
      } catch {
        throw Error("LINK: Invalid local file URL.");
      }
    } else {
      if (/^[a-z][a-z\d+.-]*:/i.test(payload.href))
        throw Error("LINK: Expected a relative local file path or file URL.");
      destination = path.resolve(path.dirname(doc), payload.href);
    }
    return {
      path: await authorized(destination),
    };
  },
  async openExternal(payload) {
    let url;
    try {
      url = new URL(payload.url);
    } catch {
      throw Error("LINK: Invalid URL.");
    }
    if (!["https:", "http:", "mailto:"].includes(url.protocol))
      throw Error(
        "LINK: Only HTTP(S) and mailto links can be opened externally.",
      );
    await shell.openExternal(url.href);
    return true;
  },
  async setDirty(payload, win) {
    states.get(win.id).dirty = !!payload.dirty;
    if (typeof payload.title === "string")
      win.setTitle(`${payload.dirty ? "● " : ""}${payload.title} — Inkstone`);
    return true;
  },
  async openExport(payload) {
    const file = await authorized(payload.path);
    if (
      !/\.(pdf|html?|png|jpe?g|webp|docx|odt|rtf|epub|tex|latex|rst|rest|md|markdown|wiki|mediawiki|dokuwiki|textile|org|opml|pptx|json|asciidoc|adoc|txt|gfm|commonmark|beamer)$/i.test(
        file,
      )
    )
      throw Error(
        "OPEN: Only supported document and image exports can be opened.",
      );
    if (!(await fs.stat(file)).isFile())
      throw Error("OPEN: Expected an exported file.");
    const error = await shell.openPath(file);
    if (error) throw Error(`OPEN: ${error}`);
    return true;
  },
  async showInFolder(payload) {
    shell.showItemInFolder(await authorized(payload.path));
    return true;
  },
  async contextMenu(_payload, win) {
    contextMenu(win);
    return true;
  },
};
const droppedPaths = new Map();
ipcMain.on("inkstone:drop-path", (event, file) => {
  const win = windowFor(event);
  if (
    event.senderFrame !== win.webContents.mainFrame ||
    typeof file !== "string"
  )
    return;
  // Only preload's webUtils.getPathForFile can emit this private channel.
  droppedPaths.set(
    file,
    grant(file).catch(() => null),
  );
});
ipcMain.handle("inkstone:invoke", async (event, method, payload = {}) => {
  const win = windowFor(event);
  if (event.senderFrame !== win.webContents.mainFrame)
    throw Error(
      "ACCESS: Only the application main frame may use desktop operations.",
    );
  const origin = event.senderFrame.url;
  const expected = pathToFileURL(
    path.join(__dirname, "../dist/index.html"),
  ).href;
  if (
    origin !== expected &&
    !(
      process.env.INKSTONE_DEV_URL &&
      origin.startsWith(process.env.INKSTONE_DEV_URL)
    )
  )
    throw Error("ACCESS: Untrusted document.");
  if (!Object.hasOwn(handlers, method))
    throw Error("INVALID: Unsupported desktop method.");
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw Error("INVALID: Operation payload must be an object.");
  if (method === "insertImages")
    for (const file of payload.paths || [])
      if (droppedPaths.has(file)) {
        await droppedPaths.get(file);
        droppedPaths.delete(file);
      }
  return handlers[method](payload, win);
});
app
  .whenReady()
  .then(async () => {
    if (process.platform === "win32")
      app.setAppUserModelId("io.inkstone.editor");
    const dictionaryCache = await installDictionaryCache(
      app.getPath("userData"),
    );
    store = new FileStore(app.getPath("userData"));
    await store.init();
    resourceManager = new ImageResourceManager({
      store,
      authorize: authorized,
      trash: (file) => shell.trashItem(file),
      defaultFolder: () => settings.imageFolder,
    });
    const loadedSettings = await store.readJson("settings", {});
    settingsPersistenceBlocked = store.blockedStateKeys.has("settings");
    const language = await initialLanguage(
      loadedSettings,
      process.resourcesPath,
      () => resolveSystemLanguage(app.getPreferredSystemLanguages()),
    );
    settings.locale = language.locale;
    languageConfigured = language.configured;
    const migration = removeRetiredSettings(loadedSettings);
    let canPersistMigration = false;
    try {
      settings = validateSettings(migration.settings);
      canPersistMigration = true;
    } catch (error) {
      settings = { ...defaults, locale: language.locale };
      const original = path.join(app.getPath("userData"), "settings.json");
      const backup = path.join(
        app.getPath("userData"),
        `settings.invalid-${Date.now()}-${crypto.randomUUID()}.json`,
      );
      try {
        await atomicWrite(
          backup,
          migration.removed.length
            ? JSON.stringify(migration.settings, null, 2)
            : await fs.readFile(original),
        );
        canPersistMigration = true;
        startupWarnings.push(
          localize(
            `Invalid preferences (${error.message}). Defaults restored. Original settings are preserved at: ${backup}`,
            `偏好设置包含无效值，已恢复默认值。原设置已备份至：${backup}`,
          ),
        );
        try {
          await store.writeJson("settings", settings);
        } catch (writeError) {
          startupWarnings.push(
            localize(
              `Defaults are in memory only; settings could not be updated: ${writeError.message}`,
              "默认设置仅在本次运行中生效，无法写入偏好设置文件。请检查文件权限和磁盘空间。",
            ),
          );
        }
      } catch (backupError) {
        settingsPersistenceBlocked = true;
        startupWarnings.push(
          localize(
            `Invalid preferences (${error.message}). Defaults are in memory only; the original settings were left untouched because backup failed: ${backupError.message}`,
            "偏好设置包含无效值且备份失败。原文件保持不变，当前仅在内存中使用默认值。请修复文件权限或磁盘错误后重试。",
          ),
        );
      }
    }
    if (migration.removed.length && canPersistMigration) {
      try {
        await store.writeJson("settings", settings);
        startupWarnings.push(
          localize(
            "Removed retired image-service, synchronization and web-search preferences.",
            "已清理旧版本的图片服务、同步和网页搜索设置。",
          ),
        );
      } catch (error) {
        startupWarnings.push(
          localize(
            `Retired settings were removed from memory, but the preferences file could not be updated: ${error.message}`,
            "旧版本设置已从内存中清理，但无法更新偏好设置文件。请检查文件权限和磁盘空间。",
          ),
        );
      }
    }
    savedSession = await store.readJson("session", {});
    for (const warning of store.stateWarnings)
      startupWarnings.push(
        warning.backup
          ? localize(
              `Unreadable ${warning.name}.json was preserved at ${warning.backup}. Defaults are in use.`,
              `${warning.name}.json 无法读取，原文件已备份至 ${warning.backup}。当前使用默认设置。`,
            )
          : localize(
              `Unreadable ${warning.name}.json could not be backed up. The original is untouched and automatic writes are disabled. Correct the file permissions or disk error before retrying.`,
              `${warning.name}.json 无法读取且备份失败。原文件保持不变，自动写入已暂停。请修复文件权限或磁盘错误后重试。`,
            ),
      );
    offlineSpellcheck = configureOfflineSpellcheck(
      session.defaultSession,
      dictionaryCache,
      settings.spellcheck,
    );
    nativeTheme.themeSource = settings.theme;
    for (const dir of [
      savedSession.folder,
      ...(settings.pinnedFolders || []),
      ...(settings.pins || []),
    ])
      if (typeof dir === "string") await grant(dir, true).catch(() => {});
    for (const file of [savedSession.path, ...(settings.recentFiles || [])])
      if (typeof file === "string") await grant(file).catch(() => {});
    // Deny permissions to microphone/camera/geolocation and embedded remote content.
    session.defaultSession.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle("inkstone-asset", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== "local")
          return new Response("Forbidden", { status: 403 });
        const file = await authorized(url.searchParams.get("path"));
        const mime = mimeTypes[path.extname(file).toLowerCase()];
        if (!mime) return new Response("Unsupported asset", { status: 415 });
        return net.fetch(pathToFileURL(file).href);
      } catch {
        return new Response("Asset not available", { status: 404 });
      }
    });
    menu();
    const argumentsToOpen = process.argv
      .slice(app.isPackaged ? 1 : 2)
      .filter((arg) => !arg.startsWith("-"));
    for (const arg of argumentsToOpen) {
      const absolute = path.resolve(arg);
      if (await exists(absolute)) {
        const stat = await fs.stat(absolute);
        if (stat.isDirectory()) {
          savedSession.folder = await grant(absolute, true);
        } else pendingPaths.push(absolute);
      }
    }
    if (pendingPaths.length)
      for (const file of pendingPaths)
        try {
          createWindow(await grant(file));
        } catch (error) {
          dialog.showErrorBox(
            localize("Open failed", "无法打开"),
            error.message,
          );
        }
    else createWindow();
  })
  .catch((error) => {
    console.error(error);
    app.quit();
  });
app.on("window-all-closed", () => {
  app.quit();
});
app.on("before-quit", (event) => {
  if (quitApproved || !states.size) return;
  event.preventDefault();
  void closeCoordinator.request([...states.keys()], "quit");
});
app.on("will-quit", () => {
  aiService?.dispose();
  for (const watcher of watchers.values()) watcher.close();
  for (const group of folderWatchers.values()) {
    clearTimeout(group.timer);
    for (const [dir, listener] of group.directories)
      fsSync.unwatchFile(dir, listener);
  }
});
