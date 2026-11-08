import path from "node:path";

// Preserve the existing Linux acceptance record when validating on Windows.
export function artifactPath(...segments) {
  if (process.env.INKSTONE_ARTIFACT_ROOT)
    return path.resolve(process.env.INKSTONE_ARTIFACT_ROOT, ...segments);
  return path.resolve(
    "artifacts",
    ...(process.platform === "win32" ? ["windows-validation"] : []),
    ...segments,
  );
}
