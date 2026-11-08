import fs from "node:fs/promises";
import { spawn } from "node:child_process";
const files = (await fs.readdir("tests"))
  .filter((name) => /\.test\.(?:js|cjs|mjs)$/.test(name))
  .sort()
  .map((name) => `tests/${name}`);
if (!files.length) throw new Error("No unit tests found.");
const child = spawn(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  shell: false,
});
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
