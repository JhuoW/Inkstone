import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

// Captures the AI Writing Assistant for the README without calling a live
// service: a loopback server replays the analyses gemini-3.6-flash returned for
// the built-in welcome documents (recorded for the 0.8.0 README). The welcome
// documents are unchanged since then, so every suggestion still applies.
const output = path.resolve(
  process.env.INKSTONE_README_IMAGES || "docs/images",
);
const model = "gemini-3.6-flash";
const analyses = {
  en: {
    file: "AI-demo-en.png",
    title: "# A place for your thoughts",
    analysis: {
      summary:
        "The document serves as an engaging and well-structured welcome guide for the Inkstone Markdown editor. It clearly outlines local storage privacy, key features, keyboard shortcuts, formatting options, and support for math and diagrams in a clean, user-friendly tone.",
      overallScore: 93,
      dimensions: [
        {
          name: "Purpose & Audience",
          score: 95,
          reason:
            "The welcome guide effectively introduces new users to Inkstone's capabilities, shortcuts, and core philosophy of local, distraction-free writing.",
        },
        {
          name: "Clarity & Readability",
          score: 90,
          reason:
            "The instructions are easy to follow, using bold text for keyboard shortcuts and practical visual examples for features like math and diagrams.",
        },
        {
          name: "Organization & Coherence",
          score: 95,
          reason:
            "Headings logically segment core topics—from basic editing shortcuts to structural elements and advanced rendering features.",
        },
        {
          name: "Tone & Style",
          score: 92,
          reason:
            "The tone is welcoming, reassuring, and concise, fitting well for a minimalist writing application.",
        },
      ],
      suggestions: [
        {
          original:
            "Click rendered text, formulas or diagrams to edit their source in place.",
          replacement:
            "Click rendered text, formulas, or diagrams to edit their source in place.",
          reason:
            "Adding an Oxford comma improves punctuation consistency across technical feature lists.",
        },
      ],
    },
  },
  "zh-CN": {
    file: "AI-demo-cn.png",
    title: "# 写下值得留下的想法",
    analysis: {
      summary:
        "本文是一篇结构清晰、文风优雅的“墨石 Inkstone”编辑器入门引导文档。文章准确向目标受众传递了“专注写作”与“本地离线存储”的产品核心理念，通过渐进式的结构向用户示范了文本排版、快捷键、表格、数学公式与 Mermaid 图表等丰富功能，兼具实用性与美感。",
      overallScore: 92,
      dimensions: [
        {
          name: "写作目的与受众匹配",
          score: 92,
          reason:
            "精准面向寻找专注写作与 Markdown 工具的用户，文风沉静自然，功能介绍贴合目标受众的使用需求。",
        },
        {
          name: "清晰度与表达",
          score: 90,
          reason:
            "语言简洁明快，操作指引清晰易懂。唯有个别界面操作描述可进一步微调以提升规范性。",
        },
        {
          name: "结构与连贯性",
          score: 94,
          reason:
            "从简单的文字输入到快捷操作，再延伸至复杂排版与公式渲染，内容层层递进，逻辑流转流畅。",
        },
        {
          name: "格式与排版规范",
          score: 95,
          reason:
            "Markdown 语法示范全面且标准，涵盖标题、引用、列表、表格、任务清单、LaTeX 公式及 Mermaid 代码块。",
        },
      ],
      suggestions: [
        {
          original: "使用顶部的「源码」随时查看原文",
          replacement: "使用顶部的「源码」按钮随时查看原文",
          reason: "增加“按钮”二字可使界面指引更加明确规范。",
        },
      ],
    },
  },
};

await fs.mkdir(output, { recursive: true });
for (const [locale, scene] of Object.entries(analyses)) {
  const chinese = locale === "zh-CN";
  const reply = JSON.stringify(scene.analysis);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          models: [
            {
              name: `models/${model}`,
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      );
      return;
    }
    for await (const chunk of req) void chunk;
    if (!url.pathname.endsWith(`/models/${model}:streamGenerateContent`)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    const part = (text) =>
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
    const middle = Math.floor(reply.length / 2);
    res.write(part(reply.slice(0, middle)));
    res.end(
      part(reply.slice(middle)) +
        'data: {"candidates":[{"finishReason":"STOP"}]}\n\n',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/v1beta`;
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "inkstone-readme-ai-"),
  );
  const profile = path.join(directory, "profile");
  await fs.mkdir(profile);
  await fs.writeFile(
    path.join(profile, "settings.json"),
    JSON.stringify({
      locale,
      theme: "light",
      firstRunComplete: true,
      defaultAppPrompted: true,
      autoSave: false,
      spellcheck: false,
      aiPanelOpen: true,
      aiPanelHeight: Number(process.env.INKSTONE_README_AI_HEIGHT) || 525,
    }),
  );
  const env = { ...process.env, INKSTONE_USER_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.INKSTONE_EXECUTABLE
    ? path.resolve(process.env.INKSTONE_EXECUTABLE)
    : undefined;
  let app;
  try {
    app = await electron.launch({
      executablePath,
      args: executablePath ? [] : [process.cwd()],
      env,
      chromiumSandbox: true,
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1675, 1075),
    );
    await page.waitForFunction(
      (title) =>
        window.__inkstone?.editor.getText().startsWith(title) &&
        !__inkstone.editor.view.state.readOnly,
      scene.title,
    );
    // A fixture key in this throwaway profile; the loopback server ignores it.
    await page.evaluate(
      ({ endpoint, model }) =>
        __inkstone.invoke("aiSaveSettings", {
          provider: "gemini",
          endpoint,
          model,
          apiKey: "readme-fixture-key-not-a-real-credential",
          temperature: 0.2,
          maxTokens: 4096,
          timeoutMs: 30000,
        }),
      { endpoint, model },
    );
    if (
      !(await page.evaluate(() =>
        document.body.classList.contains("sidebar-hidden"),
      ))
    )
      await page.evaluate(() => __inkstone.execute("sidebar"));
    const panel = page.locator("#ai-assistant-host");
    if (!(await panel.isVisible()))
      await page.locator('[data-command="aiAssistant"]').click();
    // Reopening the panel refreshes the model label from the saved settings.
    await page.locator("[data-ai-close]").click();
    await page.locator('[data-command="aiAssistant"]').click();
    await page.locator(".ai-model-label").filter({ hasText: model }).waitFor();
    await page.locator("[data-ai-analyze]").click();
    await page
      .locator(".ai-overall-score")
      .filter({ hasText: `${scene.analysis.overallScore} / 100` })
      .waitFor();
    await page.locator(".ai-suggestion").first().waitFor();
    assert.equal(
      await page.locator(".ai-suggestion [data-ai-accept]").count(),
      1,
      "the replayed suggestion must still apply to the welcome document",
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      __inkstone.editor.view.contentDOM.blur();
      __inkstone.editor.view.scrollDOM.scrollTop = 0;
      document.querySelector(".ai-results")?.scrollTo(0, 0);
    });
    await page.mouse.move(0, 0);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, scene.file) });
    console.log(`Captured AI ${chinese ? "zh-CN" : "en"} from the desktop app`);
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
