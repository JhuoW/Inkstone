# Inkstone product

<!-- impeccable:product-schema 1 -->

## Platform

web

The renderer uses web technologies inside Electron. The shipped product is a Windows-first, Linux-compatible desktop editor, not a hosted website. macOS is out of scope.

## Users and purpose

The explicit brief is daily Markdown writing, including Chinese and English, with a quiet editor comparable in interaction quality to established desktop tools. Further demographic or commercial positioning is unspecified.

## Operating context

People open local files and folders, write in Live Preview or source mode, navigate a tree/outline/search, edit formulas and tables, and export locally. Core writing works offline. No account, cloud sync, image upload, or service integration is part of the product. Images use local references or explicit URLs.

## Capabilities and constraints

Every existing function is retained. Before/after command, preference and export inventories and regression records live in `docs/UI_FUNCTION_BASELINE.md` and `artifacts/ui-redesign/`. Source text is authoritative; a visual change must not reserialize Markdown or reset selections, undo history, composition or save/exit state. Native menus, keyboard shortcuts and contextual access remain available. Default language is English; English/Chinese switching stays persistent.

## Brand commitments

Inkstone / 墨石, original supplied artwork in `inkstone-brand`, and the documented Ink/Paper/Stone/Vermilion identity. Use the outlined logo unchanged. Do not introduce stock illustrations, a new logo, gradients, decorative motion or card-based dashboard styling.

## Evidence

Version 0.3 baseline: 90 unit tests, 21 editor browser groups, 10 formula groups, 9 UI groups and 67 Electron cases. Windows packages have been cross-built and statically checked; Linux and Wine evidence does not constitute native Windows acceptance. Current detailed functionality and limitations remain in `FEATURE_PARITY.md`.

## Product principles

1. Preserve documents and user control before changing presentation.
2. Keep writing primary and commands discoverable.
3. Follow Windows/Linux keyboard, focus and window conventions.
4. Apply consistent design tokens across light/dark, languages and zoom.
5. Verify actual interactions and rendered screenshots, not just code structure.
