import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { findPandoc } from "./helpers/tools.mjs";

test("Pandoc integration discovers a native executable on PATH containing spaces and Unicode", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone tools 中文 "));
  try {
    const bin = path.join(root, "Program Files", "Pandoc");
    await fs.mkdir(bin, { recursive: true });
    const executable = path.join(
      bin,
      process.platform === "win32" ? "pandoc.exe" : "pandoc",
    );
    await fs.writeFile(executable, "test fixture", { mode: 0o700 });
    assert.equal(
      await findPandoc({ root, environment: { Path: `"${bin}"` } }),
      executable,
    );
    assert.equal(await findPandoc({ root, environment: {} }), null);
    await assert.rejects(
      findPandoc({ root, environment: { INKSTONE_PANDOC: "missing.exe" } }),
      /INKSTONE_PANDOC is not an executable/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
