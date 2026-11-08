import { artifactPath } from "../scripts/artifact-path.mjs";
import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
// Linux CI hosts may explicitly opt out when AppArmor blocks unprivileged
// namespaces and the local Electron helper is not installed setuid root.
// Keep Chromium sandboxing enabled by default and record the actual argv.
const sandboxBypass = process.env.INKSTONE_TEST_NO_SANDBOX === "1";
const evidence = artifactPath("ui-redesign/desktop-interactions");
const original =
  "# Desk\r\n\r\nKeep steady text and 中文 here.\r\n\r\n## Notes\r\n\r\n- A nested idea\r\n  - A detail\r\n\r\nFormula $x^2 + y$ stays editable.\r\n";
const results = [],
  contrasts = [],
  geometry = [];
let app, page, temp, file, pageErrors;
async function selectWords() {
  return page.evaluate(() => {
    const e = __inkstone.editor,
      at = e.view.state.doc.toString().indexOf("steady text");
    e.setSelection({ anchor: at, head: at + "steady text".length });
    e.focus();
    return e.getSelection();
  });
}
async function source() {
  return page.evaluate(() => __inkstone.editor.getText());
}
async function settle() {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function windowSize(width, height, zoom = 1) {
  const window = await app.browserWindow(page);
  await window.evaluate(
    (w, { width, height, zoom }) => {
      w.webContents.setZoomFactor(zoom);
      w.setContentSize(width, height);
    },
    { width, height, zoom },
  );
  await settle();
}
async function noOuterOverflow(label) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement,
      body = document.body;
    const footer = document.querySelector(".statusbar").getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      documentWidth: doc.scrollWidth,
      documentHeight: doc.scrollHeight,
      bodyWidth: body.scrollWidth,
      bodyHeight: body.scrollHeight,
      footer: {
        left: footer.left,
        right: footer.right,
        top: footer.top,
        bottom: footer.bottom,
      },
    };
  });
  geometry.push({ label, ...result });
  expect(result.documentWidth, label + " document width").toBeLessThanOrEqual(
    result.width + 1,
  );
  expect(result.documentHeight, label + " document height").toBeLessThanOrEqual(
    result.height + 1,
  );
  expect(result.bodyWidth, label + " body width").toBeLessThanOrEqual(
    result.width + 1,
  );
  expect(result.bodyHeight, label + " body height").toBeLessThanOrEqual(
    result.height + 1,
  );
  expect(result.footer.left).toBeGreaterThanOrEqual(-1);
  expect(result.footer.right).toBeLessThanOrEqual(result.width + 1);
  expect(result.footer.bottom).toBeLessThanOrEqual(result.height + 1);
  expect(result.footer.top).toBeGreaterThan(0);
}
async function capture(filename) {
  const window = await app.browserWindow(page);
  const png = await window.evaluate(async (w) => {
    const image = await w.webContents.capturePage();
    return image.toPNG().toString("base64");
  });
  await fs.writeFile(path.join(evidence, filename), Buffer.from(png, "base64"));
}
async function colors(selector) {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const rgba = (value) => {
        const m = value.match(/[\d.]+/g)?.map(Number) || [];
        return [m[0] || 0, m[1] || 0, m[2] || 0, m[3] ?? 1];
      };
      const blend = (front, back) =>
        [0, 1, 2]
          .map((i) => front[i] * front[3] + back[i] * (1 - front[3]))
          .concat(1);
      const background = (element) => {
        if (!element) return [255, 255, 255, 1];
        const c = rgba(getComputedStyle(element).backgroundColor);
        return c[3] === 1 ? c : blend(c, background(element.parentElement));
      };
      const style = getComputedStyle(node),
        bg = background(node),
        fg = blend(rgba(style.color), bg);
      const luminance = (color) =>
        color
          .slice(0, 3)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const a = luminance(fg),
        b = luminance(bg);
      return {
        foreground: fg,
        background: bg,
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        fontSize: style.fontSize,
      };
    });
}

