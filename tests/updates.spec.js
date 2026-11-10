import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";

// Update checks run the real electron-updater against a local generic feed
// (INKSTONE_UPDATE_FEED_URL), so no GitHub request is made. Downloading and
// installing are covered by tests/updates.test.cjs.
let server, requests, feed, application, page, directory, errors;

test.beforeEach(async () => {
  requests = [];
  errors = [];
  feed = { version: "99.0.0", status: 200 };
  server = http.createServer((req, res) => {
    requests.push(req.url);
    if (!new URL(req.url, "http://127.0.0.1").pathname.endsWith(".yml")) {
      res.writeHead(404);
      return res.end();
    }
    if (feed.status !== 200) {
      res.writeHead(feed.status);
      return res.end("unavailable");
    }
    const file = `Inkstone-${feed.version}-windows-x64.exe`;
    const sha512 = crypto.createHash("sha512").update(file).digest("base64");
    res.writeHead(200, { "Content-Type": "text/yaml" });
    res.end(
      `version: ${feed.version}\nfiles:\n  - url: ${file}\n    sha512: ${sha512}\n    size: 1024\npath: ${file}\nsha512: ${sha512}\nreleaseDate: '2026-11-10T00:00:00.000Z'\n`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-updates-"));
});
test.afterEach(async () => {
  try {
    expect(errors).toEqual([]);
  } finally {
    await application?.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await application?.close().catch(() => {});
    application = null;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

async function launch(settings = {}) {
  const profile = path.join(directory, "profile");
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale: "en",
      firstRunComplete: true,
      defaultAppPrompted: true,
      ...settings,
    }),
  );
  const env = {
    ...process.env,
    INKSTONE_USER_DATA: profile,
    INKSTONE_UPDATE_FEED_URL: `http://127.0.0.1:${server.address().port}/`,
    INKSTONE_UPDATE_CHECK_DELAY: "300",
    // Closing the app must never install anything on the test machine.
    INKSTONE_UPDATE_INSTALL_ON_QUIT: "0",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.APPIMAGE;
  const executablePath = process.env.INKSTONE_EXECUTABLE
    ? path.resolve(process.env.INKSTONE_EXECUTABLE)
    : undefined;
  application = await electron.launch({
    executablePath,
    args: executablePath ? [] : [process.cwd()],
    env,
    chromiumSandbox: true,
  });
  page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  await page.waitForFunction(
    () => window.__inkstone && !__inkstone.editor.view.state.readOnly,
  );
}
const command = (name) =>
  page.evaluate((name) => void Promise.resolve(__inkstone.execute(name)), name);

test("an automatic check shows a newer release above the editor", async () => {
  await launch();
  const notice = page.locator("#update-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Inkstone 99.0.0 is available.");
  if (process.platform === "win32") {
    await expect(notice.locator('[data-update="download"]')).toHaveText(
      "Download and install",
    );
    await expect(notice.locator('[data-update="page"]')).toHaveText(
      "What's new",
    );
  } else {
    // deb and tar.gz builds point to the release page instead.
    await expect(notice.locator('[data-update="page"]')).toHaveText(
      "Open download page",
    );
  }
  await notice.locator('[data-update="hide"]').click();
  await expect(notice).toBeHidden();
  expect(requests.some((url) => url.split("?")[0].endsWith(".yml"))).toBe(true);
});

test("automatic checks can be turned off; a manual check reports an up-to-date copy", async () => {
  feed.version = "0.0.1";
  await launch({ autoCheckUpdates: false });
  await page.waitForTimeout(1200);
  expect(requests).toEqual([]);
  await command("checkUpdates");
  await expect(page.locator("#toast")).toContainText(
    /Inkstone .+ is up to date\./,
  );
  await expect(page.locator("#update-notice")).toBeHidden();
  expect(requests.length).toBeGreaterThan(0);
});

test("preferences hold the automatic check setting and a Check now button", async () => {
  await launch();
  await page.evaluate(() => __inkstone.execute("settings"));
  const dialog = page.getByRole("dialog");
  await dialog.locator('[data-section="advanced"]').click();
  const box = dialog.locator('[name="autoCheckUpdates"]');
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect
    .poll(
      async () =>
        JSON.parse(
          await fs.readFile(
            path.join(directory, "profile", "settings.json"),
            "utf8",
          ),
        ).autoCheckUpdates,
    )
    .toBe(false);
  await dialog.locator("#check-updates-now").click();
  await expect(page.locator("#toast")).toContainText(
    "Inkstone 99.0.0 is available.",
  );
});

test("a failed check is explained in the interface language, and About offers a check", async () => {
  feed.status = 503;
  await launch({ locale: "zh-CN", autoCheckUpdates: false });
  await page.evaluate(() => __inkstone.execute("about"));
  await page.locator("[data-about-check-updates]").click();
  await expect(page.locator("#toast")).toContainText(
    "无法检查更新，请检查网络连接后重试。",
  );
  await expect(page.locator("#update-notice")).toBeHidden();
});
