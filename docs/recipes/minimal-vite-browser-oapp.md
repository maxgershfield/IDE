# Recipe: minimal browser OAPP (Vite + three.js)

Use this when the user wants a **runnable** web game or OAPP shell under the workspace, not Hyperfy.

## Invariants

1. **Vite** belongs in **`devDependencies`**, not `dependencies`, unless you have a specific reason.
2. Set **`"type": "module"`** in `package.json` and use **`<script type="module" src="/src/main.js">`** in `index.html`. Do not point `main` at a hand-run `node main.js` for Vite apps.
3. **Do not** add npm packages that do not exist on the public registry (e.g. there is no stable `physx` npm package at `^1.0.0` for this use case). For WebGL physics prefer **`three`** + simple colliders, or **`@dimforge/rapier3d-compat`** only if you add it with a real version from npm.
4. **Do not** add `vite-plugin-vue2` (or any Vue plugin) unless the project is actually Vue 2. Default this recipe to **vanilla ESM + Vite**.
5. **Port:** set `server.port` to **5174** (or another free port) in `vite.config.js` so `npm run dev` does not fight **OASIS IDE** on **3000**.
6. Scripts: at minimum `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`.

## File layout

```
package.json
vite.config.js
index.html
src/main.js
README.md
```

## After `write_files`

Run from the project directory:

1. `run_workspace_command` with `argv`: `["npm","install"]`, `cwd`: absolute path to the project.
2. `run_workspace_command` with `argv`: `["npm","run","build"]`, same `cwd`, and fix errors until exit code 0 (or run `npm run dev` and confirm no “could not be resolved” warnings).
3. `run_workspace_command` with `argv`: `["npm","run","dev"]` only if the user asked to start the server; otherwise tell them to run `npm run dev` and open the URL Vite prints.

## Acceptance checks (agent)

- **Imports:** `npm run build` completes with no missing module errors.
- **Text files:** sources are normal multi-line text (not one line full of literal `\\n` sequences).
- **One entry:** `index.html` script `src` matches the file that bootstraps the app.

## Where to see it

Tell the user the **exact URL** from the last `npm run dev` stdout (e.g. `http://localhost:5174/`), not a guess like "3000 or 5173".
