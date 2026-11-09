import { modal, esc } from "./ui.js";

export async function showAIModelSettings({ invoke, t }) {
  const d = modal(
    t("AI / 模型", "AI / Models"),
    `<p class="ai-settings-status" role="status">${t("正在读取设置…", "Loading settings…")}</p>`,
    { wide: true },
  );
  d.el.classList.add("ai-settings-dialog");
  const message = (value) => {
    const status = d.el.querySelector(".ai-settings-status");
    if (status) status.textContent = value;
  };
  try {
    let settings = await invoke("aiGetSettings");
    if (!d.el.isConnected) return;
    const field = (key, label, type = "text", extra = "") =>
      `<label class="setting-row"><span>${label}</span><input name="${key}" type="${type}" ${extra} value="${esc(settings[key] ?? "")}" autocomplete="off"></label>`;
    d.body.innerHTML = `<form class="ai-model-form" autocomplete="off">
      <p class="setting-help">${t("文档仅在你点击分析或发送时传给所选模型。本地服务可完全离线使用；在线服务按提供商规则处理发送的内容。", "Documents are sent to the selected model only when you analyze or send a message. Local services work offline; online providers process submitted content under their own policies.")}</p>
      <label class="setting-row"><span>${t("提供商", "Provider")}</span><select name="provider"><option value="local">Local · Ollama / LM Studio</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option></select></label>
      ${field("endpoint", t("服务地址", "Endpoint"), "url")}
      ${field("model", t("模型名称", "Model"), "text", 'list="ai-available-models" maxlength="200"')}
      <datalist id="ai-available-models"></datalist>
      <label class="setting-row"><span>API Key</span><input name="apiKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="${t("留空以保留已有密钥", "Leave blank to keep the saved key")}"></label>
      <label class="setting-toggle"><input name="clearKey" type="checkbox"><span>${t("删除当前提供商保存的密钥", "Remove this provider's saved key")}</span></label>
      <p class="ai-key-status setting-help"></p>
      ${field("temperature", t("温度（仅本地模型）", "Temperature (local only)"), "number", 'min="0" max="1" step="0.1" required')}
      ${field("maxTokens", t("最大输出 Token", "Maximum output tokens"), "number", 'min="64" max="32768" step="1" required')}
      ${field("timeoutMs", t("超时（毫秒）", "Timeout (milliseconds)"), "number", 'min="1000" max="600000" step="1000" required')}
      <p class="ai-settings-status" role="status" aria-live="polite"></p>
      <footer><button type="button" data-model-list>${t("获取模型列表", "List models")}</button><button type="button" data-model-test>${t("保存并测试连接", "Save & test")}</button><button type="submit" class="primary">${t("保存", "Save")}</button><button type="button" data-model-cancel hidden>${t("取消操作", "Cancel operation")}</button></footer>
    </form>`;
    const form = d.el.querySelector("form");
    const input = (name) => form.elements.namedItem(name);
    input("provider").value = settings.provider;
    const refresh = () => {
      const provider = input("provider").value;
      input("endpoint").readOnly = provider !== "local";
      input("temperature").readOnly = provider !== "local";
      d.el.querySelector(".ai-key-status").textContent =
        settings.secureStorageAvailable
          ? t(
              "密钥由系统加密存储，不会写入普通设置文件。",
              "Keys use operating-system encryption and are never stored in ordinary settings files.",
            ) +
            (settings.hasKey && settings.provider === provider
              ? t(" 已保存密钥。", " A key is saved.")
              : "")
          : t(
              "系统安全存储不可用；不能持久保存密钥。无密钥的本地模型仍可使用。",
              "Secure storage is unavailable; keys cannot be saved. Local models requiring no key remain available.",
            );
    };
    input("provider").onchange = () => {
      input("apiKey").value = "";
      input("clearKey").checked = false;
      input("endpoint").value =
        input("provider").value === "openai"
          ? "https://api.openai.com/v1"
          : input("provider").value === "anthropic"
            ? "https://api.anthropic.com/v1"
            : "http://127.0.0.1:11434/v1";
      input("model").value = "";
      d.el.querySelector("datalist").replaceChildren();
      refresh();
    };
    refresh();
    let busy = false,
      cancelled = false;
    const cancelButton = form.querySelector("[data-model-cancel]");
    const cancel = () => {
      cancelled = true;
      if (busy) void invoke("aiCancel", {}).catch(() => {});
      message(t("已取消", "Cancelled"));
    };
    cancelButton.onclick = cancel;
    async function perform(action) {
      if (busy || !form.reportValidity()) return;
      busy = true;
      cancelled = false;
      d.el.setAttribute("aria-busy", "true");
      cancelButton.hidden = false;
      form
        .querySelectorAll("button:not([data-model-cancel]),input,select")
        .forEach((el) => {
          el.disabled = true;
        });
      message(t("正在处理…", "Working…"));
      try {
        const payload = {
          provider: input("provider").value,
          endpoint: input("endpoint").value.trim(),
          model: input("model").value.trim(),
          temperature: Number(input("temperature").value),
          maxTokens: Number(input("maxTokens").value),
          timeoutMs: Number(input("timeoutMs").value),
          clearKey: input("clearKey").checked,
        };
        if (input("apiKey").value) payload.apiKey = input("apiKey").value;
        await invoke("aiSaveSettings", payload);
        input("apiKey").value = "";
        input("clearKey").checked = false;
        if (cancelled || !d.el.isConnected) return;
        settings = await invoke("aiGetSettings");
        if (cancelled || !d.el.isConnected) return;
        refresh();
        if (action === "list") {
          const models = await invoke("aiListModels");
          if (cancelled || !d.el.isConnected) return;
          const list = d.el.querySelector("datalist");
          list.replaceChildren(
            ...models.map((model) => {
              const option = document.createElement("option");
              option.value = model.id;
              return option;
            }),
          );
          message(
            t(
              "模型列表已更新，可在模型名称中选择或输入。",
              "Model list updated. Choose or enter a model name.",
            ),
          );
        } else if (action === "test") {
          const result = await invoke("aiTestConnection");
          if (cancelled || !d.el.isConnected) return;
          message(
            result.message ||
              (result.ok
                ? t("连接成功", "Connection successful")
                : t("连接失败", "Connection failed")),
          );
        } else message(t("已保存", "Saved"));
      } catch (error) {
        if (!cancelled) message(error.message);
      } finally {
        busy = false;
        cancelButton.hidden = true;
        d.el.setAttribute("aria-busy", "false");
        form.querySelectorAll("button,input,select").forEach((el) => {
          el.disabled = false;
        });
      }
    }
    form.onsubmit = (event) => {
      event.preventDefault();
      void perform("save");
    };
    form.querySelector("[data-model-list]").onclick = () =>
      void perform("list");
    form.querySelector("[data-model-test]").onclick = () =>
      void perform("test");
    d.el.addEventListener(
      "close",
      () => {
        cancel();
        input("apiKey").value = "";
      },
      { once: true },
    );
  } catch (error) {
    message(error.message);
  }
  return d;
}
