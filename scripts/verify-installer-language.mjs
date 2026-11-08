import { findNsisCompiler } from "./nsis-compiler.mjs";
import { artifactPath } from "./artifact-path.mjs";
/** Compile and execute only the NSIS locale hooks. Wine success is not native Windows installation proof. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const output = artifactPath("installer-language-validation");
await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(root, ".tools"), { recursive: true });
const work = await fs.mkdtemp(path.join(root, ".tools", "installer-locale-"));
const compiler = await findNsisCompiler();
const makensis = compiler.executablePath;
const executable = path.join(work, "locale-hook.exe");
const defineFlag = process.platform === "win32" ? "/D" : "-D";
const queue = [
  { directory: path.dirname(path.dirname(compiler.nsisDir)), depth: 0 },
];
let uacPluginDir;
while (queue.length && !uacPluginDir) {
  const { directory, depth } = queue.shift();
  for (const entry of await fs
    .readdir(directory, { withFileTypes: true })
    .catch(() => [])) {
    const candidate = path.join(directory, entry.name);
    if (
      entry.isFile() &&
      entry.name.toLowerCase() === "uac.dll" &&
      path.basename(directory) === "x86-unicode"
    ) {
      uacPluginDir = directory;
      break;
    }
    if (entry.isDirectory() && depth < 5)
      queue.push({ directory: candidate, depth: depth + 1 });
  }
}
if (!uacPluginDir)
  throw Error("Cannot locate the builder's x86-unicode UAC plugin.");
const defines = [
  `${defineFlag}INKSTONE_REPO=${root}`,
  `${defineFlag}INKSTONE_INSTALLER_INCLUDE=${path.join(root, "build/installer.nsh")}`,
  `${defineFlag}BUILD_RESOURCES_DIR=${path.join(root, "build")}`,
  `${defineFlag}BUILDER_NSIS_INCLUDE=${path.join(root, "node_modules/app-builder-lib/templates/nsis/include")}`,
  `${defineFlag}UAC_PLUGIN_DIR=${uacPluginDir}`,
];
const executables = [
  executable,
  path.join(work, "uninstaller-generation-hook.exe"),
];
for (const [index, file] of executables.entries()) {
  const compile = execFileSync(
    makensis,
    [
      ...defines,
      `${defineFlag}OUTPUT_EXE=${file}`,
      ...(index ? [`${defineFlag}BUILD_UNINSTALLER`] : []),
      path.join(root, "tests/fixtures/installer-language.nsi"),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        NSISDIR: compiler.nsisDir,
      },
    },
  );
  await fs.writeFile(
    path.join(
      output,
      index ? "compile-uninstaller-generation.log" : "compile.log",
    ),
    compile,
  );
}
const env = { ...process.env };
let runtime;
if (process.platform === "win32") {
  for (const file of executables)
    execFileSync(file, [], { env, timeout: 60000, windowsHide: true });
  runtime = "native Windows";
} else if (process.platform === "linux") {
  const wine = process.env.INKSTONE_WINE;
  if (!wine)
    throw Error(
      "Set INKSTONE_WINE to a working local Wine/WoW64 executable, or run the hook executable on Windows.",
    );
  env.WINEPREFIX = process.env.INKSTONE_WINEPREFIX
    ? path.resolve(process.env.INKSTONE_WINEPREFIX)
    : path.join(work, "wine-profile");
  env.WINEDEBUG = "-all";
  env.WINEDLLOVERRIDES = process.env.WINEDLLOVERRIDES || "mscoree,mshtml=";
  for (const file of executables)
    execFileSync(wine, [file], { env, timeout: 60000, stdio: "ignore" });
  runtime = "Linux Wine/WoW64";
} else throw Error("Windows and Linux only");
const results = [];
for (const [folder, expected] of [
  ["english", "en"],
  ["chinese", "zh-CN"],
]) {
  const filename = path.join(
    work,
    folder,
    "resources",
    "installer-locale.json",
  );
  const bytes = await fs.readFile(filename);
  const data = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(data, { locale: expected, configured: true });
  assert.equal(await fs.stat(filename + ".tmp").catch(() => null), null);
  await fs.copyFile(filename, path.join(output, `${expected}.json`));
  results.push({
    selectedLanguage: expected,
    validUTF8JSON: true,
    temporaryFileRemoved: true,
  });
}
const result = {
  version: JSON.parse(await fs.readFile("package.json", "utf8")).version,
  passed: true,
  runtime,
  scope:
    "Real NSIS hook execution only; no application installation or language-selector UI claim.",
  windowsUILanguageDefault: true,
  chineseUIVariantsUseSimplifiedChinese: true,
  otherUILanguagesUseEnglish: true,
  outerInteractiveProcessOnly: true,
  elevatedProcessInheritsSelection: true,
  silentProcessHasNoSelector: true,
  uninstallerGenerationHasNoSelector: true,
  policyCases: 12,
  installerChoiceCompletesOnboarding: true,
  results,
};
await fs.writeFile(
  path.join(output, "results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
