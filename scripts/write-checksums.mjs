import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const version = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const files = [];
for (const folder of ["release", "release/extensions"]) {
  for (const entry of await fs
    .readdir(folder, { withFileTypes: true })
    .catch(() => [])) {
    if (
      entry.isFile() &&
      entry.name.includes(version) &&
      /\.(?:exe|zip|AppImage|deb|tar\.gz|vsix)$/i.test(entry.name)
    )
      files.push(path.join(folder, entry.name));
  }
}
if (!files.length)
  throw new Error("No current-version release artifacts exist.");
const lines = [];
for (const file of files.sort()) {
  const bytes = await fs.readFile(file);
  lines.push(
    crypto.createHash("sha256").update(bytes).digest("hex") +
      "  " +
      path.relative("release", file).split(path.sep).join("/"),
  );
}
await fs.writeFile("release/SHA256SUMS", lines.join("\n") + "\n");
console.log(`Recorded ${lines.length} local release checksums.`);
