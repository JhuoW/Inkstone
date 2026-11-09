import { showAIModelSettings } from "./ai-model-settings.js";
import { icon } from "./ui.js";
import "./ai-assistant.css";
import { resolveAIRevision, boundAIHistory } from "./ai-revisions.js";

export function createAIAssistant({
  host,
  invoke,
  on,
  getContext,
  applyRevision,
  locate,
  saveLayout,
  t,
  onConfigure,
  initialLayout = {},
}) {
  let open = Boolean(initialLayout.open ?? initialLayout.aiPanelOpen);
  let height =
    Number(initialLayout.height ?? initialLayout.aiPanelHeight) || 260;
  let active = null,
    preparing = null,
    snapshot = null,
    history = [],
    disposed = false,
    applying = false;
  let contextIdentity,
    contextText,
    frame = 0;
  host.className = "ai-assistant";
  host.setAttribute("aria-label", t("AI写作助手", "AI Writing Assistant"));
  host.innerHTML = `<div class="ai-resizer" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${t("AI 面板高度", "AI panel height")}"></div>
    <header class="ai-header"><strong>${t("AI写作助手", "AI Writing Assistant")}</strong><span class="ai-model-label">${t("按需分析当前文档", "Review the current document on demand")}</span><button type="button" data-ai-clear-chat>${t("清空对话", "Clear chat")}</button><button type="button" data-ai-configure>${t("模型", "Models")}</button><button type="button" data-ai-close class="icon-button" aria-label="${t("收起 AI 面板", "Hide AI panel")}">${icon.close}</button></header>
    <div class="ai-controls"><label><span class="sr-only">${t("分析范围", "Analysis scope")}</span><select data-ai-scope><option value="document">${t("整篇文档", "Whole document")}</option><option value="selection">${t("选中段落", "Selection")}</option></select></label><label><span class="sr-only">${t("文档类型", "Document type")}</span><select data-ai-type><option value="general">${t("一般写作", "General writing")}</option><option value="academic">${t("学术论文", "Academic paper")}</option><option value="technical">${t("技术文档", "Technical document")}</option></select></label><button type="button" data-ai-analyze class="primary">${t("分析与评分", "Analyze & score")}</button><button type="button" data-ai-cancel hidden>${t("取消", "Cancel")}</button><span class="ai-status" role="status" aria-live="polite"></span></div>
    <div class="ai-content" tabindex="0"><p class="ai-empty">${t("分析结构、逻辑与表达，或就当前文档提问。建议需由你确认后应用；AI 可能出错，请核实事实与引用。", "Review structure, reasoning and clarity, or ask about your document. You decide which revisions to apply. AI can make mistakes; verify facts and references.")}</p><div class="ai-results"></div><div class="ai-chat-log"></div><pre class="ai-stream" hidden></pre></div>
    <form class="ai-chat-form"><label class="sr-only" for="ai-chat-question">${t("询问当前文档", "Ask about this document")}</label><textarea id="ai-chat-question" rows="1" maxlength="8000" placeholder="${t("询问当前文档…", "Ask about this document…")}"></textarea><button type="submit">${t("发送", "Send")}</button></form>`;
  const $ = (selector) => host.querySelector(selector);
  const status = (value) => {
    $(".ai-status").textContent = value;
  };
  const current = () => getContext();
  const fresh = (candidate = snapshot) => {
    const context = current();
    return (
      !!candidate &&
      context.identity === candidate.identity &&
      context.text === candidate.text
    );
  };
  const persist = () =>
    Promise.resolve(
      saveLayout?.({ aiPanelOpen: open, aiPanelHeight: Math.round(height) }),
    ).catch((error) => status(error.message));
  function size() {
    if (disposed) return;
    const available = host.parentElement?.clientHeight || 600;
    const maximum = Math.min(1200, Math.max(100, available - 100));
    const actual = Math.min(Math.max(120, height), maximum);
    host.style.height = actual + "px";
    $(".ai-resizer").setAttribute("aria-valuenow", String(Math.round(actual)));
    $(".ai-resizer").setAttribute("aria-valuemin", "100");
    $(".ai-resizer").setAttribute("aria-valuemax", String(Math.round(maximum)));
  }
  function busy(value) {
    $("[data-ai-analyze]").disabled = value;
    $(".ai-chat-form button").disabled = value;
    $("[data-ai-cancel]").hidden = !value;
    host.setAttribute("aria-busy", String(value));
  }
  function cancel(note = t("已取消", "Cancelled")) {
    preparing = null;
    const request = active;
    active = null;
    if (request) void invoke("aiCancel", { id: request.id }).catch(() => {});
    busy(false);
    $(".ai-stream").hidden = true;
    if (request) status(note);
  }
  function clearResults() {
    $(".ai-results").replaceChildren();
    $(".ai-chat-log").replaceChildren();
    $(".ai-stream").textContent = "";
    $(".ai-stream").hidden = true;
    snapshot = null;
    history = [];
    $(".ai-empty").hidden = false;
  }
  function updateContext() {
    if (disposed || (!active && !snapshot && !history.length)) return;
    const context = current();
    if (context.identity !== contextIdentity || context.text !== contextText) {
      cancel(t("文档已变化，分析已停止", "Document changed; analysis stopped"));
      clearResults();
      status(t("文档已变化，请重新分析", "Document changed. Analyze again."));
      contextIdentity = context.identity;
      contextText = context.text;
    }
    host.querySelectorAll("[data-ai-accept]").forEach((button) => {
      button.disabled = Boolean(context.readOnly) || applying;
    });
  }
  function updateModelLabel() {
    void invoke("aiGetSettings")
      .then((settings) => {
        if (disposed) return;
        const provider = settings.providers?.find(
          (item) => item.id === settings.provider,
        );
        $(".ai-model-label").textContent =
          `${provider?.label || (settings.provider === "local" ? t("本地", "Local") : settings.provider)} · ${settings.model || t("未配置模型", "No model configured")}`;
      })
      .catch(() => {});
  }
  function setOpen(value, save = true) {
    open = Boolean(value);
    host.hidden = !open;
    if (open) {
      size();
      updateContext();
      updateModelLabel();
    } else cancel();
    if (save) void persist();
    return open;
  }
  function showError(error) {
    status(error?.message || String(error));
  }
  function appendChat(role, text) {
    const article = document.createElement("article");
    article.className = "ai-chat-message";
    const label = document.createElement("strong");
    label.textContent = role === "user" ? t("你", "You") : "AI";
    const content = document.createElement("p");
    content.textContent = text;
    article.append(label, content);
    $(".ai-chat-log").append(article);
    while ($(".ai-chat-log").children.length > 20)
      $(".ai-chat-log").firstChild.remove();
  }
  function renderAnalysis(text, request) {
    let report;
    try {
      report = JSON.parse(
        text.replace(/^\s*```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, ""),
      );
    } catch {
      throw Error(
        t(
          "模型没有返回有效的分析格式。请换用支持结构化输出的模型后重试。",
          "The model did not return a valid analysis. Try a model supporting structured output.",
        ),
      );
    }
    const results = $(".ai-results");
    results.replaceChildren();
    const intro = document.createElement("div");
    intro.className = "ai-summary";
    const overall = Number(report.overallScore);
    const score = document.createElement("strong");
    score.className = "ai-overall-score";
    score.textContent =
      Number.isFinite(overall) && overall >= 0 && overall <= 100
        ? `${overall} / 100`
        : t("未评分", "Not scored");
    const summary = document.createElement("p");
    summary.textContent = String(report.summary || "");
    intro.append(score, summary);
    results.append(intro);
    const dimensions = document.createElement("div");
    dimensions.className = "ai-dimensions";
    for (const dimension of (Array.isArray(report.dimensions)
      ? report.dimensions
      : []
    ).slice(0, 12)) {
      const item = document.createElement("div");
      const name = document.createElement("strong");
      const score = Number(dimension.score);
      name.textContent = `${String(dimension.name || "")} · ${Number.isFinite(score) && score >= 0 && score <= 100 ? score : "—"}/100`;
      const reason = document.createElement("p");
      reason.textContent = String(dimension.reason || "");
      item.append(name, reason);
      dimensions.append(item);
    }
    results.append(dimensions);
    for (const suggestion of (Array.isArray(report.suggestions)
      ? report.suggestions
      : []
    ).slice(0, 30)) {
      const revision = resolveAIRevision(request.snapshot, suggestion);
      const card = document.createElement("article");
      card.className = "ai-suggestion";
      const reason = document.createElement("p");
      reason.textContent = String(suggestion.reason || "");
      const diff = document.createElement("div");
      diff.className = "ai-diff";
      for (const [label, value, kind] of [
        [t("原文", "Original"), suggestion.original, "original"],
        [t("建议", "Suggested"), suggestion.replacement, "replacement"],
      ]) {
        const block = document.createElement("div");
        block.className = `ai-diff-${kind}`;
        const heading = document.createElement("strong");
        heading.textContent = label;
        const source = document.createElement("pre");
        source.textContent = String(value ?? "");
        block.append(heading, source);
        diff.append(block);
      }
      card.append(reason, diff);
      const actions = document.createElement("div");
      actions.className = "ai-suggestion-actions";
      if (revision) {
        const line = document.createElement("span");
        line.textContent =
          t("第 ", "Line ") +
          request.snapshot.text.slice(0, revision.from).split("\n").length;
        actions.append(line);
        const jump = document.createElement("button");
        jump.type = "button";
        jump.textContent = t("定位", "Locate");
        jump.onclick = () => {
          if (!fresh(request.snapshot)) {
            updateContext();
            return;
          }
          Promise.resolve(locate(revision)).catch(showError);
        };
        const accept = document.createElement("button");
        accept.type = "button";
        accept.dataset.aiAccept = "";
        accept.textContent = t("接受修改", "Accept revision");
        accept.disabled = Boolean(current().readOnly);
        accept.onclick = async () => {
          if (applying) return;
          if (!fresh(request.snapshot)) {
            updateContext();
            return;
          }
          if (current().readOnly) {
            status(t("文档为只读", "Document is read-only"));
            return;
          }
          applying = true;
          accept.disabled = true;
          try {
            await applyRevision(revision);
            updateContext();
            status(
              t(
                "修改已应用，可撤销。请重新分析更新后的文档。",
                "Revision applied; undo is available. Analyze the updated document again.",
              ),
            );
          } catch (error) {
            showError(error);
          } finally {
            applying = false;
            if (accept.isConnected)
              accept.disabled = Boolean(current().readOnly);
          }
        };
        actions.append(jump, accept);
      } else {
        const note = document.createElement("span");
        note.textContent = t(
          "原文无法唯一定位，仅供参考",
          "Passage cannot be uniquely located; review manually",
        );
        actions.append(note);
      }
      const reject = document.createElement("button");
      reject.type = "button";
      reject.textContent = t("忽略", "Dismiss");
      reject.onclick = () => card.remove();
      actions.append(reject);
      card.append(actions);
      results.append(card);
    }
  }
  async function start(task, question = "") {
    if (active || preparing || disposed) return false;
    updateContext();
    const context = current();
    const documentType = $("[data-ai-type]").value;
    const selection = $("[data-ai-scope]").value === "selection";
    const from = selection
      ? Math.min(context.selection.from, context.selection.to)
      : 0;
    const to = selection
      ? Math.max(context.selection.from, context.selection.to)
      : context.text.length;
    if (from === to) {
      status(
        t(
          "请先选择文字或打开有内容的文档",
          "Select text or open a nonempty document first",
        ),
      );
      return;
    }
    if (context.text.slice(from, to).length > 200000) {
      status(
        t(
          "分析范围过长，请选择较短段落",
          "Context is too long. Select a shorter passage.",
        ),
      );
      return;
    }
    const pending = {};
    preparing = pending;
    $("[data-ai-analyze]").disabled = true;
    $(".ai-chat-form button").disabled = true;
    try {
      const settings = await invoke("aiGetSettings");
      if (disposed || preparing !== pending) return false;
      if (!settings.ready) {
        status(
          t(
            "配置模型后将继续当前操作",
            "Set up a model to continue this request",
          ),
        );
        const configured = await configure({ required: true });
        if (disposed || preparing !== pending) return false;
        if (!configured) {
          status("");
          return false;
        }
      }
      if (
        current().identity !== context.identity ||
        current().text !== context.text
      ) {
        status(
          t(
            "文档已变化，请重新发起分析或提问",
            "The document changed. Start the analysis or question again.",
          ),
        );
        return false;
      }
    } catch (error) {
      if (!disposed && preparing === pending) showError(error);
      return false;
    } finally {
      if (preparing === pending) {
        preparing = null;
        if (!disposed) busy(false);
      }
    }
    if (disposed || !open) return false;
    updateModelLabel();
    contextIdentity = context.identity;
    contextText = context.text;
    snapshot = {
      identity: context.identity,
      text: context.text,
      source: context.text.slice(from, to),
      offset: from,
    };
    const id = crypto.randomUUID();
    active = { id, task, snapshot, text: "", question };
    const request = active;
    busy(true);
    $(".ai-empty").hidden = true;
    $(".ai-stream").textContent = "";
    $(".ai-stream").hidden = false;
    status(t("正在分析…", "Working…"));
    if (task === "analysis") $(".ai-results").replaceChildren();
    if (task === "chat") appendChat("user", question);
    try {
      await invoke("aiStart", {
        id,
        task,
        text: snapshot.source,
        documentType,
        locale: t("zh-CN", "en"),
        question,
        history: boundAIHistory(history),
      });
    } catch (error) {
      if (active === request) {
        active = null;
        busy(false);
        $(".ai-stream").hidden = true;
        showError(error);
      }
      return false;
    }
    return true;
  }
  const unsubscribe = on("ai-response", (event) => {
    const request = active;
    if (!request || event.id !== request.id || disposed) return;
    if (!fresh(request.snapshot)) {
      updateContext();
      return;
    }
    if (event.type === "delta") {
      request.text += String(event.text || "");
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (active === request) $(".ai-stream").textContent = request.text;
        });
      return;
    }
    active = null;
    busy(false);
    $(".ai-stream").hidden = true;
    if (event.type === "error") {
      status(event.message || t("模型请求失败", "Model request failed"));
      return;
    }
    if (event.type !== "done") return;
    try {
      const text = typeof event.text === "string" ? event.text : request.text;
      if (request.task === "analysis") renderAnalysis(text, request);
      else {
        appendChat("assistant", text);
        history.push(
          { role: "user", content: request.question },
          { role: "assistant", content: text },
        );
        history = boundAIHistory(history);
      }
      status(
        t("完成 · AI 评价仅供参考", "Complete · AI assessments are advisory"),
      );
    } catch (error) {
      showError(error);
    }
  });
  function configure(options = {}) {
    return onConfigure
      ? onConfigure(options)
      : showAIModelSettings({ invoke, t, ...options });
  }
  $("[data-ai-configure]").onclick = () => {
    cancel();
    Promise.resolve(configure()).then(updateModelLabel).catch(showError);
  };
  $("[data-ai-clear-chat]").onclick = () => {
    if (active?.task === "chat") cancel();
    history = [];
    $(".ai-chat-log").replaceChildren();
    status(t("对话已清空", "Chat cleared"));
  };
  $("[data-ai-close]").onclick = () => setOpen(false);
  $("[data-ai-analyze]").onclick = () => void start("analysis");
  $("[data-ai-cancel]").onclick = () => cancel();
  $(".ai-chat-form").onsubmit = async (event) => {
    event.preventDefault();
    const question = $("textarea").value.trim();
    if (!question || active || preparing) return;
    if (await start("chat", question)) {
      if (!disposed && $("textarea").value.trim() === question)
        $("textarea").value = "";
    }
  };
  $("textarea").onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $(".ai-chat-form").requestSubmit();
    }
  };
  const resizer = $(".ai-resizer");
  let drag = null;
  resizer.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { y: event.clientY, height: host.getBoundingClientRect().height };
    resizer.setPointerCapture(event.pointerId);
  };
  resizer.onpointermove = (event) => {
    if (!drag) return;
    height = Math.min(
      Math.max(120, drag.height + drag.y - event.clientY),
      Math.min(1200, Math.max(120, host.parentElement.clientHeight - 100)),
    );
    size();
  };
  resizer.onpointerup =
    resizer.onpointercancel =
    resizer.onlostpointercapture =
      () => {
        if (!drag) return;
        drag = null;
        void persist();
      };
  resizer.onkeydown = (event) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    height =
      event.key === "Home"
        ? 120
        : event.key === "End"
          ? host.parentElement.clientHeight - 100
          : height + (event.key === "ArrowUp" ? 20 : -20);
    height = Math.max(
      120,
      Math.min(
        height,
        Math.min(1200, Math.max(120, host.parentElement.clientHeight - 100)),
      ),
    );
    size();
    void persist();
  };
  const observer = new ResizeObserver(size);
  observer.observe(host.parentElement);
  setOpen(open, false);
  return {
    toggle: () => setOpen(!open),
    setOpen,
    updateContext,
    configure,
    getState: () => ({ open, height, busy: Boolean(active || preparing) }),
    destroy() {
      cancel();
      disposed = true;
      unsubscribe?.();
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      host.replaceChildren();
    },
  };
}
