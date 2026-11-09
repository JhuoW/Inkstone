import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";

let application, page, directory, profile, file, server, endpoint;
let requests, reply, hold, fail, errors;
const original =
  "\uFEFF# Review\r\n\r\nAlpha paragraph.\r\n\r\nKeep $x+y$, `code` and 中文 unchanged.\r\n";
const editorOriginal = original.slice(1); // FileStore keeps the BOM in document metadata.
const report = () =>
  JSON.stringify({
    summary: "The structure is clear; one sentence can be more specific.",
    overallScore: 82,
    dimensions: [
      { name: "Clarity", score: 82, reason: "The first paragraph is vague." },
    ],
    suggestions: [
      {
        original: "Alpha paragraph.",
        replacement: "A clearer paragraph.",
        reason: "Use a more specific description.",
      },
    ],
  });
const text = () => page.evaluate(() => __inkstone.editor.getText());
const panel = () => page.locator("#ai-assistant-host");
async function showPanel() {
  if (!(await panel().isVisible()))
    await page.locator('[data-command="aiAssistant"]').click();
}
async function configure() {
  await page.evaluate(
    (endpoint) =>
      __inkstone.invoke("aiSaveSettings", {
        provider: "local",
        endpoint,
        model: "local-reviewer",
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: 10000,
      }),
    endpoint,
  );
}
async function analyze() {
  await page.locator("[data-ai-analyze]").click();
  await expect(page.locator(".ai-overall-score")).toHaveText("82 / 100");
}

