import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { artifactPath } from "../scripts/artifact-path.mjs";
import { withPreservedClipboard } from "./helpers/clipboard.mjs";

let application, page, directory, file, errors;
const executablePath = process.env.INKSTONE_EXECUTABLE
  ? path.resolve(process.env.INKSTONE_EXECUTABLE)
  : undefined;
test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-code-"));
  const profile = path.join(directory, "profile");
  await fs.mkdir(profile);
  file = path.join(directory, "代码 文稿.md");
  await fs.writeFile(file, "Before\r\n\r\nAfter");
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale: "en",
      theme: "light",
      firstRunComplete: true,
      defaultAppPrompted: true,
      autoSave: false,
      autoPair: false,
      spellcheck: false,
    }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    executablePath,
    args: executablePath ? [file] : [process.cwd(), file],
    env,
    chromiumSandbox: true,
  });
  page = await application.firstWindow();
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(
    () =>
      window.__inkstone?.getDocument().path?.endsWith("代码 文稿.md") &&
      !__inkstone.editor.view.state.readOnly,
  );
});
test.afterEach(async () => {
  try {
    expect(errors).toEqual([]);
  } finally {
    if (application) {
      await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await application.close().catch(() => {});
    }
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
});
const text = () => page.evaluate(() => __inkstone.editor.getText());
async function load(text) {
  await page.evaluate((text) => {
    __inkstone.loadDocument({ ...__inkstone.getDocument(), text });
    __inkstone.editor.setMode("live");
  }, text);
}
async function select(value, offset = 0) {
  await page.evaluate(
    ({ value, offset }) => {
      const editor = __inkstone.editor;
      editor.setSelection({
        anchor: editor.view.state.doc.toString().indexOf(value) + offset,
      });
      editor.focus();
    },
    { value, offset },
  );
}

test("Code language changes preserve metadata and caret; unfinished fences exit to prose", async () => {
  await load("```javascript linenos=1\nconst value = 42;\n```\n\nTail");
  await select("value", 3);
  await page.locator(".cm-code-language").selectOption("");
  await expect(page.locator(".cm-code-language")).toHaveValue("");
  await page.keyboard.type("X");
  expect(await text()).toContain("```text linenos=1\nconst valXue = 42;");
  await load("~~~python\nx = 1");
  await select("x = 1", 5);
  await page.keyboard.press("Control+Enter");
  await page.keyboard.type("Outside");
  expect(await text()).toBe("~~~python\nx = 1\n~~~\n\nOutside");
});

test("Insert code block focuses typing, language selection highlights Python, and save preserves CRLF", async () => {
  await select("Before", 6);
  await page.evaluate(() => __inkstone.execute("codeFence"));
  await expect(page.locator(".cm-code-line")).toBeVisible();
  await page.locator(".cm-code-language").selectOption("python");
  await page.keyboard.insertText(
    'def greet(name):\n    return "Hello " + name',
  );
  await expect(page.locator('.cm-code-line span:text-is("def")')).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".cm-code-language")).toBeVisible();
  const expected = await text();
  expect(expected).toContain(
    '```python\r\ndef greet(name):\r\n    return "Hello " + name\r\n```',
  );
  await page.keyboard.press("Control+s");
  await expect.poll(() => fs.readFile(file, "utf8")).toBe(expected);
  await load(await fs.readFile(file, "utf8"));
  await expect(page.locator(".cm-code-language")).toHaveValue("python");
  await expect(page.locator(".cm-code-line")).toHaveCount(2);
});

test("Empty native clipboard is restored after code paste", async () => {
  await withPreservedClipboard(application, async () => {
    await application.evaluate(({ clipboard }) => clipboard.clear());
    await withPreservedClipboard(application, async () => {
      await load("```python\n\n```\n\nTail");
      await select("```python", 10);
      await page.evaluate(() =>
        __inkstone.invoke("writeClipboard", { text: "print('墨石')" }),
      );
      await page.keyboard.press("Control+v");
      await expect.poll(text).toBe("```python\nprint('墨石')\n```\n\nTail");
    });
    expect(
      await application.evaluate(async ({ clipboard }) =>
        (await clipboard.read()).every((item) => item.types.length === 0),
      ),
    ).toBe(true);
  });
});

