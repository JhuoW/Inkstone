import { withPreservedClipboard } from "./helpers/clipboard.mjs";
import { artifactPath } from "../scripts/artifact-path.mjs";
import { findPandoc } from "./helpers/tools.mjs";
import { extract } from "@electron-internal/extract-zip";
import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const root = process.cwd();
let app, page, temp, fixture, errors;
test.beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-desktop-"));
  fixture = path.join(temp, "日常写作.md");
  await fs.writeFile(
    fixture,
    "\uFEFF---\r\ntitle: 中文验收\r\nunknown: preserve-me\r\n---\r\n\r\n# 中文写作\r\n\r\n第一段 **粗体** 和 *强调*。\r\n\r\n## 章节\r\n\r\n- 外层\r\n  - 内层\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 一 | 二 |\r\n\r\n$$\r\nE = mc^2\r\n$$\r\n\r\n\x60\x60\x60mermaid\r\nflowchart LR\r\n  A[中文] --> B[写作]\r\n\x60\x60\x60\r\n\r\n未识别 :::custom{x}  结尾\r\n",
  );
  const environment = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":91",
    INKSTONE_USER_DATA: path.join(temp, "profile"),
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  await fs.mkdir(path.join(temp, "profile"), { recursive: true });
  await fs.writeFile(
    path.join(temp, "profile", "settings.json"),
    JSON.stringify({ locale: "zh-CN", firstRunComplete: true }),
  );
  app = await electron.launch({
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
    args: [root, fixture],
    env: environment,
  });
  page = await app.firstWindow();
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Content Security Policy"))
      console.log("Renderer:", m.text().slice(0, 300));
  });
  await page.waitForFunction(() => window.__inkstone?.editor);
  await expect(page.locator("#document-title")).toHaveText("日常写作.md");
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { autoSave: false }),
  );
});
test.afterAll(async () => {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
});

test("launches real offline desktop with rendered Markdown, math, diagram, and isolated Node", async () => {
  await expect(page.locator(".cm-editor")).toBeVisible();
  expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
  });
  await expect(page.locator(".cm-live-block h1")).toContainText("中文写作");
  await expect(page.locator(".cm-live-block .katex")).toBeVisible();
  await page.locator(".diagram").scrollIntoViewIfNeeded();
  await expect(page.locator(".diagram svg")).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
    "unknown: preserve-me\r\n",
  );
  expect(errors).toEqual([]);
});

test("untouched save preserves bytes and mtime; local edit and undo preserve source", async () => {
  const before = await fs.readFile(fixture),
    stat = await fs.stat(fixture);
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(fixture)).toEqual(before);
  expect((await fs.stat(fixture)).mtimeMs).toBe(stat.mtimeMs);
  await page.evaluate(() => {
    const e = __inkstone.editor;
    const at = e.view.state.doc.toString().indexOf("第一段");
    e.view.dispatch({ changes: { from: at, to: at + 3, insert: "修改段" } });
  });
  expect(await page.evaluate(() => __inkstone.getDocument().dirty)).toBe(true);
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(fixture, "utf8")).toBe(
    before.toString("utf8").replace("第一段", "修改段"),
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    before.toString("utf8").slice(1),
  );
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(fixture)).toEqual(before);
});

test("continuous Chinese editing, cross-block selection, undo and source switch retain state", async () => {
  const base = await page.evaluate(() => __inkstone.getDocument().text);
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setMode("source");
    e.setSelection({ anchor: 0, head: 0 });
    e.focus();
  });
  await page.keyboard.insertText("连续中文输入🙂\n");
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({ anchor: 3, head: 65 });
  });
  const selection = await page.evaluate(() => __inkstone.editor.getSelection());
  await page.evaluate(() => __inkstone.editor.setMode("live"));
  expect(await page.evaluate(() => __inkstone.editor.getSelection())).toEqual(
    selection,
  );
  await page.evaluate(() => __inkstone.editor.setMode("source"));
  expect(await page.evaluate(() => __inkstone.editor.getSelection())).toEqual(
    selection,
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(base);
  await page.evaluate(() => __inkstone.editor.command("redo"));
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
    "连续中文输入🙂",
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  await page.evaluate(() => __inkstone.editor.setMode("live"));
});

