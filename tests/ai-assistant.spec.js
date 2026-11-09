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
async function setupLocal(dialog = page.locator(".ai-settings-dialog")) {
  await dialog.locator('[name="provider"]').selectOption("lmstudio");
  await dialog.locator('[name="endpoint"]').fill(endpoint);
  await dialog.locator('[name="endpoint"]').press("Tab");
  await dialog.locator("[data-model-list]").click();
  await expect(
    dialog.locator('[name="modelChoice"] option[value="local-reviewer"]'),
  ).toHaveCount(1);
  await expect(dialog.locator('[name="modelChoice"]')).toHaveValue(
    "local-reviewer",
  );
  return dialog;
}

test.beforeEach(async () => {
  requests = [];
  reply = report();
  hold = false;
  fail = false;
  errors = [];
  server = http.createServer(async (req, res) => {
    const requestURL = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && requestURL.pathname.endsWith("/models")) {
      if (requestURL.pathname.includes("/slow/"))
        await new Promise((resolve) => setTimeout(resolve, 800));
      if (res.destroyed) return;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          requestURL.pathname.includes("v1beta")
            ? {
                models: [
                  {
                    name: "models/gemini-3.8-flash",
                    supportedGenerationMethods: ["generateContent"],
                  },
                  {
                    name: "models/gemini-embedding-001",
                    supportedGenerationMethods: ["embedContent"],
                  },
                ],
              }
            : { data: [{ id: "local-reviewer" }] },
        ),
      );
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
    const gemini = requestURL.pathname.includes(":streamGenerateContent");
    const delta = (value) =>
      res.write(
        `data: ${JSON.stringify(gemini ? { candidates: [{ content: { parts: [{ text: value }] } }] } : { choices: [{ delta: { content: value } }] })}\n\n`,
      );
    if (hold) {
      delta("Reviewing the document…");
      return;
    }
    const content = JSON.stringify(body.messages || body.contents).includes(
      "Connection test.",
    )
      ? "Ready"
      : reply;
    delta(content.slice(0, 12));
    setTimeout(() => {
      if (!res.destroyed) {
        delta(content.slice(12));
        res.end(
          gemini
            ? 'data: {"candidates":[{"finishReason":"STOP"}]}\n\n'
            : "data: [DONE]\n\n",
        );
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
  // Keep the stack so an intermittent renderer error can be located.
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
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
  const dialog = await setupLocal();
  const before = await page.evaluate(() => __inkstone.invoke("aiGetSettings"));
  await dialog.locator("[data-model-test]").click();
  await expect(dialog.locator(".ai-settings-status")).toContainText(
    "Connection successful",
  );
  const afterTest = await page.evaluate(() =>
    __inkstone.invoke("aiGetSettings"),
  );
  expect(afterTest.provider).toBe(before.provider);
  expect(afterTest.model).toBe(before.model);
  const key = "test-fixture-key-not-a-real-credential";
  if (before.secureStorageAvailable) {
    await dialog.locator('[name="apiKey"]').fill(key);
  }
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  const settings = await page.evaluate(() =>
    __inkstone.invoke("aiGetSettings"),
  );
  expect(settings.model).toBe("local-reviewer");
  expect(settings.provider).toBe("lmstudio");
  expect(settings.ready).toBe(true);
  if (before.secureStorageAvailable) {
    expect(settings.hasKey).toBe(true);
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
  await page.locator("[data-ai-configure]").click();
  await expect(dialog.locator('[name="apiKey"]')).toHaveValue("");
  await expect(dialog.locator('[name="provider"]')).toHaveValue("lmstudio");
  await expect(dialog.locator('[name="endpoint"]')).toHaveValue(endpoint);
  await dialog.locator("[data-model-dismiss]").click();
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
  // Editing elsewhere keeps the suggestion applicable.
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({ anchor: e.view.state.doc.length });
    e.insert("\n\nA new closing line.");
  });
  await expect(page.locator("[data-ai-accept]")).toBeEnabled();
  // Editing the quoted passage itself makes the suggestion outdated.
  await page.evaluate(() => {
    const e = __inkstone.editor;
    const from = e.view.state.doc.toString().indexOf("Alpha");
    e.setSelection({ anchor: from, head: from + "Alpha paragraph.".length });
    e.insert("Changed");
  });
  await expect(page.locator("[data-ai-accept]")).toHaveCount(0);
  await expect(page.locator(".ai-suggestion")).toHaveAttribute(
    "data-state",
    "stale",
  );
  expect(await text()).not.toContain("A clearer paragraph.");
});

test("accepting one suggestion keeps the others; accept all and revert work with undo", async () => {
  await configure();
  await showPanel();
  reply = JSON.stringify({
    summary: "Two sentences can be clearer.",
    overallScore: 76,
    dimensions: [{ name: "Clarity", score: 76, reason: "Two vague phrases." }],
    suggestions: [
      {
        original: "# Review",
        replacement: "# Review notes",
        reason: "A more specific heading.",
      },
      {
        original: "Alpha paragraph.",
        replacement: "A clearer paragraph.",
        reason: "Use a more specific description.",
      },
      {
        original: "unchanged.",
        replacement: "unchanged throughout.",
        reason: "State the scope.",
      },
    ],
  });
  await page.locator("[data-ai-analyze]").click();
  await expect(page.locator(".ai-overall-score")).toHaveText("76 / 100");
  await expect(page.locator("[data-ai-accept]")).toHaveCount(3);
  await expect(page.locator("[data-ai-accept-all]")).toHaveText(
    "Accept all (3)",
  );
  // Accept the middle suggestion; the other two remain applicable.
  await page
    .locator(".ai-suggestion")
    .nth(1)
    .locator("[data-ai-accept]")
    .click();
  await expect
    .poll(text)
    .toBe(editorOriginal.replace("Alpha paragraph.", "A clearer paragraph."));
  await expect(page.locator(".ai-suggestion").nth(1)).toHaveAttribute(
    "data-state",
    "applied",
  );
  await expect(page.locator("[data-ai-accept]")).toHaveCount(2);
  await page
    .locator('.ai-suggestion[data-state="applied"] .ai-suggestion-actions')
    .scrollIntoViewIfNeeded();
  await panel().screenshot({
    path: test.info().outputPath("ai-suggestion-states.png"),
  });
  // Manual typing elsewhere does not invalidate them either.
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({ anchor: e.view.state.doc.length });
    e.insert("Closing.");
  });
  await expect(page.locator("[data-ai-accept]")).toHaveCount(2);
  await page.locator("[data-ai-accept-all]").click();
  const accepted = editorOriginal
    .replace("# Review", "# Review notes")
    .replace("Alpha paragraph.", "A clearer paragraph.")
    .replace("unchanged.", "unchanged throughout.");
  await expect.poll(text).toBe(accepted + "Closing.");
  await expect(page.locator("[data-ai-accept]")).toHaveCount(0);
  // One undo step removes the whole batch; the batch cards become pending again.
  await page.keyboard.press("Control+z");
  await expect
    .poll(text)
    .toBe(
      editorOriginal.replace("Alpha paragraph.", "A clearer paragraph.") +
        "Closing.",
    );
  await expect(page.locator("[data-ai-accept]")).toHaveCount(2);
  // Revert restores the original passage of a single applied suggestion.
  await expect(page.locator("[data-ai-revert]")).toHaveCount(1);
  await page.locator("[data-ai-revert]").click();
  await expect.poll(text).toBe(editorOriginal + "Closing.");
  await expect(page.locator("[data-ai-accept]")).toHaveCount(3);
  await page.evaluate(() => __inkstone.execute("save"));
  expect(await fs.readFile(file, "utf8")).toBe(
    original.replace(/\r\n$/, "\r\nClosing."),
  );
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
  // Server errors are retried twice (about 5.5 s) and the wait is visible.
  await expect(page.locator(".ai-status")).toContainText(
    "Provider busy; retrying (1/2)",
  );
  await expect(page.locator(".ai-status")).toContainText(
    /503|unavailable|failed/i,
    { timeout: 15000 },
  );
  await expect(panel()).toHaveAttribute("aria-busy", "false");
  expect(await text()).toBe(editorOriginal);
});

