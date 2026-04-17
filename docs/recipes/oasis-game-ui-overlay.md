# Recipe: OASIS game UI overlay on a Vite + WebGL game

Use the **passport-style** layering (viewport → vignette/scanlines → HUD) without copying Hyde End Vineyard’s full `passport.html`.

## Source template

Copy **`OASIS-IDE/docs/templates/oasis-game-ui/`** into the game as **`public/oasis-ui/`** (keep filenames).

## `index.html`

1. `<link rel="stylesheet" href="/oasis-ui/oasis-game-ui.css" />`
2. Markup: `#oasis-game-viewport`, `#oasis-game-vignette`, `#oasis-game-scanlines`, `#oasis-game-hud` with the same structure as **MyGame** `index.html` (top bar, grid, quest panel, stats, hotbar).
3. Load order: `<script defer src="/oasis-ui/oasis-game-ui.js"></script>` then `<script type="module" src="/src/main.js"></script>`.

## Game code

- Mount **WebGL/canvas** only inside **`#oasis-game-viewport`** (full-screen `position: fixed; inset: 0`).
- After boot, call **`OGameUI.init({ title, subtitle, theme })`**, **`setStats`**, **`setQuest`**, **`toast`** as needed.
- Listen for **`oasis-game-ui:action`** on `document` for **Map** / **Menu** (wire to pause, minimap, ONODE later).

## Themes

`theme`: `oasis` (teal cyber), `tokyo-night` (magenta/cyan), `ember` (warm). Add more presets in CSS via `[data-oasis-ui-theme="…"]`.

## Reference implementation

`MyGame/` in the monorepo uses this shell end-to-end.
