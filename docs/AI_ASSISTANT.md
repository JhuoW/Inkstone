# AI Writing Assistant

Use the highlighted **AI Writing Assistant** button (pen-nib icon), centered in the document titlebar's free space, to open the bottom panel. The Chinese interface labels it **AI写作助手**. The button's active appearance follows the panel's open state; click it again to collapse the panel. You can also press **Ctrl+Shift+P** and search for **AI**. Drag the panel's top divider to resize it, or use the focused divider's arrow keys. The panel sits beneath the document, beside the file sidebar, and remembers its size and visibility.

## Connect a model

Open **Preferences → AI / Models** or the panel's **Models** button. If you start analysis or chat without a configured model, **AI Model Setup** opens automatically. Test and save the configuration to continue the pending action. Cancel leaves your document and question untouched. If the document changes during setup, Inkstone asks you to start the action again instead of sending stale content.

- Choose **OpenAI**, **Anthropic (Claude)**, **Google (Gemini)**, **Alibaba Cloud (Qwen)**, **DeepSeek**, **xAI (Grok)**, **Mistral**, **Groq**, **Ollama**, **LM Studio**, or **Custom OpenAI-Compatible API**.
- Known providers fill their official endpoint and a documented default model. Qwen also offers region selection; the region must match your API key. Endpoints remain editable for proxies or your own server. Each provider remembers its own saved endpoint, model and options.
- Enter your API key where required. The model dropdown prefers models discovered from your account. Before authentication, or if discovery fails, documented reference models are explicitly labelled as a fallback; listing a model does not guarantee account access. You can always choose **Enter a custom model ID**.
- For **Ollama** or **LM Studio**, start the local server. Inkstone discovers available models and selects one when none is configured. Their default addresses are `http://127.0.0.1:11434/v1` and `http://127.0.0.1:1234/v1`. Download/load a text model first; Inkstone does not download weights. Local inference can run fully offline.
- **Test connection** tests the draft without saving it. **Test & save** (or **Save & continue**) verifies the selected model, encrypts any key, and saves. Cancelling setup does not commit its drafts. Advanced settings include request limits and an optional Anthropic workspace ID for organization-scoped keys.

Inkstone connects directly to your selected provider; no Inkstone account or server is involved. Model availability and API billing belong to that provider. Connection tests and model listing contact the selected endpoint; tests send only a short synthetic prompt. Document content is sent only when you start analysis or chat. Opening the panel does not upload the document. See the [official provider references](AI_PROVIDERS.md) for verified defaults, protocols and regional differences.

Keys are encrypted through Electron's operating-system credential protection and kept separate from editor preferences. Credentials are scoped to a provider and exact normalized endpoint; changing an endpoint does not forward a key saved for another address. Existing keys are never returned to the renderer. On Linux, a working secure keyring is required to persist credentials; unencrypted fallback is refused. Local services without authentication need no stored key.

## Review and revise

Choose the whole document or a selected passage and select **Academic**, **Technical**, or **General** writing. Analysis returns a summary, a total score, dimension scores with reasons, and concrete suggestions. Scores are model judgments, not an objective verification of factual correctness. The prompt asks the model to avoid invented facts and citations; Inkstone cannot independently verify its claims.

Suggestions show the original and proposed replacement. Locate the source, then explicitly accept or reject the change. Only an exact, unambiguous source match can be applied. Accepting a suggestion uses the normal editor transaction, preserving surrounding Markdown and the existing save and undo flow. **Ctrl+Z** undoes the change. After an edit or document switch, old suggestions cannot be applied; analyze the updated document again.

Chat uses the current document or selection as context. Responses stream into the panel while editing remains available. Cancel stops a request; changing documents or editing the context invalidates pending results. Chat history is kept only in the current panel session, not written into your document or synced to a server.

## Privacy and limitations

The main process handles network requests. Official cloud defaults use HTTPS; editable HTTP/HTTPS endpoints support local, proxy and self-hosted services. Redirects are refused. The renderer has no access to stored keys, and responses are displayed as text rather than executable HTML. Requests, responses and history have explicit size limits and timeouts. Very long documents should be reviewed in selected sections.

Provider errors, unsupported models, malformed analysis, incomplete streams and connection loss are surfaced without automatically applying edits. Local model quality depends on the model and hardware. Automated protocol tests use deterministic local servers; real provider/model verification requires access and is reported separately from those tests.

The in-editor review concept is inspired by [PaperDebugger](https://github.com/PaperDebugger/paperdebugger). The integration is implemented independently, using Inkstone's existing editor and Electron architecture.