test("Chinese UI translates provider errors and chat replies insert at the cursor as one undo step", async () => {
  await configure();
  await page.evaluate(() =>
    __inkstone.invoke("updateSettings", { locale: "zh-CN" }),
  );
  await expect(page.locator("[data-ai-analyze]")).toHaveText("分析与评分");
  await showPanel();
  fail = true;
  await page.locator("[data-ai-analyze]").click();
  await expect(page.locator(".ai-status")).toContainText("服务繁忙，正在重试");
  await expect(page.locator(".ai-status")).toContainText(
    "模型服务返回 HTTP 503",
    { timeout: 15000 },
  );
  await expect(page.locator(".ai-status")).not.toContainText("Provider");
  // Desktop errors outside the AI panel are translated as well.
  const message = await page.evaluate(() =>
    __inkstone.invoke("fileOperation", { action: "unsupported" }).then(
      () => "",
      (error) => error.message,
    ),
  );
  expect(message).not.toContain("Error invoking remote method");
  expect(message).toMatch(/[一-鿿]/);
  fail = false;
  reply = "建议在开头说明研究目的。";
  await page.locator("#ai-chat-question").fill("开头如何改进？");
  await page.locator(".ai-chat-form button[type=submit]").click();
  await expect(page.locator(".ai-chat-log")).toContainText(reply);
  await page.evaluate(() => {
    const e = __inkstone.editor;
    e.setSelection({ anchor: e.view.state.doc.length });
  });
  await page.locator("[data-ai-insert]").click();
  await expect.poll(text).toBe(editorOriginal + reply);
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(editorOriginal);
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

test("provider choices populate distinct official endpoints and default models without saving drafts", async () => {
  await showPanel();
  await page.locator("[data-ai-configure]").click();
  const dialog = page.locator(".ai-settings-dialog");
  const before = await page.evaluate(() => __inkstone.invoke("aiGetSettings"));
  await expect(dialog.locator('[name="provider"] option')).toHaveCount(11);
  for (const [provider, url] of [
    ["openai", "https://api.openai.com/v1"],
    ["anthropic", "https://api.anthropic.com/v1"],
    ["gemini", "https://generativelanguage.googleapis.com/v1beta"],
    ["qwen", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"],
    ["deepseek", "https://api.deepseek.com"],
    ["xai", "https://api.x.ai/v1"],
    ["mistral", "https://api.mistral.ai/v1"],
    ["groq", "https://api.groq.com/openai/v1"],
    ["ollama", "http://127.0.0.1:11434/v1"],
    ["lmstudio", "http://127.0.0.1:1234/v1"],
    ["custom", ""],
  ]) {
    await dialog.locator('[name="provider"]').selectOption(provider);
    await expect(dialog.locator('[name="endpoint"]')).toHaveValue(url);
    await expect(dialog.locator('[name="endpoint"]')).toBeEditable();
    if (!["ollama", "lmstudio", "custom"].includes(provider)) {
      const selected = await dialog
        .locator('[name="modelChoice"]')
        .inputValue();
      expect(selected).not.toBe("");
      expect(selected).not.toBe("__custom__");
    }
  }
  await dialog.locator('[name="provider"]').selectOption("gemini");
  await expect(dialog.locator('[name="modelChoice"]')).toHaveValue(
    "gemini-3.6-flash",
  );
  await expect(
    dialog.locator('[name="modelChoice"] option[value="gemini-3.6-flash"]'),
  ).toHaveCount(1);
  await dialog
    .locator('[name="endpoint"]')
    .fill("http://127.0.0.1:55555/proxy/v1beta");
  await dialog.locator('[name="endpoint"]').press("Tab");
  await dialog.locator('[name="modelChoice"]').selectOption("__custom__");
  await dialog.locator('[name="model"]').fill("new-custom-model");
  await dialog.locator('[name="provider"]').selectOption("deepseek");
  await dialog.locator('[name="provider"]').selectOption("gemini");
  await expect(dialog.locator('[name="endpoint"]')).toHaveValue(
    "http://127.0.0.1:55555/proxy/v1beta",
  );
  await expect(dialog.locator('[name="model"]')).toHaveValue(
    "new-custom-model",
  );
  await dialog.locator("[data-model-dismiss]").click();
  const after = await page.evaluate(() => __inkstone.invoke("aiGetSettings"));
  expect(after.provider).toBe(before.provider);
  expect(after.endpoint).toBe(before.endpoint);
  expect(after.model).toBe(before.model);
  expect(requests).toHaveLength(0);
});

test("first-use analysis opens setup, tests and saves, then resumes the original analysis", async () => {
  await showPanel();
  await page.locator("[data-ai-analyze]").click();
  const dialog = page.locator(".ai-settings-dialog");
  await expect(dialog).toBeVisible();
  await setupLocal(dialog);
  expect(requests).toHaveLength(0);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ai-overall-score")).toHaveText("82 / 100");
  expect(requests).toHaveLength(2);
  expect(requests[0].messages.map((m) => m.content).join("\n")).toContain(
    "Connection test.",
  );
  expect(requests[0].messages.map((m) => m.content).join("\n")).not.toContain(
    "Alpha paragraph.",
  );
  expect(requests[1].messages.map((m) => m.content).join("\n")).toContain(
    "Alpha paragraph.",
  );
  expect(await text()).toBe(editorOriginal);
});

test("cancelled setup preserves the pending chat; a later successful setup resumes it once", async () => {
  await showPanel();
  const question = "How can I clarify the introduction?";
  await page.locator("#ai-chat-question").fill(question);
  await page.locator(".ai-chat-form button").click();
  const dialog = page.locator(".ai-settings-dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#ai-chat-question")).toHaveValue(question);
  await expect(page.locator(".ai-chat-form button")).toBeEnabled();
  await expect(page.locator(".ai-chat-log")).toBeEmpty();
  await expect(page.locator(".ai-status")).toBeEmpty();
  expect(requests).toHaveLength(0);
  await page.locator(".ai-chat-form button").click();
  await setupLocal(dialog);
  reply = "Make the opening more specific.";
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ai-chat-log")).toContainText(reply);
  await expect(page.locator("#ai-chat-question")).toHaveValue("");
  expect(requests).toHaveLength(2);
  expect(requests[1].messages.at(-1).content).toBe(question);
  expect(await text()).toBe(editorOriginal);
});

test("setup never submits an old document after the editor changes while configuring", async () => {
  await showPanel();
  await page.locator("[data-ai-analyze]").click();
  const dialog = await setupLocal();
  await page.evaluate(() =>
    __inkstone.loadDocument({
      ...__inkstone.getDocument(),
      path: null,
      text: "A different document.",
    }),
  );
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ai-status")).toContainText("document changed");
  await expect(page.locator(".ai-results")).toBeEmpty();
  expect(requests).toHaveLength(1);
  expect(await text()).toBe("A different document.");
});

test("failed and cancelled setup tests leave saved configuration and document untouched", async () => {
  await showPanel();
  await page.locator("[data-ai-analyze]").click();
  const dialog = await setupLocal();
  const before = await page.evaluate(() => __inkstone.invoke("aiGetSettings"));
  fail = true;
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.locator(".ai-settings-status")).toContainText("503", {
    timeout: 15000,
  });
  await expect(dialog).toBeVisible();
  fail = false;
  hold = true;
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.locator("[data-model-cancel]")).toBeVisible();
  await dialog.locator("[data-model-cancel]").click();
  await dialog.locator("[data-model-dismiss]").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-ai-analyze]")).toBeEnabled();
  const after = await page.evaluate(() => __inkstone.invoke("aiGetSettings"));
  expect(after.provider).toBe(before.provider);
  expect(after.model).toBe(before.model);
  expect(after.ready).toBe(false);
  expect(await text()).toBe(editorOriginal);
});

