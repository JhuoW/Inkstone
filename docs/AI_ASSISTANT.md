# AI Writing Assistant

Use **AI** in the editor toolbar to open the bottom panel. Drag its top divider to resize it, or use the focused divider's arrow keys. The panel sits beneath the document, beside the file sidebar, and remembers its size and visibility.

## Connect a model

Open **Preferences → AI / Models** or the panel's model settings. Inkstone connects directly to the provider you choose; no Inkstone account or server is involved.

- **Local**: start Ollama or LM Studio with its OpenAI-compatible server enabled. Enter a loopback endpoint such as `http://localhost:11434/v1` (Ollama) or `http://localhost:1234/v1` (LM Studio), then select or type an installed model name. Download the model beforehand for offline use.
- **OpenAI**: supply your API key and an available model ID.
- **Claude**: supply your Anthropic API key and an available Claude model ID.

Save the configuration and test the connection. Model availability and API billing belong to your provider. Connection tests and model listing contact the selected provider; document content is sent only when you start analysis or chat. No document is automatically uploaded on opening the panel.

Keys are encrypted through Electron's operating-system credential protection and kept separate from editor preferences. Existing keys are never returned to the renderer. On Linux, a working secure keyring is required to persist credentials; unencrypted fallback is refused. Local services without authentication need no stored key.

## Review and revise

Choose the whole document or a selected passage and select **Academic**, **Technical**, or **General** writing. Analysis returns a summary, a total score, dimension scores with reasons, and concrete suggestions. Scores are model judgments, not an objective verification of factual correctness. The prompt asks the model to avoid invented facts and citations; Inkstone cannot independently verify its claims.

Suggestions show the original and proposed replacement. Locate the source, then explicitly accept or reject the change. Only an exact, unambiguous source match can be applied. Accepting a suggestion uses the normal editor transaction, preserving surrounding Markdown and the existing save and undo flow. **Ctrl+Z** undoes the change. After an edit or document switch, old suggestions cannot be applied; analyze the updated document again.

Chat uses the current document or selection as context. Responses stream into the panel while editing remains available. Cancel stops a request; changing documents or editing the context invalidates pending results. Chat history is kept only in the current panel session, not written into your document or synced to a server.

## Privacy and limitations

The main process handles network requests. Local endpoints are restricted to loopback; cloud endpoints use the official HTTPS service. The renderer has no access to stored keys, and responses are displayed as text rather than executable HTML. Requests, responses and history have explicit size limits and timeouts. Very long documents should be reviewed in selected sections.

Provider errors, unsupported models, malformed analysis, incomplete streams and connection loss are surfaced without automatically applying edits. Local model quality depends on the model and hardware. Tests use deterministic local servers; live paid OpenAI/Anthropic calls require the user's own credentials.

The in-editor review concept is inspired by [PaperDebugger](https://github.com/PaperDebugger/paperdebugger). The integration is implemented independently, using Inkstone's existing editor and Electron architecture.