test("Native and context paste keep code text, indentation and literal fences with undo", async () => {
  await withPreservedClipboard(application, async () => {
    const original = "\uFEFF```javascript\r\n\r\n```\r\n\r\nTail";
    const code =
      'const html = "<b>**literal**</b>";\n\tconsole.log(html);\n```';
    for (const contextMenu of [false, true]) {
      await load(original);
      await select("```javascript", 14);
      await page.evaluate(
        (code) =>
          __inkstone.invoke("writeClipboard", {
            text: code,
            html: '<pre><code class="language-js">WRONG HTML</code></pre>',
          }),
        code,
      );
      if (contextMenu) {
        const point = await page.evaluate(() => {
          const editor = __inkstone.editor;
          const box = editor.view.coordsAtPos(editor.getSelection().head);
          return { x: box.left + 2, y: (box.top + box.bottom) / 2 };
        });
        await page.mouse.click(point.x, point.y, { button: "right" });
        await page
          .locator('.editor-context-menu[data-context-depth="0"]')
          .getByRole("menuitem", { name: "Paste", exact: true })
          .click();
      } else await page.keyboard.press("Control+v");
      const expected =
        "\uFEFF````javascript\r\n" +
        code.replaceAll("\n", "\r\n") +
        "\r\n````\r\n\r\nTail";
      await expect.poll(text).toBe(expected);
      await expect(page.locator(".cm-code-language")).toHaveCount(1);
      await page.keyboard.press("Control+z");
      await expect.poll(text).toBe(original);
    }
  });
});

test("The context Insert menu creates an immediately editable code block", async () => {
  await select("After", 2);
  const box = await page.evaluate(() => {
    const editor = __inkstone.editor;
    const box = editor.view.coordsAtPos(editor.getSelection().head);
    return { x: box.left, y: (box.top + box.bottom) / 2 };
  });
  await page.mouse.click(box.x, box.y, { button: "right" });
  await page
    .locator('.editor-context-menu[data-context-depth="0"]')
    .getByRole("menuitem", { name: "Insert", exact: true })
    .hover();
  await page
    .locator('.editor-context-menu[data-context-depth="1"]')
    .getByRole("menuitem", { name: "Code fences", exact: true })
    .click();
  await page.keyboard.type("hello from the context menu");
  await expect(page.locator(".cm-code-line")).toHaveText(
    "hello from the context menu",
  );
});

for (const [locale, theme] of [
  ["zh-CN", "light"],
  ["zh-CN", "dark"],
  ["en", "light"],
  ["en", "dark"],
]) {
  test(`Branding and persistent code are readable in ${locale}/${theme}`, async () => {
    await page.evaluate(
      ({ locale, theme }) =>
        __inkstone.invoke("updateSettings", {
          locale,
          theme,
          sidebarWidth: 256,
        }),
      { locale, theme },
    );
    await load(
      '```javascript\n// A thought, written down\nconst message = "Hello, Inkstone";\nconsole.log(message);\n```\n\nLet your next idea begin here.',
    );
    await select("Let your");
    const logo = page.locator(`.brand .brand-artwork-${theme}`);
    await expect(logo).toBeVisible();
    expect(
      (await page.locator(".brand-lockup").boundingBox()).width,
    ).toBeGreaterThanOrEqual(180);
    const svg = await logo.getAttribute("src");
    expect(svg).toContain(
      locale === "zh-CN"
        ? "inkstone-logo-horizontal-"
        : "inkstone-logo-horizontal-en-",
    );
    await expect(
      page.locator('.cm-code-line span:text-is("const")'),
    ).toBeVisible();
    const output = artifactPath("code-native");
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, `${locale}-${theme}.png`),
    });
    await page.evaluate(() => __inkstone.execute("about"));
    await expect(page.locator("[data-about-description]")).toHaveText(
      locale === "zh-CN" ? "让想法落在纸上" : "A place for your thoughts",
    );
    await expect(page.locator("[data-about-contributor]")).toHaveText(
      "Wei Zhuo",
    );
    await page.screenshot({
      path: path.join(output, `about-${locale}-${theme}.png`),
    });
  });
}
