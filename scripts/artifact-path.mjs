import path from "node:path";

// Output of tests and validation scripts. Runs write under artifacts/runs/,
// which git ignores, so running checks never changes tracked files. Set
// INKSTONE_ARTIFACT_ROOT to write somewhere else. Acceptance records kept from
// earlier releases stay where their documents link to them under artifacts/.
export function artifactPath(...segments) {
  if (process.env.INKSTONE_ARTIFACT_ROOT)
    return path.resolve(process.env.INKSTONE_ARTIFACT_ROOT, ...segments);
  return path.resolve(
    "artifacts",
    "runs",
    process.platform === "win32" ? "windows" : "linux",
    ...segments,
  );
}
