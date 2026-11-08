import { artifactPath } from "./artifact-path.mjs";
// Offline (loopback only) source-renderer checks; no claim of installed-platform coverage.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

const cases = JSON.parse(
  await fs.readFile("samples/mermaid-catalog.json", "utf8"),
);

const output = artifactPath("mermaid-validation");
await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  path.join(output, "cases.json"),
  JSON.stringify(cases, null, 2),
);
const cacheDir = await fs.mkdtemp(
  path.join(os.tmpdir(), "inkstone-mermaid-vite-"),
);
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir,
  optimizeDeps: { include: ["mermaid", "@mermaid-js/mermaid-zenuml"] },
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath = process.env.INKSTONE_CHROMIUM || undefined;
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const networkAttempts = [],
  pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (
    url.startsWith(origin) ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  )
    return route.continue();
  networkAttempts.push(url);
  return route.abort();
});
await page.route("**/diagram-harness", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data:; object-src 'none'; base-uri 'none'"><style>body{font:16px sans-serif;margin:36px}section{border:1px solid #ddd;padding:20px;margin-bottom:30px;break-inside:avoid}h2{font-size:20px}.diagram svg{max-width:100%;height:auto;max-height:650px}pre{white-space:pre-wrap}.diagram-error{color:#a00}</style><main></main>`,
  }),
);
try {
  await page.goto(origin + "/diagram-harness");
  await page.evaluate(async () => {
    window.renderer = await import("/src/markdown.js");
  });
  const results = [];
  for (const item of cases) {
    const result = await page.evaluate(async (item) => {
      const section = document.createElement("section");
      section.id = item.name;
      const heading = document.createElement("h2");
      heading.textContent = item.name;
      section.append(heading);
      const host = document.createElement("div");
      section.append(host);
      document.querySelector("main").append(section);
      host.innerHTML = window.renderer.renderMarkdown(
        "```mermaid\n" + item.source + "\n```",
      );
      const started = performance.now();
      await window.renderer.hydrateDiagrams(host);
      await document.fonts.ready;
      const figure = host.querySelector(".diagram"),
        svg = figure?.querySelector("svg");
      const labelText = [
        ...figure.querySelectorAll("svg text,svg foreignObject"),
      ]
        .map((e) => e.textContent)
        .join(" ");
      const bounds = svg?.getBoundingClientRect();
      return {
        name: item.name,
        status: figure?.dataset.rendered ?? "missing",
        svg: Boolean(svg),
        geometry:
          svg?.querySelectorAll("path,rect,line,circle,polygon,ellipse")
            .length ?? 0,
        labelPresent: labelText.includes(item.label),
        labelText,
        width: bounds?.width ?? 0,
        height: bounds?.height ?? 0,
        milliseconds: performance.now() - started,
        error: figure?.querySelector("small")?.textContent ?? null,
      };
    }, item);
    results.push(result);
    console.log(JSON.stringify(result));
    await page
      .locator("section#" + item.name)
      .screenshot({ path: path.join(output, item.name + ".png") });
  }
  const escapedLabelCheck = await page.evaluate(async () => {
    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML = window.renderer.renderMarkdown(
      '```mermaid\nsankey\n\n"<img onerror=alert(1)>中文",输出,2\n```',
    );
    await window.renderer.hydrateDiagrams(host);
    const result = {
      rendered: host.querySelector(".diagram").dataset.rendered,
      text: host.querySelector("svg text")?.textContent,
      images: host.querySelectorAll("img,script,[onerror]").length,
    };
    host.remove();
    return result;
  });
  assert.equal(escapedLabelCheck.rendered, "true");
  assert.equal(escapedLabelCheck.images, 0);
  assert.ok(escapedLabelCheck.text.includes("<img onerror=alert(1)>中文"));
  await page.pdf({
    path: path.join(output, "catalog.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
  });
  await fs.writeFile(path.join(output, "catalog.html"), await page.content());
  const version = JSON.parse(
    await fs.readFile("node_modules/mermaid/package.json", "utf8"),
  ).version;
  const passed = results.filter(
    (r) =>
      r.status === "true" &&
      r.svg &&
      r.geometry > 0 &&
      r.labelPresent &&
      r.width > 0 &&
      r.height > 0,
  );
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        mermaid: version,
        browser: await browser.version(),
        scope:
          "Source renderer in Chromium; strict script-src self CSP, only loopback HTTP allowed, no remote resources. Each type basic Chinese fixture, not complete syntax/OS/package coverage.",
        passed: passed.length,
        total: results.length,
        networkAttempts,
        pageErrors,
        escapedLabelCheck,
        results,
      },
      null,
      2,
    ),
  );
  assert.equal(networkAttempts.length, 0);
  assert.equal(pageErrors.length, 0);
  assert.equal(passed.length, cases.length);
  console.log(
    JSON.stringify({
      passed: passed.length,
      total: results.length,
      missing: results
        .filter((r) => !passed.includes(r))
        .map((r) => ({
          name: r.name,
          error: r.error,
          labelPresent: r.labelPresent,
        })),
    }),
  );
} finally {
  await browser.close();
  await server.close();
  await fs.rm(cacheDir, { recursive: true, force: true });
}
