import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";

// 0.9.1 usability changes: front matter, find bar, shortcut recorder,
// snippet list, typography, export layout, slash menu, narrow windows,
// immersive mode, AI first-run setup and the status bar; 0.9.2 adds the
// title bar folder name and the welcome cursor.
let application, page, directory, profile, file, errors;
const original =
  "---\r\ntitle: Notes\r\ntags: [a, b]\r\n---\r\n\r\n# Heading\r\n\r\nAlpha beta alpha.\r\n\r\n中文段落。\r\n";
const text = () => page.evaluate(() => __inkstone.editor.getText());
const doc = () =>
  page.evaluate(() => __inkstone.editor.view.state.doc.toString());
const settings = () =>
  page.evaluate(async () => (await __inkstone.invoke("bootstrap")).settings);

test.beforeEach(async () => {
  errors = [];
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-ux-"));
  profile = path.join(directory, "profile");
  await fs.mkdir(profile);
  file = path.join(directory, "front matter.md");
  await fs.writeFile(file, original);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale: "en",
      firstRunComplete: true,
      defaultAppPrompted: true,
      autoSave: false,
      spellcheck: false,
    }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.INKSTONE_EXECUTABLE
    ? path.resolve(process.env.INKSTONE_EXECUTABLE)
    : undefined;
  application = await electron.launch({
    executablePath,
    args: executablePath ? [file] : [process.cwd(), file],
    env,
    chromiumSandbox: true,
  });
  page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  await page.waitForFunction(
    () =>
      window.__inkstone?.getDocument().path?.endsWith("front matter.md") &&
      !__inkstone.editor.view.state.readOnly,
  );
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1280, 860),
  );
});
test.afterEach(async () => {
  try {
    expect(errors).toEqual([]);
  } finally {
    await application?.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await application?.close().catch(() => {});
    application = null;
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
});

test("documents open below front matter, which stays collapsed and labelled", async () => {
  // Below the metadata and the title, so neither shows raw syntax.
  const body = (await doc()).indexOf("Alpha beta");
  expect(
    await page.evaluate(() => __inkstone.editor.view.state.selection.main.head),
  ).toBe(body);
  await expect(page.locator(".frontmatter summary")).toHaveText(
    "Document properties · YAML",
  );
  expect(await text()).toBe(original);
});

test("find shows a match counter and readable labels", async () => {
  await page.evaluate(() => __inkstone.execute("find"));
  const search = page.locator('.cm-search input[name="search"]');
  // The search panel commits its query on key events, as when a person types.
  await search.pressSequentially("alpha");
  await expect(page.locator(".inkstone-search-count")).toHaveText("– / 2");
  await page.locator('.cm-search button[name="next"]').click();
  await expect(page.locator(".inkstone-search-count")).toHaveText("1 / 2");
  await expect(page.locator('.cm-search button[name="next"]')).toHaveText(
    "Next",
  );
  await search.fill("");
  await search.pressSequentially("zzz");
  await expect(page.locator(".inkstone-search-count")).toHaveText("No results");
  await search.press("Escape");
  await expect(page.locator(".cm-search")).toHaveCount(0);
});

test("shortcuts are recorded by pressing keys, with conflict checks and reset", async () => {
  await page.evaluate(() => __inkstone.execute("settings"));
  await page.locator('[data-section="advanced"]').click();
  await page.locator("#shortcut-filter").fill("Toggle typewriter");
  const key = page.locator('[data-shortcut-for="typewriter"]');
  await expect(key).toHaveText("F9");
  await key.click();
  await expect(key).toHaveText("Press keys…");
  // Ctrl+S already belongs to Save.
  await page.keyboard.press("Control+s");
  await expect(page.locator("#shortcut-status")).toContainText(
    "already used by “Save”",
  );
  await page.keyboard.press("Control+Alt+y");
  await expect(key).toHaveText("Ctrl+Alt+Y");
  await expect
    .poll(async () => (await settings()).shortcuts.typewriter)
    .toBe("Mod-Alt-y");
  await expect(page.locator('textarea[name="shortcuts"]')).toHaveValue(
    /"typewriter": "Mod-Alt-y"/,
  );
  await page.locator("#settings-done").click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+Alt+y");
  await expect(page.locator("#typewriter-button")).toHaveClass(/active/);
  await page.evaluate(() => __inkstone.execute("settings"));
  await page.locator('[data-section="advanced"]').click();
  await page.locator("#shortcut-filter").fill("typewriter");
  await page.locator('[data-shortcut-for="typewriter"]').click();
  await page.keyboard.press("Backspace");
  await expect
    .poll(async () => (await settings()).shortcuts.typewriter)
    .toBeUndefined();
  await expect(page.locator('[data-shortcut-for="typewriter"]')).toHaveText(
    "F9",
  );
});

test("snippets are edited as rows and saved as before", async () => {
  await page.evaluate(() => __inkstone.execute("settings"));
  await page.locator('[data-section="advanced"]').click();
  await expect(page.locator(".snippet-row")).toHaveCount(2);
  await page.locator("#add-snippet").click();
  const row = page.locator(".snippet-row").last();
  await row.locator(".snippet-name").fill("sig");
  await row.locator(".snippet-text").fill("Best regards");
  await row.locator(".snippet-text").blur();
  await expect
    .poll(async () => (await settings()).snippets.sig)
    .toBe("Best regards");
  await page.locator(".snippet-row").first().locator(".snippet-remove").click();
  await expect
    .poll(async () => Object.keys((await settings()).snippets))
    .toEqual(["note", "sig"]);
});

test("typography uses font presets and sliders that apply immediately", async () => {
  await page.evaluate(() => __inkstone.execute("settings"));
  await page.locator('[data-section="appearance"]').click();
  await expect(page.locator("#font-preset")).toHaveValue("sans");
  await page.locator("#font-preset").selectOption("serif");
  await expect
    .poll(async () => (await settings()).fontFamily)
    .toContain("Georgia");
  const slider = page.locator('[name="fontSize"] + input[type="range"]');
  await slider.evaluate((element) => {
    element.value = "21";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(async () => (await settings()).fontSize).toBe(21);
  await expect(page.locator('[name="fontSize"]')).toHaveValue("21");
  await page.locator('[name="fontFamily"]').fill("Arial, sans-serif");
  await page.locator('[name="fontFamily"]').blur();
  await expect(page.locator("#font-preset")).toHaveValue("custom");
});

test("export starts with common formats and keeps presets and every field", async () => {
  await page.evaluate(() => void __inkstone.execute("export"));
  const form = page.locator("#export-form");
  await expect(form.locator("[data-format-tile]")).toHaveCount(4);
  await expect(form.locator('[data-format-tile="pdf"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await form.locator('[data-format-tile="docx"]').click();
  await expect(form.locator('select[name="format"]')).toHaveValue("docx");
  await expect(form.locator('[name="toc"]')).toBeVisible();
  await form.locator('[data-format-tile="png"]').click();
  await expect(form.locator('input[name="width"]')).toBeVisible();
  await expect(form.locator(".export-advanced")).toBeHidden();
  await form.locator('[data-format-tile="pdf"]').click();
  await expect(form.locator(".export-advanced")).toBeVisible();
  await expect(form.locator("#save-export-profile")).toBeVisible();
  await page.locator("#close-export").click();
});

test("typing / at the start of a line inserts blocks by English or Chinese name", async () => {
  // The completion list closes when the window loses OS focus; make sure this
  // window has it, as it would for a person typing.
  await page.bringToFront();
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({ anchor: e.view.state.doc.length });
    e.focus();
  });
  await page.keyboard.type("/");
  await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible();
  await page.keyboard.type("divid");
  await expect(
    page.locator(".cm-tooltip-autocomplete li").first(),
  ).toContainText("Horizontal rule");
  await page.keyboard.press("Enter");
  await expect.poll(doc).toMatch(/中文段落。[\s\S]*---/);
  expect(await doc()).not.toContain("/divid");
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({ anchor: e.view.state.doc.length });
  });
  await page.keyboard.press("Enter");
  await page.keyboard.type("/分隔");
  await expect(
    page.locator(".cm-tooltip-autocomplete li").first(),
  ).toContainText("分隔线");
  await page.keyboard.press("Escape");
  expect(await doc()).toContain("/分隔");
});

test("narrow windows hide the sidebar, open it as an overlay and fold the toolbar", async () => {
  // 200% UI zoom in a 720px window leaves too little room for every button.
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(720, 600);
    window.webContents.setZoomFactor(2);
  });
  await expect(page.locator("body")).toHaveClass(/sidebar-hidden/);
  await expect(page.locator("#toolbar-more")).toBeVisible();
  await page.locator("#toolbar-more").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('.titlebar [data-command="sidebar"]').click();
  await expect(page.locator("body")).toHaveClass(/sidebar-overlay/);
  await expect(page.locator("#sidebar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/sidebar-overlay/);
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.setZoomFactor(1);
    window.setSize(1280, 860);
  });
  await expect(page.locator("body")).not.toHaveClass(/sidebar-hidden/);
  await expect(page.locator("#toolbar-more")).toBeHidden();
  await expect(page.locator(".format-tools [data-command]")).toHaveCount(11);
});

