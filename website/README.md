# Inkstone website

A standalone, bilingual static website based on the supplied Inkstone home-page designs.

- `index.html` — English
- `zh.html` — 简体中文
- `styles.css` / `site.js` — responsive layout and the language slider
- `assets/` — local brand assets, product screenshots and fonts

Open either HTML file directly, or serve this directory:

```sh
python -m http.server 8080 --directory website
```

Then visit `http://localhost:8080`. The directory entry uses the visitor's saved language choice, or their browser language. Explicit `index.html` and `zh.html` URLs always show the requested language. Switching languages keeps the current section; ordinary language links also work without JavaScript.

Deploy the contents of `website/` to any static host, at either the domain root or a subdirectory. No build step, package installation, external fonts or application runtime is required. Windows download links always point to the [latest GitHub Release](https://github.com/JhuoW/Inkstone/releases/latest).

Brand files are copied unchanged from `inkstone-brand/`. Product screenshots come from `artifacts/website-home/assets/`. Update both language pages when changing content. The bundled Noto font subsets include their license and attribution in `assets/fonts/`; after adding new characters, optionally regenerate them with `python website/tools/build-fonts.py C:/Windows/Fonts` (requires FontTools, Brotli and the Noto SC variable fonts).

For maintainers, run `node website/verify.mjs` from the repository after installing its existing development dependencies. It checks both languages, navigation and screen widths from 320 to 1440 pixels. Set `INKSTONE_WEBSITE_EVIDENCE` to choose where screenshots and results are saved.
