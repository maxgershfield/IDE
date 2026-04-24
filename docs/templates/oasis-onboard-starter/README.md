# OASIS onboard starter (Vite + TypeScript)

A **minimal runnable app** that does three things against **ONODE**:

1. **Avatar sign-in** (`POST /api/avatar/authenticate`) and store JWT in `sessionStorage` (dev only)
2. **Solana wallet** on the avatar (`GET` wallets, `POST` generate keypair + link for `SolanaOASIS`)
3. **Test NFT mint** (`POST /api/nft/mint-nft` with `NFTStandardType: SPL`)

The code mirrors the same HTTP routes used in production-style apps (for example Pangea’s `OASISClient`), in a form you can copy and move behind a BFF later.

## Prerequisites

- Node 18+
- **ONODE** running (default in this template: `http://127.0.0.1:5003` via the Vite proxy)
- A real **OASIS username and password** (same as you use in the IDE or portal)

## Setup

```bash
cd OASIS-IDE/docs/templates/oasis-onboard-starter
cp .env.example .env
npm install
npm run build
npm run dev
```

Open the URL Vite prints (port **5174**). Sign in, create a wallet if needed, then mint. The default metadata URL points at this dev server’s `public/seed-metadata.json` so ONODE can download JSON during mint (only works if ONODE can reach your machine, which is the usual local dev case).

**Production note:** do not copy this pattern to production as-is. Put ONODE behind your server, use httpOnly cookies or short-lived tokens, and keep secrets off the client.

## Why a proxy

The browser calls paths under `/api/...`. The Vite dev server proxies those to `OASIS_API_URL` so you avoid CORS while developing. The JWT never hits a build-time `VITE_` public env var.

## Copy out of the monorepo

To start a new repo from this template, copy the `oasis-onboard-starter` folder anywhere, then `npm install` and `npm run build` there.