test("immersive mode hides the chrome and Esc restores it", async () => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator(".titlebar")).toBeHidden();
  await expect(page.locator(".statusbar")).toBeHidden();
  await expect(page.locator("#zen-exit")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".titlebar")).toBeVisible();
  await expect(page.locator("#zen-exit")).toBeHidden();
  expect(await text()).toBe(original);
});

test("AI setup does not probe a local server before anything is configured", async () => {
  const contacted = [];
  const server = http.createServer((req, res) => {
    contacted.push(req.url);
    res.writeHead(404);
    res.end();
  });
  // If something already uses the port, nothing here can be contacted anyway.
  server.on("error", () => {});
  await new Promise((resolve) => {
    server.once("error", resolve);
    server.listen(11434, "127.0.0.1", resolve);
  });
  try {
    await page.evaluate(() => __inkstone.execute("aiAssistant"));
    await expect(page.locator(".ai-setup-callout")).toBeVisible();
    await expect(page.locator(".ai-model-label")).toHaveText(
      "No model set up yet",
    );
    await page.locator("[data-ai-setup]").click();
    const dialog = page.locator(".ai-settings-dialog");
    await expect(dialog.locator(".ai-model-list-status")).toContainText(
      "start the local server first",
    );
    await page.waitForTimeout(700);
    expect(contacted).toEqual([]);
    await dialog.locator("[data-model-dismiss]").click();
  } finally {
    server.close();
  }
});

