import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { artifactPath } from "../scripts/artifact-path.mjs";

const metadata = JSON.parse(await fs.readFile("package.json", "utf8"));
const licenseText = await fs.readFile("LICENSE", "utf8");
const executablePath = process.env.INKSTONE_EXECUTABLE
  ? path.resolve(process.env.INKSTONE_EXECUTABLE)
  : undefined;
const original =
  "# System integration\r\n\r\nPreserve **selected words** and undo history.\r\n";
let application, page, directory, profile, file, pageErrors;

test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-system-"));
  profile = path.join(directory, "profile");
  await fs.mkdir(profile);
  file = path.join(directory, "System 文稿.md");
  await fs.writeFile(file, original);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale: "en",
      theme: "light",
      firstRunComplete: true,
      defaultAppPrompted: true,
      autoSave: false,
      spellcheck: false,
    }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    executablePath,
    args: executablePath ? [file] : [process.cwd(), file],
    env,
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
  });
  page = await application.firstWindow();
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.waitForFunction(
    () =>
      window.__inkstone?.getDocument().path?.endsWith("System 文稿.md") &&
      !__inkstone.editor.view.state.readOnly,
  );
  // Every shell action is intercepted in the real main process. These tests
  // neither open Windows Settings/a browser nor write an OS file association.
  await application.evaluate(({ shell, dialog }) => {
    global.__systemExternal = [];
    global.__systemNativeMessages = [];
    shell.openExternal = async (url) => {
      global.__systemExternal.push(url);
    };
    dialog.showMessageBox = async (...args) => {
      global.__systemNativeMessages.push(args.at(-1)?.message || "message");
      return { response: 0, checkboxChecked: false };
    };
    dialog.showMessageBoxSync = (...args) => {
      global.__systemNativeMessages.push(args.at(-1)?.message || "message");
      return 0;
    };
  });
});

test.afterEach(async () => {
  try {
    if (page && !page.isClosed()) expect(pageErrors).toEqual([]);
    if (file) expect(await fs.readFile(file, "utf8")).toBe(original);
  } finally {
    if (application) {
      await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await application.close().catch(() => {});
    }
    application = null;
    page = null;
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
});

async function nativeCommand(command) {
  await application.evaluate(({ Menu, BrowserWindow }, command) => {
    const item = Menu.getApplicationMenu().getMenuItemById(command);
    if (!item?.enabled) throw Error(`Native command unavailable: ${command}`);
    const win = BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.isDestroyed(),
    );
    win.focus();
    item.click(item, win, {});
  }, command);
}

async function documentState() {
  return page.evaluate(() => ({
    text: __inkstone.editor.getText(),
    selection: __inkstone.editor.getSelection(),
    dirty: __inkstone.getDocument().dirty,
  }));
}

async function selectWords() {
  await page.evaluate(() => {
    const editor = __inkstone.editor;
    editor.setMode("source");
    const start = editor.view.state.doc.toString().indexOf("selected words");
    editor.setSelection({
      anchor: start,
      head: start + "selected words".length,
    });
    editor.focus();
  });
}

async function screenshot(name) {
  const output = artifactPath("system-integration", name + ".png");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output });
}

test("About IPC reads the runtime version and the exact bundled AGPL license", async () => {
  const runtime = await application.evaluate(({ app }) => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
  }));
  const info = await page.evaluate(() => __inkstone.invoke("getAboutInfo"));
  expect(runtime).toEqual({
    version: metadata.version,
    packaged: Boolean(executablePath),
  });
  expect(info).toMatchObject({
    name: "Inkstone",
    version: runtime.version,
    license: "AGPL-3.0-only",
    repository: "https://github.com/JhuoW/Inkstone",
    contributors: ["Wei Zhuo"],
    contributorURL: "https://wei2hu0.github.io/",
  });
  expect(info.licenseText).toBe(licenseText);
  expect(info.licenseText).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
  expect(info.copyright).toContain("Inkstone contributors");
  expect(await application.evaluate(() => global.__systemExternal)).toEqual([]);
});

test("native Tools About opens one renderer dialog and preserves selection and undo", async () => {
  await selectWords();
  await page.keyboard.type("A replacement");
  await page.evaluate(() => {
    const editor = __inkstone.editor;
    const start = editor.view.state.doc.toString().indexOf("A replacement");
    editor.setSelection({ anchor: start + 2, head: start + 8 });
    editor.focus();
  });
  const before = await documentState();
  expect(before.dirty).toBe(true);
  await nativeCommand("about");
  await expect(page.locator(".about-dialog")).toBeVisible();
  await nativeCommand("about");
  await expect(page.locator(".about-dialog")).toHaveCount(1);
  expect(
    await application.evaluate(() => global.__systemNativeMessages),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".about-dialog")).toHaveCount(0);
  expect(await documentState()).toEqual(before);
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(() => __inkstone.editor.getText()))
    .toBe(original);
  await page.keyboard.press("Control+y");
  await expect
    .poll(() => page.evaluate(() => __inkstone.editor.getText()))
    .toBe(before.text);
});

