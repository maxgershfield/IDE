# Packaging OASIS IDE for external testers (OASIS_IDE distribution)

This document answers: **how do we ship installers**, **how do we point everything at a remote OASIS API**, and **how do we present downloads on a website** using a **typical modern IDE download** pattern (marketing page, dedicated downloads, OS-specific artifacts, checksums).

---

## Clarify “MCP” vs “remote API”

| Layer | What it is today | “Point to remote” means |
|--------|------------------|---------------------------|
| **OASIS IDE ↔ ONODE** | HTTP from the Electron app (`OASIS_API_URL`, default `http://127.0.0.1:5003`) | Set **`OASIS_API_URL`** to your **public or staging** ONODE base (e.g. `https://api.yourdomain.com`) before launch or in an installer step. |
| **OASIS IDE ↔ OASIS MCP** | **stdio**: the IDE spawns a **local Node process** (`node …/MCP/dist/src/index.js`). There is no “MCP URL” in this path—the protocol is stdin/stdout. | The MCP server still runs **on the user’s machine** next to the IDE. What becomes remote is **every HTTP call the MCP makes** into OASIS (and optional STAR / smart-contract URLs), via **`OASIS_API_URL`** (and related env vars the MCP reads). |
| **MCP ↔ OASIS** | The MCP package uses `process.env.OASIS_API_URL` (see `MCP/src/config.ts`) plus optional `OASIS_API_KEY` / JWT for agent-style access. | Ship or inject env so **`OASIS_API_URL`** matches the same remote ONODE your IDE uses. |

So: **testers do not browse to “MCP endpoints”** in the browser for the unified server today. They run the desktop app; the app runs MCP locally; **MCP talks to your remote API** over HTTPS.

If you later want a **hosted MCP** (HTTP/SSE transport), that is a **separate product change** (different MCP transport in `MCPServerManager`, server deployment, auth). This guide assumes the **current stdio + remote ONODE** model.

---

## Reference download flow (what to emulate)

A common pattern for shipping a desktop IDE:

1. **Marketing site** — Product story, changelog, trust content.
2. **Dedicated download page** — **Latest** version highlighted; **macOS / Windows / Linux** buttons; optional **older versions** with the same three-platform links; **release notes** links per version.
3. **Actual binaries** — Each button goes to a **stable CDN/storage URL** (e.g. **GitHub Releases**, **S3 + CloudFront**, or similar).
4. **Local install** — User runs `.dmg` / `.exe` / `.AppImage` (or `.deb`), drags app or runs installer—**no clone of a monorepo**.
5. **Updates** — Frequent updates via an update channel (you already depend on **`electron-updater`** in `package.json` but it is **not wired** in main process yet—treat auto-update as a follow-up).

**Emulation checklist for OASIS**

| Reference pattern | OASIS equivalent |
|-------------------|------------------|
| `/download` with OS picks | A page on **oasisweb4.com** (or a small `downloads/` static site) with **Download for macOS / Windows / Linux** linking to your artifacts. |
| “Latest” badge | One row at the top pointing to **current** DMG/EXE/AppImage + **version** string matching `package.json` / git tag. |
| Release notes | Link to **GitHub Releases** notes or `CHANGELOG.md` per tag. |
| No env var ceremony for end users | Prefer **baked-in default** `OASIS_API_URL` for open beta **or** a **first-run** screen (not implemented today—until then, document env in a one-line “If you use a private stack…” FAQ). |

---

## Steps to package the IDE for others

### 1. Freeze a version and tag

- Bump **`version`** in `OASIS-IDE/package.json`.
- Git tag (e.g. `oasis-ide/v0.1.0`) aligned with your release process.

### 2. Build the IDE

```bash
cd OASIS-IDE
npm ci
npm run build
```

### 3. Build the MCP server (still required for tools)

The IDE does **not** embed the MCP bundle in `electron-builder` `files` today—it expects either monorepo-relative path or **`OASIS_MCP_SERVER_PATH`**.

```bash
cd MCP
npm ci
npm run build
```

Confirm `MCP/dist/src/index.js` exists.

### 4. Produce installers with electron-builder

```bash
cd OASIS-IDE
# Current OS:
npm run package
# Or per platform from a machine that supports it:
npm run package:mac
npm run package:win
npm run package:linux
```

Artifacts land under **`OASIS-IDE/release/`** (see `package.json` → `build.directories.output`).

**Tester reality today:** Packaged users must either:

