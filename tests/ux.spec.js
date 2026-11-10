import { artifactPath } from "../scripts/artifact-path.mjs";
import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveSystemLanguage } from "../electron/language.cjs";

let app, page, temp, file, profile;
const original = "# Writing\r\n\r\nOriginal **words**.\r\n";
async function launch({
  named = true,
  preferences = { locale: "en", firstRunComplete: true, autoSave: false },
  reuse = false,
} = {}) {
  if (!reuse) {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-ux-"));
    profile = path.join(temp, "profile");
    file = path.join(temp, "Writing 中文.md");
    await fs.writeFile(file, original);
    await fs.mkdir(profile);
    if (preferences)
      await fs.writeFile(
        path.join(profile, "settings.json"),
        JSON.stringify(preferences),
      );
  }
  const env = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":91",
    INKSTONE_USER_DATA: profile,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
    args: [process.cwd(), ...(named ? [file] : [])],
    env,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.__inkstone?.editor);
  if (named)
    await expect(page.locator("#document-title")).toHaveText(
      path.basename(file),
    );
  await waitEditable();
  return page;
}
async function append(text, target = page) {
  await target.evaluate((text) => {
    const editor = __inkstone.editor;
    editor.setSelection({
      anchor: editor.view.state.doc.length,
      head: editor.view.state.doc.length,
    });
    editor.insert(text);
  }, text);
}
async function nativeClose(target = page) {
  const id = await (await app.browserWindow(target)).evaluate((win) => win.id);
  await app.evaluate(
    ({ BrowserWindow }, id) => BrowserWindow.fromId(id).close(),
    id,
  );
}
function choice(label, target = page) {
  return target
    .getByRole("dialog")
    .getByRole("button", { name: label, exact: true });
}
async function waitEditable(target = page) {
  await expect(target.getByRole("dialog")).toHaveCount(0);
  await target.waitForFunction(() => !__inkstone.editor.view.state.readOnly);
}
test.afterEach(async () => {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    app = null;
  }
});

test("startup folder scanning keeps the welcome editor locked until the initial document is loaded", async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-startup-ux-"));
  profile = path.join(temp, "profile");
  file = path.join(temp, "Initial.md");
  await fs.mkdir(profile);
  await fs.writeFile(file, original);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({ locale: "en", firstRunComplete: true, autoSave: false }),
  );
  await fs.writeFile(
    path.join(profile, "session.json"),
    JSON.stringify({ folder: temp, path: file }),
  );
  const hook = path.join(temp, "delay-startup-folder.cjs");
  await fs.writeFile(
    hook,
    `
const {ipcMain} = require('electron');
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, channel !== 'inkstone:invoke' ? listener : async (event, method, payload) => {
  if (method === 'listFiles' && !global.uxStartupScan) { global.uxStartupScan = true; await new Promise(resolve => { global.uxReleaseStartup = resolve; }); }
  return listener(event, method, payload);
});
process.argv = [process.argv[0], ${JSON.stringify(process.cwd())}, ${JSON.stringify(file)}];
require(${JSON.stringify(path.resolve("electron/main.cjs"))});
`,
  );
  const env = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":91",
    INKSTONE_USER_DATA: profile,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
    args: [hook],
    env,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.__inkstone?.editor);
  await expect.poll(() => app.evaluate(() => global.uxStartupScan)).toBe(true);
  await expect(page.locator("#save-state")).toHaveText("Opening…");
  expect(await page.evaluate(() => __inkstone.editor.view.state.readOnly)).toBe(
    true,
  );
  const welcome = await page.evaluate(() => __inkstone.getDocument().text);
  await page.evaluate(() => __inkstone.editor.focus());
  await page.keyboard.insertText("must not enter a loading document");
  await page.evaluate(() => __inkstone.execute("new"));
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    welcome,
  );
  await app.evaluate(() => global.uxReleaseStartup());
  await expect(page.locator("#document-title")).toHaveText("Initial.md");
  await waitEditable();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original,
  );
  expect(await fs.readFile(file, "utf8")).toBe(original);
});

