import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

let app, page, temp, file;
const original = "# Windows 文件操作\r\n\r\nOriginal text.\r\n";

async function launch(nested = false) {
  temp = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkstone-windows-regression-"),
  );
  const profile = path.join(temp, "profile");
  const folder = nested ? path.join(temp, "原始 文件夹") : temp;
  await fs.mkdir(profile, { recursive: true });
  await fs.mkdir(folder, { recursive: true });
  file = path.join(folder, "中文 文稿.md");
  await fs.writeFile(file, original);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({ locale: "en", firstRunComplete: true, autoSave: false }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [process.cwd(), temp, file], env });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.__inkstone?.editor);
  await expect(page.locator("#document-title")).toHaveText(path.basename(file));
  await page.waitForFunction(() => !__inkstone.editor.view.state.readOnly);
  return folder;
}

async function rename(target, name) {
  const operation = page.evaluate(
    (target) =>
      __inkstone.execute("fileOperation", {
        operation: "rename",
        path: target,
      }),
    target,
  );
  operation.catch(() => {});
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="value"]').fill(name);
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await operation;
}

async function append(text) {
  await page.evaluate((text) => {
    const editor = __inkstone.editor;
    const end = editor.view.state.doc.length;
    editor.setSelection({ anchor: end, head: end });
    editor.insert(text);
  }, text);
}

test.afterEach(async () => {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    app = null;
  }
  if (temp) await fs.rm(temp, { recursive: true, force: true });
});

test("undoing a renamed file prompts before moving an unsaved document and Cancel preserves it", async () => {
  await launch();
  await rename(file, "重命名 文稿.md");
  const renamed = path.join(temp, "重命名 文稿.md");
  await expect
    .poll(() => page.evaluate(() => __inkstone.getDocument().path))
    .toBe(renamed);
  await append("Unsaved changes.");
  const undo = page.evaluate(() => __inkstone.execute("undoFileOperation"));
  undo.catch(() => {});
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await undo;
  const current = await page.evaluate(() => __inkstone.getDocument());
  expect(current.path).toBe(renamed);
  expect(current.text).toBe(original + "Unsaved changes.");
  expect(current.dirty).toBe(true);
  expect(await fs.readFile(renamed, "utf8")).toBe(original);
  await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" });
});

test("undoing a folder rename saves the active descendant and reopens its restored path", async () => {
  const folder = await launch(true);
  await rename(folder, "移动后 文件夹");
  const renamedFolder = path.join(temp, "移动后 文件夹");
  const renamedFile = path.join(renamedFolder, path.basename(file));
  await expect
    .poll(() => page.evaluate(() => __inkstone.getDocument().path))
    .toBe(renamedFile);
  await append("Saved before undo.");
  const undo = page.evaluate(() => __inkstone.execute("undoFileOperation"));
  undo.catch(() => {});
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await undo;
  const current = await page.evaluate(() => __inkstone.getDocument());
  expect(current.path).toBe(file);
  expect(current.text).toBe(original + "Saved before undo.");
  expect(current.dirty).toBe(false);
  expect(await fs.readFile(file, "utf8")).toBe(current.text);
  await expect(fs.stat(renamedFolder)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("shortcut validation rejects inherited object properties without changing preferences", async () => {
  await launch();
  for (const binding of ["Mod-constructor", "constructor-s", "Mod-__proto__"]) {
    await expect(
      page.evaluate(
        (binding) =>
          __inkstone.invoke("updateSettings", { shortcuts: { save: binding } }),
        binding,
      ),
    ).rejects.toThrow(/Invalid shortcut/);
  }
  const state = await page.evaluate(() => __inkstone.invoke("bootstrap"));
  expect(state.settings.shortcuts).toEqual({});
});

test("file URL images render and local links open percent-named files through authorized access", async () => {
  await launch();
  const linked = path.join(temp, "percent%name.md");
  const image = path.join(temp, "图片 100%.svg");
  await fs.writeFile(
    linked,
    "# Linked local note\r\n\r\nContent stays local.\r\n",
  );
  await fs.writeFile(
    image,
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
  );
  const imageURL = pathToFileURL(image).href + "?cache=1#preview";
  const linkURL = pathToFileURL(linked).href;
  const source = `# Local URLs\r\n\r\n![Local image](${imageURL})\r\n\r\n[Open linked note](${linkURL})\r\n\r\nLast paragraph.\r\n`;
  await fs.writeFile(file, source);
  await page.evaluate(async (file) => {
    await __inkstone.loadDocument(
      await __inkstone.invoke("openFile", { path: file }),
    );
    const end = __inkstone.editor.view.state.doc.length;
    __inkstone.editor.setSelection({ anchor: end, head: end });
  }, file);
  const rendered = page.getByRole("img", { name: "Local image" });
  await expect(rendered).toBeVisible();
  await expect
    .poll(() =>
      rendered.evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  const anchor = page.getByRole("link", { name: "Open linked note" });
  await expect(anchor).toHaveAttribute("href", linkURL);
  await expect(
    page.evaluate(
      (href) =>
        __inkstone.invoke("resolveLink", {
          documentPath: __inkstone.getDocument().path,
          href,
        }),
      pathToFileURL(path.join(path.dirname(temp), "inkstone-ungranted.md"))
        .href,
    ),
  ).rejects.toThrow(/ACCESS/);
  await anchor.click({ modifiers: ["Control"] });
  await expect
    .poll(() => page.evaluate(() => __inkstone.getDocument().path))
    .toBe(linked);
  expect((await page.evaluate(() => __inkstone.getDocument())).text).toContain(
    "Content stays local.",
  );
});

for (const directory of [false, true]) {
  test(`case-only ${directory ? "folder" : "file"} rename preserves content and refuses a different existing destination`, async () => {
    const folder = await launch(directory);
    const firstName = directory ? "CaseFolder" : "CaseNote.md";
    const secondName = directory ? "casefolder" : "casenote.md";
    await rename(directory ? folder : file, firstName);
    const firstPath = path.join(temp, firstName);
    await rename(firstPath, secondName);
    const secondPath = path.join(temp, secondName);
    const currentPath = directory
      ? path.join(secondPath, path.basename(file))
      : secondPath;
    expect((await fs.readdir(temp)).includes(secondName)).toBe(true);
    expect((await fs.readdir(temp)).includes(firstName)).toBe(false);
    expect(await page.evaluate(() => __inkstone.getDocument().path)).toBe(
      currentPath,
    );
    expect(await fs.readFile(currentPath, "utf8")).toBe(original);

    const collisionName = directory ? "ExistingFolder" : "Existing.md";
    const collision = path.join(temp, collisionName);
    if (directory) await fs.mkdir(collision);
    else await fs.writeFile(collision, "Keep this destination.");
    await expect(rename(secondPath, collisionName)).rejects.toThrow(/EXISTS/);
    expect(await fs.readFile(currentPath, "utf8")).toBe(original);
    if (!directory)
      expect(await fs.readFile(collision, "utf8")).toBe(
        "Keep this destination.",
      );
  });
}
