import { artifactPath } from "./scripts/artifact-path.mjs";
import { defineConfig } from "@playwright/test";
// Closing the last window exits instead of asking about the tray, unless a
// test saves another closeAction. Tests pass process.env to the app.
process.env.INKSTONE_CLOSE_ACTION ??= "quit";
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
    "ai-assistant.spec.js",
    "ux-improvements.spec.js",
    "updates.spec.js",
    "lifecycle.spec.js",
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
