<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/inkstone-logo-horizontal-reversed.png">
    <img src="docs/images/inkstone-logo-horizontal.png" alt="Inkstone 墨石" width="520">
  </picture>
</p>

<p align="center"><strong>A place for your thoughts</strong></p>
<p align="center">English · <a href="README.zh-CN.md">简体中文</a></p>
<p align="center"><a href="https://wei2hu0.github.io/inkstone-website/index.html">Visit the official website ↗</a></p>

Inkstone is an **AI-powered local Markdown editor** for focused writing, with LLM-based document analysis, scoring, and revision suggestions. Your notes stay as ordinary files on your computer.

![Inkstone — English interface](docs/images/main-en.png)

## Download

**[Download the latest Windows installer](https://github.com/JhuoW/Inkstone/releases/latest)**

Run the installer to install or upgrade Inkstone. Choose it from **Open with** for Markdown files, or use **Tools → Default Markdown app** to open Windows default-app settings.

## Features

- [AI Writing Assistant](docs/AI_ASSISTANT.md): 11 provider choices including local models, OpenAI, Claude, Gemini and DeepSeek; model discovery, document scoring, chat and reviewed revisions in a resizable bottom panel.
- Live Markdown editing, a `/` menu for inserting blocks, and a source mode that preserves selection and undo history.
- Inline formulas, LaTeX math blocks, Mermaid diagrams, and editable tables.
- Persistent code blocks with syntax highlighting and a language picker.
- Local folders, search, autosave and recovery; export to PDF, HTML and images, or to Word and more with Pandoc.
- English and Simplified Chinese interfaces, light and dark themes, and an immersive writing mode.

### AI Writing Assistant

Analyze your document for an overall score, feedback on each dimension and suggested revisions. Review every change before you accept it.

![AI Writing Assistant with document analysis, scoring and revision suggestions](docs/images/AI-demo-en.png)

### Math, as you write

Formulas render in place. Click to edit the expression directly in your paragraph.

![Inline formula editing and a rendered math block](docs/images/math-en.png)

### Code that stays editable

Type or paste into a code block, then choose its language for syntax highlighting.

![Python and SQL code blocks with language pickers](docs/images/code-en.png)

### Tables, a right-click away

Insert a table or use its context menu to add, move, and remove rows and columns.

![Table editing through the context menu](docs/images/tables-en.png)

## Development

Requires **Node.js 22.12+**. Windows is the primary release platform; Linux source builds are also available.

```sh
npm ci
npm start
```

Use `npm test` for unit tests and `npm run dist:win` to build the Windows installer. See the [0.9.1 release notes](docs/releases/v0.9.1.md), [architecture](docs/ARCHITECTURE.md) and the [Electron API](electron/API.md) for details.

## License & contributor

[AGPL-3.0-only](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [Wei Zhuo](https://wei2hu0.github.io/)
