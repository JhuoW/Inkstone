// Static PE/resource verification only; never claims that Windows was executed.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import * as ResEdit from "resedit";
const manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
const expectedBytes = await fs.readFile("build/icon.ico");
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const iconData = (item) =>
  Buffer.from(item.isRaw() ? item.bin : item.generate());
const expected = ResEdit.Data.IconFile.from(expectedBytes)
  .icons.map((item) => digest(iconData(item.data)))
  .sort();
assert.ok(expected.length > 0, "ICO must contain image data");
const files = process.argv.slice(2);
if (!files.length)
  files.push(
    "release/win-unpacked/Inkstone.exe",
    `release/Inkstone-${manifest.version}-windows-x64.exe`,
  );
const results = [];
for (const filename of files) {
  const bytes = await fs.readFile(filename);
  assert.equal(
    bytes.subarray(0, 2).toString(),
    "MZ",
    `${filename}: missing MZ header`,
  );
  const pe = bytes.readUInt32LE(0x3c);
  assert.equal(
    bytes.readUInt32LE(pe),
    0x4550,
    `${filename}: missing PE signature`,
  );
  const machine = bytes.readUInt16LE(pe + 4);
  if (path.basename(filename).toLowerCase() === "inkstone.exe")
    assert.equal(machine, 0x8664, "Application must be x64");
  const executable = ResEdit.NtExecutable.from(bytes, { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(executable);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(
    resources.entries,
  ).map((group) => ({
    id: group.id,
    language: group.lang,
    hashes: group
      .getIconItemsFromEntries(resources.entries)
      .map((item) => digest(iconData(item)))
      .sort(),
  }));
  const iconMatches = groups.some(
    (group) => JSON.stringify(group.hashes) === JSON.stringify(expected),
  );
  assert.ok(
    iconMatches,
    `${filename}: no embedded icon group exactly matches build/icon.ico`,
  );
  const versions = ResEdit.Resource.VersionInfo.fromEntries(
    resources.entries,
  ).flatMap((info) =>
    info
      .getAllLanguagesForStringValues()
      .map((language) => ({ language, ...info.getStringValues(language) })),
  );
  assert.ok(
    versions.some((info) => info.ProductName === "Inkstone"),
    `${filename}: wrong ProductName`,
  );
  assert.ok(
    versions.some((info) =>
      (info.ProductVersion || "").startsWith(manifest.version),
    ),
    `${filename}: wrong ProductVersion`,
  );
  results.push({
    path: filename,
    size: bytes.length,
    sha256: digest(bytes),
    machine: `0x${machine.toString(16)}`,
    embeddedIconMatches: true,
    iconGroups: groups,
    versions,
  });
}
const folder = "artifacts/windows-package-validation";
await fs.mkdir(folder, { recursive: true });
const result = {
  version: manifest.version,
  host: process.platform,
  method:
    "Read PE headers, version resources and exact embedded ICO image bytes. Does not execute Windows binaries.",
  executedOnWindows: false,
  expectedICO: "build/icon.ico",
  expectedICOSHA256: digest(expectedBytes),
  passed: true,
  files: results,
};
await fs.writeFile(
  path.join(folder, "static-results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
