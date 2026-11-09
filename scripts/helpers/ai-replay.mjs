import http from "node:http";
import assert from "node:assert/strict";

// The analyses gemini-3.6-flash returned for the built-in welcome documents,
// recorded for the 0.8.0 README. Screenshot scripts replay them from a loopback
// server instead of calling a live service. The welcome documents are
// unchanged since then, so every suggestion still applies.
export const replayModel = "gemini-3.6-flash";
export const welcomeAnalyses = {
  en: {
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

// Serves one analysis the way the Gemini API streams it.
export async function startAnalysisReplay(analysis) {
  const reply = JSON.stringify(analysis);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          models: [
            {
              name: `models/${replayModel}`,
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      );
      return;
    }
    for await (const chunk of req) void chunk;
    if (
      !url.pathname.endsWith(`/models/${replayModel}:streamGenerateContent`)
    ) {
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
  return {
    endpoint: `http://127.0.0.1:${server.address().port}/v1beta`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// Points the app at the replay server, opens the AI panel and analyzes the
// open welcome document.
export async function analyzeWithReplay(page, endpoint, analysis) {
  // A fixture key in a throwaway profile; the loopback server ignores it.
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
    { endpoint, model: replayModel },
  );
  const panel = page.locator("#ai-assistant-host");
  if (!(await panel.isVisible()))
    await page.locator('[data-command="aiAssistant"]').click();
  // Reopening the panel refreshes the model label from the saved settings.
  await page.locator("[data-ai-close]").click();
  await page.locator('[data-command="aiAssistant"]').click();
  await page
    .locator(".ai-model-label")
    .filter({ hasText: replayModel })
    .waitFor();
  await page.locator("[data-ai-analyze]").click();
  await page
    .locator(".ai-overall-score")
    .filter({ hasText: `${analysis.overallScore} / 100` })
    .waitFor();
  await page.locator(".ai-suggestion").first().waitFor();
  assert.equal(
    await page.locator(".ai-suggestion [data-ai-accept]").count(),
    analysis.suggestions.length,
    "every replayed suggestion must still apply to the welcome document",
  );
}
