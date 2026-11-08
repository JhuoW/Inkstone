import test from "node:test";
import assert from "node:assert/strict";
import { normalizeShortcut, shortcutMatches } from "../src/shortcuts.js";

test("native shortcut aliases normalize to CodeMirror and DOM key names", () => {
  for (const [binding, normalized, key] of [
    ["Mod--", "Ctrl--", "-"],
    ["Mod-Minus", "Ctrl--", "-"],
    ["Mod-Plus", "Ctrl-+", "+"],
    ["mod-space", "Ctrl-Space", " "],
    ["Mod-Return", "Ctrl-Enter", "Enter"],
    ["Mod-Esc", "Ctrl-Escape", "Escape"],
    ["ctrl-arrowleft", "Ctrl-ArrowLeft", "ArrowLeft"],
    ["mod-f24", "Ctrl-F24", "F24"],
    [" Mod-B ", "Ctrl-b", "b"],
  ]) {
    assert.equal(normalizeShortcut(binding), normalized, binding);
    assert.equal(
      shortcutMatches({ key, ctrlKey: true }, binding),
      true,
      binding,
    );
  }
});

test("shortcut matching retains explicit modifiers and handles shifted plus", () => {
  assert.equal(
    shortcutMatches({ key: "+", ctrlKey: true, shiftKey: true }, "Mod-Plus"),
    true,
  );
  assert.equal(shortcutMatches({ key: "+", ctrlKey: true }, "Mod-Plus"), true);
  assert.equal(
    shortcutMatches({ key: "+", ctrlKey: true }, "Mod-Shift-Plus"),
    false,
  );
  assert.equal(
    shortcutMatches({ key: "S", ctrlKey: true, shiftKey: true }, "Mod-Shift-s"),
    true,
  );
  assert.equal(
    shortcutMatches({ key: "S", ctrlKey: true, shiftKey: true }, "Mod-s"),
    false,
  );
  assert.equal(
    shortcutMatches({ key: "s", ctrlKey: true, altKey: true }, "Mod-s"),
    false,
  );
  assert.equal(shortcutMatches({ key: "s", metaKey: true }, "Mod-s"), false);
  assert.equal(shortcutMatches({ key: "s", metaKey: true }, "Meta-s"), true);
  assert.equal(
    shortcutMatches({ key: "s", ctrlKey: true, isComposing: true }, "Mod-s"),
    false,
  );
});

test("unsupported shortcut names and duplicate modifiers are ignored safely", () => {
  for (const binding of [
    null,
    {},
    "",
    " ",
    "Mod-NotAKey",
    "Mod-Ctrl-s",
    "Mod-Shift-Shift-s",
    "Mod-F25",
    "Ctrl-",
    "Hyper-s",
    "Mod-constructor",
    "constructor-s",
  ]) {
    assert.equal(normalizeShortcut(binding), null);
    assert.equal(shortcutMatches({ key: "s", ctrlKey: true }, binding), false);
  }
});
