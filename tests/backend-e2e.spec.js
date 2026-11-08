import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import katex from "katex";
import http from "node:http";
import iconv from "iconv-lite";

test.describe("desktop persistence, resource and export integration", () => {
  test.describe.configure({ mode: "serial" });
  let application, page, directory, note, outputDir;
  const invoke = (method, payload = {}) =>
    page.evaluate(
      ({ method, payload }) => window.inkstone.invoke(method, payload),
      { method, payload },
    );
  test.beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-desktop-"));
    note = path.join(directory, "中文测试.md");
    outputDir = path.resolve("artifacts/backend-validation");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(note, "\ufeff# 中文文稿\r\n\r\n第一段。\r\n");
    await fs.writeFile(path.join(directory, "linked.md"), "# Linked\n");
    await fs.writeFile(path.join(directory, ".hidden.md"), "# Hidden\n");
    const environment = {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":91",
      INKSTONE_USER_DATA: path.join(directory, "profile"),
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    application = await electron.launch({
      args: ["--no-sandbox", "--disable-gpu", path.resolve("."), note],
      env: environment,
    });
    page = await application.firstWindow();
    await page.waitForFunction(() => !!window.inkstone);
    await invoke("updateSettings", { autoSave: false });
  });
  test.afterAll(async () => {
    if (application) await application.close();
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });
  test("native menus and file dialogs follow the persisted English or Chinese choice", async () => {
    const initial = await invoke("bootstrap");
    expect(initial.settings.locale).toBe("en");
    expect(initial.languageConfigured).toBe(false);
    const evidence = [];
    for (const locale of ["en", "zh-CN"]) {
      await invoke("updateSettings", { locale, firstRunComplete: true });
      const labels = await application.evaluate(({ Menu }) => {
        const flatten = (menu) =>
          menu.items.flatMap((item) => [
            item.label,
            ...(item.submenu ? flatten(item.submenu) : []),
          ]);
        return flatten(Menu.getApplicationMenu());
      });
      expect(labels).toContain(locale === "en" ? "Quit" : "退出");
      expect(labels).toContain(locale === "en" ? "Cut" : "剪切");
      expect(labels).toContain(
        locale === "en" ? "Paste as plain text" : "粘贴为纯文本",
      );
      await application.evaluate(({ dialog, Menu }) => {
        global.__nativeLanguage = {
          dialogs: [],
          context: [],
          open: dialog.showOpenDialog,
          save: dialog.showSaveDialog,
          message: dialog.showMessageBox,
          build: Menu.buildFromTemplate,
        };
        dialog.showOpenDialog = async (_window, options) => {
          global.__nativeLanguage.dialogs.push(options);
          return { canceled: true, filePaths: [] };
        };
        dialog.showSaveDialog = async (_window, options) => {
          global.__nativeLanguage.dialogs.push(options);
          return { canceled: true };
        };
        dialog.showMessageBox = async (options) => {
          global.__nativeLanguage.dialogs.push(options);
          return { response: 0 };
        };
        Menu.buildFromTemplate = (template) => ({
          popup() {
            global.__nativeLanguage.context = template
              .map((item) => item.label)
              .filter(Boolean);
          },
        });
        const tools = Menu.getApplicationMenu().items.at(-1).submenu;
        tools.items.at(-1).click();
      });
      try {
        expect(await invoke("openFile")).toBeNull();
        expect(await invoke("chooseFolder")).toBeNull();
        expect(await invoke("pickPath")).toBeNull();
        expect(
          await invoke("saveFile", {
            path: note,
            text: "unchanged",
            saveAs: true,
          }),
        ).toBeNull();
        expect(
          await invoke("exportFile", { html: "<p>test</p>", format: "html" }),
        ).toBeNull();
        expect(await invoke("insertImages", { documentPath: note })).toEqual(
          [],
        );
        await invoke("contextMenu");
        const captured = await application.evaluate(() => ({
          dialogs: global.__nativeLanguage.dialogs,
          context: global.__nativeLanguage.context,
        }));
        expect(captured.dialogs.map((item) => item.title)).toContain(
          locale === "en" ? "Save Markdown" : "保存文稿",
        );
        expect(captured.dialogs.map((item) => item.title)).toContain(
          locale === "en" ? "Open folder" : "打开文件夹",
        );
        expect(captured.context).toContain(locale === "en" ? "Bold" : "粗体");
        expect(captured.context).toContain(
          locale === "en" ? "Select all" : "全选",
        );
        expect(
          captured.dialogs.find(
            (item) =>
              item.title === (locale === "en" ? "Save Markdown" : "保存文稿"),
          ).buttonLabel,
        ).toBe(locale === "en" ? "Save" : "保存");
        if (locale === "en")
          expect(
            JSON.stringify({
              context: captured.context,
              dialogs: captured.dialogs.map(
                ({ title, buttonLabel, message, detail, filters }) => ({
                  title,
                  buttonLabel,
                  message,
                  detail,
                  filters,
                }),
              ),
            }),
          ).not.toMatch(/[\u3400-\u9fff]/);
        else expect(captured.context).not.toContain("Bold / 粗体");
        evidence.push({ locale, labels, ...captured });
      } finally {
        await application.evaluate(({ dialog, Menu }) => {
          dialog.showOpenDialog = global.__nativeLanguage.open;
          dialog.showSaveDialog = global.__nativeLanguage.save;
          dialog.showMessageBox = global.__nativeLanguage.message;
          Menu.buildFromTemplate = global.__nativeLanguage.build;
          delete global.__nativeLanguage;
        });
      }
    }
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(directory, "profile/settings.json"),
          "utf8",
        ),
      ).locale,
    ).toBe("zh-CN");
    expect((await invoke("bootstrap")).languageConfigured).toBe(true);
    await invoke("updateSettings", { locale: "en" });
    await fs.writeFile(
      path.join(outputDir, "native-language-validation.json"),
      JSON.stringify(evidence, null, 2),
    );
  });
  test("discarding one document's recoveries excludes other live windows and rejects late resurrection", async () => {
    const opened = application.waitForEvent("window");
    await invoke("newWindow", { path: note });
    const other = await opened;
    await other.waitForFunction(() => window.__inkstone?.getDocument().path);
    await invoke("saveRecovery", {
      id: "discard-current-window",
      path: note,
      text: "first window edits",
    });
    await other.evaluate(
      (path) =>
        window.inkstone.invoke("saveRecovery", {
          id: "preserve-second-window",
          path,
          text: "independent second window edits",
        }),
      note,
    );
    const discarded = await invoke("discardRecovery", {
      id: "discard-current-window",
      path: note,
    });
    expect(discarded.discarded).toContain("discard-current-window");
    expect(discarded.discarded).not.toContain("preserve-second-window");
    await invoke("saveRecovery", {
      id: "discard-current-window",
      path: note,
      text: "late stale response",
    });
    const liveBoot = await invoke("bootstrap");
    const drafts = liveBoot.recovery;
    expect(drafts.some((item) => item.id === "discard-current-window")).toBe(
      false,
    );
    expect(
      drafts.find((item) => item.id === "preserve-second-window").text,
    ).toBe("independent second window edits");
    expect(
      liveBoot.recoverableAtStartup.some(
        (item) => item.id === "preserve-second-window",
      ),
    ).toBe(false);
    const closed = other.waitForEvent("close");
    await other.evaluate(() =>
      window.inkstone.invoke("windowAction", { action: "requestClose" }),
    );
    await closed;
    expect(application.windows()).toHaveLength(1);
    const orphanedBoot = await invoke("bootstrap");
    expect(
      orphanedBoot.recoverableAtStartup.find(
        (item) => item.id === "preserve-second-window",
      ).text,
    ).toBe("independent second window edits");
    expect(
      orphanedBoot.recovery.some(
        (item) => item.id === "preserve-second-window",
      ),
    ).toBe(true);
    await invoke("deleteRecovery", { id: "preserve-second-window" });
  });
  test("unready renderer close waits for an explicit native choice and blocks unchecked new windows", async () => {
    const profile = path.join(directory, "unready-renderer-profile");
    const source = path.join(directory, "unready-renderer.md");
    const original = "# Original remains on disk\n";
    await fs.mkdir(profile);
    await fs.writeFile(source, original);
    await fs.writeFile(
      path.join(profile, "settings.json"),
      JSON.stringify({ locale: "en", firstRunComplete: true, autoSave: false }),
    );
    const hook = path.join(directory, "unready-renderer.cjs");
    await fs.writeFile(
      hook,
      `
const {ipcMain, dialog} = require('electron');
const timeout = global.setTimeout;
global.setTimeout = (fn, delay, ...args) => timeout(fn, delay === 30000 ? 20 : delay, ...args);
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, channel !== 'inkstone:invoke' ? listener : (event, method, payload) => method === 'windowAction' && payload?.action === 'ready' ? true : listener(event, method, payload));
global.__fallbackDialogs = [];
dialog.showMessageBox = async (_window, options) => { global.__fallbackDialogs.push(options); return new Promise(resolve => { global.__resolveFallback = response => resolve({response}); }); };
process.argv = [process.argv[0], ${JSON.stringify(path.resolve("."))}, ${JSON.stringify(source)}];
require(${JSON.stringify(path.resolve("electron/main.cjs"))});
`,
    );
    const environment = {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":91",
      INKSTONE_USER_DATA: profile,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    const isolated = await electron.launch({
      args: ["--no-sandbox", "--disable-gpu", hook],
      env: environment,
    });
    try {
      const localPage = await isolated.firstWindow();
      await localPage.waitForFunction(
        (source) => window.__inkstone?.getDocument().path === source,
        source,
      );
      await localPage.evaluate(() => {
        window.__fallbackAborted = 0;
        window.inkstone.on("close-aborted", () => window.__fallbackAborted++);
        window.__inkstone.editor.view.dispatch({
          changes: { from: 0, insert: "Unsaved input\n" },
        });
      });
      await localPage.evaluate(
        (path) =>
          window.inkstone.invoke("saveRecovery", {
            id: "emergency-draft",
            path,
            text: "Unsaved input\n# Original remains on disk\n",
          }),
        source,
      );
      const nativeWindow = await isolated.browserWindow(localPage);
      await nativeWindow.evaluate((window) => window.close());
      await expect
        .poll(() => isolated.evaluate(() => global.__fallbackDialogs.length))
        .toBe(1);
      const first = await isolated.evaluate(() => global.__fallbackDialogs[0]);
      expect(first.buttons).toEqual(["Wait", "Close without saving", "Cancel"]);
      expect(first.defaultId).toBe(0);
      expect(first.cancelId).toBe(2);
      expect(first.detail).toContain("may lose unsaved edits");
      expect(localPage.isClosed()).toBe(false);
      await expect(
        localPage.evaluate(() => window.inkstone.invoke("newWindow")),
      ).rejects.toThrow(/CLOSE/);
      await isolated.evaluate(() => global.__resolveFallback(2));
      await localPage.waitForFunction(() => window.__fallbackAborted === 1);
      expect(
        await localPage.evaluate(() => window.__inkstone.getDocument().text),
      ).toBe("Unsaved input\n" + original);
      await nativeWindow.evaluate((window) => window.close());
      await expect
        .poll(() => isolated.evaluate(() => global.__fallbackDialogs.length))
        .toBe(2);
      const closed = localPage.waitForEvent("close");
      await isolated.evaluate(() => global.__resolveFallback(1));
      await closed;
      expect(await fs.readFile(source, "utf8")).toBe(original);
      expect(
        JSON.parse(
          await fs.readFile(
            path.join(profile, "recovery/emergency-draft.json"),
            "utf8",
          ),
        ).text,
      ).toBe("Unsaved input\n" + original);
      await fs.writeFile(
        path.join(outputDir, "native-unready-close-validation.json"),
        JSON.stringify(
          {
            dialog: first,
            canceledWindowPreserved: true,
            uncheckedNewWindowRejected: true,
            forcedCloseRequiredExplicitChoice: true,
            originalDiskPreserved: true,
            emergencyRecoveryPreserved: true,
          },
          null,
          2,
        ),
      );
    } finally {
      await isolated.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await isolated.close().catch(() => {});
    }
  });
  test("startup and new-window files load once and retain edits made before preferences finish", async () => {
    const profile = path.join(directory, "startup-race-profile");
    const first = path.join(directory, "startup-race.md");
    const second = path.join(directory, "new-window-race.md");
    const original = "# 启动文稿\n\n原始内容。\n";
    await fs.mkdir(profile);
    await fs.writeFile(
      path.join(profile, "settings.json"),
      JSON.stringify({ autoSave: false }),
    );
    await fs.writeFile(first, original);
    await fs.writeFile(second, original);
    const hook = path.join(directory, "delay-startup-responses.cjs");
    // Delay actual IPC responses after the disk read. A duplicate request would
    // retain a stale snapshot, exactly as a slow startup read can in production.
    // Hold the first recent-file update too, allowing a keystroke before the
    // asynchronous tail of loadDocument sets the native dirty flag.
    await fs.writeFile(
      hook,
      `
const { ipcMain } = require('electron');
const handle = ipcMain.handle.bind(ipcMain);
global.__startupTrace = [];
global.__startupPending = [];
const opens = new Map();
const preferences = new Set();
function hold(kind, id) {
  return new Promise(resolve => global.__startupPending.push({kind, id, resolve}));
}
global.__releaseStartup = (kind, id) => {
  for (const pending of global.__startupPending.filter(item => item.kind === kind && item.id === id)) {
    global.__startupPending.splice(global.__startupPending.indexOf(pending), 1);
    pending.resolve();
  }
};
ipcMain.handle = (channel, listener) => handle(channel, channel !== 'inkstone:invoke' ? listener : async (event, method, payload) => {
  const id = event.sender.id;
  let ordinal = 0;
  if (method === 'openFile') {
    ordinal = (opens.get(id) || 0) + 1;
    opens.set(id, ordinal);
    global.__startupTrace.push({id, method, ordinal, path: payload.path});
  }
  const result = await listener(event, method, payload);
  if (method === 'openFile') {
    if (ordinal === 1) await new Promise(resolve => setTimeout(resolve, 120));
    else await hold('duplicate-open', id);
  }
  if (method === 'updateSettings' && payload.recentFiles && !preferences.has(id)) {
    preferences.add(id);
    await hold('preferences', id);
  }
  global.__startupTrace.push({id, method, returned: true, dirty: payload?.dirty});
  return result;
});
process.argv = [process.argv[0], ${JSON.stringify(path.resolve("."))}, ${JSON.stringify(first)}];
require(${JSON.stringify(path.resolve("electron/main.cjs"))});
`,
    );
    const environment = {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":91",
      INKSTONE_USER_DATA: profile,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    const isolated = await electron.launch({
      args: ["--no-sandbox", "--disable-gpu", hook],
      env: environment,
    });
    const observations = [];
    try {
      const firstPage = await isolated.firstWindow();
      for (const [index, file] of [first, second].entries()) {
        let localPage = firstPage;
        if (index === 1) {
          const opened = isolated.waitForEvent("window");
          await firstPage.evaluate(
            (path) => window.inkstone.invoke("newWindow", { path }),
            file,
          );
          localPage = await opened;
        }
        const nativeWindow = await isolated.browserWindow(localPage);
        const id = await nativeWindow.evaluate(
          (window) => window.webContents.id,
        );
        await expect
          .poll(() =>
            isolated.evaluate(
              (_, id) =>
                global.__startupPending.some(
                  (item) => item.kind === "preferences" && item.id === id,
                ),
              id,
            ),
          )
          .toBe(true);
        await localPage.waitForFunction(
          (file) => window.__inkstone?.getDocument().path === file,
          file,
        );
        const insertion = `即时输入 ${index + 1}。\n`;
        await localPage.evaluate((insert) => {
          const editor = window.__inkstone.editor;
          editor.view.dispatch({ changes: { from: 0, insert } });
        }, insertion);
        expect(
          await localPage.evaluate(() => window.__inkstone.getDocument().dirty),
        ).toBe(true);
        await isolated.evaluate(
          (_, id) => global.__releaseStartup("preferences", id),
          id,
        );
        await expect
          .poll(() =>
            isolated.evaluate(
              (_, id) =>
                global.__startupTrace.some(
                  (item) =>
                    item.id === id &&
                    item.method === "saveSession" &&
                    item.returned,
                ),
              id,
            ),
          )
          .toBe(true);
        await isolated.evaluate(
          (_, id) => global.__releaseStartup("duplicate-open", id),
          id,
        );
        // Give an intentionally released stale IPC response time to run its
        // loadDocument continuation. The old double-delivery implementation
        // replaces the inserted text here and clears dirty state.
        await localPage.waitForTimeout(150);
        const document = await localPage.evaluate(() =>
          window.__inkstone.getDocument(),
        );
        expect(document.text).toBe(insertion + original);
        expect(document.dirty).toBe(true);
        const trace = await isolated.evaluate(
          (_, id) => global.__startupTrace.filter((item) => item.id === id),
          id,
        );
        expect(
          trace.filter((item) => item.method === "openFile" && item.ordinal),
        ).toHaveLength(1);
        expect(
          trace.filter((item) => item.method === "setDirty").at(-1).dirty,
        ).toBe(true);
        // Exercise the native close guard, rather than only trusting renderer
        // dirty state: the application must retain the window and ask to save.
        await nativeWindow.evaluate((window) => window.close());
        await expect(localPage.locator("dialog[open]")).toContainText(
          /未保存|unsaved/,
        );
        expect(
          await nativeWindow.evaluate((window) => window.isDestroyed()),
        ).toBe(false);
        await localPage
          .getByRole("button", { name: /^(取消|Cancel)$/ })
          .click();
        await localPage.evaluate(() => window.__inkstone.execute("save"));
        expect(await fs.readFile(file, "utf8")).toBe(insertion + original);
        expect(
          await localPage.evaluate(() => window.__inkstone.getDocument().dirty),
        ).toBe(false);
        observations.push({
          source: index ? "newWindow" : "CLI",
          openCount: 1,
          firstResponseDelayMs: 120,
          editSurvivedDelayedPreferences: true,
          closePromptVerified: true,
          savedText: insertion + original,
          trace,
        });
      }
      await fs.writeFile(
        path.join(outputDir, "startup-single-delivery-validation.json"),
        JSON.stringify(observations, null, 2),
      );
    } finally {
      await isolated.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await isolated.close().catch(() => {});
    }
  });
  test("isolated bridge rejects ungranted files and symlink escapes", async () => {
    expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
    await expect(invoke("readAsset", { path: "/etc/passwd" })).rejects.toThrow(
      /ACCESS/,
    );
    await expect(
      invoke("openExternal", { url: "file:///etc/passwd" }),
    ).rejects.toThrow(/HTTP/);
    await expect(invoke("not-a-method")).rejects.toThrow(/Unsupported/);
    if (process.platform !== "win32") {
      await fs.symlink("/etc", path.join(directory, "escape"));
      await expect(
        invoke("openFile", { path: path.join(directory, "escape", "passwd") }),
      ).rejects.toThrow(/ACCESS/);
    }
    expect(
      (await invoke("resolveLink", { documentPath: note, href: "linked.md" }))
        .path,
    ).toBe(path.join(directory, "linked.md"));
  });
  test("native save preserves untouched bytes, detects external change, stores history", async () => {
    const opened = await invoke("openFile", { path: note });
    const before = await fs.readFile(note);
    const saved = await invoke("saveFile", { ...opened, text: opened.text });
    expect(saved.unchanged).toBe(true);
    expect(await fs.readFile(note)).toEqual(before);
    const changed = await invoke("saveFile", {
      ...saved,
      text: saved.text.replace("第一段", "局部编辑"),
    });
    expect(await fs.readFile(note, "utf8")).toBe(
      "\ufeff# 中文文稿\r\n\r\n局部编辑。\r\n",
    );
    const history = await invoke("listHistory", { path: note });
    expect(history).toHaveLength(1);
    expect(
      (await invoke("restoreHistory", { path: note, id: history[0].id })).text,
    ).toContain("第一段");
    await fs.writeFile(note, "external writer");
    await expect(
      invoke("saveFile", { ...changed, text: "my edits" }),
    ).rejects.toThrow(/CONFLICT/);
    expect(await fs.readFile(note, "utf8")).toBe("external writer");
  });
  test("file operations, search and hidden filtering reach real filesystem", async () => {
    const folder = path.join(directory, "Notes");
    await invoke("fileOperation", { operation: "createFolder", path: folder });
    const created = path.join(folder, "new.md");
    await invoke("fileOperation", {
      operation: "createFile",
      path: created,
      text: "# 测试\nunique-token 中文\n",
    });
    await expect(
      invoke("fileOperation", {
        operation: "createFile",
        path: created,
        text: "oops",
      }),
    ).rejects.toThrow(/EXISTS/);
    const renamed = path.join(folder, "renamed.md");
    await invoke("fileOperation", {
      operation: "rename",
      path: created,
      target: renamed,
    });
    const copy = path.join(folder, "copy.md");
    await invoke("fileOperation", {
      operation: "copy",
      path: renamed,
      target: copy,
    });
    expect(await fs.readFile(copy, "utf8")).toContain("unique-token");
    const hits = await invoke("searchFiles", {
      path: folder,
      query: "unique-token",
    });
    expect(hits).toHaveLength(2);
    expect(hits[0].line).toBe(2);
    expect(
      (await invoke("listFiles", { path: directory, recursive: true })).some(
        (f) => f.name === ".hidden.md",
      ),
    ).toBe(false);
    expect(
      (
        await invoke("listFiles", {
          path: directory,
          recursive: true,
          showHidden: true,
        })
      ).some((f) => f.name === ".hidden.md"),
    ).toBe(true);
  });
  test("preferences, sessions and recovery roundtrip persist to disk", async () => {
    const patch = {
      locale: "en",
      theme: "dark",
      snippets: { hello: "你好" },
      pins: [directory],
      showHidden: true,
      exportOptions: { pageSize: "Letter" },
    };
    await invoke("updateSettings", patch);
    await invoke("saveSession", {
      path: note,
      folder: directory,
      selection: { anchor: 2, head: 8 },
      mode: "source",
    });
    await invoke("saveRecovery", {
      id: "backend-draft",
      path: note,
      text: "未保存的恢复稿",
      revision: "stale",
    });
    const data = await invoke("bootstrap");
    expect(data.settings.snippets.hello).toBe("你好");
    expect(data.session.mode).toBe("source");
    expect(data.recovery.find((r) => r.id === "backend-draft").text).toBe(
      "未保存的恢复稿",
    );
    const persisted = JSON.parse(
      await fs.readFile(
        path.join(directory, "profile", "settings.json"),
        "utf8",
      ),
    );
    expect(persisted.theme).toBe("dark");
    await invoke("deleteRecovery", { id: "backend-draft" });
    expect(
      (await invoke("bootstrap")).recovery.some(
        (r) => r.id === "backend-draft",
      ),
    ).toBe(false);
    expect(await invoke("windowAction", { action: "zoomIn" })).toBeCloseTo(1.1);
    expect(await invoke("windowAction", { action: "zoomReset" })).toBe(1);
  });
  test("native menu shortcuts replace default accelerators and reject invalid bindings", async () => {
    const accelerator = () =>
      application.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu().getMenuItemById("save").accelerator,
      );
    await invoke("updateSettings", { shortcuts: { save: "Mod-Alt-s" } });
    expect(await accelerator()).toBe("Ctrl+Alt+S");
    await expect(
      invoke("updateSettings", { shortcuts: { save: "Mod-NotAKey" } }),
    ).rejects.toThrow(/Invalid shortcut/);
    expect(await accelerator()).toBe("Ctrl+Alt+S");
    expect((await invoke("bootstrap")).settings.shortcuts.save).toBe(
      "Mod-Alt-s",
    );
    await invoke("updateSettings", { shortcuts: { save: "Mod-Shift-F4" } });
    expect(await accelerator()).toBe("Ctrl+Shift+F4");
    await invoke("updateSettings", { shortcuts: {} });
    expect(await accelerator()).toBe("Ctrl+S");
  });
  test("invalid settings types preserve original bytes and boot with defaults plus a warning", async () => {
    const records = [];
    for (const [name, bad] of [
      ["theme", { theme: 22, recentFiles: [] }],
      ["recentFiles", { theme: "light", recentFiles: {} }],
    ]) {
      const profile = path.join(directory, `invalid-profile-${name}`);
      await fs.mkdir(profile);
      const original = JSON.stringify(bad, null, 2) + "\n";
      await fs.writeFile(path.join(profile, "settings.json"), original);
      const environment = {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ":91",
        INKSTONE_USER_DATA: profile,
      };
      delete environment.ELECTRON_RUN_AS_NODE;
      const isolated = await electron.launch({
        args: ["--no-sandbox", "--disable-gpu", path.resolve(".")],
        env: environment,
      });
      try {
        const isolatedPage = await isolated.firstWindow();
        await isolatedPage.waitForFunction(() => !!window.inkstone);
        const boot = await isolatedPage.evaluate(() =>
          window.inkstone.invoke("bootstrap"),
        );
        expect(boot.settings.theme).toBe("system");
        expect(boot.settings.recentFiles).toEqual([]);
        expect(boot.warnings.join("\n")).toContain("Invalid");
        expect(boot.warnings.join("\n")).toContain(name);
        const backup = (await fs.readdir(profile)).find((file) =>
          file.startsWith("settings.invalid-"),
        );
        expect(backup).toBeTruthy();
        expect(await fs.readFile(path.join(profile, backup), "utf8")).toBe(
          original,
        );
        const repaired = JSON.parse(
          await fs.readFile(path.join(profile, "settings.json"), "utf8"),
        );
        expect(repaired.theme).toBe("system");
        expect(repaired.recentFiles).toEqual([]);
        expect(
          await isolated.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
        ).toBe("system");
        records.push({
          invalidKey: name,
          booted: true,
          backupExact: true,
          warnings: boot.warnings,
        });
      } finally {
        await isolated.close();
      }
    }
    await fs.writeFile(
      path.join(outputDir, "invalid-settings-validation.json"),
      JSON.stringify(records, null, 2),
    );
  });
  test("clipboard-style image input deduplicates and exports self-contained HTML, paginated PDF and PNG", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><rect width="240" height="90" rx="12" fill="#28675a"/><text x="20" y="52" fill="white" font-size="28">Inkstone</text></svg>';
    const input = {
      name: "local.svg",
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    };
    const first = await invoke("insertImages", {
      documentPath: note,
      images: [input],
    });
    const again = await invoke("insertImages", {
      documentPath: note,
      images: [input],
    });
    expect(first[0].relativePath).toBe("assets/local.svg");
    expect(again[0].path).toBe(first[0].path);
    expect(await invoke("readAsset", { path: first[0].path })).toContain(
      "data:image/svg+xml;base64,",
    );
    const resource = `inkstone-asset://local/?path=${encodeURIComponent(first[0].path)}`;
    const math = katex.renderToString("E=mc^2+\\frac{1}{2}", {
      displayMode: true,
      throwOnError: true,
    });
    const html = `<h1>中文导出验收</h1><p>你好，墨石。中文、图片、公式和分页。</p><img src="${resource}">${math}<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><rect x="0" y="5" width="100" height="60" fill="#d9eee8"/><path d="M100 35 H280" stroke="#28675a" stroke-width="3"/><rect x="280" y="5" width="100" height="60" fill="#d9eee8"/><text x="15" y="42">Start</text><text x="300" y="42">Finish</text></svg><div style="break-before:page"></div><h2>第二页</h2><p>分页后的中文内容。</p>`;
    const assets = await fs.readdir(path.resolve("dist/assets"));
    const styles = (
      await Promise.all(
        assets
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFile(path.resolve("dist/assets", f), "utf8")),
      )
    ).join("\n");
    const css = `${styles}\nbody{font-family:"Noto Serif CJK SC",serif;background:white!important;color:#222!important}article{font-size:18px}h1{font-size:32px}article>svg{width:400px!important;height:80px!important}`;
    // Output must stay in a user-granted directory; collect a copy as test evidence afterward.
    for (const format of ["html", "pdf", "png", "jpg"]) {
      const file = path.join(directory, `export.${format}`);
      const result = await invoke("exportFile", {
        format,
        path: file,
        html,
        css,
        title: "中文验收",
        documentPath: note,
        pageSize: "A4",
        margins: 18,
        bookmarks: true,
      });
      expect(result.warnings).toEqual([]);
      expect((await fs.stat(file)).size).toBeGreaterThan(1000);
      await fs.copyFile(file, path.join(outputDir, `export.${format}`));
    }
    const exportedHTML = await fs.readFile(
      path.join(directory, "export.html"),
      "utf8",
    );
    expect(
      (await fs.readFile(path.join(directory, "export.jpg"))).subarray(0, 2),
    ).toEqual(Buffer.from([0xff, 0xd8]));
    expect(exportedHTML).toContain("data:image/svg+xml;base64,");
    expect(exportedHTML).not.toContain(resource);
    const pdfText = execFileSync(
      "pdftotext",
      [path.join(directory, "export.pdf"), "-"],
      { encoding: "utf8" },
    );
    expect(pdfText).toContain("中文导出验收");
    expect(pdfText).toContain("分页后的中文内容");
    expect(pdfText).toContain("Start");
    expect(pdfText).toContain("Finish");
    expect(
      (await fs.readFile(path.join(directory, "export.pdf"))).includes(
        Buffer.from("/Outlines"),
      ),
    ).toBe(true);
    const info = execFileSync("pdfinfo", [path.join(directory, "export.pdf")], {
      encoding: "utf8",
    });
    expect(info).toMatch(/Pages:\s+2/);
    await fs.writeFile(path.join(outputDir, "pdf-text.txt"), pdfText);
    await fs.writeFile(path.join(outputDir, "pdf-info.txt"), info);
    execFileSync("pdftoppm", [
      "-f",
      "1",
      "-singlefile",
      "-scale-to",
      "1400",
      "-png",
      path.join(directory, "export.pdf"),
      path.join(outputDir, "pdf-page-1"),
    ]);
  });
  test("real Pandoc detection, DOCX export/import, formatting and missing-tool error", async () => {
    const pandoc = path.resolve(".tools/pandoc/bin/pandoc");
    test.skip(
      !(await fs.stat(pandoc).catch(() => null)),
      "Pandoc executable not installed in this environment",
    );
    await invoke("updateSettings", { pandocPath: pandoc });
    expect((await invoke("detectTools")).pandoc.available).toBe(true);
    const target = path.join(directory, "roundtrip.docx");
    const text =
      "# 中文文档\n\n完整的离线写作。\n\n- 列表一\n- 列表二\n\n$$E=mc^2$$\n";
    await invoke("runPandoc", {
      direction: "export",
      format: "docx",
      path: target,
      text,
      documentPath: note,
    });
    expect((await fs.readFile(target)).subarray(0, 2).toString()).toBe("PK");
    const imported = await invoke("runPandoc", {
      direction: "import",
      path: target,
    });
    expect(imported.text).toContain("中文文档");
    expect(imported.text).toContain("完整的离线写作");
    const formatted = await invoke("runPandoc", {
      direction: "format",
      text: "# Header\n\n*   list\n",
    });
    expect(formatted.text).toContain("Header");
    await fs.copyFile(target, path.join(outputDir, "roundtrip.docx"));
    await fs.writeFile(
      path.join(outputDir, "roundtrip-import.md"),
      imported.text,
    );
    await invoke("updateSettings", { pandocPath: "/nonexistent/pandoc" });
    expect((await invoke("detectTools")).pandoc.available).toBe(false);
    await expect(
      invoke("runPandoc", { direction: "format", text: "x" }),
    ).rejects.toThrow(/DEPENDENCY/);
    await invoke("updateSettings", { pandocPath: pandoc });
  });
  test("each advertised Pandoc family produces a readable output; archive images survive import", async () => {
    const pandoc = path.resolve(".tools/pandoc/bin/pandoc");
    test.skip(
      !(await fs.stat(pandoc).catch(() => null)),
      "Pandoc not installed",
    );
    await invoke("updateSettings", { pandocPath: pandoc });
    const text =
      "# 中文格式验收\n\nInkstone offline writing. 中文段落。\n\n## 第二节\n\n- 第一项\n- Second item\n";
    const formats = [
      "docx",
      "odt",
      "rtf",
      "epub",
      "latex",
      "mediawiki",
      "dokuwiki",
      "rst",
      "textile",
      "org",
      "opml",
      "pptx",
      "revealjs",
      "beamer",
      "asciidoc",
      "json",
      "markdown",
      "gfm",
      "commonmark",
      "markdown_strict",
      "markdown_mmd",
    ];
    const manifest = [];
    const formatDir = path.join(outputDir, "formats");
    await fs.mkdir(formatDir, { recursive: true });
    for (const format of formats) {
      const ext =
        {
          latex: "tex",
          revealjs: "html",
          beamer: "tex",
          markdown: "md",
          gfm: "md",
          commonmark: "md",
          markdown_strict: "md",
          markdown_mmd: "md",
        }[format] || format;
      const output = path.join(directory, `format-${format}.${ext}`);
      const result = await invoke("runPandoc", {
        direction: "export",
        format,
        text,
        path: output,
        documentPath: note,
      });
      expect((await fs.stat(output)).size).toBeGreaterThan(10);
      const reader = { beamer: "latex", revealjs: "html" }[format] || format;
      const readback = execFileSync(
        pandoc,
        ["--from", reader, "--to", "plain", output],
        { encoding: "utf8" },
      );
      expect(readback, `${format} re-opened output`).toContain("中文格式验收");
      await fs.copyFile(output, path.join(formatDir, path.basename(output)));
      let appImportChinese = null;
      if (
        ![
          "markdown",
          "gfm",
          "commonmark",
          "markdown_strict",
          "markdown_mmd",
        ].includes(reader)
      ) {
        const imported = await invoke("runPandoc", {
          direction: "import",
          path: output,
          format: reader,
        });
        expect(imported.text, `${format} application import`).toContain(
          "中文格式验收",
        );
        appImportChinese = true;
      }
      manifest.push({
        format,
        extension: ext,
        reader,
        bytes: (await fs.stat(output)).size,
        readbackChinese: true,
        appImportChinese,
        warnings: result.warnings,
      });
    }
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=";
    const inserted = await invoke("insertImages", {
      documentPath: note,
      images: [{ name: "pixel.png", dataUrl: `data:image/png;base64,${png}` }],
    });
    const docx = path.join(directory, "with-image.docx");
    await invoke("runPandoc", {
      direction: "export",
      format: "docx",
      path: docx,
      text: `# Embedded image\n\n![pixel](${inserted[0].relativePath})\n`,
      documentPath: note,
    });
    const imported = await invoke("runPandoc", {
      direction: "import",
      path: docx,
    });
    expect(imported.text).toContain("data:image/png;base64,");
    expect(imported.text).not.toContain("inkstone-import-");
    await fs.copyFile(docx, path.join(formatDir, "with-image.docx"));
    await fs.writeFile(
      path.join(formatDir, "with-image-import.md"),
      imported.text,
    );
    await fs.writeFile(
      path.join(formatDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
  });

  test("explicit URL download and native clipboard remain while retired service IPC is unavailable", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>';
    const requests = [];
    const server = http.createServer((request, response) => {
      requests.push({ url: request.url, method: request.method });
      if (request.url === "/image.svg") {
        response.writeHead(200, { "Content-Type": "image/svg+xml" });
        response.end(svg);
        return;
      }
      if (request.url === "/huge.png") {
        response.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": String(30 * 1024 * 1024),
        });
        response.end();
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const downloaded = await invoke("downloadImage", {
        documentPath: note,
        url: origin + "/image.svg",
      });
      expect(await fs.readFile(downloaded[0].path, "utf8")).toBe(svg);
      await expect(
        invoke("downloadImage", {
          documentPath: note,
          url: origin + "/huge.png",
        }),
      ).rejects.toThrow(/25 MB/);
      await expect(
        invoke("uploadImages", { paths: [downloaded[0].path] }),
      ).rejects.toThrow(/Unsupported desktop operation/);
      expect(
        await application.evaluate(async ({ ipcMain, BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().endsWith("/index.html"),
          );
          try {
            await ipcMain._invokeHandlers.get("inkstone:invoke")(
              {
                sender: window.webContents,
                senderFrame: window.webContents.mainFrame,
              },
              "uploadImages",
              {},
            );
            return "unexpected success";
          } catch (error) {
            return error.message;
          }
        }),
      ).toContain("Unsupported desktop method");
      expect(Object.keys(await invoke("detectTools"))).toEqual(["pandoc"]);
      expect(requests.every((request) => request.method === "GET")).toBe(true);
      expect(requests).toHaveLength(2);
      await invoke("writeClipboard", {
        text: "中文剪贴板",
        html: "<strong>中文剪贴板</strong>",
      });
      expect(
        await application.evaluate(({ clipboard }) => clipboard.readText()),
      ).toBe("中文剪贴板");
      expect(
        await application.evaluate(async ({ clipboard }) => {
          const item = (await clipboard.read()).find((item) =>
            item.types.includes("text/html"),
          );
          return (await item.getType("text/html")).text();
        }),
      ).toContain("<strong>中文剪贴板</strong>");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  test("legacy service settings are removed on startup and updates without touching local documents or assets", async () => {
    const profile = path.join(directory, "retired-profile"),
      source = path.join(directory, "migration-local.md"),
      asset = path.join(directory, "migration-local.svg");
    await fs.mkdir(profile);
    await fs.writeFile(
      source,
      "\ufeff# 保留文稿\r\n![本地](migration-local.svg)\r\n",
    );
    await fs.writeFile(
      asset,
      '<svg xmlns="http://www.w3.org/2000/svg"><text>保留图片</text></svg>',
    );
    const sourceBytes = await fs.readFile(source),
      assetBytes = await fs.readFile(asset);
    const retired = {
      uploadCommand: "retired-tool",
      uploadArgs: { invalid: "ignored" },
      uploadMode: "legacy",
      uploadEndpoint: "http://127.0.0.1:1/retired",
      autoUpload: true,
      cloudSync: { provider: "retired" },
      syncToken: "obsolete",
      searchURL: "https://example.invalid/?q=%s",
    };
    await fs.writeFile(
      path.join(profile, "settings.json"),
      JSON.stringify({
        theme: "dark",
        fontSize: 23,
        imageFolder: "local assets",
        recentFiles: [source],
        snippets: { note: "keep upload/cloud words in user text" },
        shortcuts: {
          uploadImages: "Mod-u",
          webSearch: "Mod-w",
          downloadImage: "Mod-d",
        },
        ...retired,
      }),
    );
    const environment = {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":91",
      INKSTONE_USER_DATA: profile,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    const isolated = await electron.launch({
      args: ["--no-sandbox", "--disable-gpu", path.resolve(".")],
      env: environment,
    });
    try {
      const isolatedPage = await isolated.firstWindow();
      await isolatedPage.waitForFunction(() => !!window.inkstone);
      const boot = await isolatedPage.evaluate(() =>
        window.inkstone.invoke("bootstrap"),
      );
      expect(boot.settings.theme).toBe("dark");
      expect(boot.settings.fontSize).toBe(23);
      expect(boot.settings.imageFolder).toBe("local assets");
      expect(boot.settings.snippets.note).toBe(
        "keep upload/cloud words in user text",
      );
      expect(boot.settings.shortcuts).toEqual({ downloadImage: "Mod-d" });
      expect(boot.warnings.join(" ")).toContain("Removed retired");
      for (const key of Object.keys(retired))
        expect(boot.settings).not.toHaveProperty(key);
      const updated = await isolatedPage.evaluate(
        (patch) => window.inkstone.invoke("updateSettings", patch),
        { ...retired, theme: "light" },
      );
      expect(updated.theme).toBe("light");
      for (const key of Object.keys(retired))
        expect(updated).not.toHaveProperty(key);
      const persisted = JSON.parse(
        await fs.readFile(path.join(profile, "settings.json"), "utf8"),
      );
      for (const key of Object.keys(retired))
        expect(persisted).not.toHaveProperty(key);
      expect(await fs.readFile(source)).toEqual(sourceBytes);
      expect(await fs.readFile(asset)).toEqual(assetBytes);
      await fs.writeFile(
        path.join(outputDir, "settings-migration-validation.json"),
        JSON.stringify(
          {
            removedKeys: Object.keys(retired),
            startupVerified: true,
            updatesVerified: true,
            sourceBytesPreserved: true,
            assetBytesPreserved: true,
          },
          null,
          2,
        ),
      );
    } finally {
      await isolated.close();
    }
  });
  test("invalid JSON remains untouched when startup backup fails and a later explicit retry recovers it", async () => {
    const profile = path.join(directory, "invalid-json-backup-profile");
    await fs.mkdir(profile);
    const original = '{"customCSS":"preserve these bytes", BROKEN JSON';
    const settingsPath = path.join(profile, "settings.json");
    await fs.writeFile(settingsPath, original);
    const hook = path.join(directory, "fail-json-backup.cjs");
    await fs.writeFile(
      hook,
      `
const fs = require('node:fs/promises');
global.__backupFault = {fs, copy: fs.copyFile, open: fs.open};
fs.copyFile = function(source, ...args) { if (String(source).endsWith('settings.json')) return Promise.reject(Object.assign(new Error('simulated corrupt backup denial'), {code:'EACCES'})); return global.__backupFault.copy.call(this, source, ...args); };
fs.open = function(file, ...args) { if (String(file).includes('settings.invalid-')) return Promise.reject(Object.assign(new Error('simulated retry backup denial'), {code:'EACCES'})); return global.__backupFault.open.call(this, file, ...args); };
process.argv = [process.argv[0]];
require(${JSON.stringify(path.resolve("electron/main.cjs"))});
`,
    );
    const environment = {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":91",
      INKSTONE_USER_DATA: profile,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    const isolated = await electron.launch({
      args: ["--no-sandbox", "--disable-gpu", hook],
      env: environment,
    });
    try {
      const localPage = await isolated.firstWindow();
      await localPage.waitForFunction(() => !!window.__inkstone);
      const boot = await localPage.evaluate(() =>
        window.inkstone.invoke("bootstrap"),
      );
      expect(boot.warnings.join(" ")).toContain(
        "automatic writes are disabled",
      );
      expect(await fs.readFile(settingsPath, "utf8")).toBe(original);
      await isolated.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, note);
      await localPage.evaluate(() => window.inkstone.invoke("openFile"));
      expect(await fs.readFile(settingsPath, "utf8")).toBe(original);
      await expect(
        localPage.evaluate(() =>
          window.inkstone.invoke("updateSettings", { theme: "dark" }),
        ),
      ).rejects.toThrow(/cannot be backed up/);
      expect(await fs.readFile(settingsPath, "utf8")).toBe(original);
      await isolated.evaluate(() => {
        global.__backupFault.fs.copyFile = global.__backupFault.copy;
        global.__backupFault.fs.open = global.__backupFault.open;
      });
      await localPage.evaluate(() =>
        window.inkstone.invoke("updateSettings", { theme: "dark" }),
      );
      expect(JSON.parse(await fs.readFile(settingsPath, "utf8")).theme).toBe(
        "dark",
      );
      const backup = (await fs.readdir(profile)).find((name) =>
        name.startsWith("settings.invalid-"),
      );
      expect(await fs.readFile(path.join(profile, backup), "utf8")).toBe(
        original,
      );
    } finally {
      await isolated.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await isolated.close().catch(() => {});
    }
  });
  test("failed invalid-settings backup cannot be bypassed by service migration", async () => {
    const profile = path.join(directory, "backup-failure-profile");
    await fs.mkdir(profile);
    const original =
      JSON.stringify(
        {
          theme: 22,
          fontSize: 27,
          customCSS: "body{color:purple}",
          snippets: { preserved: "用户内容" },
          uploadCommand: "retired",
        },
        null,
        2,
      ) + "\n";
    await fs.writeFile(path.join(profile, "settings.json"), original);
    const hook = path.join(directory, "fail-settings-backup.cjs");
    await fs.writeFile(
      hook,
      `const fs=require('node:fs/promises');const open=fs.open;global.__inkstoneBackupFs=fs;global.__inkstoneOriginalFsOpen=open;process.argv=[process.argv[0]];fs.open=function(file,...args){if(String(file).includes('settings.invalid-')){const error=new Error('simulated backup permission failure');error.code='EACCES';return Promise.reject(error);}return open.call(this,file,...args);};require(${JSON.stringify(path.resolve("electron/main.cjs"))});`,
    );
    const environment = {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":91",
      INKSTONE_USER_DATA: profile,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    const isolated = await electron.launch({
      args: ["--no-sandbox", "--disable-gpu", hook],
      env: environment,
    });
    try {
      const localPage = await isolated.firstWindow();
      await localPage.waitForFunction(() => !!window.inkstone);
      const boot = await localPage.evaluate(() =>
        window.inkstone.invoke("bootstrap"),
      );
      expect(boot.warnings.join(" ")).toContain("backup failed");
      expect(boot.warnings.join(" ")).not.toContain("Removed retired");
      expect(boot.settings.theme).toBe("system");
      expect(boot.settings).not.toHaveProperty("uploadCommand");
      expect(
        await fs.readFile(path.join(profile, "settings.json"), "utf8"),
      ).toBe(original);
      expect(
        (await fs.readdir(profile)).some((name) =>
          name.startsWith("settings.invalid-"),
        ),
      ).toBe(false);
      const document = path.join(directory, "backup-failure-document.md");
      await fs.writeFile(document, "# Keep document\n");
      await isolated.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, document);
      expect(
        (await localPage.evaluate(() => window.inkstone.invoke("openFile")))
          .text,
      ).toBe("# Keep document\n");
      expect(
        await fs.readFile(path.join(profile, "settings.json"), "utf8"),
      ).toBe(original);
      await expect(
        localPage.evaluate(() =>
          window.inkstone.invoke("updateSettings", { theme: "dark" }),
        ),
      ).rejects.toThrow(/cannot be backed up/);
      expect(
        await fs.readFile(path.join(profile, "settings.json"), "utf8"),
      ).toBe(original);
      await isolated.evaluate(() => {
        global.__inkstoneBackupFs.open = global.__inkstoneOriginalFsOpen;
      });
      expect(
        (
          await localPage.evaluate(() =>
            window.inkstone.invoke("updateSettings", { theme: "dark" }),
          )
        ).theme,
      ).toBe("dark");
      const backup = (await fs.readdir(profile)).find((name) =>
        name.startsWith("settings.invalid-"),
      );
      expect(backup).toBeTruthy();
      const recovered = JSON.parse(
        await fs.readFile(path.join(profile, backup), "utf8"),
      );
      expect(recovered.fontSize).toBe(27);
      expect(recovered.customCSS).toBe("body{color:purple}");
      expect(recovered.snippets.preserved).toBe("用户内容");
      expect(recovered).not.toHaveProperty("uploadCommand");
    } finally {
      await isolated.close();
    }
    expect(
      JSON.parse(await fs.readFile(path.join(profile, "settings.json"), "utf8"))
        .theme,
    ).toBe("dark");
  });
  test("include and exclude globs filter tree and global search consistently", async () => {
    await invoke("updateSettings", {
      includeGlobs: "**/*.md",
      excludeGlobs: "**/copy.md, profile/**",
    });
    const listed = await invoke("listFiles", {
      path: directory,
      recursive: true,
    });
    expect(listed.some((item) => item.name === "copy.md")).toBe(false);
    expect(listed.some((item) => item.name === "renamed.md")).toBe(true);
    const results = await invoke("searchFiles", {
      path: directory,
      query: "unique-token",
    });
    expect(results).toHaveLength(1);
    expect(results[0].path).toContain("renamed.md");
    await invoke("updateSettings", { includeGlobs: "", excludeGlobs: "" });
  });

  test("export sanitizes direct bridge HTML and preserves SVG/MathML without executable content", async () => {
    const target = path.join(directory, "sanitized.html");
    const html =
      '<h1>Safe export</h1><script>window.__pwned=true</script><img src="data:image/png;base64,iVBORw0KGgo=" onerror="window.__pwned=true"><a href="javascript:alert(1)">link</a><iframe src="https://example.invalid"></iframe><svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">Diagram label</div></foreignObject></svg><math><mi>x</mi></math>';
    await invoke("exportFile", {
      format: "html",
      path: target,
      html,
      css: "",
      title: "Sanitized",
    });
    const text = await fs.readFile(target, "utf8");
    expect(text).not.toContain("<script>");
    expect(text).not.toContain("onerror");
    expect(text).not.toContain("javascript:");
    expect(text).not.toContain("<iframe");
    const plain = path.join(directory, "plain.html");
    await invoke("exportFile", {
      format: "html-plain",
      path: plain,
      html: "<h1>Unstyled</h1>",
      css: "body{color:red}",
    });
    expect(await fs.readFile(plain, "utf8")).not.toContain("<style>");
    expect(text).toContain("foreignObject");
    expect(text).toContain("Diagram label");
    expect(text).toContain("<math>");
    const nextWindow = application.waitForEvent("window");
    await application.evaluate(
      async ({ BrowserWindow }, file) => {
        const window = new BrowserWindow({
          show: false,
          width: 900,
          height: 700,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        await window.loadFile(file);
      },
      path.join(directory, "export.html"),
    );
    const exported = await nextWindow;
    await exported.waitForLoadState();
    await expect(exported.locator("h1")).toHaveText("中文导出验收");
    expect(
      await exported.evaluate(() =>
        [...document.images].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      ),
    ).toBe(true);
    await exported.screenshot({
      path: path.join(outputDir, "html-reopened.png"),
      fullPage: true,
    });
    await exported.close();
  });

  test("Save As preserves BOM and rebases local image/link spans through the native save flow", async () => {
    const source = path.join(directory, "save-as-source.md"),
      target = path.join(directory, "subfolder", "saved.md");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      source,
      "\ufeff# 文稿\r\n\r\n![本地图片](assets/local.svg)\r\n[文档](linked.md#part)\r\n`![literal](assets/local.svg)`\r\n",
    );
    const document = await invoke("openFile", { path: source });
    await application.evaluate(({ dialog }, target) => {
      global.__inkstoneOldSaveDialog = dialog.showSaveDialog;
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, target);
    try {
      const saved = await invoke("saveFile", {
        ...document,
        saveAs: true,
        preserveLinks: true,
      });
      expect(saved.path).toBe(target);
      expect(saved.rebasedLinks).toBe(2);
      expect(saved.text).toContain("../assets/local.svg");
      expect(saved.text).toContain("`![literal](assets/local.svg)`");
      expect((await fs.readFile(target, "utf8")).startsWith("\ufeff")).toBe(
        true,
      );
      expect(await fs.readFile(source, "utf8")).toContain(
        "](assets/local.svg)",
      );
    } finally {
      await application.evaluate(({ dialog }) => {
        dialog.showSaveDialog = global.__inkstoneOldSaveDialog;
        delete global.__inkstoneOldSaveDialog;
      });
    }
  });
  test("polling detects external atomic replacement and deletion without inotify", async () => {
    const watched = path.join(directory, "watched.md");
    await fs.writeFile(watched, "first");
    await invoke("openFile", { path: watched });
    await page.evaluate(() => {
      window.__backendChanges = [];
      window.inkstone.on("external-change", (event) =>
        window.__backendChanges.push(event),
      );
    });
    const replacement = path.join(directory, "replacement.tmp");
    await fs.writeFile(replacement, "replacement");
    await fs.rename(replacement, watched);
    await expect
      .poll(
        () =>
          page.evaluate(
            (file) =>
              window.__backendChanges.some(
                (event) => event.path === file && !event.deleted,
              ),
            watched,
          ),
        { timeout: 4000 },
      )
      .toBe(true);
    await fs.unlink(watched);
    await expect
      .poll(
        () =>
          page.evaluate(
            (file) =>
              window.__backendChanges.some(
                (event) => event.path === file && event.deleted,
              ),
            watched,
          ),
        { timeout: 4000 },
      )
      .toBe(true);
  });

  test("explicit encoding retry reuses the chosen file and legacy saves keep byte fidelity", async () => {
    const encoded = path.join(directory, "legacy-gb18030.md");
    const bytes = iconv.encode("# 中文编码\r\n\r\n原文\r\n", "gb18030");
    await fs.writeFile(encoded, bytes);
    await application.evaluate(({ dialog }, file) => {
      global.__inkstoneOldOpenDialog = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, encoded);
    let document;
    try {
      await expect(invoke("openFile")).rejects.toThrow(/ENCODING/);
      document = await invoke("openFile", { encoding: "gb18030" });
    } finally {
      await application.evaluate(({ dialog }) => {
        dialog.showOpenDialog = global.__inkstoneOldOpenDialog;
        delete global.__inkstoneOldOpenDialog;
      });
    }
    expect(document.path).toBe(encoded);
    expect(document.encoding).toBe("gb18030");
    expect(document.text).toContain("中文编码");
    const unchanged = await invoke("saveFile", document);
    expect(unchanged.unchanged).toBe(true);
    expect(await fs.readFile(encoded)).toEqual(bytes);
    const saved = await invoke("saveFile", {
      ...document,
      text: document.text.replace("原文", "修改"),
    });
    expect(saved.encoding).toBe("gb18030");
    expect(iconv.decode(await fs.readFile(encoded), "gb18030")).toContain(
      "修改",
    );
    const history = await invoke("listHistory", { path: encoded });
    const previous = await invoke("restoreHistory", {
      path: encoded,
      id: history[0].id,
    });
    expect(previous.encoding).toBe("gb18030");
    expect(previous.text).toContain("原文");
  });

  test("opening an export calls the OS opener only for an authorized document path", async () => {
    await application.evaluate(({ shell }) => {
      global.__inkstoneOldOpenPath = shell.openPath;
      global.__inkstoneOpenedPath = null;
      shell.openPath = async (file) => {
        global.__inkstoneOpenedPath = file;
        return "";
      };
    });
    try {
      const file = path.join(directory, "export.pdf");
      expect(await invoke("openExport", { path: file })).toBe(true);
      expect(
        await application.evaluate(() => global.__inkstoneOpenedPath),
      ).toBe(file);
      const executable = path.join(directory, "unsafe.sh");
      await fs.writeFile(executable, "#!/bin/sh");
      await expect(invoke("openExport", { path: executable })).rejects.toThrow(
        /supported document/,
      );
      await application.evaluate(({ shell }) => {
        shell.openPath = async () => "No associated application";
      });
      await expect(invoke("openExport", { path: file })).rejects.toThrow(
        /No associated application/,
      );
    } finally {
      await application.evaluate(({ shell }) => {
        shell.openPath = global.__inkstoneOldOpenPath;
        delete global.__inkstoneOldOpenPath;
        delete global.__inkstoneOpenedPath;
      });
    }
  });

  test("export eagerly loads an image below the initial viewport", async () => {
    const file = path.join(directory, "assets", "local.svg");
    const target = path.join(directory, "long-image.pdf");
    const result = await invoke("exportFile", {
      format: "pdf",
      path: target,
      title: "Long image",
      html: `<h1>Long document</h1><div style="height:2400px">Before image</div><img loading="lazy" src="inkstone-asset://local/?path=${encodeURIComponent(file)}"><p>After image</p>`,
      css: "",
    });
    expect(result.warnings).toEqual([]);
    expect((await fs.stat(target)).size).toBeGreaterThan(1000);
    const plain = execFileSync("pdftotext", [target, "-"], {
      encoding: "utf8",
    });
    expect(plain).toContain("After image");
    await fs.copyFile(target, path.join(outputDir, "long-image.pdf"));
  });

  test("inactive file watchers are released and active folders notice external new files", async () => {
    const many = [];
    for (let i = 0; i < 25; i++) {
      const file = path.join(directory, `watch-lifecycle-${i}.md`);
      await fs.writeFile(file, `# File ${i}`);
      many.push(file);
      await invoke("openFile", { path: file });
    }
    expect((await invoke("bootstrap")).diagnostics.activeFileWatchers).toBe(1);
    const newPage = application.waitForEvent("window");
    await invoke("newWindow", { path: many[0] });
    const second = await newPage;
    await second.waitForFunction(() =>
      window.__inkstone?.getDocument().path?.endsWith("watch-lifecycle-0.md"),
    );
    expect((await invoke("bootstrap")).diagnostics.activeFileWatchers).toBe(2);
    await second.close();
    await expect
      .poll(
        async () => (await invoke("bootstrap")).diagnostics.activeFileWatchers,
      )
      .toBe(1);
    await invoke("listFiles", { path: directory, recursive: true });
    expect(
      (await invoke("bootstrap")).diagnostics.activeDirectoryWatchers,
    ).toBeLessThanOrEqual(128);
    await page.evaluate(() => {
      window.__folderChanges = [];
      window.inkstone.on("folder-change", (event) =>
        window.__folderChanges.push(event),
      );
    });
    await page.waitForTimeout(150);
    const added = path.join(directory, "external-new.md");
    await fs.writeFile(added, "outside app");
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.__folderChanges.some((event) => event.external),
          ),
        { timeout: 6500 },
      )
      .toBe(true);
    expect(
      (await invoke("listFiles", { path: directory })).some(
        (entry) => entry.path === added,
      ),
    ).toBe(true);
    await invoke("saveSession", { path: many.at(-1), folder: null });
    expect(
      (await invoke("bootstrap")).diagnostics.activeDirectoryWatchers,
    ).toBe(0);
  });
  test("Pandoc embeds supplied diagram PNGs in DOCX while keeping Markdown source intact", async () => {
    const pandoc = path.resolve(".tools/pandoc/bin/pandoc");
    test.skip(
      !(await fs.stat(pandoc).catch(() => null)),
      "Pandoc not installed",
    );
    await invoke("updateSettings", { pandocPath: pandoc });
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=";
    const source = "graph TD\n  A[中文] --> B[Diagram]\n";
    const text =
      "# Diagram export\n\n" +
      String.fromCharCode(96).repeat(3) +
      "mermaid\n" +
      source +
      String.fromCharCode(96).repeat(3) +
      "\n";
    const original = path.join(directory, "diagram-source.md");
    await fs.writeFile(original, text);
    const target = path.join(directory, "diagram.docx");
    const result = await invoke("runPandoc", {
      direction: "export",
      format: "docx",
      path: target,
      documentPath: original,
      text,
      diagramAssets: [
        {
          language: "mermaid",
          source,
          dataUrl: `data:image/png;base64,${png}`,
        },
      ],
    });
    expect(result.embeddedDiagrams).toBe(1);
    expect(result.warnings).toEqual([]);
    const imported = await invoke("runPandoc", {
      direction: "import",
      path: target,
    });
    expect(imported.text).toContain("data:image/png;base64,");
    expect(imported.text).not.toContain("graph TD");
    expect(await fs.readFile(original, "utf8")).toBe(text);
    await fs.copyFile(target, path.join(outputDir, "diagram.docx"));
    await fs.writeFile(
      path.join(outputDir, "diagram-import.md"),
      imported.text,
    );
    await expect(
      invoke("runPandoc", {
        direction: "export",
        format: "docx",
        path: target,
        documentPath: original,
        text,
        diagramAssets: [
          {
            language: "mermaid",
            source,
            dataUrl: "data:text/html;base64,PHNjcmlwdD4=",
          },
        ],
      }),
    ).rejects.toThrow(/Invalid diagram/);
  });

  test("custom CSS local font resources are embedded into exported HTML", async () => {
    const fonts = await fs.readdir(path.resolve("dist/assets"));
    const font = fonts.find((name) => name.endsWith(".woff2"));
    expect(font).toBeTruthy();
    const local = path.join(directory, "custom.woff2");
    await fs.copyFile(path.resolve("dist/assets", font), local);
    const resource = `inkstone-asset://local/?path=${encodeURIComponent(local)}`,
      target = path.join(directory, "custom-font.html");
    const exported = await invoke("exportFile", {
      format: "html",
      path: target,
      html: "<p>Font export</p>",
      css: `@font-face{font-family:ExportFont;src:url("${resource}")}p{font-family:ExportFont}`,
    });
    expect(exported.warnings).toEqual([]);
    const text = await fs.readFile(target, "utf8");
    expect(text).toContain("data:font/woff2;base64,");
    expect(text).not.toContain(resource);
  });

  test("unstyled HTML contains one native MathML formula and retains diagram SVG", async () => {
    const target = path.join(directory, "plain-math.html");
    const formula = katex.renderToString("E=mc^2", { displayMode: true });
    const html =
      "<h1>Plain mathematics</h1>" +
      formula +
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60"><rect width="240" height="60" fill="#d9eee8"/><text x="10" y="35">Diagram retained</text></svg>';
    await invoke("exportFile", {
      format: "html-plain",
      path: target,
      html,
      css: "body{color:red}",
      title: "Plain MathML",
    });
    const output = await fs.readFile(target, "utf8");
    expect(output).not.toContain("katex-html");
    expect(output).not.toContain("<style>");
    expect(output).toContain("<math");
    expect(output).toContain("<svg");
    const nextPage = application.waitForEvent("window");
    await application.evaluate(async ({ BrowserWindow }, file) => {
      const window = new BrowserWindow({
        show: false,
        width: 700,
        height: 400,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      await window.loadFile(file);
    }, target);
    const plain = await nextPage;
    await plain.waitForLoadState();
    await expect(plain.locator("math")).toHaveCount(1);
    await expect(plain.locator("math")).toBeVisible();
    await expect(plain.locator(".katex-html")).toHaveCount(0);
    await expect(plain.locator("svg text")).toHaveText("Diagram retained");
    // Chromium innerText omits MathML descendants; inspect the actual math token tree.
    await expect(
      plain.locator("math mi").filter({ hasText: /^E$/ }),
    ).toHaveCount(1);
    await plain.screenshot({ path: path.join(outputDir, "plain-mathml.png") });
    await plain.close();
    await fs.copyFile(target, path.join(outputDir, "plain-mathml.html"));
  });
  test("image resource transactions copy, rename, unlink and trash with exact source patches", async () => {
    const folder = path.join(directory, "managed-images");
    await fs.mkdir(folder);
    const local = path.join(folder, "本地 图片.svg");
    await fs.writeFile(
      local,
      '<svg xmlns="http://www.w3.org/2000/svg"><text>图</text></svg>',
    );
    const file = path.join(folder, "resources.md");
    const text =
      '\ufeff# Images\r\n\r\n![inline](%E6%9C%AC%E5%9C%B0%20%E5%9B%BE%E7%89%87.svg "title")\r\n![ref][shared]\n\n[shared]: <%E6%9C%AC%E5%9C%B0%20%E5%9B%BE%E7%89%87.svg> "same"\r\n<img src="%E6%9C%AC%E5%9C%B0%20%E5%9B%BE%E7%89%87.svg" width="64">\r\n`![example](ignored.svg)`\n';
    await fs.writeFile(file, text);
    let document = await invoke("openFile", { path: file });
    let listed = await invoke("listImageReferences", {
      documentPath: file,
      text: document.text,
    });
    expect(listed.references).toHaveLength(1);
    expect(listed.references[0].occurrences).toHaveLength(3);
    const cancelled = await invoke("prepareImageOperation", {
      operation: "copy",
      documentPath: file,
      text: document.text,
      revision: document.revision,
      targetFolder: "copied",
    });
    expect(await invoke("cancelImageOperation", { id: cancelled.id })).toBe(
      true,
    );
    expect(await fs.readFile(file, "utf8")).toBe(text);
    let prepared = await invoke("prepareImageOperation", {
      operation: "copy",
      documentPath: file,
      text: document.text,
      revision: document.revision,
      targetFolder: "copied",
    });
    expect(prepared.patches).toHaveLength(3);
    await expect(fs.stat(prepared.resources[0].target)).rejects.toThrow();
    let committed = await invoke("commitImageOperation", { id: prepared.id });
    document = committed.document;
    expect(committed.text).toContain("copied/");
    expect(await fs.readFile(local, "utf8")).toContain("图");
    expect(
      (await fs.readFile(file, "utf8")).startsWith("\ufeff# Images\r\n"),
    ).toBe(true);
    expect(document.text).toContain("`![example](ignored.svg)`");
    listed = await invoke("listImageReferences", {
      documentPath: file,
      text: committed.text,
    });
    const copy = listed.references[0].path,
      target = path.join(folder, "renamed.svg");
    prepared = await invoke("prepareImageOperation", {
      operation: "rename",
      documentPath: file,
      text: committed.text,
      revision: document.revision,
      items: [{ id: listed.references[0].id, target }],
    });
    committed = await invoke("commitImageOperation", { id: prepared.id });
    expect(committed.resources[0].trashed).toBe(true);
    await expect(fs.stat(copy)).rejects.toThrow();
    expect(await fs.readFile(target, "utf8")).toContain("图");
    prepared = await invoke("prepareImageOperation", {
      operation: "unlink",
      documentPath: file,
      text: committed.text,
      revision: committed.document.revision,
    });
    committed = await invoke("commitImageOperation", { id: prepared.id });
    expect(committed.text).not.toContain("![inline]");
    expect(committed.text).not.toContain("<img");
    expect(await fs.readFile(target, "utf8")).toContain("图");
    document = await invoke("saveFile", {
      ...committed.document,
      text: committed.text + "\n![delete](renamed.svg)\n",
    });
    prepared = await invoke("prepareImageOperation", {
      operation: "delete",
      documentPath: file,
      text: document.text,
      revision: document.revision,
    });
    committed = await invoke("commitImageOperation", { id: prepared.id });
    expect(committed.resources[0].trashed).toBe(true);
    await expect(fs.stat(target)).rejects.toThrow();
    expect(await fs.readFile(local, "utf8")).toContain("图");
    await fs.writeFile(
      path.join(outputDir, "resources-final.md"),
      await fs.readFile(file),
    );
  });
  test("image resource downloads batch atomically and refuse failed fetch or stale document commit", async () => {
    const server = http.createServer((request, response) => {
      if (request.url === "/missing") {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "image/svg+xml" });
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg"><text>' +
          request.url +
          "</text></svg>",
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}`,
        file = path.join(directory, "download-batch.md");
      await fs.writeFile(
        file,
        `![one](${base}/one.svg)\n\n![two][two]\n\n[two]: ${base}/two.svg\n`,
      );
      let document = await invoke("openFile", { path: file });
      let prepared = await invoke("prepareImageOperation", {
        operation: "download",
        documentPath: file,
        text: document.text,
        revision: document.revision,
        targetFolder: "downloaded-batch",
      });
      expect(prepared.resources).toHaveLength(2);
      expect(prepared.text).not.toContain(base);
      await fs.writeFile(file, "outside edit");
      await expect(
        invoke("commitImageOperation", { id: prepared.id }),
      ).rejects.toThrow(/CONFLICT/);
      for (const item of prepared.resources)
        await expect(fs.stat(item.target)).rejects.toThrow();
      await fs.writeFile(file, document.text);
      document = await invoke("openFile", { path: file });
      await expect(
        invoke("prepareImageOperation", {
          operation: "download",
          documentPath: file,
          text: document.text + `\n![missing](${base}/missing)`,
          revision: document.revision,
          targetFolder: "failed-downloads",
        }),
      ).rejects.toThrow(/HTTP 404/);
      await expect(
        fs.stat(path.join(directory, "failed-downloads")),
      ).rejects.toThrow();
      prepared = await invoke("prepareImageOperation", {
        operation: "download",
        documentPath: file,
        text: document.text,
        revision: document.revision,
        targetFolder: "downloaded-batch",
      });
      const result = await invoke("commitImageOperation", { id: prepared.id });
      expect(result.resources).toHaveLength(2);
      for (const item of result.resources)
        expect(await fs.readFile(item.target, "utf8")).toContain("<svg");
      const moved = await invoke("prepareImageOperation", {
        operation: "move",
        documentPath: file,
        text: result.text,
        revision: result.document.revision,
        targetFolder: "moved-batch",
      });
      const completed = await invoke("commitImageOperation", { id: moved.id });
      expect(completed.resources.every((item) => item.trashed)).toBe(true);
      for (const item of completed.resources)
        expect(await fs.readFile(item.target, "utf8")).toContain("<svg");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  test("new appearance settings and file sort controls persist with type checks", async () => {
    const patch = {
      strictMarkdown: false,
      cjkEmphasis: true,
      codeWrap: false,
      defaultCodeLanguage: "c++",
      themeLibrary: { Custom: "body{color:#123456}" },
      activeThemeName: "Custom",
      outlineNumbering: true,
      sortDescending: true,
      foldersFirst: false,
      fileSort: "created",
    };
    await invoke("updateSettings", patch);
    const boot = await invoke("bootstrap");
    for (const [key, value] of Object.entries(patch))
      expect(boot.settings[key]).toEqual(value);
    await expect(
      invoke("updateSettings", { defaultCodeLanguage: "<script>" }),
    ).rejects.toThrow(/language/);
    await expect(
      invoke("updateSettings", { themeLibrary: { constructor: "bad" } }),
    ).rejects.toThrow(/theme library/);
    const folder = path.join(directory, "sort-controls");
    await fs.mkdir(folder);
    await fs.mkdir(path.join(folder, "z-folder"));
    await fs.writeFile(path.join(folder, "2.md"), "22");
    await fs.writeFile(path.join(folder, "10.md"), "ten");
    const asc = await invoke("listFiles", {
        path: folder,
        sort: "name",
        descending: false,
        foldersFirst: false,
      }),
      desc = await invoke("listFiles", {
        path: folder,
        sort: "name",
        descending: true,
        foldersFirst: false,
      });
    expect(asc.map((item) => item.name)).toEqual(["2.md", "10.md", "z-folder"]);
    expect(desc.map((item) => item.name)).toEqual(
      [...asc].reverse().map((item) => item.name),
    );
    expect(
      (
        await invoke("listFiles", {
          path: folder,
          sort: "size",
          descending: true,
          foldersFirst: true,
        })
      )[0].isDirectory,
    ).toBe(true);
    const created = await invoke("listFiles", {
      path: folder,
      sort: "created",
      descending: false,
      foldersFirst: false,
    });
    expect(created.every((item) => Number.isFinite(item.birthtime))).toBe(true);
    expect(created.map((item) => item.birthtime)).toEqual(
      created.map((item) => item.birthtime).sort((a, b) => a - b),
    );
    await invoke("updateSettings", {
      strictMarkdown: true,
      cjkEmphasis: false,
      codeWrap: true,
      defaultCodeLanguage: "javascript",
      themeLibrary: {},
      activeThemeName: "",
      outlineNumbering: false,
      sortDescending: false,
      foldersFirst: true,
      fileSort: "name",
    });
  });
  test("global search supports Unicode whole words and cancels an expensive worker", async () => {
    const folder = path.join(directory, "whole-word-search");
    await fs.mkdir(folder);
    await fs.writeFile(
      path.join(folder, "words.md"),
      "cat cats bobcat\n猫 小猫 猫咪\nnaïve naïveté\ncafe\ncafé\na+b a.b\n",
    );
    const whole = await invoke("searchFiles", {
      path: folder,
      query: "猫",
      wholeWord: true,
    });
    expect(whole).toHaveLength(1);
    expect(whole[0].line).toBe(2);
    expect(
      (
        await invoke("searchFiles", {
          path: folder,
          query: "cafe",
          wholeWord: true,
        })
      ).map((item) => item.line),
    ).toEqual([4]);
    expect(
      await invoke("searchFiles", {
        path: folder,
        query: "a+b",
        wholeWord: true,
      }),
    ).toHaveLength(1);
    await fs.writeFile(path.join(folder, "slow.md"), "a".repeat(10000) + "!");
    await page.evaluate((folder) => {
      window.__cancelledSearch = window.inkstone.invoke("searchFiles", {
        path: folder,
        query: "^(a+)+$",
        regex: true,
        id: "cancel-expensive",
      });
    }, folder);
    await page.waitForTimeout(80);
    const started = Date.now();
    expect(await invoke("cancelSearch", { id: "cancel-expensive" })).toBe(true);
    expect(await page.evaluate(() => window.__cancelledSearch)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2000);
  });
  test("image insertion honors document image roots and escapes spaces, parentheses and Chinese paths", async () => {
    const folder = path.join(directory, "image-root-case");
    await fs.mkdir(folder);
    const file = path.join(folder, "root doc.md");
    await fs.writeFile(file, "# Root assets\n");
    const root = "media (根)",
      imageFolder = "media (根)/assets (图)",
      svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>根图片</text></svg>',
      dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    const [inserted] = await invoke("insertImages", {
      documentPath: file,
      imageRoot: root,
      imageFolder,
      images: [{ name: "图片 (test).svg", dataUrl }],
    });
    expect(inserted.markdownPath).toBe(
      "assets%20%28%E5%9B%BE%29/%E5%9B%BE%E7%89%87%20%28test%29.svg",
    );
    expect(inserted.relativePath).toBe(inserted.markdownPath);
    const parsed = await invoke("listImageReferences", {
      documentPath: file,
      imageRoot: root,
      text: `![插入](${inserted.markdownPath})`,
    });
    expect(parsed.references).toHaveLength(1);
    expect(parsed.references[0].path).toBe(inserted.path);
    expect(await fs.readFile(inserted.path, "utf8")).toBe(svg);
    const [same] = await invoke("insertImages", {
      documentPath: file,
      imageRoot: root,
      imageFolder,
      images: [{ name: "图片 (test).svg", dataUrl }],
    });
    expect(same.path).toBe(inserted.path);
    const [withoutRoot] = await invoke("insertImages", {
      documentPath: file,
      imageFolder: "plain assets (图)",
      images: [{ name: "图片 (test).svg", dataUrl }],
    });
    expect(withoutRoot.relativePath).toContain("plain assets (图)");
    expect(withoutRoot.markdownPath).toContain(
      "plain%20assets%20%28%E5%9B%BE%29/",
    );
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "image/svg+xml" });
      response.end(svg);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const [downloaded] = await invoke("downloadImage", {
        documentPath: file,
        imageRoot: root,
        imageFolder,
        url: `http://127.0.0.1:${server.address().port}/download.svg`,
      });
      const refs = await invoke("listImageReferences", {
        documentPath: file,
        imageRoot: root,
        text: `<img src="${downloaded.markdownPath}">`,
      });
      expect(refs.references[0].path).toBe(downloaded.path);
      expect(downloaded.markdownPath).not.toContain("media");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  test("bundled spelling works on a fresh profile with only local dictionary requests", async () => {
    const profile = path.join(directory, "offline-spelling-profile"),
      netlog = path.join(outputDir, "offline-spelling-netlog.json");
    const environment = {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":91",
      INKSTONE_USER_DATA: profile,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    const isolated = await electron.launch({
      args: [
        "--no-sandbox",
        "--disable-gpu",
        `--log-net-log=${netlog}`,
        path.resolve("."),
      ],
      env: environment,
    });
    let status, spelling;
    try {
      const localPage = await isolated.firstWindow();
      await localPage.waitForFunction(() => !!window.inkstone);
      await expect
        .poll(
          async () =>
            (
              await localPage.evaluate(() =>
                window.inkstone.invoke("spellcheckStatus"),
              )
            ).available,
          { timeout: 10000 },
        )
        .toBe(true);
      status = await localPage.evaluate(() =>
        window.inkstone.invoke("spellcheckStatus"),
      );
      expect(status.enabled).toBe(true);
      expect(status.languages).toContain("en-US");
      expect(status.bundledLanguages).toContain("en-US");
      expect(status.externalDownloads).toBe(false);
      expect(status.dictionaryURL).toBe("inkstone-dictionary://local/");
      expect(status.error).toBe("");
      const protocol = await isolated.evaluate(async ({ net }) => {
        const local = await net.fetch(
          "inkstone-dictionary://local/EN-US-10-2.BDIC",
        );
        const missing = await net.fetch(
          "inkstone-dictionary://local/absent-1-0.bdic",
        );
        return {
          status: local.status,
          bytes: (await local.arrayBuffer()).byteLength,
          missing: missing.status,
        };
      });
      expect(protocol).toEqual({ status: 200, bytes: 451982, missing: 404 });
      await isolated.evaluate(({ BrowserWindow }) => {
        global.__spellingParams = [];
        const window = BrowserWindow.getAllWindows()[0];
        window.webContents.removeAllListeners("context-menu");
        window.webContents.on("context-menu", (_event, params) => {
          global.__spellingParams.push({
            word: params.misspelledWord,
            suggestions: params.dictionarySuggestions,
          });
        });
      });
      await localPage.evaluate(() => {
        const area = document.createElement("textarea");
        area.id = "offline-spelling-test";
        area.spellcheck = true;
        area.style =
          "position:fixed;z-index:99999;left:20px;top:100px;width:400px;height:80px;font:20px monospace";
        document.body.append(area);
      });
      const input = localPage.locator("#offline-spelling-test");
      await input.fill("mispelled ");
      await input.press("End");
      await localPage.waitForTimeout(400);
      await expect
        .poll(
          async () => {
            await input.click({ button: "right", position: { x: 35, y: 16 } });
            return isolated.evaluate(
              () => global.__spellingParams.at(-1)?.word || "",
            );
          },
          { timeout: 8000 },
        )
        .toBe("mispelled");
      spelling = await isolated.evaluate(() => global.__spellingParams.at(-1));
      expect(spelling.suggestions).toContain("misspelled");
      await localPage.evaluate(() =>
        window.inkstone.invoke("updateSettings", { spellcheck: false }),
      );
      expect(
        (
          await localPage.evaluate(() =>
            window.inkstone.invoke("spellcheckStatus"),
          )
        ).enabled,
      ).toBe(false);
      await localPage.evaluate(() =>
        window.inkstone.invoke("updateSettings", { spellcheck: true }),
      );
      expect(
        (
          await localPage.evaluate(() =>
            window.inkstone.invoke("spellcheckStatus"),
          )
        ).enabled,
      ).toBe(true);
    } finally {
      await isolated.close();
    }
    const log = JSON.parse(await fs.readFile(netlog, "utf8"));
    const urls = log.events.flatMap((event) =>
      Object.entries(event.params || {})
        .filter(
          ([key, value]) =>
            /url/i.test(key) &&
            typeof value === "string" &&
            /^https?:\/\//i.test(value),
        )
        .map(([, value]) => value),
    );
    const external = urls.filter(
      (value) =>
        !["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname),
    );
    expect(external).toEqual([]);
    await fs.writeFile(
      path.join(outputDir, "offline-spelling-validation.json"),
      JSON.stringify({ status, spelling, externalRequests: external }, null, 2),
    );
  });
});
