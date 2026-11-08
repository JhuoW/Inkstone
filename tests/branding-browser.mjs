/** Verify supplied artwork in the real renderer. Desktop IPC is stubbed for this visual-only check. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "vite";
import { chromium } from "playwright";

const artifacts = path.resolve("artifacts/branding-validation");
await fs.mkdir(artifacts, { recursive: true });
let executablePath = process.env.INKSTONE_CHROMIUM;
if (!executablePath) {
  try {
    await fs.access(chromium.executablePath());
  } catch {
    const cache = path.join(os.homedir(), ".cache/ms-playwright");
    for (const directory of (await fs.readdir(cache))
      .filter((name) => /^chromium-/.test(name))
      .sort()
      .reverse()) {
      for (const binary of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const candidate = path.join(cache, directory, binary);
        try {
          await fs.access(candidate);
          executablePath = candidate;
          break;
        } catch {}
      }
      if (executablePath) break;
    }
  }
}
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1380, height: 940 },
  colorScheme: "light",
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  const listeners = {};
  window.inkstone = {
    async invoke(method) {
      if (method === "bootstrap")
        return {
          settings: { theme: "light", locale: "zh-CN", autoSave: false },
          session: {},
          recovery: [],
          warnings: [],
        };
      return null;
    },
    on(event, callback) {
      listeners[event] = callback;
      return () => delete listeners[event];
    },
  };
  window.brandSettings = (patch) => listeners["settings-changed"](patch);
});
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.waitForFunction(
    () => window.__inkstone?.editor && window.brandSettings,
  );
  const source = await page.evaluate(() => __inkstone.editor.getText());
  for (const locale of ["zh-CN", "en"])
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        ({ locale, theme }) =>
          brandSettings({ locale, theme, sidebarWidth: 256 }),
        { locale, theme },
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".brand img")].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      );
      const state = await page.locator(".brand").evaluate((element) => {
        const visible = [...element.querySelectorAll("img")].filter(
          (image) => getComputedStyle(image).display !== "none",
        );
        return {
          visible: visible.map((image) => image.src),
          role: element
            .querySelector('[role="img"]')
            ?.getAttribute("aria-label"),
          text: element.textContent.trim(),
          color: getComputedStyle(document.documentElement)
            .getPropertyValue("--text")
            .trim(),
          width: element.querySelector(".brand-lockup").getBoundingClientRect()
            .width,
        };
      });
      assert.equal(state.visible.length, 1);
      assert.equal(state.role, locale === "en" ? "Inkstone" : "Inkstone 墨石");
      assert.match(
        state.visible[0],
        new RegExp(
          `inkstone-logo-horizontal${locale === "en" ? "-en" : ""}${theme === "dark" ? "-reversed" : ""}\\.svg`,
        ),
      );
      assert.equal(
        state.text,
        locale === "en" ? "A place for your thoughts" : "让想法落在纸上",
      );
      assert.ok(state.width >= 120);
      assert.equal(state.color, theme === "dark" ? "#f4f0e6" : "#1c1a21");
      assert.equal(
        await page.evaluate(() => __inkstone.editor.getText()),
        source,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(artifacts, `${locale}-${theme}.png`),
        fullPage: true,
      });
      checks.push({
        name: `${locale} ${theme}: supplied lockup, one accessible name, no duplicate text, palette`,
        result: "passed",
        ...state,
      });
    }
  await page.evaluate(() =>
    brandSettings({ locale: "zh-CN", theme: "light", sidebarWidth: 180 }),
  );
  const narrow = await page.locator(".brand").evaluate((element) => {
    const logo = element.querySelector(".brand-lockup").getBoundingClientRect(),
      button = element.querySelector("button").getBoundingClientRect(),
      sidebar = document.querySelector("#sidebar").getBoundingClientRect();
    return {
      logoWidth: logo.width,
      overlap: logo.right > button.left,
      withinSidebar: button.right <= sidebar.right,
      tabsWithinSidebar: [
        ...document.querySelectorAll(".sidebar-tabs button"),
      ].every((tab) => tab.getBoundingClientRect().right <= sidebar.right),
    };
  });
  assert.ok(narrow.logoWidth >= 120);
  assert.equal(narrow.overlap, false);
  assert.equal(narrow.withinSidebar, true);
  assert.equal(narrow.tabsWithinSidebar, true);
  await page.screenshot({
    path: path.join(artifacts, "zh-CN-narrow-180.png"),
    fullPage: true,
  });
  checks.push({
    name: "180px sidebar respects logo minimum and preserves folder button",
    result: "passed",
    ...narrow,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => brandSettings({ theme: "system" }));
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(await page.locator(".brand-artwork-dark").isVisible(), true);
  const icons = await page
    .locator('link[rel="icon"]')
    .evaluateAll((elements) =>
      elements.map((element) => ({ href: element.href, type: element.type })),
    );
  assert.equal(icons.length, 2);
  for (const icon of icons)
    assert.equal((await context.request.get(icon.href)).status(), 200);
  checks.push({
    name: "System dark mode and local SVG/ICO favicon resources",
    result: "passed",
  });
  assert.equal(errors.length, 0, errors.join("\n"));
  await fs.writeFile(
    path.join(artifacts, "browser-results.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        scope:
          "Real application renderer with visual-test IPC stub; installation icon extraction is validated separately.",
        checks,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${checks.length} branding checks passed`);
} finally {
  await browser.close();
  await server.close();
}
