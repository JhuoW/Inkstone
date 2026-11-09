import { showAIModelSettings } from "./ai-model-settings.js";
import { icon } from "./ui.js";
import { displayError } from "./errors.js";
import "./ai-assistant.css";
import {
  resolveAIRevision,
  boundAIHistory,
  createChangeTracker,
  locateAnchor,
  uniqueOccurrence,
} from "./ai-revisions.js";

const normalizeEOL = (value) => String(value).replace(/\r\n|\r/g, "\n");

export function createAIAssistant({
  host,
  invoke,
  on,
  getContext,
  applyRevision,
  locate,
  copyText,
  insertText,
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
    report = null,
    history = [],
    disposed = false,
    applying = false;
  let contextIdentity,
    frame = 0,
    refreshTimer = 0;
  // Every tracker receives each editor change until results are cleared.
  const trackers = new Set();
  host.className = "ai-assistant";
  host.setAttribute("aria-label", t("AI写作助手", "AI Writing Assistant"));
  host.innerHTML = `<div class="ai-resizer" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${t("AI 面板高度", "AI panel height")}"></div>
    <header class="ai-header"><strong>${t("AI写作助手", "AI Writing Assistant")}</strong><span class="ai-model-label">${t("按需分析当前文档", "Review the current document on demand")}</span><button type="button" data-ai-clear-chat>${t("清空对话", "Clear chat")}</button><button type="button" data-ai-configure>${t("模型", "Models")}</button><button type="button" data-ai-close class="icon-button" aria-label="${t("收起 AI 面板", "Hide AI panel")}" title="${t("收起 AI 面板", "Hide AI panel")}">${icon.close}</button></header>
    <div class="ai-controls"><label><span class="sr-only">${t("分析范围", "Analysis scope")}</span><select data-ai-scope title="${t("分析范围", "Analysis scope")}"><option value="document">${t("整篇文档", "Whole document")}</option><option value="selection">${t("选中段落", "Selection")}</option></select></label><label><span class="sr-only">${t("文档类型", "Document type")}</span><select data-ai-type title="${t("文档类型", "Document type")}"><option value="general">${t("一般写作", "General writing")}</option><option value="academic">${t("学术论文", "Academic paper")}</option><option value="technical">${t("技术文档", "Technical document")}</option></select></label><button type="button" data-ai-analyze class="primary">${t("分析与评分", "Analyze & score")}</button><button type="button" data-ai-cancel hidden>${t("取消", "Cancel")}</button><span class="ai-status" role="status" aria-live="polite"></span></div>
    <div class="ai-content" tabindex="0"><p class="ai-empty">${t("分析结构、逻辑与表达，或就当前文档提问。建议需由你确认后应用；继续编辑不会使其余建议失效。AI 可能出错，请核实事实与引用。", "Review structure, reasoning and clarity, or ask about your document. You decide which revisions to apply, and editing keeps the remaining suggestions usable. AI can make mistakes; verify facts and references.")}</p><div class="ai-setup-callout" hidden><button type="button" class="primary" data-ai-setup>${t("设置模型", "Set up a model")}</button><span>${t("选择云端服务或本地模型（Ollama、LM Studio）后即可分析和对话。", "Choose a cloud service or a local model (Ollama, LM Studio) to start analyzing and chatting.")}</span></div><div class="ai-results"></div><div class="ai-chat-log"></div><pre class="ai-stream" hidden></pre></div>
    <form class="ai-chat-form"><label class="sr-only" for="ai-chat-question">${t("询问当前文档", "Ask about this document")}</label><textarea id="ai-chat-question" rows="1" maxlength="8000" placeholder="${t("询问当前文档…（Enter 发送，Shift+Enter 换行）", "Ask about this document… (Enter to send, Shift+Enter for a new line)")}"></textarea><button type="submit">${t("发送", "Send")}</button></form>`;
  const $ = (selector) => host.querySelector(selector);
  const status = (value) => {
    $(".ai-status").textContent = value;
  };
  const current = () => getContext();
  const persist = () =>
    Promise.resolve(
      saveLayout?.({ aiPanelOpen: open, aiPanelHeight: Math.round(height) }),
    ).catch((error) => showError(error));
  function track(length) {
    const tracker = createChangeTracker(length);
    trackers.add(tracker);
    return tracker;
  }
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
    if (request) {
      trackers.delete(request.tracker);
      void invoke("aiCancel", { id: request.id }).catch(() => {});
    }
    busy(false);
    $(".ai-stream").hidden = true;
    if (request) status(note);
  }
  function clearReport() {
    report = null;
    trackers.clear();
    if (active?.tracker) trackers.add(active.tracker);
    $(".ai-results").replaceChildren();
  }
  function clearResults() {
    clearReport();
    $(".ai-chat-log").replaceChildren();
    $(".ai-stream").textContent = "";
    $(".ai-stream").hidden = true;
    history = [];
    $(".ai-empty").hidden = false;
  }
  // Only switching or reloading the document discards results. Ordinary edits
  // keep them; each suggestion follows its passage through the edits.
  function updateContext() {
    if (disposed) return;
    const context = current();
    if (context.identity !== contextIdentity) {
      const hadResults = Boolean(active || report || history.length);
      if (hadResults) {
        cancel(
          t("文档已切换，分析已停止", "Document switched; analysis stopped"),
        );
        clearResults();
        status(
          t(
            "文档已切换，之前的 AI 结果已清除",
            "Document switched. Previous AI results were cleared.",
          ),
        );
      }
      contextIdentity = context.identity;
    }
    scheduleRefresh();
  }
  function trackChanges(changes) {
    if (disposed || !changes) return;
    for (const tracker of trackers) tracker.add(changes);
    scheduleRefresh();
  }
  function scheduleRefresh(delay = 120) {
    if (disposed || !report) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshCards, delay);
  }
  function updateModelLabel() {
    void invoke("aiGetSettings")
      .then((settings) => {
        if (disposed) return;
        const provider = settings.providers?.find(
          (item) => item.id === settings.provider,
        );
        $(".ai-model-label").textContent = settings.ready
          ? `${provider?.label || (settings.provider === "local" ? t("本地", "Local") : settings.provider)} · ${settings.model}`
          : t("尚未设置模型", "No model set up yet");
        $(".ai-setup-callout").hidden = Boolean(settings.ready);
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
    status(displayError(error));
  }
  function appendChat(role, text) {
    const article = document.createElement("article");
    article.className = "ai-chat-message";
    article.dataset.role = role;
    const label = document.createElement("strong");
    label.textContent = role === "user" ? t("你", "You") : "AI";
    const content = document.createElement("p");
    content.textContent = text;
    article.append(label, content);
    if (role === "assistant" && (copyText || insertText)) {
      const actions = document.createElement("div");
      actions.className = "ai-chat-actions";
      if (copyText)
        actions.append(
          cardButton(t("复制", "Copy"), () =>
            Promise.resolve()
              .then(() => copyText(text))
              .then(() => status(t("已复制回复", "Reply copied")))
              .catch(showError),
          ),
        );
      if (insertText) {
        const insert = cardButton(
          t("插入到光标处", "Insert at cursor"),
          () => {
            if (current().readOnly) {
              status(t("文档为只读", "Document is read-only"));
              return;
            }
            Promise.resolve()
              .then(() => insertText(text))
              .then(() =>
                status(
                  t(
                    "已插入到光标处，可按 Ctrl+Z 撤销",
                    "Inserted at the cursor; press Ctrl+Z to undo",
                  ),
                ),
              )
              .catch(showError);
          },
          "data-ai-insert",
        );
        actions.append(insert);
      }
      article.append(actions);
    }
    const follow = nearBottom();
    $(".ai-chat-log").append(article);
    while ($(".ai-chat-log").children.length > 20)
      $(".ai-chat-log").firstChild.remove();
    if (follow) scrollToBottom();
  }
  // Keep new output visible unless the reader scrolled up to earlier content.
  function nearBottom() {
    const content = $(".ai-content");
    return content.scrollHeight - content.scrollTop - content.clientHeight < 48;
  }
  function scrollToBottom() {
    const content = $(".ai-content");
    content.scrollTop = content.scrollHeight;
  }

  // ----- Suggestions -----------------------------------------------------
  // A card resolves to the passage it currently refers to: the original text
  // ("pending"), the applied replacement ("applied"), or nothing ("stale").
  function resolveCard(card, text) {
    if (!report || card.unlocatable) return null;
    const located = locateAnchor(card.anchor, text);
    if (located) return { ...located, kind: card.anchor.kind };
    // Fall back to a unique match inside the analyzed region, for example
    // after Undo restored a passage the anchor no longer follows.
    const scope = report.scope.tracker.mapRegion(
      report.scope.from,
      report.scope.to,
    );
    if (!scope || report.scope.tracker.length !== text.length) return null;
    for (const [kind, needle] of [
      ["original", card.original],
      ["applied", card.replacement],
    ]) {
      const found = uniqueOccurrence(text, needle, scope.from, scope.to);
      if (found) {
        card.anchor = {
          tracker: track(text.length),
          from: found.from,
          to: found.to,
          expected: needle,
          kind,
        };
        return { ...found, kind };
      }
    }
    return null;
  }
  function lineAt(text, position) {
    let line = 1;
    for (
      let index = text.indexOf("\n");
      index >= 0 && index < position;
      index = text.indexOf("\n", index + 1)
    )
      line++;
    return line;
  }
  function cardButton(label, onClick, attribute) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (attribute) button.setAttribute(attribute, "");
    button.onclick = onClick;
    return button;
  }
  function renderCardActions(card, resolved, text, readOnly) {
    const actions = card.actions;
    // Rebuild buttons only when something visible changed, so keyboard focus
    // on a card survives refreshes caused by typing elsewhere.
    const line = resolved ? lineAt(text, resolved.from) : 0;
    const signature = [
      card.unlocatable,
      resolved?.kind || "stale",
      line,
      readOnly,
      applying,
    ].join("|");
    if (card.signature === signature) return;
    card.signature = signature;
    actions.replaceChildren();
    const note = document.createElement("span");
    note.className = "ai-suggestion-note";
    actions.append(note);
    card.element.dataset.state = card.unlocatable
      ? "unlocatable"
      : resolved?.kind === "applied"
        ? "applied"
        : resolved
          ? "pending"
          : "stale";
    if (card.unlocatable) {
      note.textContent = t(
        "原文无法唯一定位，仅供参考",
        "Passage cannot be uniquely located; review manually",
      );
    } else if (!resolved) {
      note.textContent = t(
        "原文已在编辑器中修改，此建议不再自动应用",
        "The passage was edited in the document; this suggestion can no longer be applied automatically",
      );
    } else {
      if (resolved.kind === "applied") {
        note.textContent = t(
          `已应用 · 第 ${line} 行`,
          `Applied · Line ${line}`,
        );
        const revert = cardButton(
          t("撤销此修改", "Revert"),
          () => void revertCard(card),
          "data-ai-revert",
        );
        revert.disabled = readOnly || applying;
        actions.append(
          cardButton(t("定位", "Locate"), () => locateCard(card)),
          revert,
        );
      } else {
        note.textContent = t(`第 ${line} 行`, `Line ${line}`);
        const accept = cardButton(
          t("接受修改", "Accept revision"),
          () => void acceptCards([card]),
          "data-ai-accept",
        );
        accept.classList.add("primary");
        accept.disabled = readOnly || applying;
        actions.append(
          cardButton(t("定位", "Locate"), () => locateCard(card)),
          accept,
        );
      }
    }
    actions.append(
      cardButton(t("忽略", "Dismiss"), () => {
        card.element.remove();
        report.cards = report.cards.filter((item) => item !== card);
        refreshCards();
      }),
    );
  }
  function refreshCards() {
    clearTimeout(refreshTimer);
    if (disposed || !report) return;
    const context = current();
    if (context.identity !== report.identity) return;
    const text = context.text,
      readOnly = Boolean(context.readOnly);
    let pending = 0,
      applied = 0,
      stale = 0;
    for (const card of report.cards) {
      const resolved = resolveCard(card, text);
      if (resolved?.kind === "applied") applied++;
      else if (resolved) pending++;
      else if (!card.unlocatable) stale++;
      renderCardActions(card, resolved, text, readOnly);
    }
    // Drop trackers that no card, scope or request still uses.
    const used = new Set([report.scope.tracker, active?.tracker]);
    for (const card of report.cards)
      if (card.anchor) used.add(card.anchor.tracker);
    for (const tracker of trackers)
      if (!used.has(tracker)) trackers.delete(tracker);
    const toolbar = report.toolbar;
    if (!toolbar) return;
    const parts = [
      report.cards.length
        ? t(
            `修改建议 ${report.cards.length} 条`,
            report.cards.length === 1
              ? "1 suggestion"
              : `${report.cards.length} suggestions`,
          )
        : t("已处理全部建议", "All suggestions handled"),
    ];
    if (applied) parts.push(t(`已应用 ${applied}`, `${applied} applied`));
    if (stale) parts.push(t(`${stale} 条已失效`, `${stale} outdated`));
    toolbar.querySelector(".ai-suggestions-count").textContent =
      parts.join(" · ");
    const all = toolbar.querySelector("[data-ai-accept-all]");
    all.hidden = pending < 2;
    all.disabled = readOnly || applying;
    all.textContent = t(`全部接受（${pending}）`, `Accept all (${pending})`);
  }
  function locateCard(card) {
    const context = current();
    const resolved = resolveCard(card, context.text);
    if (!resolved) {
      refreshCards();
      return;
    }
    Promise.resolve(locate({ from: resolved.from, to: resolved.to })).catch(
      showError,
    );
  }
  // Apply revisions as one transaction and re-anchor each card at its new text.
  async function applyResolved(entries, toKind) {
    const context = current();
    const revisions = entries.map(({ card, range }) => ({
      identity: context.identity,
      text: context.text,
      from: range.from,
      to: range.to,
      original: toKind === "applied" ? card.original : card.replacement,
      replacement: toKind === "applied" ? card.replacement : card.original,
    }));
    await applyRevision(revisions.length === 1 ? revisions[0] : revisions);
    const after = current().text;
    const tracker = track(after.length);
    let delta = 0;
    for (const [index, entry] of [...entries.entries()].sort(
      (a, b) => a[1].range.from - b[1].range.from,
    )) {
      const inserted = normalizeEOL(revisions[index].replacement);
      const from = entry.range.from + delta;
      entry.card.anchor = {
        tracker,
        from,
        to: from + inserted.length,
        expected: inserted,
        kind: toKind,
      };
      delta += inserted.length - (entry.range.to - entry.range.from);
    }
  }
  async function acceptCards(cards) {
    if (applying || !report) return;
    const context = current();
    if (context.readOnly) {
      status(t("文档为只读", "Document is read-only"));
      return;
    }
    const entries = [];
    let skipped = 0;
    for (const card of cards) {
      const range = resolveCard(card, context.text);
      if (!range || range.kind !== "original") {
        skipped++;
        continue;
      }
      // Overlapping suggestions cannot be applied in the same step.
      if (
        entries.some(
          (entry) => range.from < entry.range.to && entry.range.from < range.to,
        )
      ) {
        skipped++;
        continue;
      }
      entries.push({ card, range });
    }
    if (!entries.length) {
      refreshCards();
      status(
        t(
          "没有可应用的建议，原文可能已被修改",
          "No suggestion can be applied; the passages may have been edited",
        ),
      );
      return;
    }
    applying = true;
    refreshCards();
    try {
      await applyResolved(entries, "applied");
      status(
        entries.length > 1
          ? t(
              `已应用 ${entries.length} 条修改${skipped ? `，${skipped} 条因重叠或已修改而跳过` : ""}。可按 Ctrl+Z 一次撤销。`,
              `Applied ${entries.length} revisions${skipped ? `; skipped ${skipped} that overlap or were edited` : ""}. Press Ctrl+Z to undo them together.`,
            )
          : t(
              "修改已应用，可撤销。其余建议仍可继续应用。",
              "Revision applied; undo is available. The other suggestions remain available.",
            ),
      );
    } catch (error) {
      showError(error);
    } finally {
      applying = false;
      refreshCards();
    }
  }
  async function revertCard(card) {
    if (applying || !report) return;
    const context = current();
    if (context.readOnly) {
      status(t("文档为只读", "Document is read-only"));
      return;
    }
    const range = resolveCard(card, context.text);
    if (!range || range.kind !== "applied") {
      refreshCards();
      return;
    }
    applying = true;
    refreshCards();
    try {
      await applyResolved([{ card, range }], "original");
      status(t("已恢复原文", "Original passage restored"));
    } catch (error) {
      showError(error);
    } finally {
      applying = false;
      refreshCards();
    }
  }
  function renderAnalysis(text, request) {
    let analysis;
    try {
      analysis = JSON.parse(
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
    clearReport();
    report = {
      identity: request.snapshot.identity,
      scope: {
        tracker: request.tracker,
        from: request.snapshot.offset,
        to: request.snapshot.offset + request.snapshot.source.length,
      },
      cards: [],
      toolbar: null,
    };
    trackers.add(request.tracker);
    const results = $(".ai-results");
    const intro = document.createElement("div");
    intro.className = "ai-summary";
    const overall = Number(analysis.overallScore);
    const score = document.createElement("strong");
    score.className = "ai-overall-score";
    score.textContent =
      Number.isFinite(overall) && overall >= 0 && overall <= 100
        ? `${overall} / 100`
        : t("未评分", "Not scored");
    const summary = document.createElement("p");
    summary.textContent = String(analysis.summary || "");
    intro.append(score, summary);
    results.append(intro);
    const dimensions = document.createElement("div");
    dimensions.className = "ai-dimensions";
    for (const dimension of (Array.isArray(analysis.dimensions)
      ? analysis.dimensions
      : []
    ).slice(0, 12)) {
      const item = document.createElement("div");
      const name = document.createElement("strong");
      const value = Number(dimension.score);
      name.textContent = `${String(dimension.name || "")} · ${Number.isFinite(value) && value >= 0 && value <= 100 ? value : "—"}/100`;
      const meter = document.createElement("span");
      meter.className = "ai-meter";
      meter.setAttribute("aria-hidden", "true");
      meter.style.setProperty(
        "--value",
        String(Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0),
      );
      const reason = document.createElement("p");
      reason.textContent = String(dimension.reason || "");
      item.append(name, meter, reason);
      dimensions.append(item);
    }
    results.append(dimensions);
    const suggestions = (
      Array.isArray(analysis.suggestions) ? analysis.suggestions : []
    ).slice(0, 30);
    const omitted = Number(analysis.omittedSuggestions) || 0;
    if (suggestions.length || omitted) {
      const toolbar = document.createElement("div");
      toolbar.className = "ai-suggestions-toolbar";
      const count = document.createElement("span");
      count.className = "ai-suggestions-count";
      const all = cardButton(
        "",
        () => {
          const text = current().text;
          void acceptCards(
            report.cards.filter(
              (card) => resolveCard(card, text)?.kind === "original",
            ),
          );
        },
        "data-ai-accept-all",
      );
      all.hidden = true;
      toolbar.append(count, all);
      if (omitted) {
        const note = document.createElement("span");
        note.className = "ai-suggestions-omitted";
        note.textContent = t(
          `另有 ${omitted} 条建议引用的原文不存在或不唯一，已省略`,
          omitted === 1
            ? "1 more suggestion quoted text that is missing or not unique and was omitted"
            : `${omitted} more suggestions quoted text that is missing or not unique and were omitted`,
        );
        toolbar.append(note);
      }
      results.append(toolbar);
      report.toolbar = toolbar;
    }
    for (const suggestion of suggestions) {
      const base = resolveAIRevision(request.snapshot, suggestion);
      const element = document.createElement("article");
      element.className = "ai-suggestion";
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
      const actions = document.createElement("div");
      actions.className = "ai-suggestion-actions";
      element.append(reason, diff, actions);
      results.append(element);
      report.cards.push({
        element,
        actions,
        original: normalizeEOL(suggestion.original ?? ""),
        replacement: normalizeEOL(suggestion.replacement ?? ""),
        unlocatable: !base,
        anchor: base
          ? {
              tracker: request.tracker,
              from: base.from,
              to: base.to,
              expected: base.original,
              kind: "original",
            }
          : null,
      });
    }
    refreshCards();
  }

  // ----- Requests --------------------------------------------------------
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
        selection
          ? t(
              "请先在文档中选择要分析的文字",
              "Select the text to analyze in the document first",
            )
          : t(
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
    const snapshot = {
      identity: context.identity,
      text: context.text,
      source: context.text.slice(from, to),
      offset: from,
    };
    const id = crypto.randomUUID();
    // Edits made while the model works are recorded so results still apply.
    const tracker = track(snapshot.text.length);
    active = { id, task, snapshot, tracker, text: "", question };
    const request = active;
    busy(true);
    $(".ai-empty").hidden = true;
    $(".ai-stream").textContent = "";
    $(".ai-stream").hidden = false;
    status(
      task === "analysis"
        ? t("正在分析…", "Analyzing…")
        : t("正在回复…", "Replying…"),
    );
    if (task === "analysis") {
      clearReport();
      $(".ai-results").replaceChildren();
    }
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
        trackers.delete(tracker);
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
    if (current().identity !== request.snapshot.identity) {
      updateContext();
      return;
    }
    if (event.type === "retry") {
      const attempt = Number(event.attempt) || 1,
        of = Number(event.of) || attempt;
      status(
        t(
          `服务繁忙，正在重试（${attempt}/${of}）…`,
          `Provider busy; retrying (${attempt}/${of})…`,
        ),
      );
      return;
    }
    if (event.type === "delta") {
      request.text += String(event.text || "");
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (active === request) {
            const follow = nearBottom();
            $(".ai-stream").textContent = request.text;
            if (follow) scrollToBottom();
          }
        });
      return;
    }
    active = null;
    busy(false);
    $(".ai-stream").hidden = true;
    if (request.task !== "analysis") trackers.delete(request.tracker);
    if (event.type === "error") {
      status(
        event.message
          ? displayError(event.message)
          : t("模型请求失败", "Model request failed"),
      );
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
  $("[data-ai-configure]").onclick = $("[data-ai-setup]").onclick = () => {
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
  $("[data-ai-scope]").onchange = () => {
    if ($("[data-ai-scope]").value !== "selection") return;
    const { selection } = current();
    if (selection.from === selection.to)
      status(
        t(
          "请在文档中选择要分析的文字",
          "Select the text to analyze in the document",
        ),
      );
  };
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
  host.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (active || preparing)) {
      event.preventDefault();
      cancel();
    }
  });
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
    trackChanges,
    configure,
    getState: () => ({ open, height, busy: Boolean(active || preparing) }),
    destroy() {
      cancel();
      disposed = true;
      clearTimeout(refreshTimer);
      trackers.clear();
      unsubscribe?.();
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      host.replaceChildren();
    },
  };
}
