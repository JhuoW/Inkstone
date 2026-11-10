// Closing, the tray, exiting and saving failures in the real desktop app.
// Native message boxes are replaced in the main process with recorded answers.
import { test, expect, _electron as electron } from "@playwright/test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const electronPath = createRequire(import.meta.url)("electron");
let app, page, temp, file, profile, env;
const original = "# Lifecycle\n\nOriginal.\n";

async function launch(preferences = {}) {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-lifecycle-"));
  profile = path.join(temp, "profile");
  file = path.join(temp, "Notes 中文.md");
  await fs.writeFile(file, original);
  await fs.mkdir(profile);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale: "en",
      firstRunComplete: true,
      autoSave: false,
      ...preferences,
    }),
  );
  env = {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":91",
    INKSTONE_USER_DATA: profile,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    chromiumSandbox: process.env.INKSTONE_TEST_NO_SANDBOX !== "1",
    args: [process.cwd(), file],
    env,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => window.__inkstone?.editor);
  await expect(page.locator("#document-title")).toHaveText(path.basename(file));
  await waitEditable();
}
// Starting Inkstone again with the same profile hands over to this one.
function launchAgain(...args) {
  return new Promise((resolve, reject) => {
    // The app folder comes first, so it is not taken for a folder to open.
    const child = spawn(
      electronPath,
      [
        process.cwd(),
        ...(process.env.INKSTONE_TEST_NO_SANDBOX === "1"
          ? ["--no-sandbox"]
          : []),
        ...args,
      ],
      { env, stdio: "ignore" },
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
}
async function append(text, target = page) {
  await target.evaluate((text) => {
    const editor = __inkstone.editor;
    const end = editor.view.state.doc.length;
    editor.setSelection({ anchor: end, head: end });
    editor.insert(text);
  }, text);
}
async function windowId(target = page) {
  return (await app.browserWindow(target)).evaluate((win) => win.id);
}
async function nativeClose(target = page) {
  const id = await windowId(target);
  await app.evaluate(
    ({ BrowserWindow }, id) => BrowserWindow.fromId(id).close(),
    id,
  );
}
async function visible(target = page) {
  const id = await windowId(target);
  return app.evaluate(
    ({ BrowserWindow }, id) => BrowserWindow.fromId(id).isVisible(),
    id,
  );
}
// Answers the next native message boxes in order and records what they said.
async function answerMessageBoxes(...answers) {
  await app.evaluate(({ dialog }, answers) => {
    globalThis.messageBoxes = [];
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      globalThis.messageBoxes.push(options);
      const answer = answers.shift();
      if (!answer) throw Error(`Unexpected message box: ${options.message}`);
      return { checkboxChecked: false, ...answer };
    };
  }, answers);
}
const messageBoxes = () => app.evaluate(() => globalThis.messageBoxes || []);
function choice(label, target = page) {
  return target
    .getByRole("dialog")
    .getByRole("button", { name: label, exact: true });
}
async function waitEditable(target = page) {
  await expect(target.getByRole("dialog")).toHaveCount(0);
  await target.waitForFunction(() => !__inkstone.editor.view.state.readOnly);
}
async function openSecondWindow(name, text) {
  const other = path.join(temp, name);
  await fs.writeFile(other, text);
  const next = app.waitForEvent("window");
  await page.evaluate(
    (other) => __inkstone.invoke("newWindow", { path: other }),
    other,
  );
  const second = await next;
  await second.waitForFunction(
    (name) => window.__inkstone?.getDocument().path?.endsWith(name),
    name,
  );
  await waitEditable(second);
  return { second, other };
}
test.afterEach(async () => {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    app = null;
  }
  if (temp) {
    await fs.chmod(file, 0o644).catch(() => {});
    await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
  }
});

test("the first close asks; Minimize to Tray hides the window without a save prompt and is remembered", async () => {
  await launch({ closeAction: "ask" });
  await append("Still unsaved.");
  await answerMessageBoxes({ response: 0, checkboxChecked: true });
  await nativeClose();
  await expect.poll(() => visible()).toBe(false);
  const [box] = await messageBoxes();
  expect(box.message).toBe("Minimize Inkstone to the tray, or exit?");
  expect(box.buttons).toEqual(["Minimize to Tray", "Exit Inkstone", "Cancel"]);
  expect(box.checkboxLabel).toBe("Remember my choice");
  // Minimizing is not exiting: no save prompt, and the edits stay in memory.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => __inkstone.getDocument().dirty)).toBe(true);
  await expect
    .poll(
      async () =>
        JSON.parse(
          await fs.readFile(path.join(profile, "settings.json"), "utf8"),
        ).closeAction,
    )
    .toBe("tray");
  // Starting Inkstone again shows the hidden window.
  await launchAgain();
  await expect.poll(() => visible()).toBe(true);
  // The remembered choice applies without asking again.
  await answerMessageBoxes();
  await nativeClose();
  await expect.poll(() => visible()).toBe(false);
  expect(await messageBoxes()).toEqual([]);
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original + "Still unsaved.",
  );
});