test("AI entrance stays centered in the free titlebar area across locales, themes and constrained widths", async () => {
  const win = await application.browserWindow(page);
  for (const locale of ["en", "zh-CN"])
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (patch) => __inkstone.invoke("updateSettings", patch),
        { locale, theme },
      );
      for (const [width, height, sidebarWidth, zoom] of [
        [1280, 800, 256, 1],
        [720, 600, 500, 1],
        [800, 800, 256, 1.5],
      ]) {
        await page.evaluate(
          (patch) => __inkstone.invoke("updateSettings", patch),
          { sidebarWidth },
        );
        await win.evaluate(
          (w, size) => {
            w.webContents.setZoomFactor(size.zoom);
            w.setContentSize(size.width, size.height);
          },
          { width, height, zoom },
        );
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const entry = page.locator(".ai-launcher");
        await expect(entry).toHaveText(
          locale === "en" ? "AI Writing Assistant" : "AI写作助手",
        );
        const boxes = await page.evaluate(() => {
          const box = (selector) => {
            const b = document.querySelector(selector).getBoundingClientRect();
            return { x: b.x, y: b.y, right: b.right, width: b.width };
          };
          return {
            width: innerWidth,
            main: box("#main"),
            slot: box(".ai-entry-slot"),
            ai: box(".ai-launcher"),
            commands: box(".command-launcher"),
          };
        });
        expect(
          Math.abs(
            boxes.ai.x +
              boxes.ai.width / 2 -
              boxes.slot.x -
              boxes.slot.width / 2,
          ),
        ).toBeLessThan(1);
        expect(boxes.ai.x).toBeGreaterThanOrEqual(boxes.main.x);
        expect(boxes.commands.right).toBeLessThanOrEqual(boxes.width + 1);
        expect(boxes.ai.right).toBeLessThanOrEqual(boxes.commands.x);
        await entry.focus();
        await page.keyboard.press("Enter");
        await expect(entry).toHaveAttribute("aria-expanded", "true");
        await expect(panel()).toBeVisible();
        await page.locator("[data-ai-close]").click();
        await expect(entry).toHaveAttribute("aria-expanded", "false");
      }
    }
  expect(await text()).toBe(editorOriginal);
});

