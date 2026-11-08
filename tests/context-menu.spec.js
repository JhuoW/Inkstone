import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { artifactPath } from "../scripts/artifact-path.mjs";

let app,
  page,
  directory,
  file,
  clipboardCaptured = false;
const original =
  "# Context menu\r\n\r\nAlpha selected words and untouched text.\r\n\r\n| First | Second |\r\n| --- | --- |\r\n| alpha middle omega | cell two |\r\n| next row | last cell |\r\n\r\nTail paragraph.\r\n";
const rootMenu = () =>
  page.locator('.editor-context-menu[data-context-depth="0"]');
const submenu = () =>
  page.locator('.editor-context-menu[data-context-depth="1"]');
const text = () => page.evaluate(() => __inkstone.editor.getText());

test.beforeEach(async () => {
  clipboardCaptured = false;
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkstone-context-menu-"),
  );
  const profile = path.join(directory, "profile");
  await fs.mkdir(profile);
  file = path.join(directory, "Context 文稿.md");
  await fs.writeFile(file, original);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale: "en",
      firstRunComplete: true,
      autoSave: false,
      spellcheck: false,
    }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: [process.cwd(), file],
    env,
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
  });
  page = await app.firstWindow();
  await page.waitForFunction(
    () =>
      window.__inkstone?.getDocument().path?.endsWith("Context 文稿.md") &&
      !__inkstone.editor.view.state.readOnly,
  );
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    const items = await clipboard.read();
    global.__contextOriginalClipboard = await Promise.all(
      items.map(
        async (item) =>
          new ClipboardItem(
            Object.fromEntries(
              await Promise.all(
                item.types.map(async (type) => [
                  type,
                  await item.getType(type),
                ]),
              ),
            ),
          ),
      ),
    );
  });
  clipboardCaptured = true;
});
test.afterEach(async () => {
  try {
    if (app && clipboardCaptured)
      await app.evaluate(async ({ clipboard }) => {
        await clipboard.write(global.__contextOriginalClipboard);
        delete global.__contextOriginalClipboard;
      });
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    app = null;
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
});
async function selectSource(value, source = true) {
  return page.evaluate(
    ({ value, source }) => {
      const editor = __inkstone.editor;
      editor.setMode(source ? "source" : "live");
      const start = editor.view.state.doc.toString().indexOf(value);
      editor.setSelection({ anchor: start, head: start + value.length });
      editor.focus();
      const rectangle = editor.view.coordsAtPos(
        start + Math.min(2, value.length),
      );
      return {
        x: rectangle.left + 1,
        y: (rectangle.top + rectangle.bottom) / 2,
      };
    },
    { value, source },
  );
}
async function openSelected(value, source = true) {
  const point = await selectSource(value, source);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(rootMenu()).toBeVisible();
}
async function loadClipboardDocument(value, source = false) {
  await page.evaluate(
    ({ value, source }) => {
      __inkstone.loadDocument({ ...__inkstone.getDocument(), text: value });
      __inkstone.editor.setMode(source ? "source" : "live");
      __inkstone.editor.focus();
    },
    { value, source },
  );
}
async function openWholeDocument(source = false) {
  const point = await page.evaluate((source) => {
    const editor = __inkstone.editor;
    editor.setMode(source ? "source" : "live");
    editor.setSelection({ anchor: 0, head: editor.view.state.doc.length });
    editor.focus();
    const rectangle = editor.view.coordsAtPos(2);
    return { x: rectangle.left + 1, y: (rectangle.top + rectangle.bottom) / 2 };
  }, source);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(rootMenu()).toBeVisible();
}
const clipboardSource =
  "Text <!-- preserve this --> tail.\r\n\r\nReference [site][ref].\r\n\r\n[ref]: https://example.com\r\n\r\nFootnote[^n].\r\n\r\n[^n]: footnote content\r\n\r\n| A | B |\r\n| --- | --- |\r\n| x\\|y | z |";
const clipboardTarget = "Before\r\n\r\nTARGET\r\n\r\nAfter";
const canonical = (value) => value.replace(/\r\n|\r/g, "\n");

test("context Copy and Cut preserve source Markdown through default live and source Paste", async () => {
  for (const source of [false, true]) {
    for (const action of ["Copy", "Cut"]) {
      await loadClipboardDocument(clipboardSource, source);
      await openWholeDocument(source);
      await rootMenu()
        .getByRole("menuitem", { name: action, exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => __inkstone.invoke("readClipboard")))
              .markdown,
        )
        .toBe(canonical(clipboardSource));
      await expect.poll(text).toBe(action === "Cut" ? "" : clipboardSource);
      await loadClipboardDocument(clipboardTarget, source);
      await openSelected("TARGET", source);
      await rootMenu()
        .getByRole("menuitem", { name: "Paste", exact: true })
        .click();
      await expect
        .poll(text)
        .toBe(clipboardTarget.replace("TARGET", clipboardSource));
      await page.keyboard.press("Control+z");
      await expect.poll(text).toBe(clipboardTarget);
    }
  }
});

