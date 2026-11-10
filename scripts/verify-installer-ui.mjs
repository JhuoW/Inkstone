/** Actual NSIS UI on Linux/Wine. Stops before installation; never substitutes for native Windows acceptance. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import * as ResEdit from "resedit";
import { artifactPath } from "./artifact-path.mjs";
const root = process.cwd();
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const output = path.resolve(
  process.env.INKSTONE_INSTALLER_UI_OUTPUT ||
    artifactPath("windows-installer-ui"),
);
await fs.mkdir(output, { recursive: true });
const result = {
  version,
  host: "Linux Wine with XTest input and read-only Win32 control inspection",
  nativeWindows: false,
  passed: false,
  installationPerformed: false,
  installationVerified: false,
  uninstallVerified: false,
  checks: [],
};
let xvfb, installerProcess, work, prefix, env, wine, lastSnapshot;
let logs = "";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = async (file) => Boolean(await fs.stat(file).catch(() => null));
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    env,
    encoding: "utf8",
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
async function localTool(override, command, fallback) {
  if (override) return path.resolve(override);
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return command;
  } catch {}
  if (fallback && (await exists(fallback))) return path.resolve(fallback);
  throw Error(
    `Missing ${command}; configure its INKSTONE_* path. No tools are downloaded by this check.`,
  );
}
function capture(name) {
  const filename = path.join(output, name + ".png");
  run("python3", [
    "-c",
    "import sys; from PIL import ImageGrab; ImageGrab.grab(xdisplay=sys.argv[1]).save(sys.argv[2])",
    env.DISPLAY,
    filename,
  ]);
  return path.basename(filename);
}
try {
  assert.equal(
    process.platform,
    "linux",
    "This script explicitly validates Wine UI on Linux; native Windows needs separate acceptance",
  );
  const installer = path.resolve(
    process.env.INKSTONE_INSTALLER ||
      `release/Inkstone-${version}-windows-x64.exe`,
  );
  assert.ok(
    await exists(installer),
    `Installer is not generated: ${installer}`,
  );
  result.installer = path.relative(root, installer);
  const installerBytes = await fs.readFile(installer);
  result.installerSHA256 = createHash("sha256")
    .update(installerBytes)
    .digest("hex");
  const pe = ResEdit.NtExecutable.from(installerBytes, { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(pe);
  const versions = ResEdit.Resource.VersionInfo.fromEntries(
    resources.entries,
  ).flatMap((info) =>
    info
      .getAllLanguagesForStringValues()
      .map((language) => info.getStringValues(language)),
  );
  assert.ok(
    versions.some(
      (info) =>
        info.ProductName === "Inkstone" &&
        (info.ProductVersion || "").startsWith(version),
    ),
    "Installer PE product/version must match the current release; old packages cannot pass this check",
  );
  wine = await localTool(
    process.env.INKSTONE_WINE,
    "wine",
    ".tools/wine/wine-11.0-amd64-wow64/bin/wine",
  );
  const winegcc = await localTool(
    process.env.INKSTONE_WINEGCC,
    "winegcc",
    path.join(path.dirname(wine), "winegcc"),
  );
  const xdotool = await localTool(
    process.env.INKSTONE_XDOTOOL,
    "xdotool",
    ".tools/ime/root/usr/bin/xdotool",
  );
  const xvfbBinary = await localTool(
    process.env.INKSTONE_XVFB,
    "Xvfb",
    ".tools/xvfb/usr/bin/Xvfb",
  );
  const sourcePrefix = path.resolve(
    process.env.INKSTONE_WINEPREFIX || ".tools/wine/profile",
  );
  assert.ok(
    await exists(path.join(sourcePrefix, "system.reg")),
    "A working initialized Wine prefix is required; the script clones it and never uses a user's live prefix for installation",
  );
  const display = process.env.INKSTONE_INSTALLER_DISPLAY || ":95";
  assert.match(
    display,
    /^:\d+$/,
    "Use a dedicated local X display such as :95",
  );
  const displayNumber = display.slice(1);
  assert.equal(
    await exists(`/tmp/.X11-unix/X${displayNumber}`),
    false,
    `${display} is already in use; choose a free INKSTONE_INSTALLER_DISPLAY`,
  );
  await fs.mkdir(path.join(root, ".tools"), { recursive: true });
  work = await fs.mkdtemp(path.join(root, ".tools", "installer-ui-"));
  const installerSnapshot = path.join(work, "installer.exe");
  await fs.writeFile(installerSnapshot, installerBytes);
  prefix = path.join(work, "wine-profile");
  // A full local copy gives this check its own Wine server/registry. cp preserves Wine's DOS symlinks.
  execFileSync("cp", ["-a", "--reflink=auto", sourcePrefix, prefix], {
    timeout: 60000,
  });
  env = {
    ...process.env,
    DISPLAY: display,
    WINEPREFIX: prefix,
    WINELOADER: wine,
    WINEDEBUG: "-all",
    WINEDLLOVERRIDES: "mscoree,mshtml=",
    LD_LIBRARY_PATH:
      path.resolve(".tools/ime/root/usr/lib/x86_64-linux-gnu") +
      ":" +
      (process.env.LD_LIBRARY_PATH || ""),
  };
  result.display = display;
  result.wineVersion = run(wine, ["--version"]).trim();
  xvfb = spawn(
    xvfbBinary,
    [display, "-screen", "0", "1440x1000x24", "-ac", "-nolisten", "tcp"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  xvfb.stderr.on("data", (data) => (logs += "Xvfb: " + data));
  xvfb.on("error", (error) => (logs += "Xvfb error: " + error.message));
  for (
    let i = 0;
    i < 50 && !(await exists(`/tmp/.X11-unix/X${displayNumber}`));
    i++
  )
    await pause(100);
  assert.ok(
    await exists(`/tmp/.X11-unix/X${displayNumber}`),
    "Dedicated X server did not start",
  );
  const probe = path.join(work, "probe.exe");
  const target = run(process.env.CC || "gcc", ["-dumpmachine"]).trim();
  const compile = run(
    winegcc,
    [
      "-b",
      target,
      "-o",
      probe,
      path.join(root, "scripts/helpers/windows-ui-probe.c"),
      "-luser32",
    ],
    { timeout: 30000 },
  );
  await fs.writeFile(path.join(output, "probe-compile.log"), compile);
  const cjkFont =
    process.env.INKSTONE_WINE_CJK_FONT ||
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";
  if (await exists(cjkFont)) {
    const family = process.env.INKSTONE_WINE_CJK_FAMILY || "Noto Sans CJK SC";
    const filename = path.basename(cjkFont);
    await fs.copyFile(
      cjkFont,
      path.join(prefix, "drive_c/windows/Fonts", filename),
    );
    const registry = "HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion";
    run(
      wine,
      [
        "reg.exe",
        "add",
        registry + "\\Fonts",
        "/v",
        family + " (TrueType)",
        "/t",
        "REG_SZ",
        "/d",
        filename,
        "/f",
      ],
      { timeout: 30000 },
    );
    for (const alias of [
      "SimSun",
      "MS Shell Dlg",
      "MS Shell Dlg 2",
      "Tahoma",
    ]) {
      run(wine, [
        "reg.exe",
        "add",
        registry + "\\FontSubstitutes",
        "/v",
        alias,
        "/t",
        "REG_SZ",
        "/d",
        family,
        "/f",
      ]);
    }
    // reg.exe may already have let the isolated server exit. Exit 1 means
    // there is no server to stop; a new probe process will load the registry.
    try {
      run(path.join(path.dirname(wine), "wineserver"), ["-k"]);
    } catch (error) {
      if (error.status !== 1) throw error;
    }
    result.wineFontOverride = {
      source: cjkFont,
      family,
      sha256: createHash("sha256")
        .update(await fs.readFile(cjkFont))
        .digest("hex"),
      scope:
        "Temporary Wine prefix only; neither installer nor application fonts were changed",
    };
  } else {
    result.wineFontOverride = null;
    result.fontNote =
      "No local Noto CJK fixture found; inspect Chinese glyph screenshots before claiming visual acceptance";
  }
  const inspect = () => {
    lastSnapshot = JSON.parse(run(probe, [], { timeout: 8000 }));
    return lastSnapshot.windows;
  };
  // Bring up the cloned prefix's Win64/X11 runtime before concurrently starting
  // the 32-bit NSIS process. A cold Wine prefix can otherwise stall the first
  // inspection while its services/display driver are still initializing.
  const preflightStarted = Date.now();
  const preflight = JSON.parse(run(probe, [], { timeout: 30000 }));
  assert.equal(
    preflight.windows.length,
    0,
    "The isolated prefix must have no pre-existing Inkstone dialogs",
  );
  result.winePreflightMs = Date.now() - preflightStarted;
  await fs.writeFile(
    path.join(output, "preflight-controls.json"),
    JSON.stringify(preflight, null, 2) + "\n",
  );
  const x = (...args) => run(xdotool, args);
  const click = (control) => {
    assert.ok(
      control.visible && control.enabled,
      "Refusing to click a hidden or disabled control",
    );
    const r = control.rect;
    x(
      "mousemove",
      "--sync",
      String(Math.round(r.x + r.width / 2)),
      String(Math.round(r.y + r.height / 2)),
    );
    x("click", "1");
  };
  async function waitFor(predicate, label, timeout = 20000) {
    const deadline = Date.now() + timeout;
    do {
      const windows = inspect();
      const value = predicate(windows);
      if (value) return value;
      await pause(160);
    } while (Date.now() < deadline);
    throw Error(
      `Timed out waiting for ${label}; last Win32 control tree is saved`,
    );
  }
  const languageWindow = (windows) =>
    windows.find((win) =>
      win.controls.some(
        (c) =>
          c.class === "ComboBox" &&
          c.visible &&
          c.items?.some((s) => /English/i.test(s)),
      ),
    );
  const saveSnapshot = async (name) =>
    fs.writeFile(
      path.join(output, name + ".json"),
      JSON.stringify(lastSnapshot, null, 2) + "\n",
    );
  for (const locale of ["en", "zh-CN"]) {
    const destination = path.join(work, "never-installed-" + locale);
    const windowsDestination = "Z:" + destination.replaceAll("/", "\\");
    installerProcess = spawn(
      wine,
      [installerSnapshot, `/D=${windowsDestination}`],
      {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    installerProcess.stdout.on("data", (data) => (logs += data));
    installerProcess.stderr.on("data", (data) => (logs += data));
    installerProcess.on(
      "error",
      (error) => (logs += "Installer error: " + error.message),
    );
    const selector = await waitFor(
      languageWindow,
      "the actual installer language selector",
    );
    const combo = selector.controls.find(
      (c) =>
        c.class === "ComboBox" &&
        c.visible &&
        c.items?.some((s) => /English/i.test(s)),
    );
    assert.equal(
      combo.items.length,
      2,
      "Installer offers exactly the configured two languages",
    );
    const englishIndex = combo.items.findIndex((s) => /English/i.test(s));
    const chineseIndex = combo.items.findIndex((s) =>
      /简体|Simplified/i.test(s),
    );
    assert.ok(
      englishIndex >= 0 && chineseIndex >= 0,
      "Real ComboBox must contain English and Simplified Chinese",
    );
    assert.equal(
      combo.selectedIndex,
      englishIndex,
      "Fresh selector defaults to English",
    );
    await saveSnapshot(locale + "-selector");
    const initialScreenshot = capture(locale + "-selector");
    click(combo);
    x("key", "--clearmodifiers", "Home");
    const targetIndex = locale === "en" ? englishIndex : chineseIndex;
    for (let i = 0; i < targetIndex; i++) x("key", "Down");
    x("key", "Return"); // Closes the combo popup, does not advance the installer.
    await pause(100);
    const selected = await waitFor((windows) => {
      const win = languageWindow(windows);
      const c = win?.controls.find((item) => item.handle === combo.handle);
      return c?.selectedIndex === targetIndex ? win : null;
    }, "selected language to match keyboard input");
    await saveSnapshot(locale + "-selected");
    const selectedScreenshot = capture(locale + "-selected");
    const accept = selected.controls.find(
      (c) => c.id === 1 && c.class === "Button" && c.visible,
    );
    assert.ok(accept, "Language dialog has its real OK button");
    click(accept);
    const firstPage = await waitFor(
      (windows) =>
        windows.find((win) => {
          const text = win.controls
            .filter((c) => c.visible)
            .map((c) => c.text)
            .join("\n");
          return locale === "en"
            ? /Choose Installation Options|Welcome to.*Inkstone/i.test(text)
            : /安装选项|欢迎.*Inkstone|欢迎使用/.test(text);
        }),
      `the localized ${locale} first installation page`,
    );
    const visibleText = firstPage.controls
      .filter((c) => c.visible)
      .map((c) => c.text)
      .join("\n");
    assert.ok(
      locale === "en"
        ? /Next/.test(visibleText) && /Cancel/.test(visibleText)
        : /下一步/.test(visibleText) && /取消/.test(visibleText),
      "Page action buttons match the selected language",
    );
    await saveSnapshot(locale + "-first-page");
    const firstPageScreenshot = capture(locale + "-first-page");
    const cancel = firstPage.controls.find(
      (c) => c.id === 2 && c.class === "Button" && c.visible && c.enabled,
    );
    assert.ok(
      cancel,
      "First setup page exposes Cancel; no Next/Install click is permitted",
    );
    click(cancel);
    // Modern UI may ask for confirmation; accept only an explicit quit confirmation.
    for (let i = 0; i < 30; i++) {
      const windows = inspect();
      if (!windows.length) break;
      const confirm = windows.find((win) =>
        /quit|exit|退出|中止|终止/i.test(
          win.controls
            .filter((c) => c.visible)
            .map((c) => c.text)
            .join(" "),
        ),
      );
      if (confirm) {
        const yes = confirm.controls.find(
          (c) => c.id === 6 && c.class === "Button" && c.visible && c.enabled,
        );
        if (yes) click(yes);
      }
      await pause(100);
    }
    await waitFor(
      (windows) => windows.length === 0,
      "installer to close after cancellation",
      8000,
    );
    for (
      let i = 0;
      i < 50 &&
      installerProcess.exitCode === null &&
      installerProcess.signalCode === null;
      i++
    )
      await pause(100);
    assert.ok(
      installerProcess.exitCode !== null ||
        installerProcess.signalCode !== null,
      "Canceled installer process must exit before the next independent run",
    );
    assert.equal(
      await exists(path.join(destination, "Inkstone.exe")),
      false,
      "Application executable was never installed",
    );
    assert.equal(
      await exists(path.join(destination, "resources", "app.asar")),
      false,
      "Application payload was never installed",
    );
    result.checks.push({
      locale,
      offeredLanguages: combo.items,
      englishDefault: true,
      keyboardSelection: true,
      firstPage: /Choose Installation Options|安装选项/.test(visibleText)
        ? "installation options"
        : "welcome",
      localizedButtons: true,
      canceledBeforeInstallation: true,
      installerExitCode: installerProcess.exitCode,
      screenshots: [initialScreenshot, selectedScreenshot, firstPageScreenshot],
    });
    installerProcess = undefined;
  }
  result.passed = true;
} catch (error) {
  result.reason = error.message;
  result.status = "blocked or failed; inspect evidence";
  if (lastSnapshot)
    await fs.writeFile(
      path.join(output, "failure-controls.json"),
      JSON.stringify(lastSnapshot, null, 2) + "\n",
    );
  if (env) {
    try {
      result.failureScreenshot = capture("failure");
    } catch (captureError) {
      result.captureError = captureError.message;
    }
  }
  process.exitCode = 1;
} finally {
  // These processes belong only to the cloned prefix and dedicated display.
  if (installerProcess?.exitCode === null) installerProcess.kill("SIGTERM");
  if (wine && prefix && env) {
    try {
      run(path.join(path.dirname(wine), "wineserver"), ["-k"], {
        timeout: 5000,
      });
    } catch {}
  }
  if (xvfb?.exitCode === null) xvfb.kill("SIGTERM");
  result.finishedAt = new Date().toISOString();
  if (work) result.localWorkDirectory = path.relative(root, work);
  await fs.writeFile(path.join(output, "runtime.log"), logs);
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
}
