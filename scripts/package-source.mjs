import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const root = process.cwd(),
  manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
const allowed = [
  ".github",
  ".gitignore",
  ".gitattributes",
  ".prettierignore",
  "package.json",
  "package-lock.json",
  "README.md",
  "PRODUCT.md",
  "DESIGN.md",
  "FEATURE_PARITY.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "index.html",
  "vite.config.js",
  "playwright.config.js",
  "src",
  "electron",
  "tests",
  "scripts",
  "samples",
  "docs",
  "build",
  "integrations",
  "artifacts",
  "inkstone-brand/README.md",
];
const omitted = new Set([
  "node_modules",
  ".git",
  ".tools",
  "release",
  "dist",
  "test-results",
  "playwright-report",
  "retired",
  "retired-0.1.0",
  ".DS_Store",
]);
const files = [];
async function collect(relative) {
  const parts = relative.split(path.sep);
  if (
    parts.some((part) => omitted.has(part)) ||
    /\.icns$/i.test(relative) ||
    parts.some((part) => /^macos$/i.test(part))
  )
    return;
  const stat = await fs.lstat(relative).catch(() => null);
  if (!stat) return;
  if (stat.isSymbolicLink())
    throw new Error(`Source archive rejects symlink: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of (await fs.readdir(relative)).sort())
      await collect(path.join(relative, name));
  } else if (stat.isFile()) files.push(relative.split(path.sep).join("/"));
}
for (const entry of allowed) await collect(entry);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-source-"));
try {
  await fs.mkdir("release", { recursive: true });
  const list = path.join(temp, "files.list");
  await fs.writeFile(list, Buffer.from(files.join("\0") + "\0"));
  const archive = path.join(
    root,
    "release",
    `Inkstone-${manifest.version}-source.tar.gz`,
  );
  execFileSync("tar", ["-czf", archive, "--null", "-T", list], {
    cwd: root,
    stdio: "inherit",
  });
  console.log(
    `Source archive: ${archive} (${files.length} files). Provided original inkstone-brand directory remains untouched; only its provenance README is included; runtime brand copies are in src/assets/brand and build.`,
  );
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