test("formatting toolbar, table edits, snippets, regex find, and persistent preferences work", async () => {
  await page.evaluate(() => {
    const e = __inkstone.editor;
    const p = e.view.state.doc.toString().indexOf("第一段");
    e.setSelection({ anchor: p, head: p + 3 });
  });
  await page.locator('.format-tools [data-command="bold"]').click();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
    "**第一段**",
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  await page.evaluate(() => {
    const e = __inkstone.editor;
    const p = e.view.state.doc.toString().indexOf("| 一");
    e.setSelection({ anchor: p + 2, head: p + 2 });
    return __inkstone.execute("tableAction", "addRow");
  });
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toMatch(
    /\| 一 \| 二 \|\r\n\|\s+\|\s+\|/,
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  await page.evaluate(() => __inkstone.execute("find"));
  await expect(page.locator(".cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => __inkstone.execute("settings"));
  await page.locator('[data-section="appearance"]').click();
  await page.locator('select[name="theme"]').selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator('select[name="theme"]').selectOption("light");
  await page.locator('[data-section="writing"]').click();
  await page.locator('select[name="locale"]').selectOption("en");
  await expect(page.locator(".sidebar-tabs")).toContainText("Files");
  await page.locator('select[name="locale"]').selectOption("zh-CN");
  await page.locator("#settings-done").click();
  expect(
    (await page.evaluate(() => __inkstone.invoke("bootstrap"))).settings.locale,
  ).toBe("zh-CN");
  expect(errors).toEqual([]);
});

test("visual table grid edits, pastes TSV, reorders cells, and cancels without changing source", async () => {
  const original = await page.evaluate(() => __inkstone.editor.getText());
  await page.evaluate(() => {
    const e = __inkstone.editor,
      at = e.view.state.doc.toString().indexOf("| 一");
    e.setSelection({ anchor: at + 2, head: at + 2 });
    return __inkstone.execute("tableEdit");
  });
  await page
    .locator('.table-grid input[data-row="1"][data-col="0"]')
    .fill("可视化编辑");
  await page.locator('.table-actions [data-op="colAdd"]').click();
  await page.locator("#table-apply").click();
  expect(await page.evaluate(() => __inkstone.editor.getText())).toContain(
    "可视化编辑",
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  expect(await page.evaluate(() => __inkstone.editor.getText())).toBe(original);
  await page.evaluate(() => {
    const e = __inkstone.editor,
      at = e.view.state.doc.toString().indexOf("| 一");
    e.setSelection({ anchor: at + 2, head: at + 2 });
    return __inkstone.execute("tableEdit");
  });
  await page
    .locator('.table-grid input[data-row="1"][data-col="0"]')
    .evaluate((el) => {
      const data = new DataTransfer();
      data.setData("text/plain", "粘贴甲\t粘贴乙\n粘贴丙\t粘贴丁");
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    });
  await expect(
    page.locator('.table-grid input[data-row="2"][data-col="1"]'),
  ).toHaveValue("粘贴丁");
  await page.locator("#table-cancel").click();
  expect(await page.evaluate(() => __inkstone.editor.getText())).toBe(original);
});

test("HTML clipboard paste converts structure to Markdown and rich copy writes both MIME formats", async () =>
  withPreservedClipboard(app, async () => {
    const original = await page.evaluate(() => __inkstone.editor.getText());
    await page.evaluate(async () => {
      const e = __inkstone.editor;
      e.setMode("live");
      e.setSelection({
        anchor: e.view.state.doc.length,
        head: e.view.state.doc.length,
      });
      e.focus();
      await __inkstone.invoke("writeClipboard", {
        text: "剪贴板标题\n带格式",
        html: '<h2>剪贴板标题</h2><p><strong>带格式</strong>与<a href="https://example.com">链接</a></p>',
      });
    });
    await page.keyboard.press("Control+v");
    await expect
      .poll(() => page.evaluate(() => __inkstone.editor.getText()))
      .toContain("## 剪贴板标题");
    expect(await page.evaluate(() => __inkstone.editor.getText())).toContain(
      "**带格式**",
    );
    await page.evaluate(() => __inkstone.execute("copyRich"));
    const formats = await app.evaluate(async ({ clipboard }) => {
      const items = await clipboard.read();
      return items.flatMap((i) => i.types);
    });
    expect(formats).toContain("text/html");
    expect(formats).toContain("text/plain");
    await page.evaluate(() => __inkstone.editor.command("undo"));
    expect(await page.evaluate(() => __inkstone.editor.getText())).toBe(
      original,
    );
  }));

test("read-only, math copy, theme import, sidebar persistence, and export presets have real effects", async () =>
  withPreservedClipboard(app, async () => {
    const original = await page.evaluate(() => __inkstone.editor.getText());
    await page.evaluate(() => __inkstone.execute("readOnly"));
    expect(
      await page.locator(".cm-content").getAttribute("contenteditable"),
    ).toBe("false");
    await page.evaluate(() => __inkstone.execute("bold"));
    expect(await page.evaluate(() => __inkstone.editor.getText())).toBe(
      original,
    );
    await page.evaluate(() => __inkstone.execute("refresh"));
    await page.evaluate(() => __inkstone.execute("readOnly"));
    await page.evaluate(() => {
      const e = __inkstone.editor;
      const at = e.view.state.doc.toString().indexOf("$$");
      e.setSelection({
        anchor: at,
        head: at + e.view.state.doc.toString().slice(at).indexOf("$$", 2) + 2,
      });
      return __inkstone.execute("copyMathML");
    });
    const math = await app.evaluate(async ({ clipboard }) => {
      const items = await clipboard.read();
      return (await items[0].getType("text/plain")).text();
    });
    expect(math).toContain("<math");
    expect(math).toContain("mc");
    await page.locator("#sidebar-resize").focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => __inkstone.invoke("bootstrap"))).settings
            .sidebarWidth,
      )
      .toBe(266);
    const css = path.join(temp, "my-theme.css");
    await fs.writeFile(css, ".cm-live-block h1 { color: rgb(127, 40, 65); }");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, css);
    await page.evaluate(() => __inkstone.execute("settings"));
    await page.locator('[data-section="appearance"]').click();
    await page.locator("#import-theme").click();
    await expect(page.locator('textarea[name="customCSS"]')).toHaveValue(
      /rgb\(127, 40, 65\)/,
    );
    await page.locator('textarea[name="customCSS"]').fill("");
    await page.locator('textarea[name="customCSS"]').dispatchEvent("change");
    await page.locator("#settings-done").click();
    await page.evaluate(() => __inkstone.execute("export"));
    await page.locator('select[name="format"]').selectOption("jpeg");
    await page.locator('input[name="quality"]').fill("78");
    await page.locator("#save-export-profile").click();
    await page.locator('dialog input[name="value"]').fill("测试预设");
    await page.locator('dialog form button[type="submit"]').last().click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => __inkstone.invoke("bootstrap"))).settings
            .exportProfiles?.[0]?.name,
      )
      .toBe("测试预设");
    await page.locator('select[name="format"]').selectOption("pdf");
    await page.locator('select[name="profile"]').selectOption("0");
    await expect(page.locator('select[name="format"]')).toHaveValue("jpeg");
    await expect(page.locator('input[name="quality"]')).toHaveValue("78");
    await page.locator("dialog .close").click();
  }));

