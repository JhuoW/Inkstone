import { modal, esc } from "./ui.js";

let activeSetup = null;

// Stored credentials never leave the main process. Draft keys remain scoped to
// this dialog and their endpoint until a tested configuration is committed.
export function showAIModelSettings({ invoke, t, required = false }) {
  if (activeSetup?.dialog.isConnected) {
    activeSetup.dialog.querySelector("select, input, button")?.focus();
    return activeSetup.promise;
  }
  const d = modal(
    t("AI模型设置", "AI Model Setup"),
    `<p class="ai-settings-status" role="status">${t("正在读取设置…", "Loading settings…")}</p>`,
    { wide: true },
  );
  d.el.classList.add("ai-settings-dialog");
  let resolveResult;
  const promise = new Promise((resolve) => {
    resolveResult = resolve;
  });
  activeSetup = { dialog: d.el, promise };
  let closed = false,
    saving = false,
    operation = null,
    generation = 0,
    discoveryTimer;
  const drafts = new Map();
  let form,
    settings,
    providers,
    selected,
    modelList = [];
  const input = (name) => form.elements.namedItem(name);
  const message = (value) => {
    const el = d.el.querySelector(".ai-settings-status");
    if (el) el.textContent = value;
  };
  const listMessage = (value) => {
    const el = d.el.querySelector(".ai-model-list-status");
    if (el) el.textContent = value;
  };
  const finish = (value) => {
    if (closed) return;
    closed = true;
    generation++;
    clearTimeout(discoveryTimer);
    if (operation)
      void invoke("aiCancel", {
        id: operation === "list" ? "models" : "test",
      }).catch(() => {});
    if (form) input("apiKey").value = "";
    for (const draft of drafts.values()) draft.apiKey = "";
    drafts.clear();
    if (activeSetup?.dialog === d.el) activeSetup = null;
    resolveResult(value);
  };
  d.el.addEventListener("close", () => finish(false), { once: true });
  const endpointId = (value) => {
    try {
      const url = new URL(value.trim());
      if (url.hostname === "localhost") url.hostname = "127.0.0.1";
      return url.toString().replace(/\/+$/, "");
    } catch {
      return value.trim();
    }
  };
  const descriptor = () => providers.find((p) => p.id === selected);
  const draft = () => drafts.get(selected);
  const snapshotFields = () => {
    if (!form || !selected) return;
    Object.assign(draft(), {
      endpoint: input("endpoint").value.trim(),
      model: input("model").value.trim(),
      apiKey: input("apiKey").value,
      clearKey: input("clearKey").checked,
      workspace: input("workspace").value.trim(),
      temperature: Number(input("temperature").value),
      maxTokens: Number(input("maxTokens").value),
      timeoutMs: Number(input("timeoutMs").value),
    });
  };
  const payload = () => {
    snapshotFields();
    const current = draft();
    return {
      provider: selected,
      endpoint: current.endpoint,
      model: current.model,
      workspace: current.workspace || "",
      temperature: current.temperature,
      maxTokens: current.maxTokens,
      timeoutMs: current.timeoutMs,
      clearKey: current.clearKey,
      ...(current.apiKey &&
      current.typedKeyEndpoint === endpointId(current.endpoint)
        ? { apiKey: current.apiKey }
        : {}),
    };
  };
  const hasCredential = () =>
    Boolean(
      (input("apiKey").value.trim() &&
        draft().typedKeyEndpoint === endpointId(input("endpoint").value)) ||
      (!input("clearKey").checked &&
        draft().hasKey &&
        endpointId(input("endpoint").value) === draft().keyEndpoint),
    );
  function updateControls() {
    if (!form || !selected || closed) return;
    const testing = operation === "test" || saving;
    d.el.setAttribute("aria-busy", String(Boolean(operation || saving)));
    form.querySelectorAll("input, select, button").forEach((el) => {
      el.disabled = testing;
    });
    form.querySelector("[data-model-dismiss]").disabled = saving;
    const cancel = form.querySelector("[data-model-cancel]");
    cancel.hidden = !operation || saving;
    cancel.disabled = saving;
    form.querySelector("[data-model-list]").disabled = Boolean(
      operation || saving,
    );
    const removing = input("clearKey").checked;
    form.querySelector("[data-model-test]").disabled = testing || removing;
    form.querySelector('button[type="submit"]').textContent = removing
      ? t("移除密钥", "Remove key")
      : required
        ? t("保存并继续", "Save & continue")
        : t("测试并保存", "Test & save");
    input("temperature").disabled =
      testing || !(descriptor().local || selected === "custom");
    const saved = hasCredential() && !input("apiKey").value.trim();
    d.el.querySelector(".ai-key-status").textContent =
      !settings.secureStorageAvailable
        ? t(
            "系统安全存储不可用，不能保存 API Key；无密钥的本地服务仍可使用。",
            "Secure storage is unavailable. API keys cannot be saved; local services without keys remain available.",
          )
        : saved
          ? t(
              "已保存此服务地址的密钥。留空以继续使用，或输入新密钥替换。",
              "A key is saved for this endpoint. Leave blank to keep it, or enter a replacement.",
            )
          : t(
              "密钥由操作系统加密保存，不会写入普通设置文件。",
              "Keys are encrypted by your operating system and kept out of ordinary settings files.",
            );
    input("apiKey").placeholder = saved
      ? t("已保存密钥", "Saved key")
      : descriptor().requiresKey
        ? t("输入 API Key", "Enter API key")
        : t(
            "可选：服务需要认证时填写",
            "Optional, if your server requires authentication",
          );
    input("clearKey").closest("label").hidden =
      !draft().hasKey ||
      endpointId(input("endpoint").value) !== draft().keyEndpoint;
  }
  function showModels(models, source) {
    const seen = new Set();
    modelList = (Array.isArray(models) ? models : []).filter((model) => {
      if (
        !model ||
        typeof model.id !== "string" ||
        !model.id ||
        seen.has(model.id)
      )
        return false;
      seen.add(model.id);
      return true;
    });
    const select = input("modelChoice");
    select.replaceChildren();
    for (const model of modelList) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent =
        model.label && model.label !== model.id
          ? `${model.label} · ${model.id}`
          : model.id;
      select.append(option);
    }
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = t("输入自定义 Model ID…", "Enter a custom model ID…");
    select.append(custom);
    const current = draft();
    if (
      source === "live" &&
      (!current.model || (current.autoModel && !seen.has(current.model))) &&
      modelList.length
    )
      current.model = seen.has(descriptor().defaultModel)
        ? descriptor().defaultModel
        : modelList[0].id;
    input("model").value = current.model || "";
    select.value = seen.has(current.model) ? current.model : "__custom__";
    d.el.querySelector(".ai-custom-model").hidden =
      select.value !== "__custom__";
    listMessage(
      source === "live"
        ? modelList.length
          ? t(
              `已从服务获取 ${modelList.length} 个模型。`,
              `${modelList.length} models loaded from the service.`,
            )
          : t(
              "服务未返回可用的文本模型。请加载本地模型，或输入自定义 Model ID。",
              "The service returned no usable text models. Load a local model, or enter a custom model ID.",
            )
        : modelList.length
          ? t(
              "当前为官方文档中的参考模型；填写密钥后自动获取账号可用列表。",
              "Showing models from official documentation. Add a key to load models available to your account.",
            )
          : t(
              "正在等待服务提供模型列表，也可以手动输入 Model ID。",
              "Waiting for the service's model list. You can also enter a model ID manually.",
            ),
    );
    if (source === "live" && current.model && !seen.has(current.model)) {
      listMessage(
        t(
          "已保留你选择的模型，但服务未在可用列表中返回它。模型可能无权限、已停用或仅支持手动调用；请测试连接确认。",
          "Your selected model has been kept, but the service did not return it in its available list. It may require access, be retired, or support manual use only. Test the connection to verify it.",
        ),
      );
    }
  }
  function stopOperation(showMessage = true) {
    clearTimeout(discoveryTimer);
    generation++;
    const previous = operation;
    operation = null;
    if (previous)
      void invoke("aiCancel", {
        id: previous === "list" ? "models" : "test",
      }).catch(() => {});
    updateControls();
    if (showMessage)
      message(
        t(
          "已取消，配置尚未保存。",
          "Cancelled. The configuration has not been saved.",
        ),
      );
  }
  async function discover({ explicit = false } = {}) {
    if (closed || saving || operation === "test") return;
    if (draft().keyStatusDirty && !input("apiKey").value.trim()) {
      if (!(await endpointChanged())) return;
    }
    if (closed || saving || operation === "test") return;
    if (!input("endpoint").checkValidity() || !input("endpoint").value.trim())
      return;
    if (descriptor().requiresKey && !hasCredential()) {
      if (explicit)
        message(
          t(
            "请先填写此服务地址的 API Key。",
            "Enter an API key for this endpoint first.",
          ),
        );
      return;
    }
    stopOperation(false);
    const ticket = generation,
      config = payload();
    operation = "list";
    updateControls();
    listMessage(t("正在获取可用模型…", "Loading available models…"));
    if (explicit) message("");
    try {
      const models = await invoke("aiListModels", config);
      if (closed || ticket !== generation) return;
      showModels(models, "live");
    } catch (error) {
      if (closed || ticket !== generation) return;
      showModels(descriptor().models, "reference");
      listMessage(
        t("无法获取实时模型列表。", "Could not load the live model list.") +
          " " +
          error.message +
          (modelList.length
            ? t(
                " 仍可选择文档中的参考模型，并测试连接确认权限。",
                " You can still choose a documented model and test access.",
              )
            : t(
                " 可以输入自定义 Model ID 后测试连接。",
                " Enter a custom model ID and test the connection.",
              )),
      );
    } finally {
      if (!closed && ticket === generation) {
        operation = null;
        updateControls();
      }
    }
  }
  function scheduleDiscovery() {
    clearTimeout(discoveryTimer);
    discoveryTimer = setTimeout(() => void discover(), 250);
  }
  async function endpointChanged() {
    if (closed || saving) return false;
    const previous = draft().endpoint,
      next = input("endpoint").value.trim();
    if (endpointId(previous) === endpointId(next) && !draft().keyStatusDirty)
      return true;
    stopOperation(false);
    input("apiKey").value = "";
    input("clearKey").checked = false;
    snapshotFields();
    draft().hasKey = false;
    draft().keyEndpoint = endpointId(next);
    showModels(descriptor().models, "reference");
    updateRegion();
    updateControls();
    message(
      t(
        "服务地址已更改。密钥仅用于其保存的地址；新地址需要单独配置。",
        "Endpoint changed. Saved keys are used only for their original endpoint; configure a key for a new address.",
      ),
    );
    if (!input("endpoint").checkValidity() || !next) return false;
    const ticket = generation;
    try {
      const result = await invoke("aiGetSettings", {
        provider: selected,
        endpoint: next,
      });
      if (closed || ticket !== generation) return false;
      draft().hasKey = result.hasKey;
      draft().keyEndpoint = endpointId(next);
      draft().keyStatusDirty = false;
      updateControls();
      scheduleDiscovery();
      return true;
    } catch (error) {
      if (!closed && ticket === generation) message(error.message);
      return false;
    }
  }
  function updateRegion() {
    const options = descriptor().endpointOptions || [],
      select = input("region");
    select.replaceChildren();
    for (const item of options) {
      const option = document.createElement("option");
      option.value = item.endpoint;
      option.textContent =
        typeof item.label === "string"
          ? item.label
          : t(item.label.zh, item.label.en);
      select.append(option);
    }
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = t("自定义地址", "Custom endpoint");
    select.append(custom);
    const known = options.find(
      (item) =>
        endpointId(item.endpoint) === endpointId(input("endpoint").value),
    );
    select.value = known?.endpoint || "__custom__";
    select.closest(".setting-row").hidden = !options.length;
  }
  function selectProvider(id) {
    stopOperation(false);
    snapshotFields();
    selected = id;
    const provider = descriptor();
    if (!drafts.has(id)) {
      const saved =
        (id === settings.provider ? settings : settings.profiles?.[id]) || {};
      drafts.set(id, {
        provider: id,
        endpoint: saved.endpoint || provider.endpoint,
        model: saved.model || provider.defaultModel || "",
        workspace: saved.workspace || "",
        temperature: saved.temperature ?? 0.3,
        maxTokens: saved.maxTokens ?? 4096,
        timeoutMs: saved.timeoutMs ?? 120000,
        hasKey: !!saved.hasKey,
        keyEndpoint: endpointId(saved.endpoint || provider.endpoint),
        apiKey: "",
        clearKey: false,
        autoModel: !saved.model || !saved.profileSaved,
        typedKeyEndpoint: "",
        keyStatusDirty: false,
      });
    }
    const current = draft();
    for (const key of [
      "endpoint",
      "model",
      "workspace",
      "temperature",
      "maxTokens",
      "timeoutMs",
      "apiKey",
    ])
      input(key).value = current[key];
    input("clearKey").checked = current.clearKey;
    input("provider").value = selected;
    input("workspace").closest(".setting-row").hidden =
      selected !== "anthropic";
    const note = d.el.querySelector(".ai-provider-note");
    note.textContent = provider.note
      ? t(provider.note.zh || "", provider.note.en || "")
      : "";
    note.hidden = !note.textContent;
    updateRegion();
    showModels(provider.models, "reference");
    updateControls();
    message("");
    scheduleDiscovery();
  }
  async function testConnection(save) {
    if (closed || saving || operation === "test") return;
    if (draft().keyStatusDirty && !input("apiKey").value.trim()) {
      if (!(await endpointChanged())) return;
    }
    if (closed || saving || operation === "test") return;
    stopOperation(false);
    if (!form.reportValidity()) return;
    if (save && input("clearKey").checked) {
      const config = payload();
      saving = true;
      d.setBusy(true);
      updateControls();
      message(t("正在移除保存的密钥…", "Removing the saved key…"));
      try {
        await invoke("aiSaveSettings", config);
        saving = false;
        d.setBusy(false);
        // Removing a key is an explicit settings change, not a successful
        // connection: a pending analysis must never resume from this path.
        finish(false);
        d.close();
      } catch (error) {
        if (!closed) message(error.message);
      } finally {
        if (!closed) {
          saving = false;
          d.setBusy(false);
          updateControls();
        }
      }
      return;
    }
    if (!input("model").value.trim()) {
      message(t("请选择或输入一个模型。", "Choose or enter a model."));
      input("modelChoice").focus();
      return;
    }
    if (descriptor().requiresKey && !hasCredential()) {
      message(t("请填写 API Key。", "Enter an API key."));
      input("apiKey").focus();
      return;
    }
    const ticket = generation,
      config = payload();
    operation = "test";
    updateControls();
    message(t("正在验证模型连接…", "Testing the model connection…"));
    try {
      const result = await invoke("aiTestConnection", config);
      if (closed || ticket !== generation) return;
      if (!result?.ok)
        throw new Error(
          result?.message ||
            t(
              "连接失败，请检查配置。",
              "Connection failed. Check the configuration.",
            ),
        );
      if (save) {
        saving = true;
        operation = null;
        d.setBusy(true);
        updateControls();
        message(
          t(
            "连接成功，正在安全保存…",
            "Connection successful. Saving securely…",
          ),
        );
        await invoke("aiSaveSettings", config);
        saving = false;
        d.setBusy(false);
        finish(true);
        d.close();
      } else
        message(
          t(
            "连接成功，所选模型已响应。保存后即可使用。",
            "Connection successful. The selected model responded. Save this configuration to use it.",
          ),
        );
    } catch (error) {
      if (!closed && ticket === generation) message(error.message);
    } finally {
      if (!closed && ticket === generation) {
        saving = false;
        operation = null;
        d.setBusy(false);
        updateControls();
      }
    }
  }
  async function initialize() {
    settings = await invoke("aiGetSettings");
    if (closed || !d.el.isConnected) return;
    providers = settings.providers;
    if (!Array.isArray(providers) || !providers.length)
      throw new Error(
        t(
          "模型服务商列表不可用，请重新打开设置。",
          "The provider catalogue is unavailable. Reopen model setup.",
        ),
      );
    const field = (key, label, type = "text", extra = "") =>
      `<label class="setting-row"><span>${label}</span><input name="${key}" type="${type}" ${extra} autocomplete="off"></label>`;
    d.body.innerHTML = `<form class="ai-model-form" autocomplete="off">
      <p class="ai-setup-intro">${required ? t("先连接一个模型，即可继续刚才的操作。", "Connect a model to continue your pending action.") : t("选择服务商和模型，即可在文档中使用 AI 写作助手。", "Choose a provider and model for your writing assistant.")}</p>
      <label class="setting-row"><span>${t("服务商", "Provider")}</span><select name="provider">${providers.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("")}</select></label>
      <label class="setting-row" hidden><span>${t("服务区域", "Region")}</span><select name="region"></select></label>
      <div class="setting-row"><label for="ai-setup-endpoint">${t("服务地址", "Endpoint")}</label><div class="ai-endpoint-control"><input id="ai-setup-endpoint" name="endpoint" type="url" required autocomplete="off" spellcheck="false"><button type="button" data-endpoint-reset>${t("默认", "Default")}</button></div></div>
      <p class="ai-provider-note setting-help" hidden></p>
      <label class="setting-row"><span>API Key</span><input name="apiKey" type="password" autocomplete="new-password" spellcheck="false" maxlength="4096"></label>
      <label class="setting-toggle ai-clear-key"><input name="clearKey" type="checkbox"><span>${t("移除此地址保存的密钥", "Remove the saved key for this endpoint")}</span></label>
      <p class="ai-key-status setting-help"></p>
      <div class="setting-row"><label for="ai-setup-model">${t("模型", "Model")}</label><div class="ai-model-choice-control"><select id="ai-setup-model" name="modelChoice"></select><button type="button" data-model-list>${t("刷新", "Refresh")}</button></div></div>
      <label class="setting-row ai-custom-model" hidden><span>${t("自定义 Model ID", "Custom model ID")}</span><input name="model" type="text" maxlength="200" autocomplete="off" spellcheck="false" placeholder="${t("输入服务提供的模型 ID", "Enter the model ID from your service")}"></label>
      <p class="ai-model-list-status setting-help" role="status" aria-live="polite"></p>
      <details class="ai-model-advanced"><summary>${t("高级设置", "Advanced settings")}</summary><div>
        ${field("workspace", t("工作区 ID（可选）", "Workspace ID (optional)"), "text", 'maxlength="200"')}
        ${field("temperature", t("温度（本地 / 自定义）", "Temperature (local / custom)"), "number", 'min="0" max="1" step="0.1" required')}
        ${field("maxTokens", t("最大输出 Token", "Maximum output tokens"), "number", 'min="64" max="32768" step="1" required')}
        ${field("timeoutMs", t("超时（毫秒）", "Timeout (milliseconds)"), "number", 'min="1000" max="600000" step="1000" required')}
      </div></details>
      <p class="ai-settings-status" role="status" aria-live="polite"></p>
      <p class="ai-model-privacy setting-help">${t("文档仅在你分析或发送消息时提交。模型列表和连接测试会访问所选服务；测试仅发送简短的验证消息。", "Documents are sent only when you analyze or chat. Model discovery and connection tests contact your selected service; tests send only a brief verification message.")}</p>
      <footer><button type="button" data-model-test>${t("测试连接", "Test connection")}</button><button type="button" data-model-cancel hidden>${t("停止", "Stop")}</button><button type="button" data-model-dismiss>${t("取消", "Cancel")}</button><button type="submit" class="primary">${required ? t("保存并继续", "Save & continue") : t("测试并保存", "Test & save")}</button></footer>
    </form>`;
    form = d.el.querySelector("form");
    input("provider").onchange = () => selectProvider(input("provider").value);
    input("endpoint").onchange = () => void endpointChanged();
    input("endpoint").oninput = () => {
      stopOperation(false);
      const origin = endpointId(input("endpoint").value);
      if (draft().typedKeyEndpoint !== origin) {
        input("apiKey").value = "";
        draft().apiKey = "";
        draft().typedKeyEndpoint = "";
      }
      if (draft().keyEndpoint !== origin) {
        draft().hasKey = false;
        input("clearKey").checked = false;
      }
      draft().keyStatusDirty = true;
      updateControls();
    };
    input("region").onchange = () => {
      if (input("region").value === "__custom__") {
        input("endpoint").focus();
        return;
      }
      input("endpoint").value = input("region").value;
      void endpointChanged();
    };
    form.querySelector("[data-endpoint-reset]").onclick = () => {
      input("endpoint").value = descriptor().endpoint;
      void endpointChanged();
    };
    input("modelChoice").onchange = () => {
      draft().autoModel = false;
      const custom = input("modelChoice").value === "__custom__";
      d.el.querySelector(".ai-custom-model").hidden = !custom;
      if (!custom) input("model").value = input("modelChoice").value;
      else input("model").focus();
      snapshotFields();
    };
    input("model").oninput = () => {
      draft().autoModel = false;
      snapshotFields();
    };
    input("apiKey").oninput = () => {
      stopOperation(false);
      draft().typedKeyEndpoint = endpointId(input("endpoint").value);
      draft().apiKey = input("apiKey").value;
      if (input("apiKey").value) input("clearKey").checked = false;
      updateControls();
    };
    input("apiKey").onchange = () => {
      snapshotFields();
      updateControls();
      scheduleDiscovery();
    };
    input("clearKey").onchange = () => {
      stopOperation(false);
      if (input("clearKey").checked) {
        input("apiKey").value = "";
        draft().typedKeyEndpoint = "";
      }
      snapshotFields();
      updateControls();
    };
    form.querySelector("[data-model-list]").onclick = () =>
      void discover({ explicit: true });
    form.querySelector("[data-model-test]").onclick = () =>
      void testConnection(false);
    form.querySelector("[data-model-cancel]").onclick = () => stopOperation();
    form.querySelector("[data-model-dismiss]").onclick = () => {
      if (!saving) {
        finish(false);
        d.close();
      }
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      void testConnection(true);
    };
    const initial = providers.some((p) => p.id === settings.provider)
      ? settings.provider
      : "ollama";
    selectProvider(initial);
    input("provider").focus();
  }
  void initialize().catch((error) => {
    if (!closed) message(error.message);
  });
  return promise;
}