test("keyboard and context copying share native Markdown fidelity in both editor modes", async () => {
  for (const source of [false, true]) {
    for (const keyboardCopy of [false, true]) {
      await loadClipboardDocument(clipboardSource, source);
      if (keyboardCopy) {
        await page.evaluate(() => {
          const editor = __inkstone.editor;
          editor.setSelection({
            anchor: 0,
            head: editor.view.state.doc.length,
          });
          editor.focus();
        });
        await page.keyboard.press("Control+c");
      } else {
        await openWholeDocument(source);
        await rootMenu()
          .getByRole("menuitem", { name: "Copy", exact: true })
          .click();
      }
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => __inkstone.invoke("readClipboard")))
              .markdown,
        )
        .toBe(canonical(clipboardSource));
      await loadClipboardDocument(clipboardTarget, source);
      if (keyboardCopy) {
        await openSelected("TARGET", source);
        await rootMenu()
          .getByRole("menuitem", { name: "Paste", exact: true })
          .click();
      } else {
        await selectSource("TARGET", source);
        await page.keyboard.press("Control+v");
      }
      await expect
        .poll(text)
        .toBe(clipboardTarget.replace("TARGET", clipboardSource));
      await page.keyboard.press("Control+z");
      await expect.poll(text).toBe(clipboardTarget);
    }
  }
  await page.evaluate(() =>
    __inkstone.invoke("writeClipboard", { text: "old unrelated clipboard" }),
  );
  await app.evaluate(({ clipboard }) => {
    global.__clipboardWriteBeforeDelay = clipboard.write.bind(clipboard);
    clipboard.write = async (items) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return global.__clipboardWriteBeforeDelay(items);
    };
  });
  const quick = "Copy <!-- keep --> me";
  await loadClipboardDocument(quick);
  await page.evaluate(() => {
    const editor = __inkstone.editor;
    editor.setSelection({ anchor: 0, head: editor.view.state.doc.length });
    editor.focus();
  });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+v");
  await expect.poll(text).toBe(quick + quick);
  await app.evaluate(({ clipboard }) => {
    clipboard.write = global.__clipboardWriteBeforeDelay;
    delete global.__clipboardWriteBeforeDelay;
  });
  await page.evaluate(() =>
    __inkstone.invoke("writeClipboard", {
      text: "pasted",
      html: "<strong>pasted</strong>",
      markdown: "pasted",
    }),
  );
  await loadClipboardDocument("Typed ");
  await page.evaluate(() =>
    __inkstone.editor.setSelection({
      anchor: __inkstone.editor.view.state.doc.length,
    }),
  );
  await page.keyboard.type("prefix");
  await page.keyboard.press("Control+v");
  await expect.poll(text).toBe("Typed prefixpasted");
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe("Typed prefix");
});

test("Copy table and default live Paste retain escaped pipes and neighboring cells", async () => {
  const table = "| A | B |\r\n| --- | --- |\r\n| x\\|y | z |";
  await loadClipboardDocument("Start\r\n\r\n" + table + "\r\n\r\nEnd");
  await openTableCell(1, 0);
  await expand("table");
  await submenu()
    .getByRole("menuitem", { name: "Copy table", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => __inkstone.invoke("readClipboard")))
          .markdown,
    )
    .toBe(canonical(table));
  await loadClipboardDocument(clipboardTarget);
  await openSelected("TARGET", false);
  await rootMenu()
    .getByRole("menuitem", { name: "Paste", exact: true })
    .click();
  await expect.poll(text).toBe(clipboardTarget.replace("TARGET", table));
  await expect(page.locator(".cm-live-block th")).toHaveCount(2);
  await expect(page.locator(".cm-live-block td").first()).toHaveText("x|y");
});