test("account model discovery replaces unavailable defaults and native Gemini analysis works", async () => {
  const settings = await page.evaluate(() =>
    __inkstone.invoke("aiGetSettings"),
  );
  test.skip(
    !settings.secureStorageAvailable,
    "OS secure storage is required to save this fixture key",
  );
  await showPanel();
  await page.locator("[data-ai-analyze]").click();
  const dialog = page.locator(".ai-settings-dialog");
  await dialog.locator('[name="provider"]').selectOption("gemini");
  await dialog
    .locator('[name="endpoint"]')
    .fill(endpoint.replace("/v1", "/v1beta"));
  await dialog.locator('[name="endpoint"]').press("Tab");
  await dialog
    .locator('[name="apiKey"]')
    .fill("fixture-gemini-key-not-a-real-key");
  await dialog.locator('[name="apiKey"]').press("Tab");
  await expect(dialog.locator('[name="modelChoice"]')).toHaveValue(
    "gemini-3.8-flash",
  );
  await expect(
    dialog.locator('[name="modelChoice"] option[value="gemini-embedding-001"]'),
  ).toHaveCount(0);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ai-overall-score")).toHaveText("82 / 100");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toHaveProperty("systemInstruction");
  expect(requests[1].contents[0].parts[0].text).toContain("Alpha paragraph.");
  expect(requests[1].generationConfig.responseMimeType).toBe(
    "application/json",
  );
});