test("Cancel keeps the window, and Exit Inkstone asks about unsaved changes", async () => {
  await launch({ closeAction: "ask" });
  await append("Keep me.");
  await answerMessageBoxes({ response: 2 });
  await nativeClose();
  await expect.poll(async () => (await messageBoxes()).length).toBe(1);
  expect(await visible()).toBe(true);
  await waitEditable();
  await answerMessageBoxes({ response: 1 });
  await nativeClose();
  await expect(choice("Save")).toBeVisible();
  await choice("Cancel").click();
  await waitEditable();
  expect(await visible()).toBe(true);
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original + "Keep me.",
  );
  const closed = page.waitForEvent("close");
  await answerMessageBoxes({ response: 1 });
  await nativeClose();
  await choice("Save").click();
  await closed;
  expect(await fs.readFile(file, "utf8")).toBe(original + "Keep me.");
});

test("exiting with a window in the tray shows it and asks before discarding anything", async () => {
  await launch({ closeAction: "tray" });
  await append("Hidden edits.");
  await nativeClose();
  await expect.poll(() => visible()).toBe(false);
  // The tray menu's Exit, Ctrl+Q and File > Quit all run the same exit.
  await page.evaluate(() => __inkstone.execute("quit"));
  await expect(choice("Save")).toBeVisible();
  expect(await visible()).toBe(true);
  await choice("Cancel").click();
  await waitEditable();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original + "Hidden edits.",
  );
  expect(await fs.readFile(file, "utf8")).toBe(original);
});

test("exiting from the tray with nothing unsaved closes hidden windows without showing them", async () => {
  await launch({ closeAction: "tray" });
  await nativeClose();
  await expect.poll(() => visible()).toBe(false);
  const closed = page.waitForEvent("close");
  await page.evaluate(() => __inkstone.execute("quit"));
  await closed;
});

test("opening a file from the shell while Inkstone runs reuses this instance", async () => {
  await launch();
  const other = path.join(temp, "Other.md");
  await fs.writeFile(other, "Other\n");
  const opened = app.waitForEvent("window");
  await launchAgain(other);
  const second = await opened;
  await second.waitForFunction(() =>
    window.__inkstone?.getDocument().path?.endsWith("Other.md"),
  );
  // A file that is already open is shown, not opened twice.
  await launchAgain(file);
  await launchAgain(other);
  await page.waitForTimeout(500);
  expect(app.windows()).toHaveLength(2);
});

test("several unsaved documents: Save All saves every one before exiting", async () => {
  await launch();
  await append("First.");
  const { second, other } = await openSecondWindow("Second.md", "Second\n");
  await append("More.", second);
  await answerMessageBoxes({ response: 0 });
  const closed = [page.waitForEvent("close"), second.waitForEvent("close")];
  await page.evaluate(() => __inkstone.execute("quit"));
  await Promise.all(closed);
  const [box] = await messageBoxes();
  expect(box.message).toBe("2 documents have unsaved changes.");
  expect(box.detail).toContain("Notes 中文.md");
  expect(box.detail).toContain("Second.md");
  expect(await fs.readFile(file, "utf8")).toBe(original + "First.");
  expect(await fs.readFile(other, "utf8")).toBe("Second\nMore.");
});