test("external edit conflict keeps unsaved text and disk contents", async () => {
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
    e.insert("本地未保存");
  });
  await fs.appendFile(fixture, "\r\n外部新增\r\n");
  await expect(page.locator("#conflict-banner")).toBeVisible({
    timeout: 10000,
  });
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toContain(
    "本地未保存",
  );
  expect(await fs.readFile(fixture, "utf8")).toContain("外部新增");
  expect(await fs.readFile(fixture, "utf8")).not.toContain("本地未保存");
  await page.locator('[data-conflict="reload"]').click();
  await expect
    .poll(() => page.evaluate(() => __inkstone.getDocument().text))
    .toContain("外部新增");
  // The new text is published before recent-file/session persistence finishes.
  // Commands remain locked until the complete external-reload transition ends.
  await page.waitForFunction(() => !__inkstone.editor.view.state.readOnly);
  const data = await page.evaluate(() => __inkstone.invoke("bootstrap"));
  expect(data.recovery.some((r) => r.text?.includes("本地未保存"))).toBe(true);
});

test("real UI exports self-contained Chinese HTML, PDF, and PNG with hydrated math and Mermaid", async () => {
  await fs.mkdir(artifactPath("desktop-validation"), {
    recursive: true,
  });
  const paths = {};
  for (const format of ["html", "pdf", "png"]) {
    const output = path.join(temp, "ui-export." + format);
    paths[format] = output;
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, output);
    await page.evaluate(() => __inkstone.execute("export"));
    await page.locator('select[name="format"]').selectOption(format);
    await page.locator('#export-form button[type="submit"]').click();
    await expect(page.locator(".export-status")).toContainText("导出完成", {
      timeout: 60000,
    });
    await page.locator("dialog .close").click();
    expect((await fs.stat(output)).size).toBeGreaterThan(5000);
    await fs.copyFile(
      output,
      artifactPath("desktop-validation", "writing." + format),
    );
  }
  const html = await fs.readFile(paths.html, "utf8");
  expect(html).toContain('data-rendered="true"');
  expect(html).toContain("katex");
  expect(html).toContain("中文写作");
  const pdfText = execFileSync("pdftotext", [paths.pdf, "-"], {
    encoding: "utf8",
  });
  expect(pdfText).toMatch(/中文\s+写作|中文写作/);
  expect(pdfText).toContain("E");
  expect(pdfText).toContain("mc");
  const nodes = await page.locator(".diagram svg").textContent();
  expect(nodes).toContain("中文");
  expect(nodes).toContain("写作");
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
    e.view.scrollDOM.scrollTop = 0;
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    __inkstone.editor.view.scrollDOM.scrollTop = 0;
  });
  await page.screenshot({
    path: artifactPath("desktop-validation", "inkstone-desktop.png"),
  });
  expect(errors).toEqual([]);
});

