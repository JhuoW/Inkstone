import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(
  process.env.INKSTONE_WEBSITE_EVIDENCE ||
    (await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-website-review-"))),
);
await fs.mkdir(output, { recursive: true });
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};
const missing = new Set();
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith("/website/"))
      throw Error("Outside website prefix");
    const relative = pathname.slice("/website/".length) || "index.html";
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep))
      throw Error("Outside website directory");
    const data = await fs.readFile(filename);
    response.writeHead(200, {
      "Content-Type":
        mime[path.extname(filename)] || "application/octet-stream",
    });
    response.end(data);
  } catch {
    missing.add(request.url);
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
context.setDefaultTimeout(10000);
const checks = [];
const errors = [];
const externalRequests = new Set();

function watch(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin + "/"))
      externalRequests.add(url);
  });
}
async function check(name, run) {
  try {
    await run();
    checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function settle(page) {
  await page.evaluate(async () => {
    // Load the complete gallery before full-page captures, including lazy images.
    for (const image of document.images) image.loading = "eager";
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}

try {
  for (const [locale, file] of [
    ["en", "index.html"],
    ["zh-CN", "zh.html"],
  ]) {
    for (const width of [1440, 1024, 768, 390, 320]) {
      const page = await context.newPage();
      watch(page);
      await page.setViewportSize({ width, height: 900 });
      await check(
        `${locale} layout and local assets at ${width}px`,
        async () => {
          await page.goto(`${origin}/website/${file}`, {
            waitUntil: "networkidle",
          });
          await settle(page);
          assert.equal(await page.locator("html").getAttribute("lang"), locale);
          assert.equal(
            await page
              .locator(`.language-switch [data-language="${locale}"]`)
              .getAttribute("aria-current"),
            "page",
          );
          assert.ok((await page.locator("h1").count()) === 1);
          const layout = await page.evaluate(() => ({
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            overflow: [...document.querySelectorAll("body *")]
              .filter((element) => {
                const r = element.getBoundingClientRect();
                return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
              })
              .slice(0, 8)
              .map((element) => ({
                tag: element.tagName,
                className: element.className,
                width: element.getBoundingClientRect().width,
              })),
            badImages: [...document.images]
              .filter((image) => !image.complete || !image.naturalWidth)
              .map((image) => image.getAttribute("src")),
          }));
          assert.deepEqual(layout.badImages, []);
          assert.ok(layout.documentWidth <= width + 1, JSON.stringify(layout));
          const switchBox = await page
            .locator(".language-switch")
            .boundingBox();
          assert.ok(
            switchBox &&
              switchBox.width >= 80 &&
              switchBox.x >= 0 &&
              switchBox.x + switchBox.width <= width + 1,
          );
          if (locale === "en")
            assert.match(
              await page.locator(".hero-wordmark").getAttribute("src"),
              /assets\/brand\/inkstone-wordmark\.svg$/,
            );
          const downloads = await page
            .locator("a.btn-primary")
            .evaluateAll((links) => links.map((link) => link.href));
          assert.ok(downloads.length >= 2);
          assert.ok(
            downloads.every(
              (url) =>
                url === "https://github.com/JhuoW/Inkstone/releases/latest",
            ),
          );
          assert.equal(
            await page.locator('a[href*="/releases/download/"]').count(),
            0,
          );
          if (width === 1440 || width === 390) {
            await page.screenshot({
              path: path.join(output, `${locale}-${width}-full.png`),
              fullPage: true,
            });
            await page.screenshot({
              path: path.join(output, `${locale}-${width}-hero.png`),
            });
          }
        },
      );
      if (checks.at(-1)?.passed === false)
        await page
          .screenshot({
            path: path.join(output, `failure-${locale}-${width}.png`),
            fullPage: true,
          })
          .catch(() => {});
      await page.close();
    }
  }
  const page = await context.newPage();
  watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await check(
    "Section links navigate and language switching retains the current section",
    async () => {
      await page.goto(`${origin}/website/index.html`);
      await page.locator('.nav a[href="#features"]').click();
      await page.waitForURL((url) => url.hash === "#features");
      assert.equal(new URL(page.url()).hash, "#features");
      await page.locator('.language-switch [data-language="zh-CN"]').click();
      await page.waitForURL("**/zh.html#features");
      assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
      await page.locator('.nav a[href="#download"]').click();
      assert.equal(new URL(page.url()).hash, "#download");
      await page.locator('.language-switch [data-language="en"]').focus();
      await page.keyboard.press("Enter");
      await page.waitForURL("**/index.html#download");
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
    },
  );
  await check(
    "Arrow keys switch language and restore keyboard focus",
    async () => {
      await page.goto(`${origin}/website/index.html#features`);
      await page.locator('.language-switch [data-language="en"]').focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForURL("**/zh.html#features");
      await page.waitForLoadState("load");
      await settle(page);
      assert.equal(
        await page.evaluate(() => document.activeElement?.dataset.language),
        "zh-CN",
      );
      await page.keyboard.press("ArrowLeft");
      await page.waitForURL("**/index.html#features");
      await page.waitForLoadState("load");
      await settle(page);
      assert.equal(
        await page.evaluate(() => document.activeElement?.dataset.language),
        "en",
      );
    },
  );
  await check(
    "The two language pages use localized showcase images",
    async () => {
      await page.goto(`${origin}/website/index.html`);
      const english = await page
        .locator(".showcase .screen img")
        .getAttribute("src");
      await page.goto(`${origin}/website/zh.html`);
      const chinese = await page
        .locator(".showcase .screen img")
        .getAttribute("src");
      assert.notEqual(english, chinese);
      assert.match(english, /en/);
      assert.match(chinese, /zh/);
    },
  );
  await page.close();
  await check(
    "Directory entry uses browser locale and remembers an explicit choice",
    async () => {
      const localized = await browser.newContext({ locale: "zh-CN" });
      localized.setDefaultTimeout(10000);
      const page = await localized.newPage();
      watch(page);
      try {
        await page.goto(`${origin}/website/#features`);
        await page.waitForURL("**/zh.html#features");
        await page.locator('.language-switch [data-language="en"]').click();
        await page.waitForURL("**/index.html#features");
        await page.goto(`${origin}/website/`, { waitUntil: "networkidle" });
        assert.equal(await page.locator("html").getAttribute("lang"), "en");
        await page.goto(`${origin}/website/zh.html`);
        assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
      } finally {
        await localized.close();
      }
    },
  );
  await check("Static language links work without JavaScript", async () => {
    const noScript = await browser.newContext({ javaScriptEnabled: false });
    const page = await noScript.newPage();
    watch(page);
    try {
      await page.goto(`${origin}/website/index.html`);
      await page.locator('.language-switch [data-language="zh-CN"]').click();
      await page.waitForURL("**/zh.html");
      assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
    } finally {
      await noScript.close();
    }
  });
  await check("Direct file preview and its language switch work", async () => {
    const fileContext = await browser.newContext();
    const page = await fileContext.newPage();
    watch(page);
    try {
      await page.goto(pathToFileURL(path.join(root, "index.html")).href);
      await settle(page);
      await page.locator('.language-switch [data-language="zh-CN"]').click();
      await page.waitForURL("**/zh.html");
      await settle(page);
      assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
    } finally {
      await fileContext.close();
    }
  });
  await check(
    "All page resources are local, with no browser errors or missing files",
    async () => {
      assert.deepEqual(errors, []);
      assert.deepEqual([...missing], []);
      assert.deepEqual([...externalRequests], []);
    },
  );
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  const summary = {
    passed: checks.filter((check) => check.passed).length,
    failed: checks.filter((check) => !check.passed).length,
    checks,
    errors,
    missingResources: [...missing],
    externalRequests: [...externalRequests],
  };
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: summary.passed,
      failed: summary.failed,
      evidence: output,
    }),
  );
  if (summary.failed) process.exitCode = 1;
}