for (const [locale, theme, title, close] of [
  ["en", "light", "About Inkstone", "Close"],
  ["zh-CN", "dark", "关于 Inkstone", "关闭"],
]) {
  test(`About ${locale}/${theme} shows local branding and offline license with trusted links`, async () => {
    await page.evaluate(
      ({ locale, theme }) =>
        __inkstone.invoke("updateSettings", { locale, theme }),
      { locale, theme },
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await selectWords();
    const before = await documentState();
    await nativeCommand("about");
    const dialog = page.locator(".about-dialog");
    await expect(dialog).toHaveAccessibleName(title);
    await expect(dialog.locator("[data-about-version]")).toHaveText(
      metadata.version,
    );
    await expect(dialog.locator(".about-product")).toHaveText("Inkstone 墨石");
    await expect(dialog.locator("[data-about-description]")).toHaveText(
      locale === "zh-CN" ? "让想法落在纸上" : "A place for your thoughts",
    );
    const artwork = dialog.locator(`.about-artwork .brand-artwork-${theme}`);
    await expect(artwork).toBeVisible();
    expect(
      await artwork.evaluate(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    ).toBe(true);
    const artworkURL = await artwork.getAttribute("src");
    // Vite embeds the small, original SVG in the production renderer bundle.
    expect(artworkURL).toMatch(/^data:image\/svg\+xml,/);
    const artworkSVG = decodeURIComponent(
      artworkURL.split(",").slice(1).join(","),
    );
    expect(artworkSVG).toContain("<title>Inkstone mark</title>");
    expect(artworkSVG).toContain(theme === "dark" ? "#F4F0E6" : "#1C1A21");
    await expect(dialog.locator(".about-license-badge")).toHaveText("AGPL-3.0");
    await expect(dialog.locator("[data-about-contributor]")).toHaveText(
      "Wei Zhuo",
    );
    await expect(dialog.locator("[data-about-contributor]")).toHaveAttribute(
      "href",
      "https://wei2hu0.github.io/",
    );
    const url = page.url();
    await dialog.locator("[data-about-source]").click();
    await dialog.locator("[data-about-contributor]").click();
    await page.context().setOffline(true);
    try {
      await dialog.locator("[data-about-view-license]").click();
      await expect(dialog.locator("[data-about-license-text]")).toBeVisible();
      expect(
        await dialog.locator("[data-about-license-text]").textContent(),
      ).toBe(licenseText);
      await dialog.locator("[data-about-license-link]").click();
      await expect
        .poll(() => application.evaluate(() => global.__systemExternal))
        .toEqual([
          "https://github.com/JhuoW/Inkstone",
          "https://wei2hu0.github.io/",
          "https://www.gnu.org/licenses/agpl-3.0.html",
        ]);
      expect(page.url()).toBe(url);
      await screenshot(`${locale}-${theme}-license`);
      await dialog.locator("[data-about-back]").click();
      await expect(dialog.locator("[data-about-view-license]")).toBeFocused();
      await expect(dialog.locator("[data-about-close]")).toHaveAccessibleName(
        close,
      );
      await screenshot(`${locale}-${theme}-about`);
      await dialog.locator("[data-about-close]").click();
      await expect(dialog).toHaveCount(0);
      expect(await documentState()).toEqual(before);
      await expect(page.locator(".cm-content")).toBeFocused();
    } finally {
      await page.context().setOffline(false);
    }
    expect(
      await application.evaluate(() => global.__systemNativeMessages),
    ).toEqual([]);
  });
}

test("native Default Markdown opens Files preferences and reports actual read-only association data", async () => {
  const first = await page.evaluate(() =>
    __inkstone.invoke("getDefaultAppInfo"),
  );
  const second = await page.evaluate(() =>
    __inkstone.invoke("getDefaultAppInfo"),
  );
  expect(first).toMatchObject({
    supported: true,
    packaged: Boolean(executablePath),
    registered: false,
  });
  expect(first.extensions).toEqual([".md", ".markdown", ".mdown", ".mkd"]);
  expect(first.registrationScope).toBeNull();
  expect(first.requiresInstallation).toBe(true);
  expect(first.error).toBeUndefined();
  expect(second).toEqual(first);
  if (first.currentDefault) {
    expect(first.currentDefault.progId.length).toBeGreaterThan(0);
    expect(typeof first.currentDefault.name).toBe("string");
    expect(typeof first.currentDefault.isInkstone).toBe("boolean");
  }
  await selectWords();
  const before = await documentState();
  await nativeCommand("defaultApps");
  const preferences = page.locator(".preferences-dialog");
  await expect(preferences).toBeVisible();
  await expect(preferences.locator("#settings-tab-files")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(preferences.locator('[data-pane="files"]')).toBeVisible();
  await expect(preferences.locator("#set-default-markdown")).toBeEnabled();
  await expect(preferences.locator("#default-app-status")).toHaveText(
    "Install Inkstone first so it appears in Default apps and Open with.",
  );
  await preferences.locator("#settings-done").click();
  expect(await documentState()).toEqual(before);
  expect(await application.evaluate(() => global.__systemExternal)).toEqual([]);
});

test("Default Apps button requests only fixed Settings URI without claiming an association change", async () => {
  const before = await page.evaluate(() =>
    __inkstone.invoke("getDefaultAppInfo"),
  );
  await nativeCommand("defaultApps");
  const preferences = page.locator(".preferences-dialog");
  await expect(preferences.locator("#set-default-markdown")).toBeEnabled();
  await preferences.locator("#set-default-markdown").click();
  await expect
    .poll(() => application.evaluate(() => global.__systemExternal))
    .toEqual(["ms-settings:defaultapps"]);
  await expect(preferences.locator("#default-app-status")).toHaveText(
    "Windows Settings is open. Install Inkstone first so it appears in Default apps.",
  );
  await expect(preferences.locator("#set-default-markdown")).toBeEnabled();
  const after = await page.evaluate(() =>
    __inkstone.invoke("getDefaultAppInfo"),
  );
  expect(after).toEqual(before);
  expect(after.currentDefault?.progId || null).toBe(
    before.currentDefault?.progId || null,
  );
  await screenshot("default-apps-development");
  await preferences.locator("#settings-done").click();
});

test("Files preferences distinguish query failure, unsupported platform, and unopened Settings", async () => {
  // Isolated negative UI states: production IPC is exercised by the other
  // cases. A replacement test handler never queries/writes the real registry.
  await application.evaluate(({ ipcMain }) => {
    global.__systemDefaultFixture = { supported: true, error: "query failed" };
    ipcMain.removeHandler("inkstone:invoke");
    ipcMain.handle("inkstone:invoke", (_event, method) => {
      if (method === "getDefaultAppInfo") return global.__systemDefaultFixture;
      if (method === "openDefaultApps") return { opened: false };
      if (method === "spellcheckStatus") return { available: false };
      return null;
    });
  });
  await nativeCommand("defaultApps");
  let preferences = page.locator(".preferences-dialog");
  await expect(preferences.locator("#default-app-status")).toHaveText(
    "The current default could not be checked. You can still open Windows Settings.",
  );
  await expect(preferences.locator("#set-default-markdown")).toBeEnabled();
  await preferences.locator("#set-default-markdown").click();
  await expect(page.locator("#toast")).toContainText(
    "Windows Default apps is unavailable.",
  );
  await expect(preferences.locator("#default-app-status")).not.toContainText(
    "Settings is open",
  );
  await preferences.locator("#settings-done").click();
  await application.evaluate(() => {
    global.__systemDefaultFixture = { supported: false, currentDefault: null };
  });
  await nativeCommand("defaultApps");
  preferences = page.locator(".preferences-dialog");
  await expect(preferences.locator("#default-app-status")).toHaveText(
    "This action is available on Windows.",
  );
  await expect(preferences.locator("#set-default-markdown")).toBeDisabled();
  await preferences.locator("#settings-done").click();
  expect(await application.evaluate(() => global.__systemExternal)).toEqual([]);
});

test("development launch skips installed-app offer and validates the persisted prompt boolean", async () => {
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { defaultAppPrompted: false }),
  );
  const first = await page.evaluate(() =>
    __inkstone.invoke("claimDefaultAppPrompt"),
  );
  const second = await page.evaluate(() =>
    __inkstone.invoke("claimDefaultAppPrompt"),
  );
  expect(first).toEqual({ offered: false });
  expect(second).toEqual({ offered: false });
  const invalid = await page.evaluate(async () => {
    try {
      await __inkstone.invoke("updateSettings", { defaultAppPrompted: "true" });
      return null;
    } catch (error) {
      return error.message;
    }
  });
  expect(invalid).toContain("defaultAppPrompted");
  expect(
    JSON.parse(await fs.readFile(path.join(profile, "settings.json"), "utf8"))
      .defaultAppPrompted,
  ).toBe(false);
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { defaultAppPrompted: true }),
  );
  expect(
    JSON.parse(await fs.readFile(path.join(profile, "settings.json"), "utf8"))
      .defaultAppPrompted,
  ).toBe(true);
  await expect(page.locator(".default-app-dialog")).toHaveCount(0);
  expect(await application.evaluate(() => global.__systemExternal)).toEqual([]);
});
