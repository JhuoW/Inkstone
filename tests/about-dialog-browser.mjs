import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import { artifactPath } from "../scripts/artifact-path.mjs";

const output = artifactPath("about-dialog");
await fs.mkdir(output, { recursive: true });
const metadata = JSON.parse(await fs.readFile("package.json", "utf8"));
const licenseText = await fs.readFile("LICENSE", "utf8");
assert.match(licenseText, /GNU AFFERO GENERAL PUBLIC LICENSE/);
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.INKSTONE_CHROMIUM || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1000, height: 760 },
});
const page = await context.newPage();
const errors = [],
  remoteRequests = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (
    url.startsWith(origin) ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  )
    return route.continue();
  remoteRequests.push(url);
  return route.abort();
});
await page.route("**/about-harness", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><button id="launch">About</button><textarea id="writing">Untouched **Markdown**</textarea></body></html>',
  }),
);
async function check(name, run) {
  await run();
  checks.push({ name, result: "passed" });
  console.log("PASS", name);
}
async function open(locale = "en", theme = "light", overrides = {}) {
  await page.evaluate(
    ({ locale, theme, overrides }) => {
      document.documentElement.lang = locale;
      document.documentElement.dataset.theme = theme;
      document.querySelector("#launch").focus();
      window.about = showAbout({ ...aboutInfo, ...overrides }, invokeAbout, {
        locale,
      });
    },
    { locale, theme, overrides },
  );
}
async function close() {
  await page.locator("[data-about-close]").click();
  await page.locator(".about-dialog").waitFor({ state: "detached" });
}
try {
  await page.goto(origin + "/about-harness");
  await page.evaluate(
    async ({ version, licenseText, copyright }) => {
      await import("/src/styles.css");
      await import("/src/dialog-design.css");
      window.showAbout = (await import("/src/about-dialog.js")).showAbout;
      window.aboutInfo = { version, licenseText, copyright };
      window.aboutCalls = [];
      window.invokeAbout = async (method, payload) => {
        aboutCalls.push({ method, payload });
        return true;
      };
    },
    {
      version: metadata.version,
      licenseText,
      copyright: "© Inkstone contributors",
    },
  );
  await check(
    "English/light and Chinese/dark show runtime version and original brand assets",
    async () => {
      for (const [locale, theme] of [
        ["en", "light"],
        ["zh-CN", "dark"],
      ]) {
        await open(locale, theme);
        assert.equal(
          await page.locator("[data-about-version]").textContent(),
          metadata.version,
        );
        assert.equal(
          await page.locator(".about-license-badge").textContent(),
          "AGPL-3.0",
        );
        assert.equal(
          await page.locator("[data-about-view-license]").textContent(),
          locale === "en" ? "View license" : "查看许可证",
        );
        const image = page.locator(
          `.about-dialog .brand-artwork-${theme === "dark" ? "dark" : "light"}`,
        );
        await image.waitFor({ state: "visible" });
        await image.evaluate((image) => image.decode());
        assert.ok(await image.evaluate((image) => image.naturalWidth > 0));
        await page.screenshot({
          path: path.join(output, `${locale}-${theme}.png`),
        });
        await close();
      }
    },
  );
  await check(
    "License view shows exact bundled text offline and Back returns to its launcher",
    async () => {
      await open();
      await context.setOffline(true);
      await page.locator("[data-about-view-license]").click();
      assert.equal(
        await page.locator("[data-about-license-text]").textContent(),
        licenseText,
      );
      assert.equal(
        await page
          .locator("[data-about-license-text]")
          .evaluate((element) => document.activeElement === element),
        true,
      );
      await page.keyboard.press("PageDown");
      await page.waitForFunction(
        () => document.querySelector("[data-about-license-text]").scrollTop > 0,
      );
      await page.locator("[data-about-back]").click();
      assert.equal(
        await page
          .locator("[data-about-view-license]")
          .evaluate((element) => document.activeElement === element),
        true,
      );
      await context.setOffline(false);
      await close();
    },
  );
  await check(
    "Trusted source, contributor and license links use openExternal without navigating the editor",
    async () => {
      await open();
      assert.equal(
        await page.locator("[data-about-contributor]").textContent(),
        "Wei Zhuo",
      );
      assert.equal(
        await page.locator("[data-about-contributor]").getAttribute("href"),
        "https://wei2hu0.github.io/",
      );
      await page.locator("[data-about-source]").click();
      await page.locator("[data-about-contributor]").click();
      await page.locator("[data-about-view-license]").click();
      await page.locator("[data-about-license-link]").click();
      assert.deepEqual(await page.evaluate(() => aboutCalls), [
        {
          method: "openExternal",
          payload: { url: "https://github.com/JhuoW/Inkstone" },
        },
        {
          method: "openExternal",
          payload: { url: "https://wei2hu0.github.io/" },
        },
        {
          method: "openExternal",
          payload: { url: "https://www.gnu.org/licenses/agpl-3.0.html" },
        },
      ]);
      assert.equal(page.url(), origin + "/about-harness");
      await close();
    },
  );
  await check(
    "Native dialog traps keyboard focus; Escape restores writing selection unchanged",
    async () => {
      await open();
      for (let index = 0; index < 16; index++) {
        await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
        assert.equal(
          await page.evaluate(() =>
            document
              .querySelector(".about-dialog")
              .contains(document.activeElement),
          ),
          true,
        );
      }
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .locator("#launch")
          .evaluate((element) => document.activeElement === element),
        true,
      );
      await page.locator("#writing").evaluate((element) => {
        element.focus();
        element.setSelectionRange(3, 8);
      });
      await page.evaluate(() => {
        window.about = showAbout(aboutInfo, invokeAbout);
      });
      await page.keyboard.press("Enter");
      assert.deepEqual(
        await page.locator("#writing").evaluate((element) => ({
          focused: document.activeElement === element,
          text: element.value,
          start: element.selectionStart,
          end: element.selectionEnd,
        })),
        { focused: true, text: "Untouched **Markdown**", start: 3, end: 8 },
      );
    },
  );
  await check(
    "Short and narrow windows keep About, license scrolling and Close reachable",
    async () => {
      for (const { width, height, locale, theme } of [
        { width: 720, height: 500, locale: "en", theme: "dark" },
        { width: 480, height: 333, locale: "zh-CN", theme: "light" },
      ]) {
        await page.setViewportSize({ width, height });
        await open(locale, theme);
        for (const license of [false, true]) {
          if (license) await page.locator("[data-about-view-license]").click();
          const geometry = await page
            .locator(".about-dialog")
            .evaluate((dialog) => {
              const box = dialog.getBoundingClientRect();
              const close = dialog
                .querySelector("[data-about-close]")
                .getBoundingClientRect();
              const pre = dialog.querySelector("[data-about-license-text]");
              return {
                left: box.left,
                right: box.right,
                top: box.top,
                bottom: box.bottom,
                closeTop: close.top,
                closeBottom: close.bottom,
                closeRight: close.right,
                preHeight: pre.clientHeight,
                preOverflow: pre.scrollWidth - pre.clientWidth,
              };
            });
          assert.ok(
            geometry.left >= 15 &&
              geometry.right <= width - 15 &&
              geometry.top >= 11 &&
              geometry.bottom <= height - 11,
            JSON.stringify(geometry),
          );
          assert.ok(
            geometry.closeTop >= geometry.top &&
              geometry.closeBottom <= geometry.bottom &&
              geometry.closeRight <= geometry.right,
            JSON.stringify(geometry),
          );
          if (license)
            assert.ok(
              geometry.preHeight >= 24 && geometry.preOverflow <= 1,
              JSON.stringify(geometry),
            );
          await page.screenshot({
            path: path.join(
              output,
              `${locale}-${theme}-${width}x${height}${license ? "-license" : ""}.png`,
            ),
          });
        }
        await close();
      }
    },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        version: metadata.version,
        browser: await browser.version(),
        passed: checks.length,
        checks,
        errors,
        remoteRequests,
        scope:
          "Standalone production About module in real headless Chromium with explicit openExternal stub; exact on-disk LICENSE loaded offline. Native menu integration is verified separately.",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await context.setOffline(false).catch(() => {});
  await browser.close();
  await server.close();
}
