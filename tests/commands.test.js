import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import {
  commandList,
  defaultShortcuts,
  builtInShortcuts,
} from "../src/commands.js";
import { normalizeShortcut } from "../src/shortcuts.js";

const { applicationMenu } = createRequire(import.meta.url)(
  "../electron/menu.cjs",
);

// Commands reach execute() in app.js, which falls back to editor.command() in
// editor.js. A command is handled when either switch has a case for it;
// headings and snippets are handled by their prefixes.
async function handledCommands() {
  const handled = new Set();
  for (const file of ["src/app.js", "src/editor.js"])
    for (const [, id] of (await fs.readFile(file, "utf8")).matchAll(
      /case "([A-Za-z][\w:-]*)":/g,
    ))
      handled.add(id);
  return handled;
}
const prefixed = (id) => /^heading[1-6]$/.test(id) || id.startsWith("snippet:");

test("every command in the palette has a handler", async () => {
  const handled = await handledCommands();
  const commands = commandList({ date: "{{date}}" }, (zh, en) => en);
  assert.ok(commands.length > 50);
  const missing = commands
    .map(({ id }) => id)
    .filter((id) => !prefixed(id) && !handled.has(id));
  assert.deepEqual(missing, []);
  assert.ok(commands.some(({ id }) => id === "snippet:date"));
});

test("every native menu command has a handler", async () => {
  const handled = await handledCommands();
  const template = applicationMenu({
    locale: "en",
    shortcuts: {},
    sendCommand() {},
    newWindow() {},
    quit() {},
  });
  const items = template.flatMap((group) => group.submenu);
  const commands = items
    .filter((item) => item.id && typeof item.click === "function")
    .map((item) => item.id)
    .filter((id) => id !== "quit");
  assert.ok(commands.length > 20);
  assert.deepEqual(
    commands.filter((id) => !prefixed(id) && !handled.has(id)),
    [],
  );
});

test("palette labels follow the translator and ids are unique", () => {
  const english = commandList({}, (zh, en) => en);
  const chinese = commandList({}, (zh) => zh);
  assert.equal(
    english.find(({ id }) => id === "checkUpdates").label,
    "Check for updates",
  );
  assert.equal(
    chinese.find(({ id }) => id === "checkUpdates").label,
    "检查更新",
  );
  assert.equal(new Set(english.map(({ id }) => id)).size, english.length);
});

test("default shortcuts do not collide with built-in ones for other commands", () => {
  const owners = new Map();
  for (const [id, binding] of Object.entries({
    ...builtInShortcuts,
    ...defaultShortcuts,
  })) {
    const key = normalizeShortcut(binding);
    assert.ok(key, `${id}: ${binding} is not a valid shortcut`);
    const owner = owners.get(key);
    assert.ok(!owner || owner === id, `${binding}: ${id} and ${owner}`);
    owners.set(key, id);
  }
});
