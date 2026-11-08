import { artifactPath } from "../scripts/artifact-path.mjs";
import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFileSync } from "node:child_process";
let app, page, temp, file, server;
const networkRequests = [];
const source =
  '#无空格标题\r\n\r\n# 正常标题\n\n正文 **中文。**尾巴。\r\n\r\n![中文](photo.svg)\r\n<img src="photo.svg" width="80">\n\n![引用][picture]\r\n\r\n[picture]: photo.svg "保留标题"\r\n\r\n```text\r\n![代码示例](photo.svg)\r\n```\r\n';
test.beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-enhancements-"));
  file = path.join(temp, "写作.md");
  await fs.writeFile(file, source);
  await fs.writeFile(
    path.join(temp, "photo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><text y="30">中文</text></svg>',
  );
  await fs.mkdir(path.join(temp, "章节"));
  await fs.writeFile(path.join(temp, "章节", "子文档.md"), "# 子文档");
  await fs.writeFile(path.join(temp, "尾声.md"), "# 尾声");
  const env = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":91",
    INKSTONE_USER_DATA: path.join(temp, "profile"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  await fs.mkdir(path.join(temp, "profile"), { recursive: true });
  await fs.writeFile(
    path.join(temp, "profile", "settings.json"),
    JSON.stringify({ locale: "zh-CN", firstRunComplete: true }),
  );
  app = await electron.launch({
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
    args: [process.cwd(), file],
    env,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.__inkstone?.editor);
  await expect(page.locator("#document-title")).toHaveText("写作.md");
  server = http.createServer((request, response) => {
    networkRequests.push({ method: request.method, url: request.url });
    if (request.method !== "GET") {
      response.writeHead(405);
      response.end();
      return;
    }
    response.setHeader("content-type", "image/svg+xml");
    response.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><text y="30">URL图片</text></svg>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { autoSave: false }),
  );
});
test.afterAll(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
});

test("file tree supports roving keyboard navigation, collapse, parent, filename search and rename", async () => {
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, temp);
  await page.evaluate(() => __inkstone.execute("openFolder"));
  const directory = page
    .locator('[data-tree-item][data-directory="true"]')
    .filter({ hasText: "章节" });
  await directory.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(directory).toHaveAttribute("aria-expanded", "false");
  await expect(directory).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(directory).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.locator("[data-tree-item]").filter({ hasText: "子文档.md" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(directory).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await page.keyboard.press("F2");
  await expect(page.locator("dialog h2")).toHaveText("重命名");
  await page.locator("dialog input").fill("章节重命名");
  await page.locator('dialog button[type="submit"]').click();
  await expect(
    page.locator("[data-tree-item]").filter({ hasText: "章节重命名" }),
  ).toBeVisible();
  await page.evaluate(() => __inkstone.execute("undoFileOperation"));
  await expect(directory).toBeVisible();
});

test("strict parsing, CJK emphasis, code defaults, outline numbering and saved CSS themes apply and persist", async () => {
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
    return __inkstone.execute("settings");
  });
  await page.locator('input[name="strictMarkdown"]').uncheck();
  await page.locator('input[name="cjkEmphasis"]').check();
  await page.locator('input[name="outlineNumbering"]').check();
  await page.locator('input[name="defaultCodeLanguage"]').fill("python");
  await page.locator('input[name="defaultCodeLanguage"]').blur();
  await page.locator('[data-section="appearance"]').click();
  await page
    .locator('textarea[name="customCSS"]')
    .fill(".markdown-body { letter-spacing: .2px; }");
  await page.locator('textarea[name="customCSS"]').blur();
  await page.locator("#save-theme").click();
  await page.locator("dialog").last().locator("input").fill("中文纸张");
  await page.locator("dialog").last().locator('button[type="submit"]').click();
  await expect(page.locator("#saved-themes")).toHaveValue("中文纸张");
  await page.locator("#settings-done").click();
  await expect(
    page.locator(".cm-live-block h1").filter({ hasText: "无空格标题" }),
  ).toBeVisible();
  const saved = await page.evaluate(
    async () => (await __inkstone.invoke("bootstrap")).settings,
  );
  expect(saved.strictMarkdown).toBe(false);
  expect(saved.defaultCodeLanguage).toBe("python");
  expect(saved.themeLibrary["中文纸张"]).toContain("letter-spacing");
  await page.evaluate(() => __inkstone.execute("settings"));
  await page.locator('[data-section="files"]').click();
  await page
    .locator('textarea[name="excludeGlobs"]')
    .fill("**/archive/**\n**/cache/**");
  await page.locator('textarea[name="excludeGlobs"]').blur();
  await page.locator("#settings-done").click();
  await page.evaluate(() => __inkstone.execute("settings"));
  await page.locator('[data-section="files"]').click();
  await expect(page.locator('textarea[name="excludeGlobs"]')).toHaveValue(
    "**/archive/**\n**/cache/**",
  );
  await page.locator('textarea[name="excludeGlobs"]').fill("");
  await page.locator('textarea[name="excludeGlobs"]').blur();
  await page.locator("#settings-done").click();
  await page.evaluate(() => __inkstone.execute("codeFence"));
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
    "```python",
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  await page.evaluate(() => __inkstone.execute("outline"));
  await expect(page.locator(".outline-item").first()).toHaveText(/^1 /);
});

