import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export async function findNsisCompiler() {
  let executablePath = process.env.INKSTONE_MAKENSIS;
  if (!executablePath) {
    const roots = [
      process.env.ELECTRON_BUILDER_NSIS_DIR,
      process.env.ELECTRON_BUILDER_CACHE,
      process.platform === "win32"
        ? path.join(
            process.env.LOCALAPPDATA ||
              path.join(os.homedir(), "AppData/Local"),
            "electron-builder/Cache",
          )
        : path.join(
            process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
            "electron-builder",
          ),
    ].filter(Boolean);
    const queue = roots.map((directory) => ({ directory, depth: 0 }));
    while (queue.length && !executablePath) {
      const { directory, depth } = queue.shift();
      for (const entry of await fs
        .readdir(directory, { withFileTypes: true })
        .catch(() => [])) {
        const candidate = path.join(directory, entry.name);
        if (
          entry.isFile() &&
          (process.platform === "win32"
            ? entry.name.toLowerCase() === "makensis.exe"
            : entry.name === "makensis" && path.basename(directory) === "linux")
        ) {
          executablePath = candidate;
          break;
        }
        if (entry.isDirectory() && depth < 6)
          queue.push({ directory: candidate, depth: depth + 1 });
      }
    }
  }
  if (!executablePath)
    throw new Error(
      "Set INKSTONE_MAKENSIS to a local NSIS compiler. This script does not download build tools.",
    );
  executablePath = path.resolve(executablePath);
  let nsisDir = process.env.NSISDIR;
  for (
    let directory = path.dirname(executablePath), depth = 0;
    !nsisDir && depth < 4;
    depth++
  ) {
    if (
      await fs
        .stat(path.join(directory, "Include/LogicLib.nsh"))
        .catch(() => null)
    )
      nsisDir = directory;
    directory = path.dirname(directory);
  }
  if (!nsisDir)
    throw new Error(
      `Cannot locate NSIS Include directory for ${executablePath}`,
    );
  return { executablePath, nsisDir };
}