test("late clipboard images cannot edit an approved window and commit rejects any later unexpected edit", async () => {
  await launch();
  const secondFile = path.join(temp, "Second.md");
  await fs.writeFile(secondFile, "Second original\n");
  const opened = app.waitForEvent("window");
  await page.evaluate(
    (path) => __inkstone.invoke("newWindow", { path }),
    secondFile,
  );
  const second = await opened;
  await second.waitForFunction(() =>
    window.__inkstone?.getDocument().path?.endsWith("Second.md"),
  );
  await waitEditable(second);
  await append("Pending second edits", second);
  await app.evaluate(({ ipcMain }) => {
    const handle = ipcMain._invokeHandlers.get("inkstone:invoke");
    ipcMain.removeHandler("inkstone:invoke");
    ipcMain.handle("inkstone:invoke", async (event, method, payload) => {
      const result = await handle(event, method, payload);
      if (method === "insertImages") {
        global.uxImagesPending = true;
        await new Promise((resolve) => {
          global.uxReleaseImages = resolve;
        });
      }
      return result;
    });
  });
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
        ],
        "delayed.svg",
        { type: "image/svg+xml" },
      ),
    );
    __inkstone.editor.view.contentDOM.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect
    .poll(() => app.evaluate(() => global.uxImagesPending))
    .toBe(true);
  await page.evaluate(() => __inkstone.execute("quit"));
  await expect(choice("Cancel", second)).toBeVisible();
  expect(await page.evaluate(() => __inkstone.editor.view.state.readOnly)).toBe(
    true,
  );
  await app.evaluate(() => global.uxReleaseImages());
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original,
  );
  await choice("Cancel", second).click();
  await waitEditable();
  await waitEditable(second);
  expect(
    (await fs.readdir(path.join(temp, "assets"))).some((name) =>
      name.endsWith(".svg"),
    ),
  ).toBe(true);
  await page.evaluate(() => __inkstone.execute("quit"));
  await expect(choice("Don't Save", second)).toBeVisible();
  // Simulate a future callback bypassing the read-only UI. The final close
  // snapshot is an independent safety check against such programming errors.
  await page.evaluate(() =>
    __inkstone.editor.view.dispatch({
      changes: { from: 0, insert: "Unexpected late edit\n" },
    }),
  );
  await choice("Don't Save", second).click();
  await waitEditable();
  await waitEditable(second);
  expect(app.windows()).toHaveLength(2);
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
    "Unexpected late edit",
  );
  expect(await fs.readFile(file, "utf8")).toBe(original);
});

test("native close offers exactly Save / Don't Save / Cancel, saves current file, and Enter activates Save", async () => {
  await launch();
  await append("Saved now.");
  await nativeClose();
  await expect(choice("Save")).toBeVisible();
  await expect(choice("Don't Save")).toBeVisible();
  await expect(choice("Cancel")).toBeVisible();
  await expect(choice("Save")).toBeFocused();
  const closed = page.waitForEvent("close");
  await page.keyboard.press("Enter");
  await closed;
  expect(await fs.readFile(file, "utf8")).toBe(original + "Saved now.");
});

test("untitled Save As cancellation and write errors keep text editable; a successful retry saves before closing", async () => {
  await launch({ named: false });
  await page.evaluate(() => __inkstone.execute("new"));
  const text = "# Unsaved 中文\n\nDo not lose this.";
  await append(text);
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true });
  });
  await nativeClose();
  await choice("Save").click();
  await waitEditable();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(text);
  expect(await page.evaluate(() => __inkstone.getDocument().dirty)).toBe(true);
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => {
      throw Error("Simulated disk error");
    };
  });
  await nativeClose();
  await choice("Save").click();
  await waitEditable();
  await expect(page.locator("#toast")).toContainText("Simulated disk error");
  const destination = path.join(temp, "Saved document 中文.md");
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: destination,
    });
  }, destination);
  await nativeClose();
  const closed = page.waitForEvent("close");
  await choice("Save").click();
  await closed;
  expect(await fs.readFile(destination, "utf8")).toBe(text);
});