test.beforeEach(async () => {
  requests = [];
  reply = report();
  hold = false;
  fail = false;
  errors = [];
  server = http.createServer(async (req, res) => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "local-reviewer" }] }));
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    requests.push(body);
    if (fail) {
      res.writeHead(503);
      res.end("fixture unavailable");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    const delta = (value) =>
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: value } }] })}\n\n`,
      );
    if (hold) {
      delta("Reviewing the document…");
      return;
    }
    const content = body.messages?.some((m) =>
      m.content.includes("Connection test."),
    )
      ? "Ready"
      : reply;
    delta(content.slice(0, 12));
    setTimeout(() => {
      if (!res.destroyed) {
        delta(content.slice(12));
        res.end("data: [DONE]\n\n");
      }
    }, 60);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "inkstone-ai-e2e-"));
  profile = path.join(directory, "profile");
  await fs.mkdir(profile);
  file = path.join(directory, "AI 文稿.md");
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
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(
    () =>
      window.__inkstone?.getDocument().path?.endsWith("AI 文稿.md") &&
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
      application = null;
    }
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
});

test("AI panel shares only editor space, resizes, persists, follows sidebar and window size", async () => {
  await showPanel();
  const before = await panel().boundingBox();
  const host = await page.locator("#editor-host").boundingBox();
  expect(Math.abs(before.x - host.x)).toBeLessThan(2);
  expect(Math.abs(before.width - host.width)).toBeLessThan(2);
  const separator = page.locator(".ai-resizer");
  const drag = await separator.boundingBox();
  await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
  await page.mouse.down();
  await page.mouse.move(drag.x + drag.width / 2, drag.y - 65, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await panel().boundingBox()).height)
    .toBeGreaterThan(before.height + 40);
  await separator.focus();
  await page.keyboard.press("ArrowDown");
  await page.locator('[data-command="sidebar"]').first().click();
  await expect
    .poll(async () => (await panel().boundingBox()).width)
    .toBeGreaterThan(before.width + 100);
  await page.locator("[data-ai-close]").click();
  await expect(panel()).toBeHidden();
  await showPanel();
  await expect
    .poll(
      async () =>
        JSON.parse(
          await fs.readFile(path.join(profile, "settings.json"), "utf8"),
        ).aiPanelOpen,
    )
    .toBe(true);
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(800, 600),
  );
  await expect
    .poll(async () => (await page.locator("#editor-host").boundingBox()).height)
    .toBeGreaterThan(50);
  const size = await panel().boundingBox();
  expect(size.y + size.height).toBeLessThanOrEqual(
    await page.evaluate(() => innerHeight),
  );
});

test("AI model settings list models, test a local connection and keep keys encrypted", async () => {
  await showPanel();
  await page.locator("[data-ai-configure]").click();
  const dialog = page.locator(".ai-settings-dialog");
  await dialog.locator('[name="endpoint"]').fill(endpoint);
  await dialog.locator('[name="model"]').fill("local-reviewer");
  await dialog.locator("[data-model-list]").click();
  await expect(dialog.locator("#ai-available-models option")).toHaveAttribute(
    "value",
    "local-reviewer",
  );
  await dialog.locator("[data-model-test]").click();
  await expect(dialog.locator(".ai-settings-status")).toContainText(
    "Connection successful",
  );
  const settings = await page.evaluate(() =>
    __inkstone.invoke("aiGetSettings"),
  );
  expect(settings.model).toBe("local-reviewer");
  if (settings.secureStorageAvailable) {
    const key = "test-fixture-key-not-a-real-credential";
    await dialog.locator('[name="apiKey"]').fill(key);
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator(".ai-settings-status")).toHaveText("Saved");
    await expect(dialog.locator('[name="apiKey"]')).toHaveValue("");
    for (const name of await fs.readdir(profile)) {
      if (/\.json$/.test(name))
        expect(
          await fs.readFile(path.join(profile, name), "utf8"),
        ).not.toContain(key);
    }
    expect(
      await page.evaluate(() => __inkstone.invoke("aiGetSettings")),
    ).not.toHaveProperty("apiKey");
  }
});

test("analysis previews and locates revisions; explicit acceptance preserves source and undo", async () => {
  await configure();
  await showPanel();
  await analyze();
  await page.screenshot({ path: test.info().outputPath("ai-en-light.png") });
  await panel().screenshot({
    path: test.info().outputPath("ai-en-light-panel.png"),
  });
  expect(await text()).toBe(editorOriginal);
  await expect(page.locator(".ai-diff-original")).toContainText(
    "Alpha paragraph.",
  );
  await expect(page.locator(".ai-diff-replacement")).toContainText(
    "A clearer paragraph.",
  );
  await panel().getByRole("button", { name: "Locate", exact: true }).click();
  expect(
    await page.evaluate(() => {
      const e = __inkstone.editor;
      const s = e.view.state.selection.main;
      return e.view.state.sliceDoc(s.from, s.to);
    }),
  ).toBe("Alpha paragraph.");
  await page.locator("[data-ai-accept]").click();
  await expect
    .poll(text)
    .toBe(editorOriginal.replace("Alpha paragraph.", "A clearer paragraph."));
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(file, "utf8")).toBe(
    original.replace("Alpha paragraph.", "A clearer paragraph."),
  );
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(editorOriginal);
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(file, "utf8")).toBe(original);
  await analyze();
  await panel().getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.locator(".ai-suggestion")).toHaveCount(0);
  expect(await text()).toBe(editorOriginal);
});

test("selection scope excludes unrelated content, prevents stale edits and respects readonly", async () => {
  await configure();
  await showPanel();
  await page.evaluate(() => {
    const e = __inkstone.editor;
    const from = e.view.state.doc.toString().indexOf("Alpha");
    e.setSelection({ anchor: from, head: from + "Alpha paragraph.".length });
  });
  await page.locator("[data-ai-scope]").selectOption("selection");
  await analyze();
  const payload = requests
    .at(-1)
    .messages.map((m) => m.content)
    .join("\n");
  expect(payload).toContain("Alpha paragraph.");
  expect(payload).not.toContain("Keep $x+y$");
  await page.evaluate(() => __inkstone.execute("readOnly"));
  await expect(page.locator("[data-ai-accept]")).toBeDisabled();
  await page.evaluate(() => __inkstone.execute("readOnly"));
  await page.evaluate(() => __inkstone.editor.insert("Changed"));
  await expect(page.locator("[data-ai-accept]")).toHaveCount(0);
  expect(await text()).not.toContain("A clearer paragraph.");
});

test("streaming can be cancelled and document switches discard delayed results", async () => {
  await configure();
  await showPanel();
  hold = true;
  await page.locator("[data-ai-analyze]").click();
  await expect(page.locator(".ai-stream")).toContainText("Reviewing");
  await page.locator("[data-ai-cancel]").click();
  await expect(panel()).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".ai-status")).toContainText("Cancelled");
  await page.locator("[data-ai-analyze]").click();
  await expect(page.locator(".ai-stream")).toContainText("Reviewing");
  await page.evaluate(() =>
    __inkstone.loadDocument({
      ...__inkstone.getDocument(),
      path: null,
      text: "Another document",
    }),
  );
  await expect(panel()).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".ai-results")).toBeEmpty();
  await expect(page.locator("[data-ai-accept]")).toHaveCount(0);
  expect(await text()).toBe("Another document");
});

test("chat keeps document context and reports server errors without editing", async () => {
  await configure();
  await showPanel();
  reply = "Use a more specific opening. <script>unsafe()</script>";
  await page
    .locator("#ai-chat-question")
    .fill("How can I clarify the opening?");
  await page.locator(".ai-chat-form button[type=submit]").click();
  await expect(page.locator(".ai-chat-log")).toContainText(reply);
  await expect(page.locator(".ai-chat-log script")).toHaveCount(0);
  expect(
    requests
      .at(-1)
      .messages.map((m) => m.content)
      .join("\n"),
  ).toContain("Alpha paragraph.");
  fail = true;
  await page.locator("[data-ai-analyze]").click();
  await expect(page.locator(".ai-status")).toContainText(
    /503|unavailable|failed/i,
  );
  await expect(panel()).toHaveAttribute("aria-busy", "false");
  expect(await text()).toBe(editorOriginal);
});

test("AI panel rebuilds in Chinese dark mode and remains usable in a short narrow window", async () => {
  await configure();
  await showPanel();
  await analyze();
  const priorRequests = requests.length;
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { locale: "zh-CN", theme: "dark" }),
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("[data-ai-analyze]")).toHaveText("分析与评分");
  await expect(panel()).toBeVisible();
  await expect(page.locator(".ai-results")).toBeEmpty();
  expect(requests).toHaveLength(priorRequests);
  expect(await text()).toBe(editorOriginal);
  reply = JSON.stringify({
    summary: "文档结构清晰，首段可以进一步明确。",
    overallScore: 82,
    dimensions: [{ name: "清晰度", score: 82, reason: "首段的描述偏笼统。" }],
    suggestions: [
      {
        original: "Alpha paragraph.",
        replacement: "A clearer paragraph.",
        reason: "建议使用更具体的描述。",
      },
    ],
  });
  await analyze();
  await expect(page.locator("[data-ai-accept]")).toHaveText("接受修改");
  await page.screenshot({ path: test.info().outputPath("ai-zh-dark.png") });
  await panel().screenshot({
    path: test.info().outputPath("ai-zh-dark-panel.png"),
  });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(720, 500),
  );
  await expect
    .poll(async () => (await page.locator("#editor-host").boundingBox()).height)
    .toBeGreaterThan(50);
  const dimensions = await panel().boundingBox();
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(dimensions.x + dimensions.width).toBeLessThanOrEqual(
    viewport.width + 1,
  );
  expect(dimensions.y + dimensions.height).toBeLessThanOrEqual(
    viewport.height + 1,
  );
  await expect(page.locator("[data-ai-close]")).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("ai-zh-dark-720x500.png"),
  });
  await page.locator("[data-ai-close]").click();
  await expect(panel()).toBeHidden();
  expect(await text()).toBe(editorOriginal);
});
