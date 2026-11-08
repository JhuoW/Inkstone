/** Packaged Windows first-run, About, and Default apps integration; never changes defaults. */
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { artifactPath } from "./artifact-path.mjs";

if (process.platform !== "win32") throw Error("Native Windows is required.");
if (!process.env.INKSTONE_EXECUTABLE)
  throw Error("Set INKSTONE_EXECUTABLE to the packaged Inkstone.exe.");
const executable = path.resolve(process.env.INKSTONE_EXECUTABLE);
const variant = process.env.INKSTONE_NATIVE_VARIANT || "packaged";
if (!/^[a-z0-9-]+$/i.test(variant)) throw Error("Invalid evidence variant.");
function expectedFlag(name) {
  const value = process.env[name];
  if (value === undefined || value === "") return undefined;
  if (value === "1") return true;
  if (value === "0") return false;
  throw Error(`${name} must be 0 or 1.`);
}
const expectedRegistered = expectedFlag("INKSTONE_EXPECT_REGISTERED");
const expectedSeed = expectedFlag("INKSTONE_EXPECT_INSTALLER_SEED");
const resources = path.join(path.dirname(executable), "resources");
const { extractFile } = createRequire(import.meta.url)("@electron/asar");
const { resolveSystemLanguage } = createRequire(import.meta.url)(
  "../electron/language.cjs",
);
const asar = path.join(resources, "app.asar");
const bundledLicense = extractFile(asar, "LICENSE").toString("utf8");
const manifest = JSON.parse(extractFile(asar, "package.json").toString("utf8"));
assert.equal(manifest.version, "0.6.1");
assert.equal(manifest.license, "AGPL-3.0-only");
let seed;
try {
  seed = JSON.parse(
    await fs.readFile(path.join(resources, "installer-locale.json"), "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const seeded = ["en", "zh-CN"].includes(seed?.locale);
if (expectedSeed !== undefined) assert.equal(seeded, expectedSeed);
const output = artifactPath("windows-integration", variant);
await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "inkstone-win-integration-"),
);
const profile = path.join(temp, "fresh-profile");
await fs.mkdir(profile);
assert.deepEqual(await fs.readdir(profile), []);
const documentPath = path.join(temp, "Windows 集成 文稿.md");
const original = Buffer.from(
  "\uFEFF# Windows integration\r\n\r\nKeep this selected text unchanged.\r\n\r\n中文路径与离线许可证。\r\n",
);
await fs.writeFile(documentPath, original);
const env = { ...process.env, INKSTONE_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.INKSTONE_TEST_NO_SANDBOX;
const errors = [];
const result = {
  version: "0.6.1",
  variant,
  executable,
  passed: false,
  normalSandbox: true,
  installerSeed: seeded,
  freshPrivateProfile: true,
  settingsLaunchStubbed: true,
  clipboardUntouched: true,
  screenshots: [],
  errors,
};
let app, page;
async function start() {
  app = await electron.launch({
    executablePath: executable,
    args: [documentPath],
    env,
    chromiumSandbox: true,
    timeout: 30000,
  });
  assert.equal(app.process().spawnargs.includes("--no-sandbox"), false);
  const observe = (target) =>
    target.on("pageerror", (error) => errors.push(error.message));
  app.on("window", observe);
  page = await app.firstWindow();
  observe(page);
  await page.waitForFunction(
    (file) =>
      window.__inkstone?.getDocument().path === file &&
      !__inkstone.editor.view.state.readOnly,
    documentPath,
  );
  // Stub the actual shell object before clicking any external launch action.
  await app.evaluate(({ shell }) => {
    global.__windowsIntegrationOpenExternal = shell.openExternal;
    global.__windowsIntegrationURIs = [];
    shell.openExternal = async (uri) => {
      global.__windowsIntegrationURIs.push(uri);
    };
  });
}
async function stop() {
  if (!app) return;
  const process = app.process();
  await app
    .evaluate(({ shell }) => {
      if (global.__windowsIntegrationOpenExternal)
        shell.openExternal = global.__windowsIntegrationOpenExternal;
      delete global.__windowsIntegrationOpenExternal;
    })
    .catch(() => {});
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
  if (process.exitCode === null && process.signalCode === null) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("The integration test application did not exit.")),
        10000,
      );
      process.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  app = undefined;
}
const invoke = (name) =>
  page.evaluate((method) => __inkstone.invoke(method), name);
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, name), fullPage: true });
  result.screenshots.push(name);
}
async function selectText() {
  return page.evaluate(() => {
    const editor = __inkstone.editor;
    const anchor = editor.getText().indexOf("selected text");
    if (anchor < 0) throw Error("Synthetic document selection is missing.");
    editor.setSelection({ anchor, head: anchor + "selected text".length });
    editor.focus();
    return { text: editor.getText(), selection: editor.getSelection() };
  });
}
async function assertSelection(expected) {
  assert.deepEqual(
    await page.evaluate(() => ({
      text: __inkstone.editor.getText(),
      selection: __inkstone.editor.getSelection(),
    })),
    expected,
  );
}
async function toolsCommand(id) {
  const windowId = await (
    await app.browserWindow(page)
  ).evaluate((win) => win.id);
  return app.evaluate(
    ({ Menu, BrowserWindow }, { id, windowId }) => {
      const menu = Menu.getApplicationMenu();
      const tools = menu.items.find((item) =>
        item.submenu?.items.some((child) => child.id === "about"),
      );
      if (!["Tools", "工具"].includes(tools?.label))
        throw Error("The Tools menu is missing.");
      const item = tools.submenu.getMenuItemById(id);
      if (!item?.enabled) throw Error(`Tools command ${id} is unavailable.`);
      item.click(item, BrowserWindow.fromId(windowId));
      return { menu: tools.label, item: item.label };
    },
    { id, windowId },
  );
}
async function chooseLocale(locale) {
  await page.evaluate(
    (locale) => __inkstone.invoke("updateSettings", { locale }),
    locale,
  );
  await page.waitForFunction(
    (locale) => document.documentElement.lang === locale,
    locale,
  );
}
async function noRepeatedPrompt(target) {
  await target.waitForFunction(() => Boolean(window.__inkstone));
  const claim = await target.evaluate(() =>
    __inkstone.invoke("claimDefaultAppPrompt"),
  );
  assert.equal(claim.offered, false);
  assert.equal(await target.locator(".default-app-dialog[open]").count(), 0);
  assert.equal(await target.locator("#language-onboarding").isVisible(), false);
}
try {
  await start();
  const systemLanguages = await app.evaluate(({ app }) =>
    app.getPreferredSystemLanguages(),
  );
  const systemLocale = await resolveSystemLanguage(systemLanguages);
  const initialLocale = seeded ? seed.locale : systemLocale;
  assert.equal(await page.locator("html").getAttribute("lang"), initialLocale);
  result.initialLocale = initialLocale;
  result.windowsSystemLocale = systemLocale;
  const initialInfo = await invoke("getDefaultAppInfo");
  assert.equal(initialInfo.supported, true);
  assert.equal(initialInfo.packaged, true);
  assert.ok(!initialInfo.error, initialInfo.error);
  if (expectedRegistered !== undefined)
    assert.equal(initialInfo.registered, expectedRegistered);
  assert.equal(initialInfo.requiresInstallation, !initialInfo.registered);
  assert.deepEqual(initialInfo.extensions, [
    ".md",
    ".markdown",
    ".mdown",
    ".mkd",
  ]);
  result.registration = initialInfo;
  result.defaultBefore = initialInfo.currentDefault;
  if (seeded) {
    assert.equal(await page.locator("#language-onboarding").isVisible(), false);
  } else {
    await page.locator("#language-onboarding").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#welcome-language").inputValue(),
      systemLocale,
    );
    await shot("first-language-choice.png");
    await page.locator("#welcome-continue").click();
    await page.locator("#language-onboarding").waitFor({ state: "hidden" });
  }
  if (initialInfo.registered) {
    await page.locator(".default-app-dialog[open]").waitFor();
    assert.equal(await page.locator(".default-app-dialog[open]").count(), 1);
    await shot("first-default-prompt.png");
    await page.locator("[data-default-later]").click();
    await page.locator(".default-app-dialog").waitFor({ state: "detached" });
    await shot("first-prompt-not-now.png");
    const saved = JSON.parse(
      await fs.readFile(path.join(profile, "settings.json"), "utf8"),
    );
    assert.equal(saved.defaultAppPrompted, true);
    result.defaultPromptPersisted = true;
  } else {
    assert.equal((await invoke("claimDefaultAppPrompt")).offered, false);
    assert.equal(await page.locator(".default-app-dialog[open]").count(), 0);
    result.unregisteredDoesNotOfferDefault = true;
  }
  const about = await invoke("getAboutInfo");
  assert.equal(about.version, "0.6.1");
  assert.equal(about.version, manifest.version);
  assert.equal(about.license, "AGPL-3.0-only");
  assert.equal(about.licenseText, bundledLicense);
  assert.equal(about.repository, "https://github.com/JhuoW/Inkstone");
  result.aboutVersionAndBundledLicenseExact = true;
  for (const locale of ["en", "zh-CN"]) {
    await chooseLocale(locale);
    const selected = await selectText();
    await toolsCommand("about");
    const dialog = page.locator(".about-dialog[open]");
    await dialog.waitFor();
    assert.equal(
      await dialog.locator("[data-about-version]").textContent(),
      "0.6.1",
    );
    assert.equal(
      await dialog.locator('.about-artwork [role="img"]').count(),
      1,
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".about-artwork img")].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    assert.equal(
      await dialog.locator("[data-about-source]").getAttribute("href"),
      about.repository,
    );
    await shot(`about-${locale}.png`);
    await dialog.locator("[data-about-view-license]").click();
    await dialog
      .locator("[data-about-license-view]")
      .waitFor({ state: "visible" });
    assert.equal(
      await dialog.locator("[data-about-license-text]").textContent(),
      bundledLicense,
    );
    await shot(`license-${locale}.png`);
    await dialog.locator("[data-about-close]").click();
    await assertSelection(selected);
  }
  result.toolsAboutRendererBothLanguages = true;
  result.aboutClosePreservesDocumentAndSelection = true;
  await chooseLocale("en");
  const selection = await selectText();
  await toolsCommand("defaultApps");
  const files = page.locator("#settings-pane-files");
  await files.waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#settings-tab-files").getAttribute("aria-selected"),
    "true",
  );
  await page.waitForFunction(() =>
    Boolean(document.querySelector("#default-app-status")?.textContent.trim()),
  );
  const status = await page.locator("#default-app-status").textContent();
  if (!initialInfo.registered) assert.match(status, /Install Inkstone first/);
  else if (initialInfo.currentDefault?.name)
    assert.equal(status, `Current default: ${initialInfo.currentDefault.name}`);
  else assert.equal(status, "Windows did not report a confirmed default app.");
  assert.equal(await page.locator("#set-default-markdown").isEnabled(), true);
  await shot("preferences-files.png");
  await page.locator("#set-default-markdown").click();
  await page.waitForFunction(
    () => document.querySelector("#set-default-markdown")?.disabled === false,
  );
  const uris = await app.evaluate(() => global.__windowsIntegrationURIs);
  assert.equal(uris.length, 1);
  const registeredURI = `ms-settings:defaultapps?${initialInfo.registrationScope === "user" ? "registeredAppUser" : "registeredAppMachine"}=Inkstone`;
  assert.ok(
    (initialInfo.registered
      ? ["ms-settings:defaultapps", registeredURI]
      : ["ms-settings:defaultapps"]
    ).includes(uris[0]),
    `Unexpected external settings URI: ${uris[0]}`,
  );
  result.fixedSettingsURI = uris[0];
  await page.locator("#settings-done").click();
  await assertSelection(selection);
  const afterSettings = await invoke("getDefaultAppInfo");
  assert.deepEqual(afterSettings, initialInfo);
  result.preferencesEffectiveDefaultReadOnly = true;
  const next = app.waitForEvent("window");
  await page.evaluate(() => __inkstone.execute("newWindow"));
  const second = await next;
  await noRepeatedPrompt(second);
  result.newWindowHasNoRepeatedPrompt = true;
  await chooseLocale(initialLocale);
  assert.deepEqual(await fs.readFile(documentPath), original);
  await stop();
  await start();
  await noRepeatedPrompt(page);
  assert.equal(await page.locator("html").getAttribute("lang"), initialLocale);
  assert.deepEqual(await invoke("getDefaultAppInfo"), initialInfo);
  assert.deepEqual(await fs.readFile(documentPath), original);
  result.sameProfileRelaunchHasNoRepeatedPrompt = true;
  result.defaultAfter = (await invoke("getDefaultAppInfo")).currentDefault;
  assert.deepEqual(result.defaultAfter, result.defaultBefore);
  assert.deepEqual(errors, []);
  result.defaultUnchanged = true;
  result.syntheticBOMCRLFDocumentUnchanged = true;
  result.passed = true;
} catch (error) {
  result.failure = { message: error.message, stack: error.stack };
  await page
    ?.screenshot({ path: path.join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await stop();
  assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith("inkstone-win-integration-"));
  await fs.rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
  result.privateProfileRemoved = true;
  result.allTestAppsClosed = true;
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
}