test("Don't Save discards document recovery drafts, preserves disk bytes, and does not resurrect changes on restart", async () => {
  await launch();
  await append("This must be discarded.");
  await page.evaluate(() =>
    __inkstone.invoke("saveRecovery", {
      id: "older-same-document",
      ...__inkstone.getDocument(),
    }),
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => __inkstone.invoke("bootstrap"))).recovery
          .length,
    )
    .toBeGreaterThan(0);
  await nativeClose();
  const closed = page.waitForEvent("close");
  await choice("Don't Save").click();
  await closed;
  expect(await fs.readFile(file, "utf8")).toBe(original);
  await app.close().catch(() => {});
  await launch({ reuse: true });
  const boot = await page.evaluate(() => __inkstone.invoke("bootstrap"));
  expect(boot.recovery.filter((item) => item.path === file)).toEqual([]);
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original,
  );
});

test("Cancel, Escape and repeated close requests preserve edits, restore typing, and clean windows close without a prompt", async () => {
  await launch();
  await append("Keep editing.");
  await nativeClose();
  await nativeClose();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await choice("Cancel").click();
  await waitEditable();
  await append(" More.");
  await page.evaluate(() => __inkstone.execute("quit"));
  await expect(choice("Save")).toBeVisible();
  await page.keyboard.press("Escape");
  await waitEditable();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original + "Keep editing. More.",
  );
  await page.evaluate(() => __inkstone.execute("save"));
  const closed = page.waitForEvent("close");
  await nativeClose();
  await closed;
  expect(await fs.readFile(file, "utf8")).toBe(
    original + "Keep editing. More.",
  );
});

test("multi-window Quit is atomic on Cancel; Save and Don't Save commit only after every window agrees", async () => {
  await launch();
  await append("First window.");
  const otherFile = path.join(temp, "Second.md");
  await fs.writeFile(otherFile, "Second original\n");
  const nextWindow = app.waitForEvent("window");
  await page.evaluate(
    (file) => __inkstone.invoke("newWindow", { path: file }),
    otherFile,
  );
  const second = await nextWindow;
  await second.waitForFunction(() =>
    window.__inkstone?.getDocument().path?.endsWith("Second.md"),
  );
  await waitEditable(second);
  await append("Second window.", second);
  // Two unsaved documents: the native summary box offers Review Each…, which
  // keeps the per-window prompts this test covers.
  await app.evaluate(({ dialog }) => {
    globalThis.uxSummaries = [];
    dialog.showMessageBox = async (...args) => {
      globalThis.uxSummaries.push(args.at(-1).message);
      return { response: 1 };
    };
  });
  await page.evaluate(() => __inkstone.execute("quit"));
  await choice("Don't Save").click();
  await choice("Cancel", second).click();
  await waitEditable();
  await waitEditable(second);
  expect(app.windows()).toHaveLength(2);
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
    "First window.",
  );
  expect(await second.evaluate(() => __inkstone.getDocument().text)).toContain(
    "Second window.",
  );
  expect(await fs.readFile(file, "utf8")).toBe(original);
  await page.evaluate(() => __inkstone.execute("quit"));
  await choice("Save").click();
  expect(await app.evaluate(() => globalThis.uxSummaries)).toEqual([
    "2 documents have unsaved changes.",
    "2 documents have unsaved changes.",
  ]);
  const firstClosed = page.waitForEvent("close"),
    secondClosed = second.waitForEvent("close");
  await choice("Don't Save", second).click();
  await Promise.all([firstClosed, secondClosed]);
  expect(await fs.readFile(file, "utf8")).toBe(original + "First window.");
  expect(await fs.readFile(otherFile, "utf8")).toBe("Second original\n");
});