test("external native HTML table pipes remain inside their original cells", async () => {
  await page.evaluate(() =>
    __inkstone.invoke("writeClipboard", {
      text: "external table",
      html: "<table><thead><tr><th>A|B</th><th>Other</th></tr></thead><tbody><tr><td>raw\\|pipe <code>x|y</code></td><td>neighbor</td></tr></tbody></table>",
    }),
  );
  expect(
    (await page.evaluate(() => __inkstone.invoke("readClipboard"))).markdown,
  ).toBeNull();
  await loadClipboardDocument(clipboardTarget);
  await openSelected("TARGET", false);
  await rootMenu()
    .getByRole("menuitem", { name: "Paste", exact: true })
    .click();
  await expect(page.locator(".cm-live-block th")).toHaveCount(2);
  await expect(page.locator(".cm-live-block th").first()).toHaveText("A|B");
  await expect(page.locator(".cm-live-block td").first()).toHaveText(
    "raw\\|pipe x|y",
  );
  await expect(page.locator(".cm-live-block td").nth(1)).toHaveText("neighbor");
});

test("live table native Paste handles literal multiline text, Excel TSV HTML and source-mode raw text", async () => {
  const table =
    "Start\r\n\r\n| A | B |\r\n| --- | --- |\r\n| alpha middle omega | keep |\r\n\r\nEnd";
  await loadClipboardDocument(table);
  await page.locator(".cm-live-block td").first().click();
  const input = page.locator(".inkstone-table-cell-editor");
  await input.evaluate((input) => {
    input.setSelectionRange(6, 12);
    input.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.keyboard.press("Control+c");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => __inkstone.invoke("readClipboard"))).text,
    )
    .toBe("middle");
  await page.evaluate(() =>
    __inkstone.invoke("writeClipboard", { text: "x|y\nZ" }),
  );
  await input.click({ button: "right", position: { x: 65, y: 12 } });
  await expect(rootMenu()).toBeVisible();
  await rootMenu()
    .getByRole("menuitem", { name: "Paste", exact: true })
    .click();
  await expect.poll(text).toBe(table.replace("middle", "x\\|y<br>Z"));
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(table);
  await page.evaluate(() =>
    __inkstone.invoke("writeClipboard", {
      text: "one\ttwo\r\nthree\tfour",
      html: "<table><tr><th>one</th><th>two</th></tr><tr><td>three</td><td>four</td></tr></table>",
    }),
  );
  await openTableCell(1, 0);
  await rootMenu()
    .getByRole("menuitem", { name: "Paste", exact: true })
    .click();
  await expect
    .poll(text)
    .toBe(
      table.replace(
        "| alpha middle omega | keep |",
        "| one | two |\r\n| three | four |",
      ),
    );
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(table);
  await page.evaluate(() =>
    __inkstone.invoke("writeClipboard", { text: "x|y\nZ" }),
  );
  await openSelected("middle", true);
  await rootMenu()
    .getByRole("menuitem", { name: "Paste", exact: true })
    .click();
  await expect.poll(text).toBe(table.replace("middle", "x|y\r\nZ"));
});

test("context and native textarea edits repair escaping across a retained pipe boundary", async () => {
  const table =
    "Start\r\n\r\n| A | B |\r\n| --- | --- |\r\n| a\\|b | keep |\r\n\r\nEnd";
  for (const useContext of [false, true]) {
    await loadClipboardDocument(table);
    await page.locator(".cm-live-block td").first().click();
    const input = page.locator(".inkstone-table-cell-editor");
    await input.evaluate((input) => {
      input.setSelectionRange(0, 1);
      input.dispatchEvent(new Event("select", { bubbles: true }));
    });
    if (useContext) {
      await page.evaluate(() =>
        __inkstone.invoke("writeClipboard", { text: "\\" }),
      );
      await input.click({ button: "right", position: { x: 7, y: 12 } });
      await expect(rootMenu()).toBeVisible();
      await rootMenu()
        .getByRole("menuitem", { name: "Paste", exact: true })
        .click();
    } else await page.keyboard.type("\\");
    await expect.poll(text).toBe(table.replace("a\\|b", "\\".repeat(3) + "|b"));
    await expect(page.locator(".cm-live-block th")).toHaveCount(2);
    await page.keyboard.press("Control+z");
    await expect.poll(text).toBe(table);
  }
});

