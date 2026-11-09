# AI Writing Assistant

Use the highlighted **AI Writing Assistant** button (pen-nib icon), centered in the document titlebar's free space, to open the bottom panel. The Chinese interface labels it **AI写作助手**. The button's active appearance follows the panel's open state; click it again to collapse the panel. You can also press **Ctrl+Shift+A**, choose **View → AI Writing Assistant**, or press **Ctrl+Shift+P** and search for **AI**. The shortcut can be changed with the `aiAssistant` key in **Preferences → Keyboard shortcuts**. Drag the panel's top divider to resize it, or use the focused divider's arrow keys. The panel sits beneath the document, beside the file sidebar, and remembers its size and visibility.

## Connect a model

Open **Preferences → AI / Models**, the panel's **Models** button, or **Set up a model**, which the panel shows until a model is configured. If you start analysis or chat without a configured model, **AI Model Setup** opens automatically. Before anything is configured, the dialog does not contact any server on its own: choose a provider, or select **Refresh** for the one already selected, to load its models. For Ollama or LM Studio, start the local server first. Test and save the configuration to continue the pending action. Cancel leaves your document and question untouched. If the document changes during setup, Inkstone asks you to start the action again instead of sending stale content.

- Choose **OpenAI**, **Anthropic (Claude)**, **Google (Gemini)**, **Alibaba Cloud (Qwen)**, **DeepSeek**, **xAI (Grok)**, **Mistral**, **Groq**, **Ollama**, **LM Studio**, or **Custom OpenAI-Compatible API**.
- Known providers fill their official endpoint and a documented default model. Qwen also offers region selection; the region must match your API key. Endpoints remain editable for proxies or your own server. Each provider remembers its own saved endpoint, model and options.
- Enter your API key where required. The model dropdown prefers models discovered from your account. Before authentication, or if discovery fails, documented reference models are explicitly labelled as a fallback; listing a model does not guarantee account access. You can always choose **Enter a custom model ID**.
- For **Ollama** or **LM Studio**, start the local server. Inkstone discovers available models and selects one when none is configured. Their default addresses are `http://127.0.0.1:11434/v1` and `http://127.0.0.1:1234/v1`. Download/load a text model first; Inkstone does not download weights. Local inference can run fully offline.
- **Test connection** tests the draft without saving it. **Test & save** (or **Save & continue**) verifies the selected model, encrypts any key, and saves. Cancelling setup does not commit its drafts. Advanced settings include request limits and an optional Anthropic workspace ID for organization-scoped keys.

Inkstone connects directly to your selected provider; no Inkstone account or server is involved. Model availability and API billing belong to that provider. Connection tests and model listing contact the selected endpoint; tests send only a short synthetic prompt. Document content is sent only when you start analysis or chat. Opening the panel does not upload the document. See the [official provider references](AI_PROVIDERS.md) for verified defaults, protocols and regional differences.

Keys are encrypted through Electron's operating-system credential protection and kept separate from editor preferences. Credentials are scoped to a provider and exact normalized endpoint; changing an endpoint does not forward a key saved for another address. Existing keys are never returned to the renderer. On Linux, a working secure keyring is required to persist credentials; unencrypted fallback is refused. Local services without authentication need no stored key.

## Review and revise

Choose the whole document or a selected passage and select **Academic**, **Technical**, or **General** writing. Analysis returns a summary, a total score, dimension scores with reasons, and concrete suggestions. Scores are model judgments, not an objective verification of factual correctness. The prompt asks the model to avoid invented facts and citations; Inkstone cannot independently verify its claims.

Suggestions show the original and proposed replacement. Locate the source, then explicitly accept or dismiss the change. Only an exact, unambiguous source match can be applied; quotes that differ from the document only in spacing are matched to the exact source text, and suggestions that still cannot be located are counted as omitted. Accepting a suggestion uses the normal editor transaction, preserving surrounding Markdown and the existing save and undo flow. **Ctrl+Z** undoes the change.

Accepting one suggestion does not invalidate the others. Each suggestion follows its passage through later edits, including other accepted suggestions and your own typing elsewhere, and shows its state:

- **Pending** — the original passage is unchanged and can be accepted.
- **Applied** — the replacement is in the document. **Revert** restores the original passage of that suggestion only.
- **Outdated** — the quoted passage itself was edited, so the suggestion is kept for reference but no longer applied automatically. If you undo that edit, the suggestion becomes available again.

When two or more suggestions are pending, **Accept all** applies them as one undo step; overlapping or edited passages are skipped and reported. Results stay visible while you edit and are cleared only when you switch, reload or restore another version of the document.

Chat uses the current document or selection as context. Responses stream into the panel while editing remains available; edits made while a request runs do not discard its result. Each reply offers **Copy** and **Insert at cursor** (one undo step). Cancel (or **Esc** inside the panel) stops a request; switching documents discards pending results. Chat history is kept only in the current panel session, not written into your document or synced to a server.

## Privacy and limitations

The main process handles network requests. Official cloud defaults use HTTPS; editable HTTP/HTTPS endpoints support local, proxy and self-hosted services. Redirects are refused. The renderer has no access to stored keys, and responses are displayed as text rather than executable HTML. Requests, responses and history have explicit size limits and timeouts. Very long documents should be reviewed in selected sections.

Analyses request structured output where the service supports it: a strict JSON schema for OpenAI, xAI, Mistral, Groq, Ollama, LM Studio and custom servers, JSON mode for Qwen and DeepSeek, a forced review tool for Anthropic and a response schema for Gemini. If a service rejects that parameter, Inkstone retries once with the next option and finally with JSON requested only by the prompt, and remembers the choice for that model during the session. Every response is validated against the same schema before it is shown.

Provider errors, unsupported models, malformed analysis, incomplete streams and connection loss are surfaced without automatically applying edits. In the Chinese interface these messages are shown in Chinese. Temporary server failures (HTTP 500/502/503/504, for example an overloaded model) are retried twice after short pauses, and the panel shows **Provider busy; retrying (1/2)…** while it waits. Rate limits (HTTP 429) and authentication errors are reported immediately; Gemini's HTTP 400 for an invalid key is reported as an API key problem.

Summaries and reasons follow the interface language. Replacement text stays in the language of the passage it replaces, and chat replies follow the language of your question. Local model quality depends on the model and hardware. Automated protocol tests use deterministic local servers; real provider/model verification requires access and is reported separately from those tests.

The in-editor review concept is inspired by [PaperDebugger](https://github.com/PaperDebugger/paperdebugger). The integration is implemented independently, using Inkstone's existing editor and Electron architecture.
