import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const { extractFile } = createRequire(import.meta.url)("@electron/asar");
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const expectedWindowIcon = digest(await fs.readFile("build/icon.png"));
const desktopIcons = new Map();
for (const filename of await fs.readdir("build/icons")) {
  const match = filename.match(/^(\d+)x\d+\.png$/);
  if (match)
    desktopIcons.set(Number(match[1]), {
      path: "build/icons/" + filename,
      sha256: digest(await fs.readFile("build/icons/" + filename)),
    });
}
async function installedIcons(folder) {
  const result = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.name.toLowerCase() === "inkstone.png") {
        const bytes = await fs.readFile(filename);
        if (bytes.subarray(1, 4).toString() !== "PNG")
          throw Error("Invalid installed PNG: " + filename);
        const width = bytes.readUInt32BE(16),
          height = bytes.readUInt32BE(20);
        const expected = desktopIcons.get(width);
        if (!expected || width !== height || digest(bytes) !== expected.sha256)
          throw Error(
            "Installed icon does not match supplied size-specific PNG: " +
              filename,
          );
        result.push({
          path: path.relative(folder, filename),
          width,
          height,
          sha256: expected.sha256,
          source: expected.path,
          matchesProvided: true,
        });
      }
    }
  }
  await visit(folder);
  return result;
}
if (process.platform !== "linux")
  throw new Error(
    "Linux package validation requires Linux; use test:native on Windows.",
  );
const root = process.cwd(),
  work = path.join(root, ".tools", "package-validation"),
  evidence = path.join(root, "artifacts", "package-validation");
await fs.mkdir(work, { recursive: true });
await fs.mkdir(evidence, { recursive: true });
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const packages = {
  appimage: path.join(root, "release", "Inkstone-" + version + ".AppImage"),
  deb: path.join(root, "release", "inkstone-editor_" + version + "_amd64.deb"),
  archive: path.join(root, "release", "inkstone-editor-" + version + ".tar.gz"),
};
const result = {
  platform: process.platform,
  architecture: process.arch,
  generatedAt: new Date().toISOString(),
  method:
    "Extract and launch actual packaged binaries in Xvfb. System-wide installation and desktop integration are not asserted.",
  packages: [],
};
for (const [kind, file] of Object.entries(packages)) {
  const folder = path.join(work, kind);
  await fs.rm(folder, { recursive: true, force: true });
  await fs.mkdir(folder, { recursive: true });
  let executable;
  if (kind === "appimage") {
    execFileSync(file, ["--appimage-extract"], {
      cwd: folder,
      stdio: "ignore",
    });
    executable = path.join(folder, "squashfs-root", "inkstone");
  }
  if (kind === "deb") {
    execFileSync("dpkg-deb", ["-x", file, folder]);
    executable = path.join(folder, "opt", "Inkstone", "inkstone");
    await fs.writeFile(
      path.join(evidence, "deb-control.txt"),
      execFileSync("dpkg-deb", ["--info", file]),
    );
  }
  if (kind === "archive") {
    execFileSync("tar", ["-xzf", file, "-C", folder]);
    executable = path.join(folder, "inkstone-editor-" + version, "inkstone");
  }
  const note = path.join(folder, "package-test.md"),
    original = "# 安装包验收\n\n中文写作与 **本地文件**。\n\n$$\nE=mc^2\n$$\n";
  await fs.writeFile(note, original);
  const env = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":91",
    INKSTONE_USER_DATA: path.join(folder, "profile-" + Date.now()),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const sandboxBypass = process.env.INKSTONE_TEST_NO_SANDBOX === "1";
  let normalSandbox = !sandboxBypass;
  const sandboxError = sandboxBypass
    ? "Explicit test-only bypass requested with INKSTONE_TEST_NO_SANDBOX=1; this run does not validate normal process sandbox startup."
    : null;
  // Default to the real sandbox. A constrained test host must opt in explicitly,
  // rather than treating Playwright's implicit --no-sandbox default as success.
  const app = await electron.launch({
    chromiumSandbox: !sandboxBypass,
    executablePath: executable,
    args: [note],
    env,
    timeout: 15000,
  });
  try {
    normalSandbox = !app.process().spawnargs.includes("--no-sandbox");
    const page = await app.firstWindow();
    await page.waitForFunction(
      () =>
        window.__inkstone?.getDocument().path?.endsWith("package-test.md") &&
        !window.__inkstone.editor.view.state.readOnly,
    );
    await page.evaluate(() => {
      const e = __inkstone.editor;
      e.setSelection({
        anchor: e.view.state.doc.length,
        head: e.view.state.doc.length,
      });
      e.insert("\n已验证打包程序保存。");
    });
    await page.evaluate(() => __inkstone.execute("save"));
    const text = await fs.readFile(note, "utf8");
    if (text !== original + "\n已验证打包程序保存。")
      throw Error(kind + ": packaged save was not exact");
    const state = await page.evaluate(async () => ({
      node: typeof window.require,
      version: (await __inkstone.invoke("bootstrap")).version,
    }));
    if (state.version !== version)
      throw Error(kind + ": packaged version mismatch");
    if (state.node !== "undefined") throw Error("Node leaked into renderer");
    await page.screenshot({ path: path.join(evidence, kind + ".png") });
    const bytes = await fs.readFile(file),
      asar = await fs.readFile(
        path.join(path.dirname(executable), "resources", "app.asar"),
      );
    const asarPath = path.join(
      path.dirname(executable),
      "resources",
      "app.asar",
    );
    if (digest(extractFile(asarPath, "build/icon.png")) !== expectedWindowIcon)
      throw Error(kind + ": wrong bundled window icon");
    const icons = await installedIcons(folder);
    if (kind !== "archive" && icons.length === 0)
      throw Error(kind + ": missing desktop icons");
    result.packages.push({
      version: state.version,
      bundledWindowIconMatchesProvided: true,
      bundledWindowIconSHA256: expectedWindowIcon,
      desktopIcons: icons,
      kind,
      path: path.relative(root, file),
      size: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      asarSHA256: crypto.createHash("sha256").update(asar).digest("hex"),
      launch: true,
      editAndAtomicSave: true,
      nodeIsolation: true,
      normalSandbox,
      sandboxError,
    });
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
}
if (new Set(result.packages.map((p) => p.asarSHA256)).size !== 1)
  throw Error("Packages do not contain identical application sources");
await fs.writeFile(
  path.join(evidence, "results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