test("Pandoc DOCX contains a rasterized Mermaid diagram and can be imported back", async () => {
  const pandoc = await findPandoc();
  test.skip(!pandoc, "Install Pandoc to validate DOCX diagram embedding");
  const output = path.join(temp, "diagram.docx");
  await page.evaluate(
    (path) => __inkstone.invoke("updateSettings", { pandocPath: path }),
    pandoc,
  );
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, output);
  await page.evaluate(() => __inkstone.execute("export"));
  await page.locator('select[name="format"]').selectOption("docx");
  await page.locator('#export-form button[type="submit"]').click();
  await expect(page.locator(".export-status")).toContainText("导出完成", {
    timeout: 60000,
  });
  await page.locator("dialog .close").click();
  const extracted = path.join(temp, "diagram-docx");
  await extract(output, { dir: extracted });
  const media = path.join(extracted, "word", "media");
  const image = (await fs.readdir(media)).find((name) => name.endsWith(".png"));
  expect(image).toBeTruthy();
  expect((await fs.readFile(path.join(media, image))).subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const imported = await page.evaluate(
    (path) => __inkstone.invoke("runPandoc", { direction: "import", path }),
    output,
  );
  expect(imported.text).toContain("data:image/png;base64,");
  expect(imported.text).toContain("中文写作");
  await fs.copyFile(output, artifactPath("desktop-validation", "writing.docx"));
});

test("complete offline acceptance sample renders native legacy diagrams and advanced math in the desktop CSP", async () => {
  const sample = path.join(root, "samples", "acceptance.md"),
    output = path.join(temp, "acceptance.html");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, sample);
  await page.evaluate(() => __inkstone.execute("open"));
  await expect(page.locator("#document-title")).toHaveText("acceptance.md");
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
  const html = await fs.readFile(output, "utf8");
  expect(html).not.toContain('class="math-error"');
  expect(html).not.toContain('class="diagram-error"');
  expect(
    (html.match(/data-rendered="true"/g) || []).length,
  ).toBeGreaterThanOrEqual(5);
  expect(html).toContain("data:image/");
  expect(html).toContain("<svg");
  await fs.copyFile(
    output,
    artifactPath("desktop-validation", "acceptance.html"),
  );
  expect(errors).toEqual([]);
});