test("native Markdown clipboard representation rejects invalid sizes and mismatched source", async () => {
  for (const payload of [
    { text: "plain", markdown: 3 },
    { text: "plain", markdown: "hidden different content" },
  ])
    await expect(
      page.evaluate(
        (payload) => __inkstone.invoke("writeClipboard", payload),
        payload,
      ),
    ).rejects.toThrow(/CLIPBOARD/);
  await expect(
    page.evaluate(() => {
      const text = "中".repeat(4 * 1024 * 1024);
      return __inkstone.invoke("writeClipboard", { text, markdown: text });
    }),
  ).rejects.toThrow(/CLIPBOARD/);
  await app.evaluate(async ({ clipboard, ClipboardItem }) =>
    clipboard.write([
      new ClipboardItem({
        "text/plain": "visible",
        "text/html": "<b>visible</b>",
        "text/x-inkstone-markdown": "hidden",
      }),
    ]),
  );
  const result = await page.evaluate(() => __inkstone.invoke("readClipboard"));
  expect(result.text).toBe("visible");
  expect(result.markdown).toBeNull();
});

test("live cell Cut and Delete repair retained pipe escaping while source mode stays raw", async () => {
  const originalCell = "a" + "\\".repeat(3) + "|b";
  const table = `Start\r\n\r\n| A | B |\r\n| --- | --- |\r\n| ${originalCell} | keep |\r\n\r\nEnd`;
  for (const action of ["Cut", "Delete"]) {
    await loadClipboardDocument(table);
    await page.locator(".cm-live-block td").first().click();
    const input = page.locator(".inkstone-table-cell-editor");
    await input.evaluate((input) => {
      input.setSelectionRange(0, 2);
      input.dispatchEvent(new Event("select", { bubbles: true }));
    });
    await input.click({ button: "right", position: { x: 7, y: 12 } });
    await expect(rootMenu()).toBeVisible();
    await rootMenu()
      .getByRole("menuitem", { name: action, exact: true })
      .click();
    await expect
      .poll(text)
      .toBe(table.replace(originalCell, "\\".repeat(3) + "|b"));
    await expect(page.locator(".cm-live-block th")).toHaveCount(2);
    if (action === "Cut")
      expect(
        (await page.evaluate(() => __inkstone.invoke("readClipboard")))
          .markdown,
      ).toBe("a\\");
    await page.keyboard.press("Control+z");
    await expect.poll(text).toBe(table);
  }
  await openSelected("a\\", true);
  await rootMenu()
    .getByRole("menuitem", { name: "Delete", exact: true })
    .click();
  await expect
    .poll(text)
    .toBe(table.replace(originalCell, "\\".repeat(2) + "|b"));
});
async function openTableCell(row = 1, column = 1) {
  await page.evaluate(() => {
    const editor = __inkstone.editor;
    editor.setMode("live");
    editor.setSelection({ anchor: editor.view.state.doc.length });
    editor.focus();
  });
  const cell = page
    .locator('.cm-live-block[data-block-type="table_open"] tr')
    .nth(row)
    .locator("th,td")
    .nth(column);
  await cell.click({ button: "right" });
  await expect(rootMenu()).toBeVisible();
}
async function expand(id) {
  await rootMenu().locator(`[data-context-submenu="${id}"]`).hover();
  await expect(submenu()).toBeVisible();
}
async function undo() {
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(original);
}
async function capture(name) {
  const output = artifactPath("context-menu");
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, name + ".png") });
}

