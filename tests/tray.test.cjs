const test = require("node:test");
const assert = require("node:assert/strict");
const { createTray, trayMenu } = require("../electron/tray.cjs");
const {
  closeChoice,
  unsavedDocuments,
} = require("../electron/close-prompts.cjs");

const english = (en) => en;
const chinese = (_en, zh) => zh;

function fakes() {
  const calls = [];
  class Tray {
    constructor(image) {
      this.image = image;
      this.handlers = {};
      this.destroyed = false;
      Tray.created.push(this);
    }
    setToolTip(text) {
      this.tooltip = text;
    }
    on(event, handler) {
      this.handlers[event] = handler;
    }
    setContextMenu(menu) {
      this.menu = menu;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  Tray.created = [];
  const Menu = { buildFromTemplate: (template) => ({ template }) };
  const nativeImage = {
    createFromPath: (file) => ({
      resize: (size) => ({ file, ...size }),
    }),
  };
  const actions = {
    show: () => calls.push("show"),
    open: (file) => calls.push(["open", file]),
    quit: () => calls.push("quit"),
  };
  return { Tray, Menu, nativeImage, actions, calls };
}

test("the tray menu opens Inkstone, lists recent documents and exits", () => {
  const { actions, calls } = fakes();
  const menu = trayMenu({
    localize: english,
    recentFiles: ["/a/R&D.md", "/a/notes.md", "/b/notes.md"],
    actions,
  });
  assert.deepEqual(
    menu.map((item) => item.label || item.type),
    ["Open Inkstone", "Recent Documents", "separator", "Exit Inkstone"],
  );
  const recent = menu[1].submenu.map((item) => item.label);
  // "&" is not a mnemonic, and equal names show their folder.
  assert.deepEqual(recent, ["R&&D.md", "notes.md — a", "notes.md — b"]);
  menu[0].click();
  menu[1].submenu[2].click();
  menu[3].click();
  assert.deepEqual(calls, ["show", ["open", "/b/notes.md"], "quit"]);
  const empty = trayMenu({ localize: chinese, actions });
  assert.equal(empty[0].label, "打开 Inkstone");
  assert.equal(empty[1].enabled, false);
  assert.equal(empty.at(-1).label, "退出 Inkstone");
});

test("the tray icon is created once, restores on click and rebuilds its menu", () => {
  const { Tray, Menu, nativeImage, actions, calls } = fakes();
  let recent = [];
  const tray = createTray({
    Tray,
    Menu,
    nativeImage,
    icon: "C:/app/build/icon.ico",
    platform: "win32",
    localize: english,
    recentFiles: () => recent,
    actions,
  });
  assert.equal(tray.active, false);
  const icon = tray.show();
  assert.equal(tray.show(), icon);
  assert.equal(Tray.created.length, 1);
  assert.equal(icon.image, "C:/app/build/icon.ico");
  assert.equal(icon.tooltip, "Inkstone");
  icon.handlers.click();
  assert.deepEqual(calls, ["show"]);
  recent = ["/docs/plan.md"];
  tray.refresh();
  assert.equal(icon.menu.template[1].submenu[0].label, "plan.md");
  tray.destroy();
  assert.equal(icon.destroyed, true);
  assert.equal(tray.active, false);
  tray.refresh();
  // Linux gets a small PNG instead of the 1024-pixel source.
  const linux = createTray({
    Tray,
    Menu,
    nativeImage,
    icon: "/app/build/icon.png",
    platform: "linux",
    localize: english,
    actions,
  }).show();
  assert.deepEqual(linux.image, {
    file: "/app/build/icon.png",
    width: 32,
    height: 32,
    quality: "best",
  });
});

test("the close choice maps buttons and remembers only a real choice", () => {
  const prompt = closeChoice(english);
  assert.deepEqual(prompt.options.buttons, [
    "Minimize to Tray",
    "Exit Inkstone",
    "Cancel",
  ]);
  assert.equal(prompt.options.cancelId, 2);
  assert.equal(prompt.options.checkboxLabel, "Remember my choice");
  assert.deepEqual(prompt.decide({ response: 0, checkboxChecked: true }), {
    action: "tray",
    remember: true,
  });
  assert.deepEqual(prompt.decide({ response: 1, checkboxChecked: false }), {
    action: "quit",
    remember: false,
  });
  assert.deepEqual(prompt.decide({ response: 2, checkboxChecked: true }), {
    action: "cancel",
    remember: false,
  });
  assert.equal(closeChoice(chinese).options.buttons[0], "最小化到托盘");
});

test("several unsaved documents get one choice with their names", () => {
  const names = Array.from({ length: 12 }, (_, i) => `note ${i + 1}.md`);
  const prompt = unsavedDocuments(english, names);
  assert.equal(prompt.options.message, "12 documents have unsaved changes.");
  assert.match(prompt.options.detail, /• note 1\.md/);
  assert.match(prompt.options.detail, /…and 2 more/);
  assert.doesNotMatch(prompt.options.detail, /note 11\.md/);
  assert.deepEqual(prompt.options.buttons, [
    "Save All",
    "Review Each…",
    "Don't Save",
    "Cancel",
  ]);
  assert.deepEqual(
    [0, 1, 2, 3].map((response) => prompt.decide({ response })),
    ["save", "review", "discard", "cancel"],
  );
  assert.equal(
    unsavedDocuments(chinese, ["a.md", "b.md"]).options.message,
    "有 2 个文档包含未保存的修改。",
  );
});
