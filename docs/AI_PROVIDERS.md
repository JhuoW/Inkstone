# AI provider reference

Official documentation checked **9 November 2026**. The shared catalogue is
[`electron/ai-catalog.cjs`](../electron/ai-catalog.cjs). This is documentation
verification, not a claim that every provider was tested with a paid account.

Inkstone prefers a server's live model list. Bundled choices are documented
fallbacks; they do not guarantee account access, regional availability, quota or
continued service. A custom model ID remains available. Local services have no
invented default model: install or load a model, start the server, and refresh the
list. Custom services require their actual endpoint and model.

## Defaults and protocols

Base URLs below do not include the generation operation. Bearer authentication
means `Authorization: Bearer <key>`. Keys belong in request headers, never URLs.

| Provider                 | Default base URL                                         | Initial model            | Protocol and authentication                                             | Official references                                                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI                   | `https://api.openai.com/v1`                              | `gpt-6-luna`             | Chat Completions; Bearer                                                | [Model](https://developers.openai.com/api/docs/models/gpt-6-luna), [Chat API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)                                                                                                        |
| Anthropic                | `https://api.anthropic.com/v1`                           | `claude-haiku-5-5`       | Native Messages; `x-api-key`, `anthropic-version`                       | [Models](https://platform.claude.com/docs/en/models/overview), [Authentication](https://platform.claude.com/docs/en/api/overview), [Messages](https://platform.claude.com/docs/en/api/messages/create)                                                                                   |
| Google Gemini            | `https://generativelanguage.googleapis.com/v1beta`       | `gemini-3.6-flash`       | Native `streamGenerateContent`; `x-goog-api-key`                        | [Models](https://ai.google.dev/gemini-api/docs/models), [3.6 Flash](https://aistudio.google.com/docs/models/gemini-3.6-flash), [API keys](https://aistudio.google.com/docs/api-key), [Streaming API](https://aistudio.google.com/api-reference/generate-content/stream-generate-content) |
| Alibaba Cloud Qwen       | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-flash`             | OpenAI-compatible Chat Completions; regional Bearer key                 | [Base URLs](https://www.alibabacloud.com/help/en/model-studio/base-url), [Chat API](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions), [Models](https://www.alibabacloud.com/help/en/model-studio/models)                                          |
| DeepSeek                 | `https://api.deepseek.com`                               | `deepseek-flash`         | OpenAI-compatible Chat Completions; Bearer                              | [API introduction and current models](https://api-docs.deepseek.com/), [Models API](https://api-docs.deepseek.com/api/list-models/)                                                                                                                                                      |
| xAI                      | `https://api.x.ai/v1`                                    | `grok-4.7`               | Supported Chat Completions interface; Bearer                            | [Models](https://docs.x.ai/developers/models), [Chat API](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions)                                                                                                                                                    |
| Mistral                  | `https://api.mistral.ai/v1`                              | `mistral-small-latest`   | OpenAI-compatible Chat Completions; Bearer                              | [Models](https://docs.mistral.ai/models), [Official model aliases](https://docs.mistral.ai/vibe/code/cli/configuration), [Chat API](https://docs.mistral.ai/api/endpoint/chat)                                                                                                           |
| Groq                     | `https://api.groq.com/openai/v1`                         | `openai/gpt-oss-120b`    | OpenAI-compatible Chat Completions; Bearer                              | [Models and production/preview status](https://console.groq.com/docs/models), [API reference](https://console.groq.com/docs/api-reference)                                                                                                                                               |
| Ollama                   | `http://127.0.0.1:11434/v1`                              | Discovered locally       | OpenAI-compatible Chat Completions; no key required by the local server | [Compatibility and endpoints](https://docs.ollama.com/api/openai-compatibility)                                                                                                                                                                                                          |
| LM Studio                | `http://127.0.0.1:1234/v1`                               | Discovered locally       | OpenAI-compatible Chat Completions; optional server Bearer token        | [OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat), [Authentication](https://lmstudio.ai/docs/developer/core/authentication)                                                                                                                                       |
| Custom OpenAI-compatible | User supplied                                            | User supplied/discovered | Chat Completions; optional Bearer key                                   | [Expected protocol](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create); actual compatibility depends on the server                                                                                                                      |

`gemini-3.6-flash` is a documented stable model, not a guessed ID. It is the
initial Gemini choice requested for this integration. The catalogue also includes
newer Flash models and explicitly labels Pro Preview. Defaults favor practical
writing use; they are not claims that one model is best for every document.

## Model discovery

| Service   | Documented operation and response                                                                                                                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI    | [`GET /v1/models`](https://developers.openai.com/api/reference/resources/models/methods/list): `data[].id`; no pagination parameters documented. The endpoint also lists models unsuitable for text chat.                                                                                                        |
| Anthropic | [`GET /v1/models`](https://platform.claude.com/docs/en/api/models/list): `data[].id`, `display_name`; follow `has_more` and `last_id` using `after_id`. `limit` supports up to 1,000. Retired models are excluded by default.                                                                                    |
| Gemini    | [`GET /v1beta/models`](https://aistudio.google.com/api-reference/models/list-models): `models[].name`, `displayName`, `supportedGenerationMethods`; select `generateContent` models, strip the `models/` prefix for the selector, and follow `nextPageToken` using `pageToken`. `pageSize` supports up to 1,000. |
| Qwen      | [`GET /api/v1/models`](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/list-models) on the regional/workspace host, **not** the Chat Completions path: `capabilities=TG`, `page_no`, `page_size`; response `output.models[].model`, `name`, `output.total`, `page_no`, `page_size`.            |
| DeepSeek  | [`GET /models`](https://api-docs.deepseek.com/api/list-models/): `data[].id`; no pagination documented.                                                                                                                                                                                                          |
| xAI       | [`GET /v1/models`](https://docs.x.ai/developers/rest-api-reference/inference/models): available models for the authenticated key. Filter non-text products.                                                                                                                                                      |
| Mistral   | [`GET /v1/models`](https://docs.mistral.ai/api/endpoint/models): current documentation shows an array of models; also accept the older `data` envelope. `capabilities.completion_chat` distinguishes chat models.                                                                                                |
| Groq      | [`GET /openai/v1/models`](https://console.groq.com/docs/api-reference): `data[].id`, `active`; filter inactive and non-text models.                                                                                                                                                                              |
| Ollama    | [`GET /v1/models`](https://docs.ollama.com/api/openai-compatibility); the native equivalent is [`GET /api/tags`](https://docs.ollama.com/api/tags). No automatic model download. Choose an installed local model for offline operation.                                                                          |
| LM Studio | [`GET /v1/models`](https://lmstudio.ai/docs/developer/openai-compat/models) lists loaded models, or downloaded models when Just-In-Time loading is enabled. Server authentication applies when enabled.                                                                                                          |
| Custom    | Try `/models` relative to the supplied base URL; keep manual model entry when discovery is unsupported.                                                                                                                                                                                                          |

Discovery metadata varies across services. A model appearing in a list does not
prove that the key can generate text with it; the connection test performs a
small generation request. Models removed from a live list must not silently
replace a user's saved model selection.

## Regional and protocol details

- **Qwen:** the default is the Singapore pay-as-you-go service. Beijing uses
  `https://dashscope.aliyuncs.com/compatible-mode/v1`; Virginia uses
  `https://dashscope-us.aliyuncs.com/compatible-mode/v1`; Hong Kong uses
  `https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1`. The key,
  workspace, region and billing plan must match. Model Studio recommends
  workspace-specific `*.maas.aliyuncs.com` URLs; the documented shared DashScope
  addresses remain available. Paste a workspace-specific base URL when required.
  Coding Plan credentials and endpoints are separate from pay-as-you-go.
  [Official endpoint guide](https://www.alibabacloud.com/help/en/model-studio/base-url),
  [regional key scope](https://www.alibabacloud.com/help/en/model-studio/singapore-regional-access-information).
- **Anthropic:** `x-api-key` remains a documented authentication option, alongside
  Bearer authentication. Organization-wide keys require
  `anthropic-workspace-id`; workspace-scoped keys do not. API version
  `2026-10-21` removes `temperature`, `top_p` and `top_k`, so these must not be sent.
  [Authentication](https://platform.claude.com/docs/en/api/overview),
  [version migration](https://platform.claude.com/docs/en/api/migration-2026-10-21).
- **Gemini:** use the native Developer API, with `systemInstruction`, `contents`
  and `generationConfig`; stream with `:streamGenerateContent?alt=sse`. Consume
  answer text, not `thought: true` parts. Google AI Studio keys are distinct from
  Vertex AI configuration. Thinking and sampling parameters vary by model:
  3.6 Flash permits `MINIMAL`; 3.8 Flash permits `LOW` but not `MINIMAL` and removes
  older sampling controls. A tiny output budget can be exhausted before an answer.
  [Streaming schema](https://aistudio.google.com/api-reference/generate-content/stream-generate-content),
  [thinking](https://aistudio.google.com/docs/thinking),
  [latest model migration](https://ai.google.dev/gemini-api/docs/latest-model).
- **Chat compatibility is not parameter identity:** OpenAI, xAI and Groq document
  `max_completion_tokens`; other services retain `max_tokens`. Do not send
  OpenAI-only storage controls or a universal thinking/sampling configuration to
  every provider. xAI still supports Chat Completions but recommends Responses for
  new integrations. Qwen's `qwen-flash` defaults to non-thinking, while newer Qwen
  families can enable thinking by default. DeepSeek also distinguishes reasoning
  from answer content. Follow the linked Chat API references and
  [Qwen thinking guide](https://www.alibabacloud.com/help/en/model-studio/deep-thinking).

Keep the catalogue's verification date and this reference updated together.
Do not infer service support from a model name alone or store credentials in this
document, source files, diagnostics or model-discovery caches.