test("resource manager copies all Markdown, reference and HTML image occurrences without altering fenced examples or mixed EOL", async () => {
  await page.evaluate(() => __inkstone.execute("manageImages"));
  await expect(page.locator("[data-resource]")).toHaveCount(1);
  await page.locator("[data-resource]").check();
  await page.locator("#resource-apply").click();
  await expect(page.locator("#resource-apply")).toHaveCount(0);
  const expected = source
    .replace("](photo.svg)", "](assets/photo.svg)")
    .replace('src="photo.svg"', 'src="assets/photo.svg"')
    .replace("[picture]: photo.svg", "[picture]: assets/photo.svg");
  expect(await fs.readFile(file, "utf8")).toBe(expected);
  expect(await page.evaluate(() => __inkstone.getDocument().dirty)).toBe(false);
  expect(
    await fs.readFile(path.join(temp, "assets", "photo.svg"), "utf8"),
  ).toContain("中文");
  expect(await fs.readFile(path.join(temp, "photo.svg"), "utf8")).toContain(
    "中文",
  );
});

test("local-only preferences and commands omit cloud services while URL images render and preserve their URLs", async () => {
  await page.evaluate(() => __inkstone.execute("settings"));
  await expect(
    page.locator('[name*="upload" i], [name="searchURL"]'),
  ).toHaveCount(0);
  await expect(page.locator("dialog")).not.toContainText(
    /PicGo|PicList|Upgit|上传|同步/,
  );
  await page.locator("#settings-done").click();
  await page.evaluate(() => __inkstone.execute("commands"));
  await expect(page.locator("dialog")).not.toContainText(
    /上传|Upload|同步|Sync|搜索所选文字/,
  );
  await page.locator("dialog .close").click();
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
    window.imageInsert = __inkstone.execute("insertImageURL");
  });
  const url = `http://127.0.0.1:${server.address().port}/中文 图(1).svg`;
  await page.locator("dialog input").fill(url);
  await page.locator('dialog button[type="submit"]').click();
  await page.evaluate(() => window.imageInsert);
  const encoded = new URL(url).href
    .replaceAll("(", "%28")
    .replaceAll(")", "%29");
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
    `![](${encoded})`,
  );
  await page.evaluate(() =>
    __inkstone.editor.setSelection({ anchor: 0, head: 0 }),
  );
  const image = page.locator('.cm-live-block img[src^="http://127.0.0.1:"]');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el) => el.naturalWidth)).toBe(80);
  expect(networkRequests.length).toBeGreaterThan(0);
  expect(networkRequests.every((request) => request.method === "GET")).toBe(
    true,
  );
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(file, "utf8")).toContain(`![](${encoded})`);
});

