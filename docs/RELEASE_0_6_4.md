# Inkstone 0.6.4 — final release validation

Date: 2026-11-09. This patch follows 0.6.3.

The final review fixes code-fence metadata being interpreted as a language when selecting plain text, preserves the caret when switching a code language, and closes an unfinished fence before Ctrl+Enter returns to prose. New browser and native desktop cases cover these regressions.

Independent CI also exposed a native context-menu coordinate mismatch when zooming. Native coordinates are now converted to CSS coordinates for hit testing and spelling suggestions; regression cases cover 75%, 150% and 200% zoom without relying on the renderer menu already being visible. Test fixtures now preserve empty clipboards correctly and use canonical paths, matching the real file tree when Windows TEMP uses an 8.3 alias.

`README.md` is now the concise English landing page; `README.zh-CN.md` is its Chinese counterpart. Both start with the original shared brand artwork, link to each other, and show an actual desktop screenshot in the selected language.

Windows distribution now builds and publishes only the NSIS installer. Historical archives remain historical records. The tag-based release workflow validates the version, tests the packaged application and checks its source identity before publishing the installer. Linux source builds remain available; Linux validation uses the explicit Ubuntu 22.04 runner instead of the changing `ubuntu-latest` image.

Final local validation on Windows, using Node.js 22.23.4:

| Check | Result |
| --- | --- |
| Unit tests | 153 passed |
| Browser regression groups | 110 passed |
| Full Electron desktop suite | 124 passed |
| Application extracted from the actual NSIS installer | 19 passed |
| Packaged runtime files compared with the current build | 300 identical |
| Source/build files unchanged throughout validation | 345 identical |

All 406 automated checks passed, including the new code-fence, empty-clipboard and zoom regressions. Packaged-application checks used the normal Chromium sandbox. An additional packaged interaction check passed formula editing, table context menus, clipboard round trips, undo and actual file saving. The installer and application passed PE version/icon verification, and the installer payload matched the unpacked application's ASAR. Both README screenshots were captured from the actual desktop app using isolated sample documents and profiles; their language links and local image paths were verified.

Detailed results are recorded in `artifacts/windows-validation/0.6.4` locally; the release workflow independently builds and checks the published installer. Local validation launches the extracted application without installing it or changing OS default applications. This is regression evidence, not a claim that every possible bug is excluded.