test("closing during an in-flight save preserves later edits until the user decides what to discard", async () => {
  await launch();
  await app.evaluate(({ ipcMain }) => {
    const handle = ipcMain._invokeHandlers.get("inkstone:invoke");
    ipcMain.removeHandler("inkstone:invoke");
    ipcMain.handle("inkstone:invoke", async (event, method, payload) => {
      if (method === "saveFile") {
        globalThis.uxSaveStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      return handle(event, method, payload);
    });
  });
  await append("Snapshot A.");
  await page.evaluate(() => {
    window.uxPendingSave = __inkstone.execute("save");
  });
  await expect
    .poll(() => app.evaluate(() => globalThis.uxSaveStarted))
    .toBe(true);
  await append(" Unsaved B.");
  await nativeClose();
  await expect(choice("Don't Save")).toBeVisible();
  const closed = page.waitForEvent("close");
  await choice("Don't Save").click();
  await closed;
  expect(await fs.readFile(file, "utf8")).toBe(original + "Snapshot A.");
});

test("fresh profiles follow the system language; first-run and preferences switch all UI while preserving text, selection and undo", async () => {
  await launch({ named: false, preferences: null });
  const systemLocale = await resolveSystemLanguage(
    await app.evaluate(({ app }) => app.getPreferredSystemLanguages()),
  );
  await expect(page.locator("html")).toHaveAttribute("lang", systemLocale);
  await expect(page.locator("#welcome-language")).toHaveValue(systemLocale);
  expect(await page.evaluate(() => __inkstone.editor.getText())).toContain(
    systemLocale === "zh-CN"
      ? "写下值得留下的想法"
      : "A place for your thoughts",
  );
  await page.locator("#welcome-language").selectOption("zh-CN");
  await page.locator("#welcome-continue").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("#language-onboarding")).toBeHidden();
  await page.evaluate(() => __inkstone.execute("new"));
  await append("中文与 English\n");
  await page.evaluate(() =>
    __inkstone.editor.setSelection({ anchor: 1, head: 4 }),
  );
  const before = await page.evaluate(() => ({
    text: __inkstone.editor.getText(),
    selection: __inkstone.editor.getSelection(),
  }));
  await page.evaluate(() => __inkstone.execute("settings"));
  await page.locator('select[name="locale"]').selectOption("en");
  await expect(page.getByRole("dialog").locator("h2")).toHaveText(
    "Preferences",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.locator('#app button[data-command="bold"]').first(),
  ).toHaveAttribute("aria-label", "Bold");
  expect(
    await page.evaluate(() => ({
      text: __inkstone.editor.getText(),
      selection: __inkstone.editor.getSelection(),
    })),
  ).toEqual(before);
  await page.locator("#settings-done").click();
  await page.evaluate(() => __inkstone.editor.command("undo"));
  expect(await page.evaluate(() => __inkstone.editor.getText())).toBe("");
  await page.evaluate(() => __inkstone.editor.command("redo"));
  expect(await page.evaluate(() => __inkstone.editor.getText())).toBe(
    before.text,
  );
  expect(
    JSON.parse(await fs.readFile(path.join(profile, "settings.json"), "utf8"))
      .locale,
  ).toBe("en");
  await fs.mkdir(artifactPath("ux-validation"), { recursive: true });
  await page.screenshot({
    path: artifactPath("ux-validation", "english-desktop.png"),
  });
});

test("typing during an asynchronous external reload is preserved and becomes a visible conflict", async () => {
  await launch();
  await app.evaluate(({ ipcMain }) => {
    const handle = ipcMain._invokeHandlers.get("inkstone:invoke");
    ipcMain.removeHandler("inkstone:invoke");
    ipcMain.handle("inkstone:invoke", async (event, method, payload) => {
      const result = await handle(event, method, payload);
      if (method === "openFile") {
        globalThis.uxReadStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return result;
    });
  });
  await fs.writeFile(file, "# External update\n");
  await expect
    .poll(() => app.evaluate(() => globalThis.uxReadStarted))
    .toBe(true);
  await append("Keep this keystroke.");
  await expect(page.locator("#conflict-banner")).toBeVisible();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original + "Keep this keystroke.",
  );
  await nativeClose();
  await choice("Save").click();
  await waitEditable();
  expect(await fs.readFile(file, "utf8")).toBe("# External update\n");
  expect(await page.evaluate(() => __inkstone.getDocument().dirty)).toBe(true);
});

test("canceling Open never discards a draft; pending navigation locks editing and unlocks after loading", async () => {
  await launch();
  await append("Preserve draft.");
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await page.evaluate(() => __inkstone.execute("open"));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original + "Preserve draft.",
  );
  const other = path.join(temp, "Next.md");
  await fs.writeFile(other, "# Next\n");
  await app.evaluate(({ dialog, ipcMain }, other) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [other],
    });
    const handle = ipcMain._invokeHandlers.get("inkstone:invoke");
    ipcMain.removeHandler("inkstone:invoke");
    ipcMain.handle("inkstone:invoke", async (event, method, payload) => {
      if (method === "openFile") {
        globalThis.uxOpenStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return handle(event, method, payload);
    });
  }, other);
  await page.evaluate(() => {
    window.uxOpening = __inkstone.execute("open");
  });
  await choice("Don't Save").click();
  await expect
    .poll(() => app.evaluate(() => globalThis.uxOpenStarted))
    .toBe(true);
  expect(await page.evaluate(() => __inkstone.editor.view.state.readOnly)).toBe(
    true,
  );
  await append("Must not enter an outgoing document.");
  await page.evaluate(() => window.uxOpening);
  await waitEditable();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    "# Next\n",
  );
  await append("Can write now.");
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    "# Next\nCan write now.",
  );
});