test("changing an endpoint clears a typed key before Enter can submit it", async () => {
  await showPanel();
  await page.locator("[data-ai-configure]").click();
  const dialog = page.locator(".ai-settings-dialog");
  await dialog.locator('[name="provider"]').selectOption("gemini");
  await dialog
    .locator('[name="endpoint"]')
    .fill(endpoint.replace("/v1", "/v1beta"));
  await dialog.locator('[name="endpoint"]').press("Tab");
  await dialog
    .locator('[name="apiKey"]')
    .fill("fixture-key-bound-to-the-first-endpoint");
  await dialog
    .locator('[name="endpoint"]')
    .fill(endpoint.replace("/v1", "/different/v1beta"));
  await expect(dialog.locator('[name="apiKey"]')).toHaveValue("");
  await dialog.locator('[name="endpoint"]').press("Enter");
  await expect(dialog.locator(".ai-settings-status")).toContainText("API key");
  expect(requests).toHaveLength(0);
  await dialog.locator("[data-model-dismiss]").click();
});

test("switching provider discards a delayed model list from the previous server", async () => {
  await showPanel();
  await page.locator("[data-ai-configure]").click();
  const dialog = page.locator(".ai-settings-dialog");
  await dialog.locator('[name="provider"]').selectOption("lmstudio");
  await dialog
    .locator('[name="endpoint"]')
    .fill(endpoint.replace("/v1", "/slow/v1"));
  await dialog.locator('[name="endpoint"]').press("Tab");
  await expect(dialog.locator(".ai-model-list-status")).toContainText(
    "Loading available models",
  );
  await dialog.locator('[name="provider"]').selectOption("openai");
  await page.waitForTimeout(1000); // Allow the intentionally delayed old response to arrive.
  await expect(
    dialog.locator('[name="modelChoice"] option[value="local-reviewer"]'),
  ).toHaveCount(0);
  await expect(dialog.locator('[name="endpoint"]')).toHaveValue(
    "https://api.openai.com/v1",
  );
  await expect(dialog.locator('[name="modelChoice"]')).not.toHaveValue(
    "__custom__",
  );
  await dialog.locator("[data-model-dismiss]").click();
});