test.beforeEach(async () => {
  pageErrors = [];
  await fs.mkdir(evidence, { recursive: true });
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-design-test-"));
  const folder = path.join(temp, "Notebook"),
    profile = path.join(temp, "profile");
  await fs.mkdir(folder);
  await fs.mkdir(profile);
  file = path.join(folder, "Desk.md");
  await fs.writeFile(file, original);
  await fs.writeFile(path.join(folder, "References.md"), "# References\n");
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale: "en",
      theme: "light",
      firstRunComplete: true,
      autoSave: false,
      spellcheck: false,
    }),
  );
  await fs.writeFile(
    path.join(profile, "session.json"),
    JSON.stringify({ folder, path: file }),
  );
  const env = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":91",
    INKSTONE_USER_DATA: profile,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: [root, file],
    env,
    chromiumSandbox: !sandboxBypass,
  });
  expect(app.process().spawnargs.includes("--no-sandbox")).toBe(sandboxBypass);
  page = await app.firstWindow();
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.waitForFunction(
    () =>
      window.__inkstone?.getDocument().path?.endsWith("Desk.md") &&
      !__inkstone.editor.view.state.readOnly,
  );
  await windowSize(1280, 900);
});
test.afterEach(async ({}, info) => {
  results.push({ name: info.title, status: info.status, pageErrors });
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    app = null;
  }
  expect(pageErrors).toEqual([]);
});
test.afterAll(async () => {
  await fs.writeFile(
    path.join(evidence, "results.json"),
    JSON.stringify(
      {
        version: JSON.parse(await fs.readFile("package.json", "utf8")).version,
        host: process.platform,
        normalSandbox: !sandboxBypass,
        sandboxBypass: sandboxBypass
          ? "Explicit INKSTONE_TEST_NO_SANDBOX=1: Linux host blocks unprivileged user namespaces and local chrome-sandbox is not root setuid; Chromium process sandbox bypassed for this test run."
          : null,
        desktopIPC: "real Electron",
        scope:
          "UI zoom is tested; this does not represent physical Windows DPI or an accessibility certification.",
        results,
        contrasts,
        geometry,
      },
      null,
      2,
    ) + "\n",
  );
});

test("all eleven original toolbar commands remain accessible; formatting and mode switching preserve source and undo", async () => {
  const commands = [
    "heading",
    "bold",
    "italic",
    "strike",
    "quote",
    "bullet",
    "task",
    "link",
    "insertImage",
    "table",
    "code",
  ];
  const actual = await page
    .locator(".format-tools [data-command]")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.command));
  expect(actual).toEqual(commands);
  for (const command of commands) {
    const button = page.locator(`.format-tools [data-command="${command}"]`);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-label", /.+/);
    await expect(button.locator("svg")).toHaveCount(1);
  }
  await selectWords();
  await page.locator('.format-tools [data-command="bold"]').click();
  expect(await source()).toBe(
    original.replace("steady text", "**steady text**"),
  );
  const selection = await page.evaluate(() => __inkstone.editor.getSelection());
  await page.locator("#mode-button").click();
  await page.locator("#mode-button").click();
  expect(await page.evaluate(() => __inkstone.editor.getSelection())).toEqual(
    selection,
  );
  await page.evaluate(() => __inkstone.editor.command("undo"));
  expect(await source()).toBe(original);
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(file, "utf8")).toBe(original);
});

test("Insert menu toggles, navigates with keys, restores focus on Escape, and applies a selected format in place", async () => {
  const selection = await selectWords(),
    trigger = page.locator("#insert-menu-button");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu", { name: "Insert", exact: true }),
    items = menu.getByRole("menuitem");
  expect(await items.count()).toBeGreaterThanOrEqual(19);
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => __inkstone.editor.getSelection())).toEqual(
    selection,
  );
  await trigger.click();
  await trigger.click();
  await expect(menu).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.keyboard.press("End");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await expect(
    menu.getByRole("menuitem", { name: "Highlight", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await source()).toBe(
    original.replace("steady text", "==steady text=="),
  );
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.keyboard.press("Control+z");
  expect(await source()).toBe(original);
  await page.keyboard.press("Control+Shift+z");
  expect(await source()).toContain("==steady text==");
});

test("sidebar tabs use arrow, Home and End navigation with one selected keyboard stop", async () => {
  const tabs = page.locator(".sidebar-tabs [role=tab]");
  await expect(tabs).toHaveCount(3);
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".outline-item")).toHaveCount(2);
  await page.keyboard.press("End");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(page.locator("#global-search input[name=query]")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(tabs.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(2)).toBeFocused();
  expect(
    await tabs.evaluateAll(
      (nodes) => nodes.filter((n) => n.tabIndex === 0).length,
    ),
  ).toBe(1);
  expect(
    await tabs.evaluateAll(
      (nodes) =>
        nodes.filter((n) => n.getAttribute("aria-selected") === "true").length,
    ),
  ).toBe(1);
  expect(await source()).toBe(original);
});

