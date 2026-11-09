# Inkstone desktop design system

This redesign retains the supplied brand identity and all existing behavior. It follows the user’s explicit professional desktop brief. The main surface is **Operate**; the document canvas is **Read**. App screens are implemented directly in code. No new illustration, stock asset or generated mockup is needed.

## Structure and hierarchy

The native system window frame and menu remain. Inside the window, a compact file header establishes the active document; a 38px editing toolbar contains familiar formatting and labeled access to insertion commands; a 26px status bar holds writing statistics and modes. A resizable sidebar keeps files, outline and search as three stable destinations. No landing-page hero, decorative card grid, full-bleed accent or animation is appropriate.

```
Native Windows/Linux menu and window controls
┌──────────────────────┬────────────────────────────────────────────┐
│ Inkstone wordmark    │ Sidebar  folder / document       Save state│
│ Folder     Pin  New  ├────────────────────────────────────────────┤
│ Files Outline Search│ Text formatting     Insert ▾  Source Export│
│ Filter / tree-list   ├────────────────────────────────────────────┤
│                      │                                            │
│ Local file tree      │                 Document                   │
│                      │                                            │
│ Quick open           │                                            │
│ Preferences          ├────────────────────────────────────────────┤
│                      │ Words       Position / Encoding / Modes    │
└──────────────────────┴────────────────────────────────────────────┘
```

All current toolbar commands remain reachable. Insertion menus complement the native menu and searchable command palette; they never replace the underlying actions. File tree rows and settings use alignment and grouping, not containers styled as cards. Empty states explain the immediate next action.

## Color tokens

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `#fcfcfa` | `#202124` | Reading canvas |
| `--sidebar` | `#f2f1ed` | `#18191c` | Navigation / secondary surface |
| `--panel` | `#ffffff` | `#242529` | Menus, dialogs, inputs |
| `--text` | `#1c1a21` | `#f4f0e6` | Supplied brand Ink/Paper, primary text |
| `--muted` | `#67636b` | `#b4b0b8` | Secondary UI text |
| `--border` | `#dedee0` | `#393a40` | Structural separation |
| `--control-border` | `#95929b` | `#71727b` | Form control boundary |
| `--accent` | `#59525f` | `#ccc3d2` | Restrained Stone-derived active state |
| `--selection-bg` | `#dedee9` | `#464150` | Visible text selection |
| `--code-bg` | `#f1f2f3` | `#292b30` | Code and formula source surface |

The original `--ink-ink`, `--ink-paper`, `--ink-stone`, `--ink-vermilion` values remain intact. Vermilion is sparing, meaningful emphasis only. It is not the background of every primary button. Controls have consistent default, hover, active, focus, disabled, busy and error states. Text and placeholders target 4.5:1 contrast; focus and input boundaries are checked separately.

## Type and spacing

- Chrome: Segoe UI / Noto Sans / Microsoft YaHei / system sans; 13px controls, 12px supporting text, 14px dialog titles. Brand typography is the supplied outlined artwork, not a substitute font.
- Document defaults remain 17px, 1.75 leading and configurable 780px measure; existing user font and layout preferences are honored. Headings derive from the document scale. Code uses Cascadia Code / Consolas / Liberation Mono.
- A single spacing scale: 2, 4, 8, 12, 16, 24, 32px. Related controls stay close; sections receive separation. Do not use letter-spaced uppercase UI labels.
- Form controls and action buttons: 30–32px; icon targets at least 28px. Toolbar may scroll when its available width is constrained, with visible menu access rather than inaccessible clipped actions.
- Border radius: 3px controls, 4px menus, 6px dialogs. No pill buttons or rounded icon tiles. Elevation belongs only to overlays. Dialog backdrops dim without blur.

## Icons and interaction

Authored 20px SVG geometry, one stroke vocabulary, decorative `aria-hidden`. No Unicode or emoji substitutes for toolbar icons. Each icon-only control has a localized label and title. Shortcuts are visible in menus/palettes. Keyboard menus use arrows, Home/End, Enter/Space, Escape and focus return. Tabs expose selection and keyboard navigation. No hover-only action is the sole path to a feature.

Focus rings are visible against both themes. Text selection and caret are theme tokens. No smooth-scroll animation is applied to the editor, where selection and composition need immediate response. Reduced motion and forced colors receive explicit treatment. Native form controls, scrollbars, file pickers and OS window affordances keep their expected behavior.

## Preservation and verification

Baseline snapshots precede code changes. The command, preference, export and native-menu inventories may grow but must not shrink. All 197 baseline tests remain, including math re-editing and save/exit safety. After implementation compare actual Electron screenshots at 1280px and 800px, English/Chinese, light/dark and 150% zoom; add keyboard/menu, contrast, long labels and height-constrained dialog checks. Windows native DPI/IME/installation remain separate from Linux screenshots and Wine checks.

## Sources and application

- [Impeccable](https://github.com/pbakaus/impeccable): Operate/Read guidance and craft floor. Its context engine download failed; repository context was inspected directly. No design hook or live overlay was installed.
- [Anthropic Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design): explicit subject, deliberate hierarchy and self-critique. Marketing-page guidance does not override desktop functionality.
- [Desktop UI Design](https://github.com/dasien/ClaudeMultiAgentTemplate/tree/main/templates/.claude/skills/desktop-ui-design): conventional menus, controls, shortcuts and feedback.
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md): accessibility, focus, forms, overflow and theme review for the Electron renderer. Web URL state, CDN preload and mobile landing-page requirements are not added to this local desktop application.

The existing user brief supplies product, platform, brand and preservation constraints; routine design choices are made within that authorization. The requested redesign does not add approval gates, change the editing kernel or rewrite product claims.
