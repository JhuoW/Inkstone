# Inkstone 墨石 — logo & app icon kit

Open `brand-sheet.html` for the visual overview: concept, every lockup, the icon at all sizes, colours and usage rules.

## Concept

The mark is a **free-form inkstone (随形砚)**: a polished river stone, slightly fuller at its base and tilted 8°. It holds one **drop-shaped ink well (墨池)**. The same drop replaces the dot of the *i* in the wordmark, so the mark and the name share one shape.

## What's inside

| Folder | Contents |
|---|---|
| `logo/svg`, `logo/png` | `inkstone-mark`, `inkstone-logo-horizontal` (with 墨石), `-horizontal-en`, `-stacked`, `-zh`, `inkstone-wordmark`, `inkstone-seal`. Ink and `-reversed` (paper) versions. Transparent PNGs, 2048–4800 px wide. |
| `icon/svg` | `inkstone-icon` (light, macOS grid), `-dark`, `-square` (opaque, for iOS / Android maskable), `-small` (simplified art for 32 px and below), `layers/` (background and foreground for macOS Icon Composer or Android adaptive icons). |
| `icon/png` | `inkstone-icon-16 … 1024`, plus dark versions at 256, 512 and 1024. |
| `icon/macos` | `Inkstone.icns` (16 px to 512@2x) and the `Inkstone.iconset/` it was built from. |
| `icon/windows` | `Inkstone.ico` (16, 20, 24, 32, 40, 48, 64, 128, 256: BMP below 256 for NSIS compatibility, PNG at 256) plus loose PNGs. |
| `icon/web` | `favicon.svg` (switches to light-on-dark in dark mode), `favicon.ico`, `apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png`, `site.webmanifest`. |

All logo SVGs are pure outlines: no fonts and no external references.

## Hooking it up

**Electron (electron-builder)**: copy into `build/`:
```
icon/macos/Inkstone.icns      -> build/icon.icns
icon/windows/Inkstone.ico     -> build/icon.ico
icon/png/inkstone-icon-1024.png -> build/icon.png   (Linux)
```

**Tauri**: in `src-tauri/tauri.conf.json` under `bundle.icon`, list
`icons/32x32.png` (`inkstone-icon-32.png`), `icons/128x128.png`, `icons/128x128@2x.png` (`inkstone-icon-256.png`), `icons/icon.icns`, `icons/icon.ico`.
You can also run `npx tauri icon icon/png/inkstone-icon-1024.png`, but that step downsamples the detailed art. Keep the hand-tuned small sizes from this kit.

**Web**:
```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

## Colour

| | Hex | Use |
|---|---|---|
| 墨 Ink | `#1C1A21` | Logo, text, the stone |
| 宣 Paper | `#F4F0E6` | Backgrounds, the well |
| 石 Stone | `#76717D` | Secondary text, rules |
| 朱 Vermilion | `#C8402B` | The seal and sparing accents only. Never on the drop. |

## Type & licence

The wordmark letters come from **Noto Serif SC** (Source Han Serif): SemiBold for *inkstone*, Medium for 墨石. They are outlined from the open-source font under the **SIL Open Font License 1.1**, which allows use in logos and commercial products. Everything else is original geometry generated in `src/`.

## Usage

- Keep clear space around any logo at least the width of the drop.
- Minimum sizes: mark 16 px, horizontal logo 120 px wide.
- Lighting effects belong to the app icon only. Keep the logo flat, keep the 8° tilt, and don't recolour the drop.

## Rebuilding

Everything is generated from code, so you can change a value and rebuild:

```bash
python src/build.py
```

You need Python 3 with `Pillow` and `fontTools`, Chrome or Edge (used headless to rasterise the SVGs exactly), and Noto Serif SC (`NotoSerifSC-VF.ttf`, path set in `src/textpath.py`). The shape parameters are `STONE` and `WELL` in `src/geom.py`. The palette and lockup spacing are in `src/brand.py`.