test("command palette advertises shortcuts, maintains combobox selection, executes the keyboard choice and honors customization", async () => {
  const selection = await selectWords();
  await page.keyboard.press("Control+Shift+p");
  const dialog = page.getByRole("dialog"),
    input = dialog.getByRole("combobox");
  await expect(dialog).toHaveCount(1);
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-controls", "palette-results");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await input.fill("saveAs");
  await expect(dialog.getByRole("option")).toContainText("Ctrl+Shift+S");
  await input.fill("toggle");
  await page.keyboard.press("ArrowDown");
  const selected = dialog.getByRole("option", { selected: true });
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("Toggle focus");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    await selected.getAttribute("id"),
  );
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("body")).toHaveClass(/focus-mode/);
  expect(await source()).toBe(original);
  expect(await page.evaluate(() => __inkstone.editor.getSelection())).toEqual(
    selection,
  );
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", {
      shortcuts: { commands: "Mod-Shift-k", saveAs: "Mod-Alt-s" },
    }),
  );
  await page.locator(".cm-content").focus();
  await page.keyboard.press("Control+Shift+k");
  await expect(dialog).toHaveCount(1);
  await input.fill("saveAs");
  await expect(dialog.getByRole("option")).toContainText("Ctrl+Alt+S");
  await input.fill("nothing-matches-this-command");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  expect(await input.getAttribute("aria-activedescendant")).toBeNull();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("800px and 150% UI zoom retain reachable commands, status and preference actions without outer document scrolling", async () => {
  for (const [width, height, zoom, sidebarWidth = 256] of [
    [800, 600, 1],
    [800, 800, 1],
    [1280, 900, 1.5],
    [800, 800, 1.5],
    [720, 500, 1, 500],
  ]) {
    const label = `${width}x${height}-zoom${Math.round(zoom * 100)}-sidebar${sidebarWidth}`;
    await page.evaluate(
      (sidebarWidth) => __inkstone.invoke("updateSettings", { sidebarWidth }),
      sidebarWidth,
    );
    await windowSize(width, height, zoom);
    await noOuterOverflow(label);
    for (const selector of [
      "#statistics",
      "#focus-button",
      "#typewriter-button",
      "#zoom-button",
    ]) {
      const button = page.locator(selector);
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      const viewport = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    for (const selector of [
      "#mode-button",
      '.view-tools [data-command="export"]',
      "#insert-menu-button",
    ]) {
      const control = page.locator(selector);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeVisible();
      const box = await control.boundingBox(),
        viewport = await page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
        }));
      expect(box.x, label + " " + selector).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, label + " " + selector).toBeLessThanOrEqual(
        viewport.width + 1,
      );
      expect(box.y + box.height, label + " " + selector).toBeLessThanOrEqual(
        viewport.height + 1,
      );
    }
    await page.locator("#insert-menu-button").click();
    await expect(page.getByRole("menu")).toBeVisible();
    const menuBox = await page.getByRole("menu").boundingBox(),
      triggerBox = await page.locator("#insert-menu-button").boundingBox();
    expect(menuBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
    await page.locator("#insert-menu-button").click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.locator("#insert-menu-button").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Escape");
    await page.evaluate(() => __inkstone.execute("settings"));
    await expect(page.locator("#settings-done")).toBeVisible();
    const bounds = await page.locator("#settings-done").boundingBox(),
      viewport = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    const settingTabs = page.locator(".settings-tabs [role=tab]");
    await settingTabs.first().focus();
    await page.keyboard.press("End");
    await expect(settingTabs.last()).toBeFocused();
    await capture(`preferences-${label}.png`);
    await page.locator("#settings-done").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await noOuterOverflow(label + "-after-settings");
  }
  expect(await source()).toBe(original);
});

test("light and dark chrome provide readable text contrast while preserving source and settings actions", async () => {
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => __inkstone.invoke("updateSettings", { theme }),
      theme,
    );
    await page.waitForFunction(
      (theme) => document.documentElement.dataset.theme === theme,
      theme,
    );
    for (const selector of [
      "#document-title",
      "#save-state",
      "#statistics",
      ".sidebar-tabs button.active",
      "#cursor-status",
      "#file-filter",
    ]) {
      const result = await colors(selector);
      contrasts.push({ theme, selector, ...result });
      expect(result.contrast, theme + " " + selector).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    await page.evaluate(() => __inkstone.execute("settings"));
    for (const selector of [
      "dialog h2",
      "#settings-result",
      "#settings-done",
      "dialog select[name=locale]",
    ]) {
      const result = await colors(selector);
      contrasts.push({ theme, selector, ...result });
      expect(result.contrast, theme + " " + selector).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    await capture(`contrast-${theme}.png`);
    await page.locator("#settings-done").click();
  }
  expect(await source()).toBe(original);
});
