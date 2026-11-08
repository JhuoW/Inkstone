import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html lang='en'><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
  this.dispatchEvent(new dom.window.Event("close"));
};
const { offerDefaultApp } = await import("../src/default-app-dialog.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));
let calls, behavior;
const invoke = async (method) => {
  calls.push(method);
  return behavior(method);
};
test.beforeEach(() => {
  document.body.innerHTML =
    '<textarea id="writing">Keep my Markdown</textarea><div id="toast" hidden></div>';
  const writing = document.querySelector("#writing");
  writing.focus();
  writing.setSelectionRange(2, 7);
  calls = [];
  behavior = (method) =>
    method === "claimDefaultAppPrompt"
      ? { offered: true, currentDefault: { name: "Typora" } }
      : { opened: true };
});
test.afterEach(() => {
  document.querySelector(".default-app-dialog")?.close();
  document.querySelector("#toast .toast-dismiss")?.click();
});
test.after(() => dom.window.close());

test("a previously offered or unregistered app does not show setup again", async () => {
  behavior = () => ({ offered: false });
  assert.equal(await offerDefaultApp(invoke, "en"), null);
  assert.deepEqual(calls, ["claimDefaultAppPrompt"]);
  assert.equal(document.querySelector("dialog"), null);
});
test("Not now leaves the current default alone and restores writing selection", async () => {
  const dialog = await offerDefaultApp(invoke, "en");
  dialog.el.querySelector("[data-default-later]").click();
  assert.deepEqual(calls, ["claimDefaultAppPrompt"]);
  const writing = document.querySelector("#writing");
  assert.equal(document.activeElement, writing);
  assert.equal(writing.value, "Keep my Markdown");
  assert.deepEqual([writing.selectionStart, writing.selectionEnd], [2, 7]);
});
test("explicit Windows choice opens settings without claiming a default change", async () => {
  const dialog = await offerDefaultApp(invoke, "en");
  await dialog.el.querySelector("[data-default-open]").onclick();
  assert.deepEqual(calls, ["claimDefaultAppPrompt", "openDefaultApps"]);
  assert.equal(dialog.el.isConnected, false);
  assert.match(
    document.querySelector("#toast").textContent,
    /Choose Inkstone to confirm/,
  );
});
test("an unavailable settings action stays open with a recoverable error", async () => {
  behavior = (method) =>
    method === "claimDefaultAppPrompt" ? { offered: true } : { opened: false };
  const dialog = await offerDefaultApp(invoke, "zh-CN");
  const button = dialog.el.querySelector("[data-default-open]");
  await button.onclick();
  assert.equal(dialog.el.isConnected, true);
  assert.equal(button.disabled, false);
  assert.match(document.querySelector("#toast").textContent, /不可用/);
});
test("repeated clicks while Windows settings opens perform one request", async () => {
  let finish;
  behavior = (method) =>
    method === "claimDefaultAppPrompt"
      ? { offered: true }
      : new Promise((resolve) => {
          finish = resolve;
        });
  const dialog = await offerDefaultApp(invoke, "en");
  const button = dialog.el.querySelector("[data-default-open]");
  const pending = button.onclick();
  await tick();
  await button.onclick();
  assert.equal(
    calls.filter((method) => method === "openDefaultApps").length,
    1,
  );
  assert.equal(button.disabled, true);
  finish({ opened: true });
  await pending;
  assert.equal(dialog.el.isConnected, false);
});
test("current application labels remain literal and Escape declines safely", async () => {
  behavior = () => ({
    offered: true,
    currentDefault: { name: '<img src=x onerror="attack()">' },
  });
  const dialog = await offerDefaultApp(invoke, "en");
  assert.equal(dialog.el.querySelector("[onerror]"), null);
  assert.ok(dialog.el.textContent.includes("<img src=x"));
  dialog.el.dispatchEvent(new dom.window.Event("cancel", { cancelable: true }));
  assert.equal(dialog.el.isConnected, false);
  assert.deepEqual(calls, ["claimDefaultAppPrompt"]);
});