test("selected text gets the compact document menu and formatting preserves selection and one-step undo", async () => {
  await openSelected("selected words");
  await expect(
    rootMenu()
      .getByRole("group", { name: "Edit", exact: true })
      .getByRole("menuitem"),
  ).toHaveCount(4);
  await expect(
    rootMenu()
      .getByRole("group", { name: "Formatting", exact: true })
      .getByRole("menuitem"),
  ).toHaveCount(8);
  expect(
    await rootMenu()
      .getByRole("group", { name: "Formatting", exact: true })
      .getByRole("menuitem")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label")),
      ),
  ).toEqual([
    "Bold",
    "Italic",
    "Inline code",
    "Link",
    "Block quote",
    "Bullet list",
    "Numbered list",
    "Task list",
  ]);
  await expect(
    rootMenu().locator('[data-context-submenu="paragraph"]'),
  ).toBeVisible();
  await rootMenu().getByRole("menuitem", { name: "Bold", exact: true }).click();
  await expect(rootMenu()).toHaveCount(0);
  expect(await text()).toBe(
    original.replace("selected words", "**selected words**"),
  );
  await undo();
  await page.keyboard.press("Control+Shift+z");
  expect(await text()).toContain("**selected words**");
});

test("blank insertion moves the caret to the right-clicked line and exposes every document insertion", async () => {
  await selectSource("Tail paragraph.");
  const point = await page.evaluate(() => {
    const editor = __inkstone.editor;
    const at =
      editor.view.state.doc.toString().indexOf("Tail paragraph.") +
      "Tail paragraph.".length;
    const rectangle = editor.view.coordsAtPos(at);
    return {
      x: rectangle.left + 15,
      y: (rectangle.top + rectangle.bottom) / 2,
    };
  });
  await page.evaluate(() => __inkstone.editor.setSelection({ anchor: 0 }));
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(rootMenu()).toBeVisible();
  await capture("english-blank-root");
  const caret = await page.evaluate(
    () => __inkstone.editor.view.state.selection.main.head,
  );
  expect(caret).toBeGreaterThan(
    original.replaceAll("\r\n", "\n").indexOf("Tail"),
  );
  await expand("insert");
  await capture("english-document-insert");
  for (const label of [
    "Image…",
    "Footnote…",
    "Link reference",
    "Horizontal line",
    "Table…",
    "Code fences",
    "Inline math",
    "Math block",
    "Table of contents",
    "YAML front matter",
    "Paragraph before",
    "Paragraph after",
  ])
    await expect(
      submenu().getByRole("menuitem", { name: label, exact: true }),
    ).toBeVisible();
  await submenu()
    .getByRole("menuitem", { name: "Horizontal line", exact: true })
    .click();
  expect(await text()).toContain("\r\n\r\n---\r\n\r\n");
  expect(await text()).toContain("Tail");
  await undo();
});

test("table context has structural actions and only image and outside paragraphs in Insert", async () => {
  await openTableCell(1, 1);
  await expect(
    rootMenu().locator('[data-context-submenu="table"]'),
  ).toBeVisible();
  await expect(
    rootMenu().locator('[data-context-submenu="paragraph"]'),
  ).toHaveCount(0);
  for (const label of [
    "Block quote",
    "Bullet list",
    "Numbered list",
    "Task list",
  ])
    await expect(
      rootMenu().getByRole("menuitem", { name: label, exact: true }),
    ).toBeDisabled();
  for (const label of ["Bold", "Italic", "Inline code", "Link"])
    await expect(
      rootMenu().getByRole("menuitem", { name: label, exact: true }),
    ).toBeEnabled();
  await expand("insert");
  await capture("english-table-insert");
  expect(await submenu().getByRole("menuitem").allTextContents()).toEqual([
    "Image…",
    "Paragraph before",
    "Paragraph after",
  ]);
  await expand("table");
  await capture("english-table-actions");
  await submenu()
    .getByRole("menuitem", { name: "Insert column left", exact: true })
    .click();
  expect(await text()).toContain("| First |  | Second |");
  expect(await text()).toContain("| alpha middle omega |  | cell two |");
  await undo();
});

