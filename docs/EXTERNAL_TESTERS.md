# OASIS IDE: external testers (what can fail, easiest green path)

Use this for **friends beta**, **investor demos**, and **QA** so nobody gets stuck on localhost defaults or missing API keys.

---

## Easiest path that usually works (no monorepo, no local MCP)

1. **Install / run** the IDE build (or `git clone`, `cd OASIS-IDE`, `npm install`, `npm run build`, `npm run dev`).

2. **Point ONODE at production** (usually automatic for **packaged** installs):
   - **Packaged** (DMG, EXE, or similar): the app defaults to `https://api.oasisweb4.one`, `https://star.oasisweb4.one`, and **hosted** MCP at `https://mcp.oasisweb4.one/mcp` with no local build.
   - **From source** / dev: set **Settings → Integrations → API endpoint override** to `https://api.oasisweb4.one` (origin only, no `/api` path), **or** copy `OASIS-IDE/.env.example` → `.env` and set:
     ```bash
     OASIS_API_URL=https://api.oasisweb4.one
     ```
   - Optional STAR: **Settings → STARNET** or `STAR_API_URL=https://star.oasisweb4.one` in `.env` (packaged defaults include the public STAR host when unset).

3. **MCP** uses **hosted** `https://mcp.oasisweb4.one/mcp` for packaged builds (and whenever local stdio is not used). No `OASIS_MCP_SERVER_PATH`, no local `MCP` build.

4. **Log in** with an OASIS avatar (register if needed). JWT is sent to hosted MCP for authenticated tools.

5. **Smoke test the build and local safety checks** (from `OASIS-IDE`):
   ```bash
   npm run smoke:beta
   ```

   This runs the local regression tests, production build, and checks the expected Electron/Vite artifacts. It does **not** call live OASIS services by default.

6. **Smoke test hosted MCP** (optional, networked):
   ```bash
   npm run smoke:beta -- --skip-build --remote-mcp
   ```

   You can still run the narrower MCP-only check with `npm run test:mcp-remote`.

If something still fails, see **Failure modes** below.

---

## Failure modes (common)

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| ONODE “down”, login fails, health errors | Still on default `http://127.0.0.1:5003` | Set API URL in **Settings** or `OASIS_API_URL` in `.env` |
| MCP tools count 0 | Hosted MCP blocked, TLS, or startup error | Check main-process log for `[MCP]`; confirm HTTPS to `mcp.oasisweb4.one`; try **Refresh** on OASIS Tools |
| Mint / workflow errors while health works | Auth, chain, or server-side limits | Log in; use devnet vs mainnet as designed; see API errors in tool output |
| “Payload Too Large” on big tools | Was infra body limit; hosted stack should allow large JSON-RPC | If it returns, ops must keep Express + proxy limits high enough |
| Composer / semantic search / web search missing | **Optional IDE keys** not set | Expected: set `OPENAI_API_KEY`, `TAVILY_API_KEY` in `.env` **only if** you test those features (see below) |
| ElevenLabs / Glif from **IPC routes** in main | `ELEVENLABS_API_KEY`, `GLIF_API_TOKEN` in `.env` | Only if you exercise those specific IDE-wired paths |
| STAR CLI tools missing | No `star` binary / `STAR_CLI_PATH` | Optional; install STAR CLI or ignore `run_star_cli` |

---

## API keys and secrets (what “fails” when you share the repo)

**Sharing the GitHub repo does not share your secrets.** Testers start with **no** `OPENAI_API_KEY`, `TAVILY_API_KEY`, `GLIF_API_TOKEN`, `ELEVENLABS_API_KEY`, etc. That is normal.

- **Core OASIS flows** (login, agents, many MCP tools backed by **your** hosted API and **your** hosted MCP server env) can work **without** each tester bringing their own Glif/OpenAI keys, because those services are often configured **on the server** (ONODE / ECS MCP), not on the laptop.
- **IDE-only features** that call OpenAI/Tavily **from the Electron main process** using **local `.env`** will **not** work until the tester adds their own keys (or you ship a dedicated build that injects non-secret routing to your proxy).

**Practical policy for a public beta**

1. Document: “**Required:** OASIS account + API base URL. **Optional:** OpenAI/Tavily only for semantic search / web search in Composer.”
2. Do **not** commit real keys; keep `.env.example` with blank placeholders only.
3. For demos, prefer **hosted** API + **hosted** MCP so testers are not asked to run local Node MCP.

---

## Packaged app (DMG / EXE) gotcha

macOS **double-click** does not load shell `export`. Prefer:

- **First-run / Settings** stored under the app’s **userData** (already used for API override), **or**
- A **`config.json` next to the app** loaded at startup (future), **or**
- Document: “Create `OASIS-IDE/.env` beside the unpacked app” **only** for advanced users.

Packaged builds now **bake in** those public API / STAR / hosted MCP defaults. Advanced users can still use **in-app Settings** or `.env` to override.

---

## Quick checklist before you invite others

- [ ] Run `npm run smoke:beta` from `OASIS-IDE` on a clean checkout.
- [ ] Confirm hosted MCP with `npm run smoke:beta -- --skip-build --remote-mcp`.
- [ ] Confirm `https://api.oasisweb4.one` and `https://mcp.oasisweb4.one/health` are up.
- [ ] One internal run: fresh clone, no `.env`, set API URL only via **Settings**, log in, run `oasis_health_check` from OASIS Tools.
- [ ] Run the three non-destructive golden flows below in Agent mode before trying mint/publish/create flows.
- [ ] Decide whether Composer needs OpenAI/Tavily for the beta; if not, say so in the invite email to avoid “broken” reports.

---

## Golden flows for beta smoke testing

These are the first flows to run with testers because they prove the core product path without minting, publishing, or writing to production state.

### Flow A — Hosted connectivity

1. Open **Settings → Integrations**.
2. Set API endpoint override to `https://api.oasisweb4.one` if the packaged default is not already using it.
3. Open **OASIS Tools**, refresh tools, and run `oasis_health_check`.

Expected result: tools are listed, `oasis_health_check` returns a healthy response, and the IDE does not ask for a local MCP build.

### Flow B — Workspace-grounded Agent

1. Open a small workspace folder.
2. Switch Composer to **Agent** mode.
3. Ask:
   ```text
   Read the README and package.json in this workspace, then tell me what this project does and what command verifies it.
   ```

Expected result: the activity feed shows file reads, the answer cites real workspace facts, and the agent does not claim a build/test passed unless it ran a command.

### Flow C — STARNET/OAPP plan without mutation

1. Stay in **Plan** mode.
2. Ask:
   ```text
   Plan a small OAPP from available STARNET components for a community mission app. Use real catalog rows if they are available in context, label gaps as Proposed, and do not create or publish anything.
   ```

Expected result: the reply separates verified catalog items from proposed custom work and does not call create/publish/mint/save tools in Plan mode.

---

## Related docs

- Packaging and release: [DISTRIBUTION_AND_DOWNLOADS.md](./DISTRIBUTION_AND_DOWNLOADS.md)
- Local LLM / optional keys: [LOCAL_LLM_AND_GOOSE_STYLE_SETUP.md](./LOCAL_LLM_AND_GOOSE_STYLE_SETUP.md) (if present)
