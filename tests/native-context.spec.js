import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let app, page, temp;
const executablePath = process.env.INKSTONE_EXECUTABLE
  ? path.resolve(process.env.INKSTONE_EXECUTABLE)
  : undefined;
test.beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-native-context-"));
  const profile = path.join(temp, "profile");
  await fs.mkdir(profile);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale: "en",
      firstRunComplete: true,
      autoSave: false,
    }),
  );
  const file = path.join(temp, "Context.md");
  await fs.writeFile(file, "# Native context\n\nEditor text.\n");
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath,
    args: executablePath ? [file] : [process.cwd(), file],
    env,
    chromiumSandbox: true,
  });
  page = await app.firstWindow();
  await page.waitForFunction(
    () => window.__inkstone?.editor && !__inkstone.editor.view.state.readOnly,
  );
});
test.afterEach(async () => {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    app = null;
  }
  if (temp) await fs.rm(temp, { recursive: true, force: true });
});

test("custom editor context menu does not open a second native menu and outside inputs retain native editing", async () => {
  await app.evaluate(({ Menu }) => {
    global.__nativeContexts = [];
    Menu.prototype.popup = function () {
      global.__nativeContexts.push(this.items.map((item) => item.label));
    };
  });
  await page.evaluate(() => __inkstone.editor.setMode("source"));
  await page
    .locator(".cm-line")
    .filter({ hasText: "Editor text." })
    .click({ button: "right" });
  await expect(
    page.locator('.editor-context-menu[data-context-depth="0"]'),
  ).toBeVisible();
  expect(await app.evaluate(() => global.__nativeContexts.length)).toBe(0);
  await page.locator("#file-filter").click({ button: "right" });
  await expect(page.locator(".editor-context-menu")).toHaveCount(0);
  await expect
    .poll(() => app.evaluate(() => global.__nativeContexts.length))
    .toBe(1);
  const labels = await app.evaluate(() => global.__nativeContexts[0]);
  expect(labels).toContain("Copy");
  expect(labels).toContain("Paste");
  expect(labels).toContain("Select all");
});

test("source-mode context hit testing reparses edited offsets and excludes fenced table examples", async () => {
  const result = await page.evaluate(() => {
    const editor = __inkstone.editor;
    editor.setDocument(
      "```md\n| A | B |\n| --- | --- |\n| example | sample |\n```\n\n| Real | Table |\n| --- | --- |\n| one | two |\n",
    );
    editor.setMode("source");
    editor.view.dispatch({ changes: { from: 0, insert: "Prefix\n\n" } });
    const source = editor.view.state.doc.toString();
    const at = (needle) => {
      const position = source.indexOf(needle);
      const rect = editor.view.coordsAtPos(position);
      return editor.prepareContextMenu({
        x: rect.left + 1,
        y: (rect.top + rect.bottom) / 2,
        target: document.elementFromPoint(
          rect.left + 1,
          (rect.top + rect.bottom) / 2,
        ),
        preserveSelection: false,
      });
    };
    return {
      example: at("example"),
      real: at("two"),
      expectedFrom: source.indexOf("| Real"),
    };
  });
  expect(result.example.table).toBeNull();
  expect(result.example.block.type).toBe("fence");
  expect(result.real.table.from).toBe(result.expectedFrom);
  expect(result.real.table.row).toBe(2);
  expect(result.real.table.col).toBe(1);
});

for (const zoom of [0.75, 1.5, 2]) {
  test(`native context dispatch uses CSS coordinates at ${zoom * 100} percent zoom before the DOM menu opens`, async () => {
    const window = await app.browserWindow(page);
    await window.evaluate(
      (window, zoom) => window.webContents.setZoomFactor(zoom),
      zoom,
    );
    await app.evaluate(({ BrowserWindow, Menu }) => {
      global.__zoomContext = { native: 0, custom: 0 };
      Menu.prototype.popup = function () {
        global.__zoomContext.native++;
      };
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      const send = contents.send.bind(contents);
      contents.send = (channel, ...args) => {
        if (channel === "inkstone:context-menu-details") {
          global.__zoomContext.custom++;
          global.__zoomContext.details = args[0];
        }
        return send(channel, ...args);
      };
    });
    await page.evaluate(() => {
      __inkstone.editor.setMode("source");
      // Exercise native hit testing even when the renderer menu opens first.
      const query = document.querySelector.bind(document);
      document.querySelector = (selector) =>
        selector ===
        '[data-inkstone-context-menu="true"][role="menu"]:not([hidden])'
          ? null
          : query(selector);
      document.addEventListener(
        "contextmenu",
        (event) => {
          window.__testContextPoint = { x: event.clientX, y: event.clientY };
        },
        true,
      );
    });
    await page
      .locator(".cm-line")
      .filter({ hasText: "Editor text." })
      .click({ button: "right" });
    await expect(
      page.locator('.editor-context-menu[data-context-depth="0"]'),
    ).toBeVisible();
    await expect
      .poll(() =>
        app.evaluate(
          () => global.__zoomContext.custom + global.__zoomContext.native,
        ),
      )
      .toBe(1);
    const dispatched = await app.evaluate(() => global.__zoomContext);
    expect(dispatched).toMatchObject({
      native: 0,
      custom: 1,
    });
    const point = await page.evaluate(() => window.__testContextPoint);
    expect(Math.abs(dispatched.details.x - point.x)).toBeLessThan(2);
    expect(Math.abs(dispatched.details.y - point.y)).toBeLessThan(2);
  });
}

test("native dictionary additions reject empty, multiword and oversized input", async () => {
  for (const word of ["", "two words", "word\nnext", "x".repeat(257)])
    await expect(
      page.evaluate(
        (word) => __inkstone.invoke("addDictionaryWord", { word }),
        word,
      ),
    ).rejects.toThrow(/SPELLCHECK/);
});
