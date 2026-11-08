import { artifactPath } from "../scripts/artifact-path.mjs";
/** Real Chromium UI behavior; desktop operations are explicitly stubbed. No platform-install claims. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
const output = artifactPath("ui-polish-validation");
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
await fs.mkdir(output, { recursive: true });
const executablePath = process.env.INKSTONE_CHROMIUM || undefined;
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
  deviceScaleFactor: 1.5,
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript((version) => {
  const listeners = {};
  window.inkstone = {
    async invoke(method, payload) {
      if (method === "bootstrap")
        return {
          version,
          settings: { locale: "en", theme: "light", autoSave: false },
          session: {},
          recovery: [],
          warnings: [],
          localeConfigured: true,
          firstRun: false,
        };
      if (method === "spellcheckStatus")
        return {
          available: true,
          enabled: true,
          languages: ["en-US"],
          source: "Bundled: en-US",
          externalDownloads: false,
        };
      if (method === "updateSettings") return payload;
      return null;
    },
    on(event, fn) {
      listeners[event] = fn;
      return () => delete listeners[event];
    },
  };
  window.polishSettings = (patch) => listeners["settings-changed"](patch);
}, version);
const check = async (name, fn) => {
  await fn();
  checks.push({ name, passed: true });
  console.log("PASS", name);
};
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.waitForFunction(() => window.__inkstone?.editor);
  await page.evaluate(async () => {
    window.ui = await import("/src/ui.js");
    window.tableUI = await import("/src/table-dialog.js");
    window.resourcesUI = await import("/src/resource-manager.js");
    window.exportUI = await import("/src/export.js");
    window.preferencesUI = await import("/src/preferences.js");
    window.defaults = preferencesUI.defaults;
    const button = document.createElement("button");
    button.id = "test-launcher";
    button.textContent = "Test launcher";
    button.style.cssText = "position:fixed;right:12px;bottom:44px;z-index:1";
    document.body.append(button);
    button.focus();
  });
  await check(
    "Dialog primary Enter, Escape/cancel, close icon, backdrop and restored focus",
    async () => {
      await page.evaluate(() => {
        window.answer = undefined;
        ui.ask("Save changes?", "Your draft has unsaved changes.", [
          { label: "Save", value: "save" },
          { label: "Cancel", value: "cancel" },
        ]).then((value) => (window.answer = value));
      });
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Save",
      );
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.answer === "save");
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "test-launcher",
      );
      for (const how of ["escape", "close", "backdrop"]) {
        await page.evaluate(() => {
          window.answer = "pending";
          ui.ask("Close draft", "Keep your work?", [
            { label: "Keep writing", value: true },
            { label: "Discard", value: false },
          ]).then((value) => (window.answer = value));
        });
        if (how === "escape") await page.keyboard.press("Escape");
        else if (how === "close") await page.locator("dialog .close").click();
        else await page.mouse.click(3, 3);
        await page.waitForFunction(() => window.answer === null);
      }
    },
  );
  await check(
    "Dialog padding is not backdrop; busy and IME cancellation protect the active operation",
    async () => {
      await page.evaluate(() => {
        window.dialog = ui.modal(
          "Working",
          "<p>Operation content</p><footer><button>Continue</button></footer>",
        );
      });
      const box = await page.locator("dialog").boundingBox();
      await page.mouse.click(box.x + 2, box.y + box.height / 2);
      assert.equal(await page.locator("dialog[open]").count(), 1);
      await page.evaluate(() => dialog.setBusy(true));
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("dialog[open]").count(), 1);
      assert.equal(await page.locator("dialog .close").isDisabled(), true);
      await page.evaluate(() => {
        dialog.setBusy(false);
        dialog.el.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true }),
        );
      });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("dialog[open]").count(), 1);
      await page.evaluate(() =>
        dialog.el.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true }),
        ),
      );
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    },
  );
  await check(
    "English and Chinese prompt labels, selected value, explicit Cancel and Enter submission",
    async () => {
      await page.evaluate(() => {
        document.documentElement.lang = "en";
        window.answer = "pending";
        ui.promptText("Rename", "Filename", "Old.md").then(
          (value) => (window.answer = value),
        );
      });
      assert.equal(
        await page.locator("dialog button[type=submit]").textContent(),
        "OK",
      );
      assert.equal(
        await page.locator("dialog [data-cancel]").textContent(),
        "Cancel",
      );
      await page.locator("dialog input").fill("New 中文.md");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.answer === "New 中文.md");
      await page.evaluate(() => {
        document.documentElement.lang = "zh-CN";
        window.answer = "pending";
        ui.promptText("重命名", "文件名", "原稿.md").then(
          (value) => (window.answer = value),
        );
      });
      assert.equal(
        await page.locator("dialog button[type=submit]").textContent(),
        "确定",
      );
      await page.locator("dialog [data-cancel]").click();
      await page.waitForFunction(() => window.answer === null);
      await page.evaluate(() => (document.documentElement.lang = "en"));
    },
  );
  await check(
    "Notifications are accessible, safely render literal text, and dismiss from keyboard",
    async () => {
      await page.evaluate(() =>
        ui.toast("<img src=x onerror=alert(1)> Saved", true),
      );
      assert.equal(await page.locator("#toast").getAttribute("role"), "alert");
      assert.equal(await page.locator("#toast img").count(), 0);
      await page.locator("#toast button").focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#toast").isVisible(), false);
    },
  );
  await check(
    "Table dialog keyboard edits remain local and English controls reflect available operations",
    async () => {
      await page.evaluate(() => {
        window.tableOriginal =
          "# Draft\r\n\r\n| Name | Value |\r\n| --- | --- |\r\n| Alpha | One |\r\n\r\nUntouched tail\r\n";
        const e = __inkstone.editor;
        e.setDocument(tableOriginal);
        e.setSelection({
          anchor: e.view.state.doc.toString().indexOf("Alpha"),
          head: e.view.state.doc.toString().indexOf("Alpha"),
        });
        tableUI.editTable(e);
      });
      assert.equal(await page.locator("dialog h2").textContent(), "Edit table");
      assert.equal(
        await page.locator("[data-op=rowDelete]").isDisabled(),
        true,
      );
      assert.equal(await page.locator("[data-op=rowUp]").isDisabled(), true);
      await page.screenshot({ path: path.join(output, "table-en.png") });
      await page.locator("[data-op=rowAdd]").click();
      const cell = page.locator('input[data-row="2"][data-col="0"]');
      await cell.fill("中文 new");
      await page.keyboard.press("Tab");
      await page.keyboard.insertText("Second");
      await page.evaluate(() => {
        window.tableCellBeforeTab = document.activeElement;
      });
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await page.evaluate(() => tableCellBeforeTab.isConnected),
        true,
        "Navigating existing cells retains the input DOM",
      );
      await page.locator('[data-op="right"]').click();
      assert.equal(
        await page.locator('[data-op="right"]').getAttribute("aria-pressed"),
        "true",
      );
      assert.match(
        await page.locator("#table-position").textContent(),
        /Row 3, column 1/,
      );
      await page.evaluate(() =>
        __inkstone.editor.setSettings({ readOnly: true }),
      );
      await page.keyboard.press("Control+Enter");
      assert.equal(await page.locator("dialog[open]").count(), 1);
      assert.equal(
        await page.evaluate(() => __inkstone.editor.getText()),
        await page.evaluate(() => tableOriginal),
      );
      assert.match(
        await page.locator("#toast").textContent(),
        /read-only or closing/,
      );
      await page.evaluate(() =>
        __inkstone.editor.setSettings({ readOnly: false }),
      );
      await page.keyboard.press("Control+Enter");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      const text = await page.evaluate(() => __inkstone.editor.getText());
      assert.ok(text.includes("中文 new"));
      assert.ok(text.startsWith("# Draft\r\n\r\n"));
      assert.ok(text.endsWith("\r\n\r\nUntouched tail\r\n"));
    },
  );
  await check(
    "Resource selection count, empty state, and cancel during preparation never commit",
    async () => {
      await page.evaluate(async () => {
        window.resourceCalls = [];
        window.resourceState = {
          path: "/notes/draft.md",
          text: "![A](a.png)",
          revision: "one",
          generation: 1,
        };
        window.resourceDialog = await resourcesUI.manageResources({
          snapshot: () => resourceState,
          commit: async () => {
            resourceCalls.push("commit");
            return {};
          },
          invoke: async (method, payload) => {
            resourceCalls.push(method);
            if (method === "listImageReferences")
              return {
                references: [
                  {
                    id: "a",
                    source: "a.png",
                    path: "/notes/a.png",
                    remote: false,
                    occurrences: [{}],
                  },
                  {
                    id: "b",
                    source: "https://example.invalid/b.png",
                    remote: true,
                    occurrences: [{}],
                  },
                ],
                warnings: [],
              };
            if (method === "prepareImageOperation")
              return await new Promise(
                (resolve) =>
                  (window.resolvePrepare = () => resolve({ id: "pending" })),
              );
            return true;
          },
        });
      });
      assert.equal(await page.locator("#resource-apply").isDisabled(), true);
      await page.locator("#resource-select-all").check();
      assert.equal(
        await page.locator("#resource-selection-count").textContent(),
        "2 of 2 selected",
      );
      await page.locator('[data-resource="1"]').uncheck();
      await page.screenshot({ path: path.join(output, "resources-en.png") });
      await page.locator("#resource-apply").click();
      await page.waitForFunction(() => window.resolvePrepare);
      await page.locator("dialog .close").click();
      await page.evaluate(() => resolvePrepare());
      await page.waitForFunction(() =>
        resourceCalls.includes("cancelImageOperation"),
      );
      assert.equal(
        await page.evaluate(() => resourceCalls.includes("commit")),
        false,
      );
      await page.evaluate(async () => {
        await resourcesUI.manageResources({
          snapshot: () => resourceState,
          commit: async () => {},
          invoke: async () => ({ references: [], warnings: [] }),
        });
      });
      assert.match(
        await page.locator(".empty-state").textContent(),
        /no image references/,
      );
      assert.equal(await page.locator("#resource-apply").isDisabled(), true);
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Export freezes editable options while working, then reports success and restores controls",
    async () => {
      await page.evaluate(() => {
        __inkstone.editor.setDocument("# Local export\n\nA paragraph.");
        window.exportInvoked = false;
        window.exportDialog = exportUI.showExport({
          editor: __inkstone.editor,
          current: { path: "/notes/local.md" },
          settings: { ...defaults, locale: "en" },
          updateSettings: async () => {},
          invoke: async (method, payload) => {
            if (method === "exportFile") {
              window.exportInvoked = true;
              window.exportPayload = payload;
              return await new Promise(
                (resolve) =>
                  (window.finishExport = () =>
                    resolve({ path: "/notes/local.pdf" })),
              );
            }
            return null;
          },
        });
      });
      const format = page.locator('#export-form select[name="format"]');
      assert.equal(
        await page.locator('#export-form input[name="width"]').isVisible(),
        false,
      );
      await format.selectOption("jpeg");
      assert.equal(
        await page.locator('#export-form input[name="quality"]').isVisible(),
        true,
      );
      assert.equal(
        await page.locator('#export-form select[name="pageSize"]').isVisible(),
        false,
      );
      await page.locator('#export-form input[name="width"]').fill("9999");
      await format.selectOption("docx");
      await page.locator('#export-form textarea[name="args"]').fill("not JSON");
      await format.selectOption("pdf");
      assert.equal(
        await page.locator('#export-form textarea[name="args"]').isVisible(),
        false,
      );
      await page.locator("#export-form button[type=submit]").click();
      await page.waitForFunction(() => window.exportInvoked);
      assert.equal(
        await page.locator("#export-form select[name=format]").isDisabled(),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("dialog[open]").count(), 1);
      await page.evaluate(() => finishExport());
      await page.waitForFunction(() =>
        document
          .querySelector(".export-status")
          .textContent.startsWith("Exported:"),
      );
      assert.equal(
        await page.locator("#export-form select[name=format]").isDisabled(),
        false,
      );
      const buttonBox = await page
        .locator("#export-form button[type=submit]")
        .boundingBox();
      const dialogBox = await page.locator("dialog").boundingBox();
      assert.ok(
        buttonBox.y + buttonBox.height <= dialogBox.y + dialogBox.height,
        "Export action is fully visible",
      );
      await page.screenshot({ path: path.join(output, "export-en.png") });
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog"));
    },
  );
  await check(
    "Preferences retain every field, support keyboard tabs and validate without accidental form navigation",
    async () => {
      await page.evaluate(() => {
        window.preferencePatches = [];
        preferencesUI.showPreferences(
          { ...defaults, locale: "en" },
          async (patch) => {
            preferencePatches.push(patch);
          },
          async (method) =>
            method === "spellcheckStatus"
              ? { available: true, languages: ["en-US"] }
              : null,
        );
      });
      const expected = [
        "locale",
        "autoPair",
        "autoPairMarkdown",
        "smartPunctuationInput",
        "spellcheck",
        "tabSize",
        "strictMarkdown",
        "cjkEmphasis",
        "smartPunctuation",
        "softBreaks",
        "exportSoftBreaks",
        "lineNumbers",
        "codeWrap",
        "defaultCodeLanguage",
        "mathNumbering",
        "sequenceTheme",
        "outlineNumbering",
        "focusMode",
        "typewriterMode",
        "theme",
        "fontFamily",
        "fontSize",
        "lineHeight",
        "contentWidth",
        "wheelZoom",
        "customCSS",
        "autoSave",
        "autoSaveDelay",
        "recordRecent",
        "fileSort",
        "sortDescending",
        "foldersFirst",
        "showHidden",
        "showAllFiles",
        "includeGlobs",
        "excludeGlobs",
        "imageFolder",
        "pandocPath",
        "snippets",
        "shortcuts",
      ];
      assert.deepEqual(
        await page
          .locator(".settings-form [name]")
          .evaluateAll((fields) => fields.map((field) => field.name).sort()),
        expected.sort(),
      );
      await page.locator('[data-section="writing"]').focus();
      await page.keyboard.press("ArrowDown");
      assert.equal(
        await page
          .locator('[data-section="appearance"]')
          .getAttribute("aria-selected"),
        "true",
      );
      await page.keyboard.press("End");
      assert.equal(
        await page
          .locator('[data-section="advanced"]')
          .getAttribute("aria-selected"),
        "true",
      );
      const shortcuts = page.locator('[name="shortcuts"]');
      await shortcuts.fill("invalid JSON");
      await page.locator('[name="snippets"]').focus();
      assert.equal(await shortcuts.getAttribute("aria-invalid"), "true");
      assert.equal(await page.evaluate(() => preferencePatches.length), 0);
      await shortcuts.fill('{"bold":"Mod-b"}');
      await page.locator('[name="snippets"]').focus();
      await page.waitForFunction(() => preferencePatches.length === 1);
      assert.equal(await shortcuts.getAttribute("aria-invalid"), null);
      await page.locator('[data-section="appearance"]').click();
      await page.locator('[name="fontSize"]').fill("18");
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("dialog[open]").count(), 1);
      assert.ok(await page.evaluate(() => !!window.__inkstone?.editor));
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog"));
    },
  );
  await check(
    "Preferences have readable fields and keep footer actions inside the dialog",
    async () => {
      await page.evaluate(() => {
        polishSettings({ locale: "en", theme: "light" });
        __inkstone.execute("settings");
      });
      await page.locator(".settings-tabs").waitFor();
      const title = await page.locator("dialog h2").textContent();
      assert.match(title, /Preferences/);
      const layout = await page.evaluate(() => {
        const grid = document
          .querySelector(".settings-grid")
          .getBoundingClientRect();
        const footer = document
          .querySelector(".settings-grid + footer")
          .getBoundingClientRect();
        return { gridBottom: grid.bottom, footerTop: footer.top };
      });
      assert.ok(
        layout.gridBottom <= layout.footerTop,
        "Settings content has its own scroll region above the footer",
      );
      await page.screenshot({ path: path.join(output, "preferences-en.png") });
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    },
  );
  await check(
    "Task dialogs keep content and actions reachable at 800px with 150% display density",
    async () => {
      await page.setViewportSize({ width: 800, height: 600 });
      assert.equal(await page.evaluate(() => devicePixelRatio), 1.5);
      for (const [locale, theme] of [
        ["en", "light"],
        ["zh-CN", "dark"],
      ]) {
        await page.evaluate(
          ({ locale, theme }) => {
            polishSettings({ locale, theme });
            preferencesUI.showPreferences(
              { ...defaults, locale, theme },
              async () => {},
              async (method) =>
                method === "spellcheckStatus"
                  ? { available: true, languages: ["en-US"] }
                  : null,
            );
          },
          { locale, theme },
        );
        for (const section of [
          "writing",
          "appearance",
          "files",
          "tools",
          "advanced",
        ]) {
          await page.locator(`[data-section="${section}"]`).click();
          const geometry = await page.evaluate(() => {
            const dialog = document.querySelector(".preferences-dialog");
            const form = dialog.querySelector(".settings-form");
            form.scrollTop = form.scrollHeight;
            const footer = dialog
              .querySelector("footer")
              .getBoundingClientRect();
            const button = dialog
              .querySelector("#settings-done")
              .getBoundingClientRect();
            return {
              footerTop: footer.top,
              footerBottom: footer.bottom,
              formBottom: form.getBoundingClientRect().bottom,
              buttonBottom: button.bottom,
              viewport: innerHeight,
              overflow: dialog.scrollWidth > dialog.clientWidth,
            };
          });
          assert.ok(
            geometry.formBottom <= geometry.footerTop,
            `${section} does not scroll beneath footer`,
          );
          assert.ok(
            geometry.buttonBottom <= geometry.viewport,
            `${section} Done stays reachable`,
          );
          assert.equal(
            geometry.overflow,
            false,
            `${section} has no horizontal dialog overflow`,
          );
        }
        await page.locator('[data-section="appearance"]').click();
        await page.screenshot({
          path: path.join(
            output,
            `preferences-${locale}-${theme}-800-dpi150.png`,
          ),
        });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector("dialog"));
      }
      await page.evaluate(() => {
        polishSettings({ locale: "en", theme: "light" });
        exportUI.showExport({
          editor: __inkstone.editor,
          current: { path: "/notes/local.md" },
          settings: { ...defaults, locale: "en" },
          invoke: async () => null,
          updateSettings: async () => {},
        });
      });
      for (const format of ["pdf", "jpeg", "docx"]) {
        await page.locator('#export-form [name="format"]').selectOption(format);
        await page.locator("#export-form button[type=submit]").focus();
        const footer = await page.locator(".export-footer").boundingBox();
        assert.ok(
          footer.y >= 0 && footer.y + footer.height <= 600,
          `${format} export actions fit a short window`,
        );
      }
      await page.locator('#export-form [name="numberSections"]').check();
      await page.locator('#export-form [name="toc"]').check();
      assert.equal(
        await page.locator('#export-form [name="numberSections"]').isChecked(),
        true,
      );
      assert.equal(
        await page.locator('#export-form [name="toc"]').isChecked(),
        true,
      );
      await page.screenshot({
        path: path.join(output, "export-docx-800-dpi150.png"),
      });
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog"));
      await page.setViewportSize({ width: 800, height: 333 });
      await page.evaluate(() =>
        preferencesUI.showPreferences(
          { ...defaults, locale: "en" },
          async () => {},
          async (method) =>
            method === "spellcheckStatus"
              ? { available: true, languages: ["en-US"] }
              : null,
        ),
      );
      await page.locator('[data-section="writing"]').focus();
      for (const section of [
        "writing",
        "appearance",
        "files",
        "tools",
        "advanced",
      ]) {
        if (section !== "writing") await page.keyboard.press("ArrowDown");
        const visible = await page
          .locator(`[data-section="${section}"]`)
          .evaluate((tab) => {
            const box = tab.getBoundingClientRect(),
              nav = tab.parentElement.getBoundingClientRect();
            const done = document
              .querySelector("#settings-done")
              .getBoundingClientRect();
            return {
              focused: document.activeElement === tab,
              selected: tab.getAttribute("aria-selected"),
              inside: box.top >= nav.top && box.bottom <= nav.bottom,
              doneVisible: done.bottom <= innerHeight,
            };
          });
        assert.equal(
          visible.focused,
          true,
          `${section} receives keyboard focus in a short window`,
        );
        assert.equal(visible.selected, "true");
        assert.equal(
          visible.inside,
          true,
          `${section} scrolls fully into the settings navigation`,
        );
        assert.equal(
          visible.doneVisible,
          true,
          "Done remains visible in a short window",
        );
      }
      await page.screenshot({
        path: path.join(output, "preferences-short-800x333-dpi150.png"),
      });
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog"));
      await page.setViewportSize({ width: 1380, height: 940 });
    },
  );
  await check(
    "Short windows keep table cells and resources editable with reachable footer actions",
    async () => {
      await page.setViewportSize({ width: 800, height: 333 });
      await page.evaluate(() => {
        polishSettings({ locale: "en", theme: "light" });
        window.shortTableOriginal =
          "# Short window\r\n\r\n| Item | Value |\r\n| --- | --- |\r\n| Alpha | One |\r\n\r\nUntouched ending\r\n";
        const editor = __inkstone.editor;
        editor.setDocument(shortTableOriginal);
        const position = editor.view.state.doc.toString().indexOf("Alpha");
        editor.setSelection({ anchor: position, head: position });
        tableUI.editTable(editor);
      });
      const grid = await page.locator(".table-grid").boundingBox();
      assert.ok(
        grid.height >= 100,
        "Short-window table keeps a usable editing region",
      );
      const cell = page.locator('input[data-row="1"][data-col="0"]');
      await cell.click();
      await cell.fill("Edited 中文");
      await page.screenshot({
        path: path.join(output, "table-edit-short-800x333-dpi150.png"),
      });
      await page.locator("#table-apply").scrollIntoViewIfNeeded();
      const apply = await page.locator("#table-apply").boundingBox();
      assert.ok(
        apply.y >= 0 && apply.y + apply.height <= 333,
        "Apply can be scrolled into view",
      );
      await page.locator("#table-apply").click();
      await page.waitForFunction(() => !document.querySelector("dialog"));
      assert.match(
        await page.evaluate(() => __inkstone.editor.getText()),
        /Edited 中文/,
      );
      await page.keyboard.press("Control+z");
      assert.equal(
        await page.evaluate(() => __inkstone.editor.getText()),
        await page.evaluate(() => shortTableOriginal),
        "Undo restores original table and surrounding CRLF content",
      );
      await page.evaluate(async () => {
        window.shortResourceCommitted = false;
        await resourcesUI.manageResources({
          snapshot: () => ({
            path: "/notes/short.md",
            text: "![A](a.png)",
            revision: "one",
            generation: 1,
          }),
          commit: async () => {
            shortResourceCommitted = true;
          },
          invoke: async () => ({
            references: Array.from({ length: 12 }, (_, i) => ({
              id: String(i),
              source: `assets/image-${i}.png`,
              path: `/notes/assets/image-${i}.png`,
              remote: false,
              occurrences: [{}],
            })),
            warnings: [],
          }),
        });
      });
      const list = await page.locator(".resource-list").boundingBox();
      assert.ok(
        list.height >= 100,
        "Short-window resource list does not collapse",
      );
      await page.locator('[data-resource="11"]').check();
      assert.equal(
        await page.locator('[data-resource="11"]').isChecked(),
        true,
      );
      await page.locator("#resource-apply").scrollIntoViewIfNeeded();
      assert.equal(await page.locator("#resource-apply").isEnabled(), true);
      const resourceApply = await page.locator("#resource-apply").boundingBox();
      assert.ok(
        resourceApply.y >= 0 && resourceApply.y + resourceApply.height <= 333,
      );
      await page.screenshot({
        path: path.join(output, "resources-short-800x333-dpi150.png"),
      });
      await page.locator("#resource-cancel").click();
      await page.waitForFunction(() => !document.querySelector("dialog"));
      assert.equal(await page.evaluate(() => shortResourceCommitted), false);
      await page.setViewportSize({ width: 1380, height: 940 });
    },
  );
  await check(
    "English/Chinese light/dark chrome preserves original brand and stays usable at narrow widths",
    async () => {
      for (const locale of ["en", "zh-CN"])
        for (const theme of ["light", "dark"]) {
          await page.evaluate(
            ({ locale, theme }) => polishSettings({ locale, theme }),
            { locale, theme },
          );
          await page.waitForFunction(() =>
            [...document.querySelectorAll(".brand img")].every(
              (img) => img.complete && img.naturalWidth > 0,
            ),
          );
          await page.screenshot({
            path: path.join(output, `${locale}-${theme}.png`),
          });
          assert.equal(
            await page
              .locator(".brand img")
              .evaluateAll(
                (images) =>
                  images.filter(
                    (img) => getComputedStyle(img).display !== "none",
                  ).length,
              ),
            1,
          );
        }
      await page.setViewportSize({ width: 800, height: 680 });
      await page.evaluate(() =>
        polishSettings({ locale: "en", theme: "light", sidebarWidth: 220 }),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const tools = page.locator(".format-tools button");
      assert.ok((await tools.count()) > 0);
      assert.equal(
        await tools.evaluateAll((buttons) =>
          buttons.every(
            (button) => getComputedStyle(button).display !== "none",
          ),
        ),
        true,
      );
      await tools.last().focus();
      assert.equal(
        await tools
          .last()
          .evaluate((button) => document.activeElement === button),
        true,
      );
      await page.screenshot({ path: path.join(output, "narrow-800.png") });
    },
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        version,
        platform: process.platform,
        browser: await browser.version(),
        desktopIPC: "stubbed; not file/OS integration validation",
        passed: checks.length,
        checks,
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ passed: checks.length, pageErrors: errors }));
} catch (error) {
  await page
    .screenshot({ path: path.join(output, "failure.png") })
    .catch(() => {});
  await fs.writeFile(
    path.join(output, "failure.json"),
    JSON.stringify({ checks, pageErrors: errors, error: error.stack }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
