const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDiagnostics,
  settingsSummary,
} = require("../electron/diagnostics.cjs");

const fixed = () => new Date("2026-11-10T08:00:00.000Z");
const facts = {
  version: "0.10.0",
  packaged: true,
  versions: { electron: "45.2.3", chrome: "140.0", node: "22.20.0" },
  os: {
    platform: "win32",
    release: "10.0.26200",
    arch: "x64",
    locale: "zh-CN",
  },
  settings: {
    locale: "zh-CN",
    theme: "dark",
    fontSize: 17,
    customCSS: "body { color: red }",
    pandocPath: "C:\\Users\\wei\\pandoc.exe",
    recentFiles: ["C:\\Users\\wei\\notes\\secret.md"],
    snippets: { date: "{{date}}", sign: "Private signature" },
    shortcuts: { bold: "Mod-b" },
  },
  update: { status: "available", version: "0.10.1", canInstall: true },
  ai: { provider: "gemini", model: "gemini-3.6-flash", ready: true },
  windows: 2,
  watchers: { files: 1, folders: 3 },
  gpu: { gpu_compositing: "enabled", webgl: "disabled_software" },
};

test("the report lists versions, state and a settings summary", () => {
  const report = createDiagnostics({ now: fixed }).report(facts);
  assert.match(report, /Inkstone 0\.10\.0 \(installed build\)/);
  assert.match(report, /Electron 45\.2\.3 · Chromium 140\.0 · Node 22\.20\.0/);
  assert.match(report, /win32 10\.0\.26200 x64 · system language zh-CN/);
  assert.match(report, /Update: available \(0\.10\.1 found\), can install/);
  assert.match(report, /AI: gemini · gemini-3\.6-flash · ready/);
  assert.match(report, /Graphics: webgl=disabled_software/);
  assert.match(report, /- none recorded/);
});

test("the report leaves out paths, custom CSS, snippet text and keys", () => {
  const report = createDiagnostics({ now: fixed }).report(facts);
  for (const secret of [
    "secret.md",
    "pandoc.exe",
    "color: red",
    "Private signature",
    "C:\\Users",
  ])
    assert.ok(!report.includes(secret), `report contains ${secret}`);
  const summary = settingsSummary(facts.settings);
  assert.equal(summary.customCSS, "19 characters");
  assert.equal(summary.recentFiles, 1);
  assert.equal(summary.snippets, 2);
  assert.equal(summary.pandocPath, "set");
  assert.equal(summary.theme, "dark");
});

test("recent problems are scrubbed of the home folder and capped", () => {
  const diagnostics = createDiagnostics({ home: "C:\\Users\\wei", now: fixed });
  diagnostics.record("error", new Error("ENOENT: C:\\Users\\wei\\notes\\a.md"));
  for (let i = 0; i < 40; i++) diagnostics.record("warn", `problem ${i}`);
  const problems = diagnostics.problems();
  assert.equal(problems.length, 30);
  assert.equal(problems.at(-1), "2026-11-10T08:00:00.000Z warn: problem 39");
  diagnostics.record("renderer", "TypeError at C:\\Users\\wei\\app.js");
  assert.match(
    diagnostics.problems().at(-1),
    /renderer: TypeError at ~\\app\.js$/,
  );
  assert.ok(!diagnostics.report(facts).includes("C:\\Users\\wei"));
});

test("console warnings and errors are recorded and still printed", () => {
  const printed = [];
  const target = {
    warn: (...args) => printed.push(["warn", ...args]),
    error: (...args) => printed.push(["error", ...args]),
  };
  const diagnostics = createDiagnostics({ now: fixed });
  diagnostics.captureConsole(target);
  target.warn("Update check failed:", "offline");
  target.error(new Error("boom"));
  assert.deepEqual(diagnostics.problems(), [
    "2026-11-10T08:00:00.000Z warn: Update check failed: offline",
    "2026-11-10T08:00:00.000Z error: boom",
  ]);
  assert.equal(printed.length, 2);
});
