import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";

register(
  "data:text/javascript," +
    encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  }
`),
  import.meta.url,
);
const dom = new JSDOM("<!doctype html><html lang='en'><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
if (!dom.window.HTMLDialogElement.prototype.showModal)
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
if (!dom.window.HTMLDialogElement.prototype.close)
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  };
const { showAbout } = await import("../src/about-dialog.js");
const licenseText =
  "GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3\n\nLiteral <license> text & exact trailing newline.\n";
const info = {
  version: "9.8.7-test",
  licenseText,
  contributors: ["First author", "中文贡献者"],
  copyright: "© Example contributors",
};
let calls;
const invoke = async (method, payload) => {
  calls.push({ method, payload });
  return true;
};
test.beforeEach(() => {
  document.body.innerHTML =
    '<button id="launcher">Open About</button><textarea id="document">Unchanged Markdown</textarea>';
  document.documentElement.lang = "en";
  document.querySelector("#launcher").focus();
  calls = [];
});
test.afterEach(() => document.querySelector("[data-about-close]")?.click());
test.after(() => dom.window.close());

test("About uses runtime version, project identity and accessible modal labels", () => {
  const dialog = showAbout(info, invoke);
  assert.equal(
    dialog.el.querySelector("[data-about-description]").textContent,
    "A place for your thoughts",
  );
  assert.equal(
    dialog.el.querySelector("[data-about-version]").textContent,
    info.version,
  );
  assert.match(
    dialog.el.querySelector(".about-product").textContent,
    /Inkstone\s+墨石/,
  );
  assert.equal(
    dialog.el.querySelector(".about-license-badge").textContent,
    "AGPL-3.0",
  );
  assert.equal(
    dialog.el.querySelector("[data-about-copyright]").textContent,
    info.copyright,
  );
  assert.equal(
    dialog.el.querySelector("[data-about-contributors]").textContent,
    "First author · 中文贡献者",
  );
  assert.equal(dialog.el.getAttribute("aria-modal"), "true");
  assert.equal(
    document.getElementById(dialog.el.getAttribute("aria-labelledby"))
      .textContent,
    "About Inkstone",
  );
  assert.ok(
    document.getElementById(dialog.el.getAttribute("aria-describedby")),
  );
  assert.equal(
    document.activeElement,
    dialog.el.querySelector("[data-about-close]"),
  );
});

test("bundled license opens offline as literal exact text and Back restores focus", () => {
  const dialog = showAbout(info, invoke);
  dialog.el.querySelector("[data-about-view-license]").click();
  const region = dialog.el.querySelector("[data-about-license-text]");
  assert.equal(region.textContent, licenseText);
  assert.equal(region.querySelector("license"), null);
  assert.equal(region.getAttribute("role"), "region");
  assert.equal(dialog.el.querySelector("[data-about-overview]").hidden, true);
  assert.equal(
    dialog.el.querySelector("[data-about-license-view]").hidden,
    false,
  );
  assert.equal(document.activeElement, region);
  assert.deepEqual(calls, []);
  dialog.el.querySelector("[data-about-back]").click();
  assert.equal(
    dialog.el.querySelector("[data-about-license-view]").hidden,
    true,
  );
  assert.equal(
    document.activeElement,
    dialog.el.querySelector("[data-about-view-license]"),
  );
});

test("project, Wei Zhuo homepage and official AGPL links use their fixed external destinations", async () => {
  const dialog = showAbout(
    {
      ...info,
      contributors: ["Wei Zhuo"],
      repository: "https://github.com/OpenMathpix/example",
      contributorURL: "javascript:wrong()",
    },
    invoke,
  );
  dialog.el.querySelector("[data-about-source]").click();
  assert.equal(
    dialog.el.querySelector("[data-about-contributor]").textContent,
    "Wei Zhuo",
  );
  assert.equal(
    dialog.el.querySelector("[data-about-contributor]").getAttribute("href"),
    "https://wei2hu0.github.io/",
  );
  dialog.el.querySelector("[data-about-contributor]").click();
  dialog.el.querySelector("[data-about-view-license]").click();
  dialog.el.querySelector("[data-about-license-link]").click();
  await Promise.resolve();
  assert.deepEqual(calls, [
    {
      method: "openExternal",
      payload: { url: "https://github.com/JhuoW/Inkstone" },
    },
    {
      method: "openExternal",
      payload: { url: "https://wei2hu0.github.io/" },
    },
    {
      method: "openExternal",
      payload: { url: "https://www.gnu.org/licenses/agpl-3.0.html" },
    },
  ]);
});

test("Chinese labels are consistent even when locale is supplied explicitly", () => {
  const dialog = showAbout(info, invoke, { locale: "zh-CN" });
  assert.equal(
    dialog.el.querySelector("[data-about-description]").textContent,
    "让想法落在纸上",
  );
  assert.equal(
    dialog.el.querySelector("header h2").textContent,
    "关于 Inkstone",
  );
  assert.equal(
    dialog.el.querySelector("header .close").getAttribute("aria-label"),
    "关闭",
  );
  assert.equal(
    dialog.el.querySelector("[data-about-view-license]").textContent,
    "查看许可证",
  );
  assert.equal(
    dialog.el.querySelector("[data-about-close]").textContent,
    "关闭",
  );
  dialog.el.querySelector("[data-about-view-license]").click();
  assert.equal(
    dialog.el
      .querySelector("[data-about-license-text]")
      .getAttribute("aria-label"),
    "许可证全文",
  );
});

test("closing and Escape restore writing focus without changing document text or selection", () => {
  const editor = document.querySelector("#document");
  for (const escape of [false, true]) {
    editor.focus();
    editor.setSelectionRange(3, 8);
    const dialog = showAbout(info, invoke);
    if (escape)
      dialog.el.dispatchEvent(
        new dom.window.Event("cancel", { cancelable: true }),
      );
    else dialog.el.querySelector("[data-about-close]").click();
    assert.equal(dialog.el.isConnected, false);
    assert.equal(document.activeElement, editor);
    assert.equal(editor.value, "Unchanged Markdown");
    assert.deepEqual([editor.selectionStart, editor.selectionEnd], [3, 8]);
  }
});

test("repeated About requests focus the existing dialog instead of stacking copies", () => {
  const first = showAbout(info, invoke);
  assert.equal(showAbout(info, invoke), first);
  assert.equal(document.querySelectorAll(".about-dialog").length, 1);
});

test("runtime strings are escaped and missing bundled metadata has an explicit state", () => {
  const dialog = showAbout(
    { version: '<img src="bad">', contributors: ["<script>bad</script>"] },
    invoke,
  );
  assert.equal(
    dialog.el.querySelector("[data-about-version]").textContent,
    '<img src="bad">',
  );
  assert.equal(dialog.el.querySelector("script,img[src=bad]"), null);
  assert.equal(
    dialog.el.querySelector("[data-about-view-license]").disabled,
    true,
  );
  assert.equal(dialog.el.querySelector("[data-about-message]").hidden, false);
  assert.match(
    dialog.el.querySelector("[data-about-message]").textContent,
    /bundled license text is unavailable/,
  );
});

test("external-link failures keep the dialog open and announce a useful retry message", async () => {
  const dialog = showAbout(info, async () => {
    throw Error("IPC details should not leak");
  });
  dialog.el.querySelector("[data-about-source]").click();
  await Promise.resolve();
  assert.equal(dialog.el.isConnected, true);
  const message = dialog.el.querySelector("[data-about-message]");
  assert.equal(message.hidden, false);
  assert.equal(message.getAttribute("aria-live"), "polite");
  assert.equal(message.textContent, "The link could not be opened. Try again.");
});
