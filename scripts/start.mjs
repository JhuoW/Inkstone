import { spawn } from "node:child_process";
import electron from "electron";
if (!["win32", "linux"].includes(process.platform)) {
  console.error("Inkstone 0.2 supports Windows and Linux only.");
  process.exit(1);
}
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [".", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: environment,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