test("the title bar shows a short folder name in full", async () => {
  const folder = page.locator("#breadcrumb-folder");
  await expect(folder).toHaveText(path.basename(directory));
  const size = await folder.evaluate((node) => ({
    shown: node.clientWidth,
    needed: node.scrollWidth,
  }));
  expect(size.shown).toBeGreaterThanOrEqual(size.needed);
});

test("the Chinese welcome starts on its first paragraph, not on the quote", async () => {
  await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await application.close().catch(() => {});
  // A fresh profile: the first one would reopen the file from its session.
  const welcomeProfile = path.join(directory, "welcome-profile");
  await fs.mkdir(welcomeProfile);
  await fs.writeFile(
    path.join(welcomeProfile, "settings.json"),
    JSON.stringify({
      locale: "zh-CN",
      firstRunComplete: true,
      defaultAppPrompted: true,
      autoSave: false,
      spellcheck: false,
    }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: welcomeProfile };
  delete env.ELECTRON_RUN_AS_NODE;
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
    () =>
      window.__inkstone?.editor.getText().startsWith("# 写下值得留下的想法") &&
      !__inkstone.editor.view.state.readOnly,
  );
  const welcome = await doc();
  await expect
    .poll(() =>
      page.evaluate(() => __inkstone.editor.view.state.selection.main.head),
    )
    .toBe(welcome.indexOf("从一个念头开始"));
  // The quote renders instead of showing its ">" marker as a source line.
  await expect(
    page.locator("#editor-host blockquote", { hasText: "墨石 Inkstone" }),
  ).toBeVisible();
  await expect(
    page.locator(".cm-line", { hasText: "墨石 Inkstone" }),
  ).toHaveCount(0);
});

test("status bar names the count clearly and explains it on hover", async () => {
  await expect(page.locator("#statistics")).toHaveText(/^\d+ words · \d+ min$/);
  await expect(page.locator("#statistics")).toHaveAttribute(
    "title",
    /CJK characters 4 · other words \d+/,
  );
  await page.locator("#focus-button").click();
  await expect(page.locator("#focus-button")).toHaveClass(/active/);
  await page.locator("#focus-button").click();
});
