"use strict";
/**
 * Preference defaults and validation, shared by the main process at startup
 * and for every updateSettings call. validateSettings returns the merged
 * settings or throws an English message the renderer localizes.
 */
const { removeRetiredSettings } = require("./settings-migration.cjs");
const { patterns } = require("./glob.cjs");

// What the close button does to the last open window.
const closeActions = ["ask", "tray", "quit"];
// Automated tests set INKSTONE_CLOSE_ACTION=quit so closing a window never
// waits on the native choice dialog; a saved preference still wins.
const defaultCloseAction = closeActions.includes(
  process.env.INKSTONE_CLOSE_ACTION,
)
  ? process.env.INKSTONE_CLOSE_ACTION
  : "ask";

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
  autoCheckUpdates: true,
  closeAction: defaultCloseAction,
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
function validateSettings(patch, current) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw Error("Settings must be a JSON object.");
  patch = removeRetiredSettings(patch).settings;
  const value = { ...removeRetiredSettings(current).settings };
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
    "autoCheckUpdates",
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
  if ("closeAction" in patch) {
    if (!closeActions.includes(patch.closeAction))
      throw Error("Invalid close action");
    value.closeAction = patch.closeAction;
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

module.exports = {
  closeActions,
  defaults,
  boundedString,
  nativeAccelerator,
  validateSettings,
};
