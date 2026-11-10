// Real Linux IBus/X11 input, isolated DBus session. See docs/ACCEPTANCE.md for prerequisites.
import { _electron as electron } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { artifactPath } from "../scripts/artifact-path.mjs";
import assert from "node:assert/strict";
const root = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-os-ime-"));
const output = artifactPath("os-ime-validation");
await fs.mkdir(output, { recursive: true });
const env = {
  ...process.env,
  DISPLAY: process.env.DISPLAY || ":92",
  INKSTONE_USER_DATA: path.join(temp, "profile"),
  GTK_IM_MODULE: "ibus",
  QT_IM_MODULE: "ibus",
  XMODIFIERS: "@im=ibus",
  XDG_CONFIG_HOME: path.join(temp, "config"),
  XDG_CACHE_HOME: path.join(temp, "cache"),
};
delete env.ELECTRON_RUN_AS_NODE;
env.IBUS_ADDRESS = "unix:path=" + path.join(temp, "ibus.socket");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const daemon = spawn(
  "ibus-daemon",
  [
    "--replace",
    "--xim",
    "--config=/usr/libexec/ibus-memconf",
    "--address=" + env.IBUS_ADDRESS,
    "--panel=/usr/libexec/ibus-ui-gtk3",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
let daemonLog = "";
daemon.stdout.on("data", (x) => (daemonLog += x));
daemon.stderr.on("data", (x) => (daemonLog += x));
let app;
const lifecycleChecks = [],
  browserErrors = [];
try {
  let engines;
  for (let i = 0; i < 150; i++) {
    try {
      engines = execFileSync("ibus", ["list-engine"], {
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (engines.includes("table:cangjie3")) break;
    } catch {}
    await pause(100);
  }
  assert.ok(
    engines?.includes("table:cangjie3"),
    "Requires the installed IBus Cangjie3 engine",
  );
  const file = path.join(temp, "真实输入法.md");
  await fs.writeFile(file, "# IBus 验收\n\n");
  await fs.mkdir(env.INKSTONE_USER_DATA, { recursive: true });
  await fs.writeFile(
    path.join(env.INKSTONE_USER_DATA, "settings.json"),
    // Closing exits as before; the tray choice dialog is native and would wait.
    JSON.stringify({
      locale: "en",
      firstRunComplete: true,
      closeAction: "quit",
    }),
  );
  app = await electron.launch({ args: ["--no-sandbox", root, file], env });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.waitForFunction(
    () =>
      window.__inkstone?.editor &&
      document.querySelector("#document-title")?.textContent ===
        "真实输入法.md",
  );
  await page.evaluate(async () => {
    await __inkstone.invoke("updateSettings", {
      autoSave: true,
      autoSaveDelay: 500,
    });
    window.imeEvents = [];
    for (const type of [
      "compositionstart",
      "compositionupdate",
      "compositionend",
      "beforeinput",
    ])
      document.addEventListener(
        type,
        (event) =>
          imeEvents.push({
            type,
            data: event.data,
            inputType: event.inputType,
            isComposing: event.isComposing,
          }),
        true,
      );
    const editor = __inkstone.editor;
    editor.setSelection({
      anchor: editor.view.state.doc.length,
      head: editor.view.state.doc.length,
    });
    editor.focus();
  });
  let xdotool = process.env.INKSTONE_XDOTOOL;
  if (!xdotool) {
    try {
      execFileSync("xdotool", ["--version"], { stdio: "ignore" });
      xdotool = "xdotool";
    } catch {
      xdotool = path.join(root, ".tools/ime/root/usr/bin/xdotool");
    }
  }
  const xenv = {
    ...env,
    LD_LIBRARY_PATH:
      path.join(root, ".tools/ime/root/usr/lib/x86_64-linux-gnu") +
      ":" +
      (env.LD_LIBRARY_PATH || ""),
  };
  const x = (...args) =>
    execFileSync(xdotool, args, { env: xenv, encoding: "utf8" });
  const win = x("search", "--name", "Inkstone").trim().split("\n").at(-1);
  x("windowfocus", "--sync", win);
  execFileSync("ibus", ["engine", "table:cangjie3"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await pause(500);
  x("type", "--clearmodifiers", "--delay", "90", "a");
  await pause(900);
  assert.equal(
    await fs.readFile(file, "utf8"),
    "# IBus 验收\n\n",
    "Autosave must not persist an uncommitted IME candidate",
  );
  await page.screenshot({ path: path.join(output, "preedit.png") });
  try {
    execFileSync(
      "python3",
      [
        "-c",
        'from PIL import ImageGrab; ImageGrab.grab(xdisplay="' +
          env.DISPLAY +
          '").save("' +
          path.join(output, "candidate-window.png") +
          '")',
      ],
      { env },
    );
  } catch {}
  x("key", "space");
  await pause(300);
  x("type", "--clearmodifiers", "--delay", "90", "b");
  x("key", "space");
  await pause(300);
  const result = await page.evaluate(() => ({
    text: __inkstone.editor.getText(),
    events: window.imeEvents,
  }));
  console.log(JSON.stringify(result));
  assert.ok(
    result.events.some((item) => item.type === "compositionstart"),
    "Real IBus must start browser composition",
  );
  assert.ok(
    result.events.some(
      (item) =>
        item.type === "compositionupdate" &&
        /[\p{Script=Han}]/u.test(item.data),
    ) && result.events.some((item) => item.type === "compositionend"),
    "Real IBus must deliver Chinese preedit and end composition",
  );
  assert.equal(result.text, "# IBus 验收\n\n日月");
  x("type", "--clearmodifiers", "--delay", "90", "a");
  await pause(200);
  x("key", "Escape");
  await pause(200);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    result.text,
    "Escape cancels real IME preedit",
  );
  x("key", "ctrl+z");
  await pause(150);
  const undone = await page.evaluate(() => __inkstone.editor.getText());
  assert.notEqual(undone, result.text);
  x("key", "ctrl+shift+z");
  await pause(150);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    result.text,
    "Redo restores IME input",
  );
  await page.evaluate(() => __inkstone.execute("source"));
  x("type", "--clearmodifiers", "--delay", "90", "a");
  x("key", "space");
  await pause(200);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    result.text + "日",
    "Real IME also commits in source mode",
  );
  await page.evaluate(() => __inkstone.execute("source"));
  await page.evaluate(() => {
    const e = __inkstone.editor,
      from = e.view.state.doc.toString().indexOf("日月日");
    e.setSelection({ anchor: from, head: from + 3 });
    e.focus();
  });
  x("type", "--clearmodifiers", "--delay", "90", "b");
  x("key", "space");
  await pause(200);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    "# IBus 验收\n\n月",
    "Real composition replaces selected Chinese text",
  );
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
    e.insert("\n\n| 候选 | 内容 |\n| --- | --- |\n| 原字 | 留白 |\n\n");
    e.setSelection({ anchor: 0, head: 0 });
  });
  await page.locator(".cm-live-block td").filter({ hasText: "原字" }).click();
  await page.locator(".inkstone-table-cell-editor").waitFor();
  x("key", "ctrl+a");
  x("type", "--clearmodifiers", "--delay", "90", "a");
  x("key", "space");
  await pause(200);
  assert.match(
    await page.evaluate(() => __inkstone.editor.getText()),
    /\| 日 \| 留白 \|/,
    "Real IBus edits one visual table cell",
  );
  x("key", "Escape");
  result.autosaveDefersComposition = true;
  result.selectionReplace = true;
  result.tableCell = true;
  result.text = await page.evaluate(() => __inkstone.editor.getText());
  result.events = await page.evaluate(() => window.imeEvents);
  result.escapeCancel = true;
  result.undoRedo = true;
  result.sourceMode = true;
  await page.evaluate(() => __inkstone.execute("save"));
  assert.equal(await fs.readFile(file, "utf8"), result.text);
  await page.screenshot({ path: path.join(output, "committed.png") });

  // These are real X11/IBus preedits, deliberately left uncommitted when the
  // application changes mode or starts its normal close/Save/Cancel handshake.
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { autoSave: false }),
  );
  async function preeditAtEnd(key) {
    const before = await page.evaluate(() => {
      const e = __inkstone.editor;
      e.setSelection({ anchor: e.view.state.doc.length });
      e.focus();
      return { text: e.getText(), events: window.imeEvents.length };
    });
    x("windowfocus", "--sync", win);
    x("type", "--clearmodifiers", "--delay", "90", key);
    await pause(250);
    assert.ok(
      await page.evaluate(
        (from) =>
          window.imeEvents
            .slice(from)
            .some((event) => event.type === "compositionstart"),
        before.events,
      ),
      "A real OS composition must be active before the lifecycle action",
    );
    return before.text;
  }
  const modeBefore = await preeditAtEnd("a");
  await page.evaluate(() => __inkstone.execute("source"));
  x("key", "space");
  await pause(200);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    modeBefore + "日",
    "Switching live to source during native composition must retain one committed Chinese character",
  );
  await preeditAtEnd("b");
  await page.evaluate(() => __inkstone.execute("source"));
  x("key", "space");
  await pause(200);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    modeBefore + "日月",
    "Switching source to live during native composition must retain one committed Chinese character",
  );
  lifecycleChecks.push({
    name: "Live/source switches during native Chinese preedit",
    passed: true,
  });
  await page.evaluate(() => __inkstone.execute("save"));
  const diskBeforeCancel = await fs.readFile(file, "utf8");
  const beforeCancel = await preeditAtEnd("a");
  await page.evaluate(() => __inkstone.execute("close"));
  await page.locator('dialog[open] [data-choice="2"]').waitFor();
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    beforeCancel + "日",
    "Close must finish real OS preedit before asking Save/Cancel",
  );
  await page.screenshot({ path: path.join(output, "close-cancel.png") });
  await page.locator('dialog[open] [data-choice="2"]').click();
  await page.waitForFunction(() => !__inkstone.editor.view.state.readOnly);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    beforeCancel + "日",
    "Cancel must keep the Chinese character committed by finishComposition",
  );
  assert.equal(
    await fs.readFile(file, "utf8"),
    diskBeforeCancel,
    "Cancel must not save or discard the draft",
  );
  x("type", "--clearmodifiers", "--delay", "90", "b");
  x("key", "space");
  await pause(200);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    beforeCancel + "日月",
    "Typing continues at the original caret after Cancel",
  );
  x("key", "ctrl+z");
  await pause(150);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    beforeCancel + "日",
  );
  x("key", "ctrl+shift+z");
  await pause(150);
  assert.equal(
    await page.evaluate(() => __inkstone.editor.getText()),
    beforeCancel + "日月",
  );
  lifecycleChecks.push({
    name: "Close during native preedit, Cancel, continue typing, undo/redo",
    passed: true,
  });
  await page.evaluate(() => __inkstone.execute("save"));

  await page.evaluate(() => __inkstone.editor.setSelection({ anchor: 0 }));
  await page.locator(".cm-live-block td").filter({ hasText: /^日$/ }).click();
  x("key", "ctrl+a");
  x("type", "--clearmodifiers", "--delay", "90", "b");
  await pause(250);
  await page.evaluate(() => __inkstone.execute("close"));
  await page.locator('dialog[open] [data-choice="2"]').waitFor();
  assert.match(
    await page.evaluate(() => __inkstone.editor.getText()),
    /\| 月 \| 留白 \|/,
    "Close must commit a real visual-cell IME preedit before locking the editor",
  );
  await page.locator('dialog[open] [data-choice="2"]').click();
  await page.waitForFunction(() => !__inkstone.editor.view.state.readOnly);
  assert.match(
    await page.evaluate(() => __inkstone.editor.getText()),
    /\| 月 \| 留白 \|/,
  );
  lifecycleChecks.push({
    name: "Visual table preedit commits before Close and survives Cancel",
    passed: true,
  });
  await page.evaluate(() => __inkstone.execute("save"));

  const beforeSaveClose = await preeditAtEnd("a");
  await page.evaluate(() => __inkstone.execute("close"));
  await page.locator('dialog[open] [data-choice="0"]').waitFor();
  result.text = await page.evaluate(() => __inkstone.editor.getText());
  result.events = await page.evaluate(() => window.imeEvents);
  assert.equal(result.text, beforeSaveClose + "日");
  await page.screenshot({ path: path.join(output, "close-save.png") });
  const closed = page.waitForEvent("close", { timeout: 15000 });
  await page.locator('dialog[open] [data-choice="0"]').click();
  await closed;
  assert.equal(
    await fs.readFile(file, "utf8"),
    result.text,
    "Save and Close must persist the final Chinese character exactly once",
  );
  lifecycleChecks.push({
    name: "Close during native preedit, Save, actual window closes with exact disk content",
    passed: true,
  });
  assert.deepEqual(browserErrors, []);
  await fs.copyFile(file, path.join(output, "saved-document.md"));
  await fs.writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        engine: "IBus table:cangjie3",
        input: "XTest through xdotool; no CDP composition injection",
        sandboxDisabled: true,
        display: env.DISPLAY,
        passed: true,
        version: JSON.parse(
          await fs.readFile(path.join(root, "package.json"), "utf8"),
        ).version,
        lifecycleChecks,
        browserErrors,
        ...result,
      },
      null,
      2,
    ),
  );
  await fs.rm(path.join(output, "failure.json"), { force: true });
} catch (error) {
  await fs.writeFile(
    path.join(output, "failure.json"),
    JSON.stringify(
      { error: error.stack, lifecycleChecks, browserErrors, temp },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
  daemon.kill();
  await fs.writeFile(path.join(output, "ibus.log"), daemonLog);
}
