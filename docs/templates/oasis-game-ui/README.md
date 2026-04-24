# OASIS game UI shell (template)

Drop-in **HTML/CSS/JS** overlay for browser games (Three.js, Babylon, canvas, etc.). Same layering idea as **Hyde End Vineyard** `public/passport.html`: full-screen **viewport** (z-index 0), optional **vignette / scanlines**, then **HUD** (top bar, side panels, toasts).

## Files

| File | Role |
|------|------|
| `oasis-game-ui.css` | Variables, layout, panels (no build step) |
| `oasis-game-ui.js` | `OGameUI` API: stats, quest line, toasts, theme |

## Integrate in a Vite + three project

1. Copy this folder to your game as `public/oasis-ui/` (keep names so paths stay `/oasis-ui/...`).

2. In `index.html`:
   - Add `<link rel="stylesheet" href="/oasis-ui/oasis-game-ui.css" />` in `<head>`.
   - Replace a bare `#app` with the shell markup from the **MyGame** `index.html` example (or paste the block from the comment in `oasis-game-ui.css` bottom).

3. In your game entry (`main.js`):
   - Mount the WebGL renderer into `#oasis-game-viewport` (fixed full-screen div).
   - Import the UI bootstrap **before** or **after** creating the renderer:

   ```js
   import '/oasis-ui/oasis-game-ui.js';
   // then:
   const mount = document.getElementById('oasis-game-viewport');
   ```

4. At runtime:

   ```js
   OGameUI.init({
     title: 'MyGame',
     subtitle: 'OASIS',
     theme: 'tokyo-night' // or 'oasis', 'ember'
   });
   OGameUI.setQuest('Find the dojo');
   OGameUI.setStats({ health: 100, stamina: 80, level: 1 });
   OGameUI.toast('Controls: drag to orbit');
   ```

5. **Optional:** listen for `oasis-game-ui:action` on `document` (detail `{ action: 'menu' | 'map' | 'signin' }`) and wire to your game or ONODE later.

## Theming

Edit CSS variables on `:root` or pass `theme` to `init()` (adds `data-oasis-ui-theme` on `body` for preset palettes in CSS).

## Relation to passport.html

`passport.html` is a **full product** (quests, auth, stamps). This pack is a **minimal game chrome** so vibe-coded games share a consistent **OASIS** look without copying 2000+ lines.
