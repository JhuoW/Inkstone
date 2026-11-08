import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "desktop.spec.js",
    "backend-e2e.spec.js",
    "enhancements.spec.js",
    "ux.spec.js",
    "design-system-desktop.spec.js",
  ],
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "artifacts/playwright-report" }],
  ],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  outputDir: "test-results",
});