test("right-clicking a selected middle word in a live table textarea keeps precisely that source selection", async () => {
  await page.evaluate(() => {
    __inkstone.editor.setMode("live");
    __inkstone.editor.setSelection({
      anchor: __inkstone.editor.view.state.doc.length,
    });
  });
  await page
    .locator('.cm-live-block[data-block-type="table_open"] tr')
    .nth(1)
    .locator("td")
    .first()
    .click();
  const input = page.locator(".inkstone-table-cell-editor");
  const point = await input.evaluate((input) => {
    input.focus();
    input.setSelectionRange(6, 12);
    input.dispatchEvent(new Event("select", { bubbles: true }));
    const bounds = input.getBoundingClientRect(),
      style = getComputedStyle(input);
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    context.font = style.font;
    return {
      x:
        bounds.left +
        parseFloat(style.paddingLeft) +
        context.measureText("alpha mid").width,
      y:
        bounds.top +
        parseFloat(style.paddingTop) +
        parseFloat(style.lineHeight) / 2,
    };
  });
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(rootMenu()).toBeVisible();
  expect(
    await page.evaluate(() => {
      const selection = __inkstone.editor.view.state.selection.main;
      return __inkstone.editor.view.state.sliceDoc(
        selection.from,
        selection.to,
      );
    }),
  ).toBe("middle");
  await rootMenu().getByRole("menuitem", { name: "Bold", exact: true }).click();
  expect(await text()).toBe(
    original.replace("alpha middle omega", "alpha **middle** omega"),
  );
  await undo();
});

test("copy and paste formats use the native clipboard, retain the insertion range and undo once", async () => {
  await openSelected("selected words");
  await expand("copy-paste");
  await submenu()
    .getByRole("menuitem", { name: "Copy HTML code", exact: true })
    .click();
  const clipboard = await page.evaluate(() =>
    __inkstone.invoke("readClipboard"),
  );
  expect(clipboard.text).toContain("<p>selected words</p>");
  await page.evaluate(() =>
    __inkstone.invoke("writeClipboard", {
      text: "plain",
      html: "<strong>rich paste</strong>",
    }),
  );
  await openSelected("selected words");
  await expand("copy-paste");
  await submenu()
    .getByRole("menuitem", { name: "Paste HTML as Markdown", exact: true })
    .click();
  await expect
    .poll(text)
    .toBe(original.replace("selected words", "**rich paste**"));
  await undo();
});

test("YAML, reference links and table copy, prettify and delete are real undoable commands", async () => {
  await openSelected("selected words");
  await expand("insert");
  await submenu()
    .getByRole("menuitem", { name: "YAML front matter", exact: true })
    .click();
  expect(await text()).toBe("---\r\ntitle: \r\n---\r\n\r\n" + original);
  await undo();
  await openSelected("selected words");
  await expand("insert");
  await submenu()
    .getByRole("menuitem", { name: "Link reference", exact: true })
    .click();
  expect(await text()).toContain("[selected words][ref]");
  expect(await text()).toContain("[ref]: https://");
  await undo();
  await openTableCell(1, 1);
  await expand("table");
  await submenu()
    .getByRole("menuitem", { name: "Copy table", exact: true })
    .click();
  expect(
    (await page.evaluate(() => __inkstone.invoke("readClipboard"))).text,
  ).toContain("| alpha middle omega | cell two |");
  await openTableCell(1, 1);
  await expand("table");
  await submenu()
    .getByRole("menuitem", { name: "Prettify table", exact: true })
    .click();
  expect(await text()).toContain("| First              | Second");
  await undo();
  await openTableCell(1, 1);
  await expand("table");
  await submenu()
    .getByRole("menuitem", { name: "Delete table", exact: true })
    .click();
  expect(await text()).not.toContain("alpha middle omega");
  expect(await text()).toContain("Tail paragraph.");
  await undo();
});

