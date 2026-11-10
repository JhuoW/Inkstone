const test = require("node:test");
const assert = require("node:assert/strict");
const {
  defaults,
  nativeAccelerator,
  validateSettings,
} = require("../electron/settings-schema.cjs");
const { applicationMenu } = require("../electron/menu.cjs");

test("settings merge into the current values and reject out-of-range input", () => {
  const current = { ...defaults, fontSize: 20 };
  const next = validateSettings(
    { theme: "dark", autoCheckUpdates: false },
    current,
  );
  assert.equal(next.theme, "dark");
  assert.equal(next.autoCheckUpdates, false);
  assert.equal(next.fontSize, 20);
  assert.equal(current.theme, "system", "the current settings are not mutated");
  assert.throws(() => validateSettings({ fontSize: 3 }, current), {
    message: "Invalid setting: fontSize",
  });
  assert.throws(() => validateSettings({ autoCheckUpdates: "yes" }, current), {
    message: "Invalid setting: autoCheckUpdates",
  });
  assert.throws(() => validateSettings([], current), {
    message: "Settings must be a JSON object.",
  });
});

test("shortcuts convert to native accelerators or are rejected", () => {
  assert.equal(nativeAccelerator("Mod-Shift-a"), "Ctrl+Shift+A");
  assert.equal(nativeAccelerator("Alt-ArrowUp"), "Alt+Up");
  assert.equal(nativeAccelerator("Mod--"), "Ctrl+-");
  assert.equal(nativeAccelerator("Mod-Mod-a"), null);
  assert.equal(nativeAccelerator("Hyper-a"), null);
  assert.throws(
    () => validateSettings({ shortcuts: { bold: "Hyper-b" } }, defaults),
    /Invalid shortcut for bold/,
  );
});

function menu(options = {}) {
  const sent = [];
  const calls = [];
  const template = applicationMenu({
    locale: "en",
    shortcuts: {},
    sendCommand: (win, command) => sent.push([win, command]),
    newWindow: () => calls.push("newWindow"),
    quit: () => calls.push("quit"),
    ...options,
  });
  const items = template.flatMap((group) => group.submenu);
  return { template, items, sent, calls };
}

test("menu items send their command to the focused window", () => {
  const { items, sent } = menu();
  const check = items.find((item) => item.id === "checkUpdates");
  assert.equal(check.label, "Check for updates…");
  check.click(null, "window");
  check.click(null, null);
  assert.deepEqual(sent, [["window", "checkUpdates"]]);
  for (const id of ["new", "open", "save", "export", "settings", "about"])
    assert.ok(
      items.some((item) => item.id === id),
      `menu has ${id}`,
    );
});

test("new window and quit use the main-process callbacks", () => {
  const { items, calls } = menu();
  items.find((item) => item.label === "New window").click();
  items.find((item) => item.id === "quit").click();
  assert.deepEqual(calls, ["newWindow", "quit"]);
});

test("custom shortcuts replace accelerators and labels follow the language", () => {
  const { items, template } = menu({
    locale: "zh-CN",
    shortcuts: { save: "Mod-Alt-s", quit: "Mod-Shift-q" },
  });
  assert.equal(template[0].label, "文件");
  assert.equal(
    items.find((item) => item.id === "save").accelerator,
    "Ctrl+Alt+S",
  );
  assert.equal(
    items.find((item) => item.id === "quit").accelerator,
    "Ctrl+Shift+Q",
  );
  assert.equal(items.find((item) => item.id === "open").accelerator, "Ctrl+O");
});

test("the close button preference accepts ask, tray or quit", () => {
  assert.equal(defaults.closeAction, "ask");
  assert.equal(
    validateSettings({ closeAction: "tray" }, defaults).closeAction,
    "tray",
  );
  assert.throws(() => validateSettings({ closeAction: "hide" }, defaults), {
    message: "Invalid close action",
  });
});
