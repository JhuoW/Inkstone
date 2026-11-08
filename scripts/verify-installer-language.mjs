/** Compile and execute only the NSIS locale hooks. Wine success is not native Windows installation proof. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const output = path.join(root, "artifacts", "installer-language-validation");
await fs.mkdir(output, { recursive: true });
await fs.mkdir(path.join(root, ".tools"), { recursive: true });
const work = await fs.mkdtemp(path.join(root, ".tools", "installer-locale-"));
let makensis = process.env.INKSTONE_MAKENSIS;
if (!makensis) {
  const folder = path.join(
    os.homedir(),
    ".cache/electron-builder/nsis-3.0.4.1",
  );
  for (const name of await fs.readdir(folder).catch(() => [])) {
    const candidate = path.join(
      folder,
      name,
      process.platform === "win32" ? "Bin/makensis.exe" : "linux/makensis",
    );
    if (await fs.stat(candidate).catch(() => null)) {
      makensis = candidate;
      break;
    }
  }
}
if (!makensis)
  throw Error(
    "Set INKSTONE_MAKENSIS to a local NSIS compiler. This script does not download build tools.",
  );
const executable = path.join(work, "locale-hook.exe");
const defineFlag = process.platform === "win32" ? "/D" : "-D";
const compile = execFileSync(
  makensis,
  [
    `${defineFlag}INKSTONE_REPO=${root}`,
    `${defineFlag}OUTPUT_EXE=${executable}`,
    path.join(root, "tests/fixtures/installer-language.nsi"),
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      NSISDIR: process.env.NSISDIR || path.dirname(path.dirname(makensis)),
    },
  },
);
await fs.writeFile(path.join(output, "compile.log"), compile);
const env = { ...process.env };
let runtime;
if (process.platform === "win32") {
  execFileSync(executable, [], { env, timeout: 60000 });
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
  execFileSync(wine, [executable], { env, timeout: 60000, stdio: "ignore" });
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
  assert.deepEqual(data, { locale: expected });
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
  englishDefault: true,
  results,
};
await fs.writeFile(
  path.join(output, "results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
