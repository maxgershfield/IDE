# Sharing this repo

## Quick start

```bash
npm install
npm run build
npm run dev
```

Copy `.env.example` to `.env` and set **`OASIS_API_URL`**, **`STAR_API_URL`** for your environment (see comments in `.env.example`).

## MCP (OASIS tools in the IDE)

**Default:** the IDE uses the **hosted** unified MCP at `https://mcp.oasisweb4.one/mcp` (Streamable HTTP). Same tool list as local MCP: both use one `createOasisMcpServer()` in the OASIS `MCP` repo. Deploy the HTTP entry (`server-http.ts` / `npm run start:http`) from the **same commit** you ship for stdio if you want guaranteed parity.

After login, the IDE sends your session JWT to the hosted MCP via `Authorization: Bearer …`.

**Optional local MCP:** `export OASIS_MCP_TRANSPORT=stdio`, then build monorepo `MCP` and set `OASIS_MCP_SERVER_PATH` to `…/MCP/dist/src/index.js` if needed.

| Env | Role |
|-----|------|
| `OASIS_MCP_TRANSPORT` | Omit or `http` for hosted (default). `stdio` for local Node MCP. |
| `OASIS_MCP_REMOTE_URL` | Hosted MCP URL (default `https://mcp.oasisweb4.one/mcp`). |

## Standalone clone

A snapshot of this folder is also pushed to [github.com/maxgershfield/IDE](https://github.com/maxgershfield/IDE) for sharing without the full monorepo. You do **not** need a local `MCP` build unless you set `OASIS_MCP_TRANSPORT=stdio`.