test("keyboard submenus and Escape work at the viewport edge; read-only keeps copying but disables edits", async () => {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(720, 500),
  );
  await selectSource("selected words");
  await page.keyboard.press("Shift+F10");
  await expect(rootMenu()).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowRight");
  await expect(submenu()).toBeVisible();
  await expect(submenu().getByRole("menuitem", { name: "Image…", exact: true })).toBeFocused();
  // Chromium can emit pointerenter when a new popover paints below a cursor
  // that has not moved. Keyboard navigation must keep its branch and focus.
  await rootMenu().locator('[data-context-submenu="paragraph"]').evaluate((button) =>
    button.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" })),
  );
  await expect(submenu().getByRole("menuitem", { name: "Image…", exact: true })).toBeFocused();
  const geometry = await page
    .locator(".editor-context-menu")
    .evaluateAll((menus) =>
      menus.map((menu) => {
        const box = menu.getBoundingClientRect();
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: innerWidth,
          height: innerHeight,
        };
      }),
    );
  for (const box of geometry) {
    expect(box.left).toBeGreaterThanOrEqual(7);
    expect(box.top).toBeGreaterThanOrEqual(7);
    expect(box.right).toBeLessThanOrEqual(box.width - 7);
    expect(box.bottom).toBeLessThanOrEqual(box.height - 7);
  }
  await page.keyboard.press("Escape");
  await expect(submenu()).toHaveCount(0);
  await expect(rootMenu()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rootMenu()).toHaveCount(0);
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.mouse.move(1, 1);
  await page.keyboard.press("Shift+F10");
  await expect(rootMenu()).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowRight");
  await expect(submenu().getByRole("menuitem", { name: "Image…", exact: true })).toBeFocused();
  const paragraph = await rootMenu().locator('[data-context-submenu="paragraph"]').boundingBox();
  await page.mouse.move(paragraph.x + paragraph.width / 2, paragraph.y + paragraph.height / 2);
  await expect(submenu().getByRole("menuitem", { name: "Heading 1", exact: true })).toBeVisible();
  await expect(submenu().getByRole("menuitem", { name: "Paragraph", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(submenu()).toHaveCount(0);
  await expect(rootMenu()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rootMenu()).toHaveCount(0);
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.evaluate(() => __inkstone.execute("readOnly"));
  await page.waitForFunction(() => __inkstone.editor.view.state.readOnly);
  await openSelected("selected words");
  for (const label of ["Cut", "Paste", "Delete", "Bold"])
    await expect(
      rootMenu().getByRole("menuitem", { name: label, exact: true }),
    ).toBeDisabled();
  await expect(
    rootMenu().getByRole("menuitem", { name: "Copy", exact: true }),
  ).toBeEnabled();
  await rootMenu().getByRole("menuitem", { name: "Copy", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => __inkstone.invoke("readClipboard"))).text,
    )
    .toBe("selected words");
  expect(await text()).toBe(original);
});

test("Chinese and dark menus retain local labels and stay inside a short window", async () => {
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { locale: "zh-CN", theme: "dark" }),
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await openSelected("selected words");
  await expect(
    rootMenu().getByRole("menuitem", { name: "复制", exact: true }),
  ).toBeVisible();
  await expand("insert");
  await expect(
    submenu().getByRole("menuitem", { name: "在前面插入段落", exact: true }),
  ).toBeVisible();
  const output = artifactPath("context-menu");
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, "chinese-dark-insert.png") });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { theme: "light" }),
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await openSelected("");
  await capture("chinese-blank-root");
  await expand("insert");
  await capture("chinese-document-insert");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await openTableCell(1, 1);
  await expand("table");
  await capture("chinese-table-actions");
  await expand("insert");
  await capture("chinese-table-insert");
});

test("pipe syntax inside a code fence keeps the ordinary document menu", async () => {
  const example =
    "```markdown\n| First | Second |\n| --- | --- |\n| alpha | beta |\n```\n";
  await page.evaluate(
    (example) =>
      __inkstone.loadDocument({ ...__inkstone.getDocument(), text: example }),
    example,
  );
  await openSelected("alpha");
  await expect(
    rootMenu().locator('[data-context-submenu="table"]'),
  ).toHaveCount(0);
  await expect(
    rootMenu().locator('[data-context-submenu="paragraph"]'),
  ).toBeVisible();
  await expand("insert");
  await expect(
    submenu().getByRole("menuitem", { name: "Table…", exact: true }),
  ).toBeVisible();
  expect(await text()).toBe(example);
});

test("inserting a footnote preserves selected prose and keeps the definition in one undo step", async () => {
  await openSelected("selected words");
  await expand("insert");
  await submenu()
    .getByRole("menuitem", { name: "Footnote…", exact: true })
    .click();
  await page.getByRole("dialog").locator('input[name="value"]').fill("note");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "OK", exact: true })
    .click();
  await expect
    .poll(text)
    .toContain("Alpha selected words[^note] and untouched text.");
  expect(await text()).toContain("[^note]: ");
  await undo();
});

