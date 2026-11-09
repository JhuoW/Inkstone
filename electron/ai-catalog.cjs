"use strict";

// Human-reviewed fallbacks, not an assertion of account access. Prefer live discovery.
// Sources and protocol differences: docs/AI_PROVIDERS.md (verified 2026-11-09).
const models = (...entries) =>
  entries.map((entry) =>
    Object.freeze(typeof entry === "string" ? { id: entry } : entry),
  );
const catalog = [
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai",
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-6-luna",
    models: models("gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol", "gpt-6-astra"),
    requiresKey: true,
    local: false,
    docsUrl: "https://developers.openai.com/api/docs/models",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    protocol: "anthropic",
    endpoint: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-5-5",
    models: models(
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
      "claude-opus-5-5",
      "claude-fable-5-1",
    ),
    requiresKey: true,
    local: false,
    docsUrl: "https://platform.claude.com/docs/en/models/overview",
    note: {
      en: "Use a workspace-scoped API key, or supply the Workspace ID for an organization-wide key.",
      zh: "使用限定工作空间的 API Key；若使用组织级 Key，请填写工作空间 ID。",
    },
  },
  {
    id: "gemini",
    label: "Google (Gemini)",
    protocol: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.6-flash",
    models: models(
      "gemini-3.6-flash",
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.5-flash-lite",
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
    ),
    requiresKey: true,
    local: false,
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
    note: {
      en: "Uses the native Gemini Developer API with a Google AI Studio key. Model access and quota depend on your project.",
      zh: "使用 Gemini 原生开发者 API 和 Google AI Studio Key；模型权限与额度以你的项目为准。",
    },
  },
  {
    id: "qwen",
    label: "Alibaba Cloud (Qwen)",
    protocol: "openai",
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-flash",
    models: models(
      "qwen-flash",
      "qwen-plus",
      "qwen-max",
      "qwen3.8-flash",
      "qwen3.7-plus",
      "qwen3.8-max",
    ),
    requiresKey: true,
    local: false,
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio/base-url",
    endpointOptions: [
      {
        label: "Singapore",
        endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      },
      {
        label: "China (Beijing)",
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      {
        label: "US (Virginia)",
        endpoint: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
      },
      {
        label: "China (Hong Kong)",
        endpoint:
          "https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1",
      },
    ],
    note: {
      en: "Match the endpoint region to your pay-as-you-go API key. Model availability differs by region. You can paste a workspace-specific API base URL from Model Studio.",
      zh: "Endpoint 地域必须与按量付费 API Key 一致，各地域模型不同。也可粘贴 Model Studio 提供的工作空间专属 API 地址。",
    },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai",
    endpoint: "https://api.deepseek.com",
    defaultModel: "deepseek-flash",
    models: models("deepseek-flash", "deepseek-v4-pro"),
    requiresKey: true,
    local: false,
    docsUrl: "https://api-docs.deepseek.com/",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    protocol: "openai",
    endpoint: "https://api.x.ai/v1",
    defaultModel: "grok-4.7",
    models: models("grok-4.7"),
    requiresKey: true,
    local: false,
    docsUrl: "https://docs.x.ai/developers/models",
  },
  {
    id: "mistral",
    label: "Mistral",
    protocol: "openai",
    endpoint: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    models: models(
      "mistral-small-latest",
      "mistral-medium-latest",
      "mistral-large-latest",
      "ministral-14b-latest",
    ),
    requiresKey: true,
    local: false,
    docsUrl: "https://docs.mistral.ai/models",
  },
  {
    id: "groq",
    label: "Groq",
    protocol: "openai",
    endpoint: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    models: models("openai/gpt-oss-120b", "openai/gpt-oss-20b", {
      id: "qwen/qwen3.8-27b",
      label: "Qwen 3.8 27B (Preview)",
    }),
    requiresKey: true,
    local: false,
    docsUrl: "https://console.groq.com/docs/models",
  },
  {
    id: "ollama",
    label: "Ollama",
    protocol: "openai",
    endpoint: "http://127.0.0.1:11434/v1",
    defaultModel: "",
    models: models(),
    requiresKey: false,
    local: true,
    docsUrl: "https://docs.ollama.com/api/openai-compatibility",
    note: {
      en: "Start Ollama and install a text model. The model list is discovered from your server; no model is downloaded automatically.",
      zh: "启动 Ollama 并安装文本模型。模型列表来自你的服务，不会自动下载模型。",
    },
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    protocol: "openai",
    endpoint: "http://127.0.0.1:1234/v1",
    defaultModel: "",
    models: models(),
    requiresKey: false,
    local: true,
    docsUrl: "https://lmstudio.ai/docs/developer/openai-compat/models",
    note: {
      en: "Start the LM Studio server. Discovery lists loaded models, or downloaded models when Just-In-Time loading is enabled. Add a token if server authentication is enabled.",
      zh: "启动 LM Studio 服务。列表显示已加载模型，启用即时加载时也显示已下载模型；若服务启用了认证，请填写访问令牌。",
    },
  },
  {
    id: "custom",
    label: "Custom OpenAI-Compatible API",
    protocol: "openai",
    endpoint: "",
    defaultModel: "",
    models: models(),
    requiresKey: false,
    local: false,
    docsUrl:
      "https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create",
    note: {
      en: "Enter your service's API base URL. Choose a discovered model or enter its model ID; supply a key if the service requires authentication.",
      zh: "填写服务的 API 基础地址，选择检测到的模型或输入模型 ID；若服务要求认证，请填写 Key。",
    },
  },
].map((provider) => Object.freeze({ ...provider, verifiedAt: "2026-11-09" }));
Object.freeze(catalog);
const getProvider = (id) => catalog.find((provider) => provider.id === id);

module.exports = { catalog, getProvider };
