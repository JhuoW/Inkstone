import { artifactPath } from "./scripts/artifact-path.mjs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "desktop.spec.js",
    "backend-e2e.spec.js",
    "enhancements.spec.js",
    "ux.spec.js",
    "design-system-desktop.spec.js",
    "windows-regressions.spec.js",
    "context-menu.spec.js",
    "native-context.spec.js",
    "system-integration.spec.js",
    "code-fences.spec.js",
  ],
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: artifactPath("playwright-report") },
    ],
    ["json", { outputFile: artifactPath("playwright-results.json") }],
  ],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  outputDir:
    process.platform === "win32"
      ? artifactPath("test-results")
      : "test-results",
});