test("one-megabyte document editing and switching produce measured performance evidence", async () => {
  const result = await page.evaluate(async () => {
    const e = __inkstone.editor,
      original = e.getText(),
      text =
        "# 中文长文档\n\n一段用于性能测试的普通文字，保持 Markdown 原文。 **重点**\n\n".repeat(
          12000,
        );
    const a = performance.now();
    e.setDocument(text);
    const opened = performance.now() - a;
    const b = performance.now();
    e.view.dispatch({ changes: { from: 10, insert: "测试" } });
    const edited = performance.now() - b;
    const c = performance.now();
    e.setMode("source");
    e.setMode("live");
    const switched = performance.now() - c;
    e.setDocument(original);
    e.setMode("live");
    return {
      characters: text.length,
      utf8Bytes: new TextEncoder().encode(text).length,
      openMs: opened,
      editMs: edited,
      switchMs: switched,
    };
  });
  await fs.writeFile(
    artifactPath("desktop-validation", "performance.json"),
    JSON.stringify(result, null, 2),
  );
  console.log("Document performance:", result);
  expect(result.utf8Bytes).toBeGreaterThan(1000000);
  expect(errors).toEqual([]);
});

test("Save As rebases relative resources and keeps live content synchronized with the new file", async () => {
  const note = path.join(temp, "resource-note.md"),
    target = path.join(temp, "copy", "resource-note.md");
  await fs.mkdir(path.join(temp, "copy"), { recursive: true });
  await fs.mkdir(path.join(temp, "assets"), { recursive: true });
  await fs.writeFile(
    path.join(temp, "assets", "figure.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="green"/></svg>',
  );
  await fs.writeFile(note, "# 资源另存\n\n![示例](assets/figure.svg)\n");
  await page.evaluate(
    async (path) =>
      __inkstone.loadDocument(await __inkstone.invoke("openFile", { path })),
    note,
  );
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, target);
  await page.evaluate(() => __inkstone.execute("saveAs"));
  expect(await fs.readFile(target, "utf8")).toContain("../assets/figure.svg");
  const live = await page.evaluate(() => __inkstone.getDocument());
  expect(live.path).toBe(target);
  expect(live.text).toBe(await fs.readFile(target, "utf8"));
  expect(live.dirty).toBe(false);
});

test("process termination recovers the unsaved draft on restart without modifying the source file", async () => {
  const before = await page.evaluate(() => __inkstone.getDocument());
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({
      anchor: e.view.state.doc.length,
      head: e.view.state.doc.length,
    });
    e.insert("\n进程终止恢复标记");
  });
  await expect
    .poll(async () => {
      const data = await page.evaluate(() => __inkstone.invoke("bootstrap"));
      return data.recovery.some((r) => r.text.includes("进程终止恢复标记"));
    })
    .toBe(true);
  expect(await fs.readFile(before.path, "utf8")).not.toContain(
    "进程终止恢复标记",
  );
  if (process.platform === "win32") {
    // Playwright's Windows launcher may be a wrapper process. Terminating only
    // that PID leaves Electron alive with the profile lock and inspector open.
    execFileSync(
      "taskkill.exe",
      ["/PID", String(app.process().pid), "/T", "/F"],
      {
        windowsHide: true,
        stdio: "ignore",
      },
    );
  } else app.process().kill("SIGKILL");
  await app.close().catch(() => {});
  const environment = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":91",
    INKSTONE_USER_DATA: path.join(temp, "profile"),
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
    args: [root],
    env: environment,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.__inkstone?.editor);
  await page.locator("#recovery-review").click();
  await expect(page.locator("[data-recovery]").first()).toBeVisible({
    timeout: 10000,
  });
  const records = (await page.evaluate(() => __inkstone.invoke("bootstrap")))
    .recovery;
  const index = records.findIndex((r) => r.text.includes("进程终止恢复标记"));
  await page.locator('[data-recovery="' + index + '"]').click();
  await expect
    .poll(() => page.evaluate(() => __inkstone.getDocument().text))
    .toContain("进程终止恢复标记");
  expect(await page.evaluate(() => __inkstone.getDocument().dirty)).toBe(true);
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(before.path, "utf8")).toContain("进程终止恢复标记");
});
