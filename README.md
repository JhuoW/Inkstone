<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/inkstone-logo-horizontal-reversed.png">
    <img src="docs/images/inkstone-logo-horizontal.png" alt="Inkstone 墨石" width="520">
  </picture>
</p>

<p align="center"><strong>A place for your thoughts</strong></p>
<p align="center">English · <a href="README.zh-CN.md">简体中文</a></p>

Inkstone is a local Markdown editor for focused writing. Your notes stay as ordinary files on your computer.

![Inkstone — English interface](docs/images/main-en.png)

## Download

**[Download Inkstone 0.6.4 for Windows x64](https://github.com/JhuoW/Inkstone/releases/download/v0.6.4/Inkstone-0.6.4-windows-x64.exe)** · [Release notes](https://github.com/JhuoW/Inkstone/releases/latest)

Run the installer to install or upgrade Inkstone. Choose it from **Open with** for Markdown files, or use **Tools → Default Markdown app** to open Windows default-app settings.

## Features

- Live Markdown editing with a source mode that preserves selection and undo history.
- Inline formulas, LaTeX math blocks, Mermaid diagrams, and editable tables.
- Persistent code blocks with syntax highlighting and a language picker.
- Local folders, search, autosave, recovery, and HTML/PDF export.
- English and Simplified Chinese interfaces, light and dark themes.

## Development

Requires **Node.js 22.12+**. Windows is the primary release platform; Linux source builds are also available.

```sh
npm ci
npm start
```

Use `npm test` for unit tests and `npm run dist:win` to build the Windows installer. See [validation notes](docs/RELEASE_0_6_4.md) and the [Electron API](electron/API.md) for details.

## License & contributor

[AGPL-3.0-only](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [Wei Zhuo](https://wei2hu0.github.io/)
