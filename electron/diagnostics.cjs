"use strict";
/**
 * A plain-text report for bug reports: versions, system, a summary of the
 * settings, update and AI state, and recent main-process problems.
 *
 * It never includes document text, file or folder paths, custom CSS, snippet
 * text, API keys or endpoints. The user's home folder is replaced with "~" in
 * recorded problems.
 */
const LIMIT = 30;

function createDiagnostics({ home = "", now = () => new Date() } = {}) {
  const problems = [];
  const scrub = (text) => {
    let value = String(text ?? "");
    if (home) value = value.split(home).join("~");
    return value.replace(/\s+/g, " ").trim().slice(0, 400);
  };
  return {
    /** Keeps the latest problems, newest last. */
    record(level, ...parts) {
      const message = scrub(
        parts
          .map((part) => (part instanceof Error ? part.message : part))
          .join(" "),
      );
      if (!message) return;
      problems.push(`${now().toISOString()} ${level}: ${message}`);
      if (problems.length > LIMIT) problems.splice(0, problems.length - LIMIT);
    },
    problems: () => [...problems],
    /** Also records what the main process logs with console.warn/error. */
    captureConsole(target = console) {
      for (const level of ["warn", "error"]) {
        const original = target[level].bind(target);
        target[level] = (...args) => {
          this.record(level, ...args);
          original(...args);
        };
      }
    },
    report(facts) {
      return formatReport(facts, problems, now());
    },
  };
}

const settingKeys = [
  "locale",
  "theme",
  "fontSize",
  "lineHeight",
  "contentWidth",
  "autoSave",
  "autoSaveDelay",
  "spellcheck",
  "strictMarkdown",
  "cjkEmphasis",
  "codeWrap",
  "lineNumbers",
  "focusMode",
  "typewriterMode",
  "autoPair",
  "smartPunctuation",
  "fileSort",
  "showHidden",
  "showAllFiles",
  "aiPanelOpen",
  "autoCheckUpdates",
  "closeAction",
];

/** Settings without paths or free text: values for options, counts otherwise. */
function settingsSummary(settings = {}) {
  const summary = {};
  for (const key of settingKeys)
    if (key in settings) summary[key] = settings[key];
  const count = (value) =>
    Array.isArray(value)
      ? value.length
      : value && typeof value === "object"
        ? Object.keys(value).length
        : 0;
  summary.customCSS = settings.customCSS
    ? `${String(settings.customCSS).length} characters`
    : "none";
  summary.themes = count(settings.themeLibrary);
  summary.shortcuts = count(settings.shortcuts);
  summary.snippets = count(settings.snippets);
  summary.recentFiles = count(settings.recentFiles);
  summary.pinnedFolders = count(settings.pinnedFolders);
  summary.pandocPath = settings.pandocPath ? "set" : "default";
  return summary;
}

function formatReport(facts, problems, date) {
  const {
    version,
    packaged,
    versions = {},
    os = {},
    settings,
    update,
    ai,
    windows,
    watchers,
    gpu,
  } = facts;
  const lines = [
    "## Inkstone diagnostics",
    "",
    `- Inkstone ${version} (${packaged ? "installed build" : "development run"})`,
    `- Electron ${versions.electron} · Chromium ${versions.chrome} · Node ${versions.node}`,
    `- ${os.platform} ${os.release} ${os.arch} · system language ${os.locale}`,
    `- Windows open: ${windows ?? "?"} · file watchers: ${watchers?.files ?? "?"} · folder watchers: ${watchers?.folders ?? "?"}`,
    `- Update: ${update ? `${update.status}${update.version ? ` (${update.version} found)` : ""}, ${update.canInstall ? "can install" : "release page only"}` : "unknown"}`,
    `- AI: ${ai ? `${ai.provider || "none"}${ai.model ? ` · ${ai.model}` : ""} · ${ai.ready ? "ready" : "not set up"}` : "unknown"}`,
  ];
  if (gpu)
    lines.push(
      // Only software fallbacks and unavailable features; "*_ok" is expected.
      `- Graphics: ${
        Object.entries(gpu)
          .filter(
            ([, value]) =>
              /software|^unavailable/.test(value) && !/_ok$/.test(value),
          )
          .map(([key, value]) => `${key}=${value}`)
          .join(", ") || "hardware acceleration in use"
      }`,
    );
  lines.push(
    `- Report created ${date.toISOString()}`,
    "",
    "### Settings",
    "",
    "```json",
    JSON.stringify(settingsSummary(settings), null, 2),
    "```",
    "",
    "### Recent problems",
    "",
    ...(problems.length
      ? problems.map((problem) => `- ${problem}`)
      : ["- none recorded"]),
    "",
  );
  return lines.join("\n");
}

module.exports = { createDiagnostics, settingsSummary };