test("empty clipboard Paste on a new document finishes without Save As or image work", async () => {
  await page.evaluate(() => __inkstone.invoke("writeClipboard", { text: "" }));
  await page.evaluate(() => __inkstone.execute("new"));
  await page.waitForFunction(
    () =>
      !__inkstone.getDocument().path && !__inkstone.editor.view.state.readOnly,
  );
  await app.evaluate(({ dialog }) => {
    global.__contextSaveDialogCalls = 0;
    dialog.showSaveDialog = async () => {
      global.__contextSaveDialogCalls++;
      return { canceled: true };
    };
  });
  await page.evaluate(() => {
    window.__contextCompletion = null;
    document.addEventListener(
      "inkstone:context-action-complete",
      (event) => {
        window.__contextCompletion = event.detail;
      },
      { once: true },
    );
  });
  await openSelected("");
  await capture("english-empty-document-root");
  await rootMenu()
    .getByRole("menuitem", { name: "Paste", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__contextCompletion))
    .toEqual({ id: "contextPaste", ok: true });
  expect(await app.evaluate(() => global.__contextSaveDialogCalls)).toBe(0);
  expect(await text()).toBe("");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("right-clicking the visible end of a long selection and Escape never jump to its distant head", async () => {
  const long =
    "# Top\n\nvisible selected prefix\n\n" +
    "A distant paragraph.\n\n".repeat(100) +
    "End";
  await page.evaluate(
    (long) =>
      __inkstone.loadDocument({ ...__inkstone.getDocument(), text: long }),
    long,
  );
  const before = await page.evaluate(() => {
    const editor = __inkstone.editor;
    editor.setMode("source");
    editor.setSelection(
      { anchor: 0, head: editor.view.state.doc.length },
      { scrollIntoView: false },
    );
    editor.view.scrollDOM.scrollTop = 0;
    editor.focus();
    const position = editor.view.state.doc.toString().indexOf("visible") + 3;
    const rectangle = editor.view.coordsAtPos(position);
    return {
      selection: editor.getSelection(),
      scroll: editor.view.scrollDOM.scrollTop,
      point: { x: rectangle.left, y: (rectangle.top + rectangle.bottom) / 2 },
    };
  });
  await page.mouse.click(before.point.x, before.point.y, { button: "right" });
  await expect(rootMenu()).toBeVisible();
  expect(await page.evaluate(() => __inkstone.editor.getSelection())).toEqual(
    before.selection,
  );
  expect(
    await page.evaluate(() => __inkstone.editor.view.scrollDOM.scrollTop),
  ).toBeCloseTo(before.scroll, 0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => __inkstone.editor.getSelection())).toEqual(
    before.selection,
  );
  expect(
    await page.evaluate(() => __inkstone.editor.view.scrollDOM.scrollTop),
  ).toBeCloseTo(before.scroll, 0);
});

test("inline math wrapping and immediate replacement typing undo as separate edits", async () => {
  await openSelected("selected words");
  await expand("insert");
  await submenu()
    .getByRole("menuitem", { name: "Inline math", exact: true })
    .click();
  await expect
    .poll(text)
    .toBe(original.replace("selected words", "$selected words$"));
  await page.keyboard.type("Q");
  expect(await text()).toBe(original.replace("selected words", "$Q$"));
  await page.keyboard.press("Control+z");
  expect(await text()).toBe(
    original.replace("selected words", "$selected words$"),
  );
  await page.keyboard.press("Control+z");
  expect(await text()).toBe(original);
});

test("forwarded spelling suggestions replace only the verified clicked source word and undo once", async () => {
  const before = original.replace("selected words", "inkstonetestword");
  await page.evaluate(
    (before) =>
      __inkstone.loadDocument({ ...__inkstone.getDocument(), text: before }),
    before,
  );
  const point = await selectSource("inkstonetestword");
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(rootMenu()).toBeVisible();
  await app.evaluate(
    ({ BrowserWindow }, point) =>
      BrowserWindow.getAllWindows()[0].webContents.send(
        "inkstone:context-menu-details",
        {
          ...point,
          misspelledWord: "inkstonetestword",
          dictionarySuggestions: ["chosen"],
        },
      ),
    point,
  );
  await rootMenu()
    .getByRole("menuitem", { name: "chosen", exact: true })
    .click();
  await expect.poll(text).toBe(before.replace("inkstonetestword", "chosen"));
  await page.keyboard.press("Control+z");
  expect(await text()).toBe(before);
});