test("several unsaved documents: Cancel keeps both, Don't Save exits without writing", async () => {
  await launch();
  await append("First.");
  const { second, other } = await openSecondWindow("Second.md", "Second\n");
  await append("More.", second);
  await answerMessageBoxes({ response: 3 });
  await page.evaluate(() => __inkstone.execute("quit"));
  await expect.poll(async () => (await messageBoxes()).length).toBe(1);
  await waitEditable();
  await waitEditable(second);
  expect(app.windows()).toHaveLength(2);
  await answerMessageBoxes({ response: 2 });
  const closed = [page.waitForEvent("close"), second.waitForEvent("close")];
  await page.evaluate(() => __inkstone.execute("quit"));
  await Promise.all(closed);
  expect(await fs.readFile(file, "utf8")).toBe(original);
  expect(await fs.readFile(other, "utf8")).toBe("Second\n");
});

test("a moved or deleted file is explained and can be saved again where it was", async () => {
  await launch();
  await append("Recovered.");
  await fs.rm(file);
  await expect(page.locator("#conflict-banner")).toContainText(
    "moved or deleted",
  );
  await page.evaluate(() => {
    window.pendingSave = __inkstone.execute("save");
  });
  await expect(
    page.getByRole("dialog").getByText("The file was moved or deleted", {
      exact: true,
    }),
  ).toBeVisible();
  await choice("Save to Original Location").click();
  await expect
    .poll(() => fs.readFile(file, "utf8").catch(() => ""))
    .toBe(original + "Recovered.");
  await expect(page.locator("#conflict-banner")).toBeHidden();
  expect(await page.evaluate(() => __inkstone.getDocument().dirty)).toBe(false);
  // Closing with the file gone again: Cancel in the explanation keeps it open.
  // The watcher polls every 600 ms; let it see the recreated file first.
  await page.waitForTimeout(1500);
  await append(" Again.");
  await fs.rm(file);
  await expect(page.locator("#conflict-banner")).toBeVisible();
  await nativeClose();
  await choice("Save").click();
  await expect(choice("Save to Original Location")).toBeVisible();
  await choice("Cancel").click();
  await waitEditable();
  expect(await page.evaluate(() => __inkstone.getDocument().text)).toBe(
    original + "Recovered. Again.",
  );
  expect(app.windows()).toHaveLength(1);
});

test("a read-only file is explained and Save As keeps the edits", async () => {
  await launch();
  await fs.chmod(file, 0o444);
  await append("Edited.");
  await page.evaluate(() => {
    window.pendingSave = __inkstone.execute("save");
  });
  await expect(
    page.getByRole("dialog").getByText("Couldn't save this file", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("read-only");
  await expect(choice("Try Again")).toBeVisible();
  const copy = path.join(temp, "Copy.md");
  await app.evaluate(({ dialog }, copy) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: copy });
  }, copy);
  await choice("Save As…").click();
  await expect
    .poll(() => fs.readFile(copy, "utf8").catch(() => ""))
    .toBe(original + "Edited.");
  expect(await fs.readFile(file, "utf8")).toBe(original);
  await expect(page.locator("#document-title")).toHaveText("Copy.md");
});

test("with auto save on, closing saves a named document without asking", async () => {
  await launch({ autoSave: true, autoSaveDelay: 60000 });
  await append("Saved on close.");
  const closed = page.waitForEvent("close");
  await nativeClose();
  await closed;
  expect(await fs.readFile(file, "utf8")).toBe(original + "Saved on close.");
});

test("Windows shutdown waits for unsaved changes and passes when everything is saved", async () => {
  await launch();
  const shutdown = async () => {
    const id = await windowId();
    return app.evaluate(({ BrowserWindow }, id) => {
      const event = {
        reasons: ["shutdown"],
        prevented: false,
        preventDefault() {
          this.prevented = true;
        },
      };
      BrowserWindow.fromId(id).emit("query-session-end", event);
      return event.prevented;
    }, id);
  };
  expect(await shutdown()).toBe(false);
  await append("Before shutdown.");
  await expect
    .poll(() => page.evaluate(() => __inkstone.getDocument().dirty))
    .toBe(true);
  await expect.poll(shutdown).toBe(true);
  await expect(choice("Save")).toBeVisible();
  await choice("Cancel").click();
  await waitEditable();
});