test("a saved model is preserved when a refreshed account list no longer includes it", async () => {
  await page.evaluate(
    (endpoint) =>
      __inkstone.invoke("aiSaveSettings", {
        provider: "lmstudio",
        endpoint,
        model: "previously-saved-model",
      }),
    endpoint,
  );
  await showPanel();
  await page.locator("[data-ai-configure]").click();
  const dialog = page.locator(".ai-settings-dialog");
  await expect(
    dialog.locator('[name="modelChoice"] option[value="local-reviewer"]'),
  ).toHaveCount(1);
  await expect(dialog.locator('[name="modelChoice"]')).toHaveValue(
    "__custom__",
  );
  await expect(dialog.locator('[name="model"]')).toHaveValue(
    "previously-saved-model",
  );
  await expect(dialog.locator(".ai-model-list-status")).toContainText(
    /not.*list|not.*returned|not.*available/i,
  );
  await dialog.locator("[data-model-dismiss]").click();
  expect(
    (await page.evaluate(() => __inkstone.invoke("aiGetSettings"))).model,
  ).toBe("previously-saved-model");
});

for (const provider of ["gemini", "lmstudio"])
  test(`${provider} saved credentials can be removed without calling an unauthenticated model`, async () => {
    const settings = await page.evaluate(() =>
      __inkstone.invoke("aiGetSettings"),
    );
    test.skip(
      !settings.secureStorageAvailable,
      "OS secure storage required for fixture key",
    );
    await page.evaluate(
      ({ provider, endpoint }) =>
        __inkstone.invoke("aiSaveSettings", {
          provider,
          endpoint,
          model: "local-reviewer",
          apiKey: "fixture-removable-key",
        }),
      { provider, endpoint },
    );
    await showPanel();
    await page.locator("[data-ai-configure]").click();
    const dialog = page.locator(".ai-settings-dialog");
    await dialog.locator('[name="clearKey"]').check();
    await expect(dialog.locator("[data-model-test]")).toBeDisabled();
    await expect(dialog.locator('button[type="submit"]')).toHaveText(
      "Remove key",
    );
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toHaveCount(0);
    const result = await page.evaluate(() =>
      __inkstone.invoke("aiGetSettings"),
    );
    expect(result.hasKey).toBe(false);
    if (provider === "gemini") expect(result.ready).toBe(false);
    expect(requests).toHaveLength(0);
    expect(await text()).toBe(editorOriginal);
  });
