# OASIS IDE

Cursor-like editor for building **OASIS** and **STARNET** apps with one Composer that can read your workspace, call OASIS MCP tools, and compose holons. Built with Electron, React, and TypeScript.

**Repo:** [github.com/NextGenSoftwareUK/IDE](https://github.com/NextGenSoftwareUK/IDE)

---

## For Jade - Getting started

### 1. Clone and install

```bash
git clone https://github.com/NextGenSoftwareUK/IDE.git
cd IDE
npm install
```

### 2. Connect to OASIS

The IDE talks to OASIS over HTTP and (optionally) runs the OASIS MCP server locally. Set these **environment variables** before running:

| Variable | What it does | Example |
|----------|----------------|---------|
| **OASIS_API_URL** | Base URL of the OASIS API (auth, chat, agents, health). | `http://127.0.0.1:5003` (local) or a staging/production URL |
| **OASIS_MCP_TRANSPORT** | If unset: **stdio** when `../MCP/dist/src/index.js` exists (monorepo), else **hosted** MCP. `http` / `remote` forces hosted; `stdio` forces local. | `export OASIS_MCP_TRANSPORT=http` to use hosted MCP even with a local `MCP` build |
| **OASIS_MCP_REMOTE_URL** | Hosted MCP Streamable HTTP URL. Only used when `OASIS_MCP_TRANSPORT` is not `stdio`. | Default: `https://mcp.oasisweb4.one/mcp` |
| **OASIS_MCP_SERVER_PATH** | *(stdio only)* Full path to `MCP/dist/src/index.js` if not using the default monorepo-relative path. | `/path/to/MCP/dist/src/index.js` |

Example (macOS/Linux):

```bash
export OASIS_API_URL=http://127.0.0.1:5003
# Default in monorepo: local stdio MCP when MCP/dist is built (STAR_* matches Settings → STARNET).
# Force hosted MCP:
# export OASIS_MCP_TRANSPORT=http
# Force local MCP when path is non-standard:
# export OASIS_MCP_TRANSPORT=stdio
# export OASIS_MCP_SERVER_PATH=/absolute/path/to/MCP/dist/src/index.js
```

### 3. Run the IDE

```bash
npm run dev
```

This opens the Electron window. The default shell keeps the first-run surface focused on Explorer, Search, Build, STARNET, IDE Passes, Composer, and Terminal. Press the **Build** rocket to expand templates, holonic suites, and guide-map surfaces in the left bar when you need them.

You can log in with your OASIS avatar (username/password) if the API is running; Composer uses the OASIS IDE Assistant agent.

### 4. Golden path

1. Open a workspace.
2. Ask Composer to build or wire an OASIS app.
3. Use **Build** to inspect STARNET suggestions, start from a template, or open OASIS tools.
4. Run and verify from the embedded Terminal.

Advanced verticals such as Game / Metaverse, Research / XPRIZE, and Holonic Medicine are treated as domain packs or lab surfaces rather than first-run navigation.

### 5. Embedded terminal (if you use it)

The in-app terminal uses **node-pty**. If you see "posix_spawnp failed" or similar:

```bash
npm run rebuild:terminal
```

Then restart the app. If rebuild fails with a Python `distutils` error (e.g. on Python 3.12+):

```bash
python3 -m pip install setuptools
npm run rebuild:terminal
```

### 6. Collaborating (workflow)

- Work on a **branch** for your feature: `git checkout -b your-feature`
- Push and open a **Pull Request** when ready.
- Keep `main` runnable; we’ll merge via PRs.

If something’s unclear or you’re blocked, reach out to Max (or the team) — we can add more docs or pair on setup.

### Sharing with testers (beta / demos)

See **[docs/EXTERNAL_TESTERS.md](docs/EXTERNAL_TESTERS.md)** for the shortest path to a working remote setup, what breaks without API keys, and packaged-app gotchas.

---

## MCP tools (optional)

The IDE connects to the **same** OASIS unified MCP tool surface as Cursor: either **hosted** (default, zero install) or a **local** stdio server from your machine.

**Default — Hosted MCP (recommended):**  
The IDE uses Streamable HTTP to `https://mcp.oasisweb4.one/mcp` (override with `OASIS_MCP_REMOTE_URL`). After you log in, the IDE passes your JWT as `Authorization: Bearer …` so authenticated tools work. No `MCP` folder or `npm run build` in the monorepo is required.

**Local stdio (advanced):** set `OASIS_MCP_TRANSPORT=stdio`, build the `MCP` package in the OASIS repo (`cd MCP && npm install && npm run build`), and optionally set **OASIS_MCP_SERVER_PATH** to `…/MCP/dist/src/index.js` if not using the default path next to this repo.

If MCP fails to start, the IDE still runs; chat panels may show fewer tools until MCP is reachable.

---

## Project structure

```
├── src/
│   ├── main/           # Electron main process (MCP, API client, auth, IPC)
│   ├── renderer/       # React UI (editor, chat, panels, terminal)
│   └── preload/        # Preload script
├── package.json
├── SETUP.md            # Detailed setup and troubleshooting
└── README.md           # This file
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run IDE in development (watch + hot reload) |
| `npm run build` | Build main + renderer for production |
| `npm start` | Run built app (after `npm run build`) |
| `npm run package` | Package for current OS (mac/win/linux) |
| `npm run rebuild:terminal` | Rebuild node-pty for Electron (fix terminal issues) |

---

## Docs and links

- **Detailed setup:** [SETUP.md](./SETUP.md) (env vars, external repo, troubleshooting)
- **Local LLM (Ollama / LM Studio, goose-style):** [docs/LOCAL_LLM_AND_GOOSE_STYLE_SETUP.md](./docs/LOCAL_LLM_AND_GOOSE_STYLE_SETUP.md)
- **Shipping the IDE (installers, remote API, download page):** [docs/DISTRIBUTION_AND_DOWNLOADS.md](./docs/DISTRIBUTION_AND_DOWNLOADS.md)
- **OASIS platform:** https://oasisweb4.com

---

## License

MIT