test("real clipboard image paste saves only a local asset and never sends file contents to a service", async () => {
  await page.evaluate(async () => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
    e.focus();
  });
  await app.evaluate(
    async ({ clipboard, ClipboardItem }, data) => {
      await clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([Buffer.from(data, "base64")], {
            type: "image/png",
          }),
        }),
      ]);
    },
    (await fs.readFile(path.join(process.cwd(), "build", "icon.png"))).toString(
      "base64",
    ),
  );
  await page.keyboard.press("Control+v");
  await expect
    .poll(() => page.evaluate(() => __inkstone.getDocument().text))
    .toMatch(/!\[[^\]]*\]\(assets\/[^)]+\.png\)/);
  expect(
    (await fs.readdir(path.join(temp, "assets"))).some((name) =>
      name.endsWith(".png"),
    ),
  ).toBe(true);
  expect(networkRequests.every((request) => request.method === "GET")).toBe(
    true,
  );
});

test("production desktop exports all 25 Mermaid types offline including ZenUML and Chinese Sankey", async () => {
  const fixtures = JSON.parse(
    await fs.readFile("samples/mermaid-catalog.json", "utf8"),
  );
  const diagramFile = path.join(temp, "所有图表.md");
  const content =
    "# 图表桌面导出验收\n\n" +
    fixtures
      .map(
        (item) =>
          "## " + item.name + "\n\n```mermaid\n" + item.source + "\n```\n",
      )
      .join("\n");
  await fs.writeFile(diagramFile, content);
  await page.evaluate(
    async (file) =>
      __inkstone.loadDocument(
        await __inkstone.invoke("openFile", { path: file }),
      ),
    diagramFile,
  );
  const output = artifactPath("desktop-validation/diagram-catalog.html");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, output);
  await page.evaluate(() => __inkstone.execute("export"));
  await page.locator('select[name="format"]').selectOption("html");
  await page.locator('#export-form button[type="submit"]').click();
  await expect(page.locator(".export-status")).toContainText("导出完成", {
    timeout: 60000,
  });
  await page.locator("dialog .close").click();
  const validation = await app.evaluate(async ({ BrowserWindow }, file) => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    try {
      await window.loadFile(file);
      return await window.webContents.executeJavaScript(
        '({ count:[...document.querySelectorAll(".diagram")].filter(el=>el.querySelector("svg")).length, errors:document.querySelectorAll(".diagram-error").length, text:document.body.textContent, scripts:document.scripts.length, externalImages:[...document.images].filter(img=>/^https?:/.test(img.src)).length })',
      );
    } finally {
      window.destroy();
    }
  }, output);
  expect(validation.count).toBe(25);
  expect(validation.errors).toBe(0);
  expect(validation.scripts).toBe(0);
  expect(validation.externalImages).toBe(0);
  for (const fixture of fixtures)
    expect(validation.text).toContain(fixture.label);
  const pdf = output.replace(".html", ".pdf");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, pdf);
  await page.evaluate(() => __inkstone.execute("export"));
  await page.locator('select[name="format"]').selectOption("pdf");
  await page.locator('#export-form button[type="submit"]').click();
  await expect(page.locator(".export-status")).toContainText("导出完成", {
    timeout: 60000,
  });
  await page.locator("dialog .close").click();
  const text = execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8" });
  expect(text).toContain("中文协作");
  await fs.writeFile(
    output.replace(".html", "-validation.json"),
    JSON.stringify(
      {
        ...validation,
        text: undefined,
        labels: fixtures.map((item) => item.label),
        pdfSize: (await fs.stat(pdf)).size,
        pdfChineseZenText: text.includes("中文协作"),
      },
      null,
      2,
    ),
  );
});
