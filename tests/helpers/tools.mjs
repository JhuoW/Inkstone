import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

// Optional conversion tests must find the same native executable users can run,
// rather than silently skipping an installed Windows pandoc.exe.
export async function findPandoc({
  environment = process.env,
  root = process.cwd(),
} = {}) {
  const exists = async (filename) => {
    try {
      if (!(await fs.stat(filename)).isFile()) return false;
      await fs.access(filename, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  if (environment.INKSTONE_PANDOC) {
    const filename = path.resolve(root, environment.INKSTONE_PANDOC);
    if (!(await exists(filename)))
      throw new Error(`INKSTONE_PANDOC is not an executable file: ${filename}`);
    return filename;
  }
  const name = process.platform === "win32" ? "pandoc.exe" : "pandoc";
  const pathValue = Object.entries(environment).find(
    ([key]) => key.toLowerCase() === "path",
  )?.[1];
  const candidates = [
    path.join(root, ".tools", "pandoc", "bin", name),
    path.join(root, ".tools", "pandoc", name),
    ...(pathValue || "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) =>
        path.resolve(root, directory.replace(/^"|"$/g, ""), name),
      ),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}