- Install MCP somewhere and set **`OASIS_MCP_SERVER_PATH`** to the absolute path of `dist/src/index.js`, **or**
- You change packaging to **`extraResources`** (electron-builder) copying `MCP/dist/**` into the app bundle and set that path **at runtime** in `MCPServerManager` when `app.isPackaged`—**recommended** before a wide public beta so testers are not editing env vars for MCP.

### 5. Point the app and MCP at **remote** ONODE

**Same URL for both** avoids split-brain:

| Variable | Where read | Set to |
|----------|------------|--------|
| **`OASIS_API_URL`** | IDE (`OASISAPIClient.ts`), inherited by child processes | `https://your-onode-host` (no trailing `/api` unless your client expects it—match whatever local dev uses today). |
| **`OASIS_API_URL`** | MCP (`MCP/src/config.ts` via `process.env`) | Same as IDE. Child MCP inherits Electron env if you launch the IDE from a shell/export; for double-click launch on macOS, you need **defaults inside the app** or **plist / installer env** (see gap below). |

Optional MCP-related URLs if tools need them: **`STAR_API_URL`**, **`SMART_CONTRACT_API_URL`**, etc. (same `config.ts`).

**Gap to close for “download and double-click”:** macOS GUI apps do not read your shell `export`. Options:

1. **Build-time**: inject public beta URL via `electron-builder` `extraMetadata` + read in `OASISAPIClient` / main bootstrap, or  
2. **Runtime**: `app.setLoginSettings` won’t set global env—use **embedded config JSON** in `extraResources` loaded at startup, or  
3. **First-run UI**: settings screen storing URL in `userData` (best long-term).

Until (1)–(3) exist, document: “Create `~/.zprofile` …” only for technical preview—not full OASIS_IDE distribution parity.

### 6. Publish artifacts + checksums

1. Upload **`release/*`** to **GitHub Releases** (or S3) with clear names, e.g. `OASIS-IDE-0.1.0-arm64.dmg`, `OASIS-IDE-0.1.0-x64.exe`.
2. Publish **SHA256** sums on the same release page (standard trust practice).
3. Optional: **notarize** macOS builds and **sign** Windows builds so SmartScreen/Gatekeeper friction is low—required for serious public distribution.

### 7. Put “Download” on your website

Minimal page structure for a download hub:

- **H1**: Download OASIS IDE  
- **Primary**: Download for **macOS** (detect Apple Silicon vs Intel if you ship two DMGs—use platform tabs or labels).  
- **Secondary rows**: Windows · Linux  
- **Subtext**: Version **0.x.x** · [Release notes](link) · *Requires macOS 12+* (adjust).  
- **Footer**: Link to docs, support, privacy.

**Optional nicety:** small script `navigator.platform` / `userAgentData` to **highlight** the right button (“Recommended for your system”).

---

## Quick reference — env vars for a remote-beta tester

| Variable | Purpose |
|----------|---------|
| **`OASIS_API_URL`** | ONODE base URL for IDE + (when inherited) MCP. |
| **`OASIS_MCP_SERVER_PATH`** | Absolute path to `MCP/dist/src/index.js` **until** MCP is bundled inside the app. |
| **`OASIS_IDE_ASSISTANT_AGENT_ID`** | If your hosted agent id ≠ default `oasis-ide-assistant`. |

IDE-only keys for local LLM / chat are documented in [LOCAL_LLM_AND_GOOSE_STYLE_SETUP.md](./LOCAL_LLM_AND_GOOSE_STYLE_SETUP.md).

---

## Follow-up work (recommended before “everyone try it”)

1. **Bundle MCP** via `electron-builder` `extraResources` + packaged path resolution in `MCPServerManager.ts`.  
2. **Default remote `OASIS_API_URL`** (build-time or first-run) so double-click works.  
3. **Wire `electron-updater`** + publish `latest-mac.yml` / equivalent with each release.  
4. **Code signing** (Apple Developer ID + notarization; Windows Authenticode).  
5. **Legal**: license agreement in installer; privacy notice if you collect telemetry (none documented here = assume none).

---

## Related files in this repo

| File | Relevance |
|------|-----------|
| `OASIS-IDE/package.json` | `build` / `electron-builder` / `package:*` scripts |
| `OASIS-IDE/src/main/services/OASISAPIClient.ts` | `OASIS_API_URL` default |
| `OASIS-IDE/src/main/services/MCPServerManager.ts` | MCP spawn path; place to add packaged `resourcesPath` |
| `MCP/src/config.ts` | Remote API URLs for tool implementations |

---

*Last updated April 2026. Describes OASIS_IDE distribution goals; external product sites are not mirrored here.*
