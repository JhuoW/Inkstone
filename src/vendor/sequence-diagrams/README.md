# js-sequence-diagrams vendored source

Upstream: https://github.com/bramp/js-sequence-diagrams

Pinned revision: `6e597f796b6f68a1215f6186ec4ae6a5a8b1837d` (distribution identifies itself as 2.0.1).

Source: https://raw.githubusercontent.com/bramp/js-sequence-diagrams/6e597f796b6f68a1215f6186ec4ae6a5a8b1837d/dist/sequence-diagram.js

Original SHA-256: `e10dbc383bc84ab9040fa383733f8ee3bce84dee12723dd4e6b73dbe83520e9d`.

License: BSD-2-Clause for the retained JavaScript, complete upstream notice in `LICENCE`. The upstream distribution's optional Daniel vector-font data (separately licensed CC BY-ND 3.0) is omitted entirely. Inkstone uses local system fonts for both ordinary and hand-drawn diagrams, preserving Chinese labels without bundling that font asset.

Adaptations are limited to module/lifecycle integration:

- Import MIT-licensed `underscore` and `raphael` from locked npm dependencies.
- Export the `Diagram` class as an ES module instead of installing a global.
- Remove the inactive Node command-line `fs`/`path` export block.
- Omit the optional Daniel vector-font asset and use system text with the native hand-drawn geometry.
- Return the created theme from `drawSVG`, allowing the caller to dispose the Raphael paper after copying its sanitized SVG.

No source-string `eval`, `Function` constructor, remote script, CDN, or runtime font download is used. The upstream grammar, layout, note handling, alias handling, arrow semantics, and theme implementations are retained.