test("desktop math edits stay inline, render in the sandbox, and survive Save and reopen with CRLF intact", async () => {
  await launch();
  const raw =
    "# Formula\r\n\r\nBefore $\\frac{x}{y}$ after.\r\n\r\n$$\r\na^2 + b^2\r\n$$\r\n\r\nEnd\r\n";
  await page.evaluate(
    (text) => __inkstone.loadDocument({ path: null, revision: null, text }),
    raw,
  );
  await page.evaluate(() => {
    __inkstone.editor.setSelection({
      anchor: __inkstone.editor.view.state.doc.length,
    });
    __inkstone.editor.focus();
  });
  const glyphPoint = await page
    .locator(".cm-live-block .math-inline")
    .evaluate((element) => {
      const walker = document.createTreeWalker(
        element.querySelector(".katex-html"),
        NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = node.textContent.indexOf("x");
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const box = range.getBoundingClientRect();
        if (box.width && box.height)
          return { x: box.left + box.width * 0.2, y: box.top + box.height / 2 };
      }
      throw Error("Fraction numerator glyph missing");
    });
  await page.mouse.click(glyphPoint.x, glyphPoint.y);
  expect(await page.evaluate(() => __inkstone.editor.getSelection().head)).toBe(
    raw.replaceAll("\r\n", "\n").indexOf("{x}") + 1,
  );
  await expect(page.locator(".cm-math-source")).toHaveText("$\\frac{x}{y}$");
  await page.keyboard.type("Q");
  await expect(page.locator(".cm-inline-math-preview")).toHaveCount(0);
  await expect(page.locator(".cm-math-source")).toHaveText("$\\frac{Qx}{y}$");
  await page.keyboard.press("Control+Enter");
  await expect(
    page.locator(".cm-math-source, .cm-inline-math-preview"),
  ).toHaveCount(0);
  await expect(page.locator(".cm-inline-math .katex")).toHaveCount(1);
  const modified = raw.replace("{x}", "{Qx}");
  expect(await page.evaluate(() => __inkstone.editor.getText())).toBe(modified);
  const destination = path.join(temp, "Math 中文.md");
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: destination,
    });
  }, destination);
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(destination, "utf8")).toBe(modified);
  await page.evaluate(() => __inkstone.execute("new"));
  await page.evaluate(
    async (path) =>
      __inkstone.loadDocument(await __inkstone.invoke("openFile", { path })),
    destination,
  );
  await page.evaluate(() =>
    __inkstone.editor.setSelection({
      anchor: __inkstone.editor.view.state.doc.length,
    }),
  );
  await expect(page.locator(".cm-live-block .katex")).toHaveCount(2);
  await page.locator(".cm-live-block .math-inline").dblclick();
  expect(
    await page.evaluate(() => {
      const { from, to } = __inkstone.editor.view.state.selection.main;
      return __inkstone.editor.view.state.sliceDoc(from, to);
    }),
  ).toBe("\\frac{Qx}{y}");
  await page.keyboard.type("z^2");
  await page.keyboard.press("Control+Enter");
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(destination, "utf8")).toBe(
    modified.replace("\\frac{Qx}{y}", "z^2"),
  );
});

test("native File Quit and Ctrl+W use the same cancelable save decision", async () => {
  await launch();
  await append("Native menu edits.");
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()
      .items.flatMap((m) => m.submenu?.items || [])
      .find((m) => m.label === "Quit");
    if (!item) throw Error("Missing native Quit menu");
    item.click();
  });
  await choice("Cancel").click();
  await waitEditable();
  await page.locator(".cm-content").focus();
  await page.keyboard.press("Control+w");
  await choice("Cancel").click();
  await waitEditable();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original + "Native menu edits.",
  );
});
