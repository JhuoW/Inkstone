/** Compare final packaged application files against the current build, not a prior release. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const { extractFile, listPackage } = createRequire(import.meta.url)(
  "@electron/asar",
);
const manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
const paths = process.argv.slice(2);
if (!paths.length)
  paths.push(
    "release/win-unpacked/resources/app.asar",
    "release/linux-unpacked/resources/app.asar",
  );
const expected = [];
async function collect(name) {
  const stat = await fs.stat(name);
  if (stat.isDirectory()) {
    for (const child of (await fs.readdir(name)).sort())
      await collect(path.join(name, child));
  } else expected.push(name.split(path.sep).join("/"));
}
for (const name of [
  "dist",
  "electron",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "build/icon.png",
  "build/icon.ico",
])
  await collect(name);
const results = [];
for (const file of paths) {
  const packaged = JSON.parse(
    extractFile(file, "package.json").toString("utf8"),
  );
  assert.equal(packaged.version, manifest.version);
  assert.equal(packaged.name, manifest.name);
  for (const name of expected)
    assert.deepEqual(
      extractFile(file, name),
      await fs.readFile(name),
      `${file}: stale or changed ${name}`,
    );
  const bundled = listPackage(file).map((name) =>
    name.replaceAll("\\", "/").replace(/^\//, ""),
  );
  for (const name of bundled.filter((name) =>
    /^(dist|electron)\//.test(name),
  )) {
    if (expected.includes(name)) continue;
    const stat = await fs.stat(name).catch(() => null);
    assert.ok(
      stat?.isDirectory(),
      `${file}: unexpected stale runtime file ${name}`,
    );
  }
  results.push({
    file,
    version: packaged.version,
    matchedRuntimeFiles: expected.length,
    asarSHA256: createHash("sha256")
      .update(await fs.readFile(file))
      .digest("hex"),
    passed: true,
  });
}
await fs.mkdir("artifacts/ui-redesign/release", { recursive: true });
await fs.writeFile(
  "artifacts/ui-redesign/release/source-match.json",
  JSON.stringify({ version: manifest.version, results }, null, 2) + "\n",
);
console.log(JSON.stringify(results, null, 2));
