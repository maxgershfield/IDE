# Recipe: OASIS onboard starter (Vite, auth, wallet, mint)

Use this when a new user wants a **runnable** web shell that **builds from scratch** and exercises **ONODE** avatars, **Solana** wallets, and **NFT** mint, without STARNET or a separate backend (dev uses a **Vite proxy** to ONODE; production still needs a BFF).

## Canonical template

- **Path:** `OASIS-IDE/docs/templates/oasis-onboard-starter/`
- **Invariants**
  1. Port **5174** in `vite.config.ts` (does not fight the IDE on 3000)
  2. **`"type": "module"`** in `package.json`, entry from `index.html` via `<script type="module" src="/src/main.ts">`
  3. **No** invented npm package names, **no** fake `@scope` SDKs, **no** one-line `\\n` source files
  4. ONODE URL comes from **`.env`** as `OASIS_API_URL` and is read **only in `vite.config.ts`** (proxy), not with `VITE_` in client code
  5. Same JSON shapes as a full app: `extractOasisResult` / `isOasisError` in `src/oasisTransport.ts`

## What the user gets

- Login: `POST /api/avatar/authenticate`
- Wallet: `GET /api/wallet/avatar/{id}/wallets/...` and `POST /api/keys/generate_keypair_with_wallet_address_and_link_provider_keys_to_avatar_by_id`
- Mint: `POST /api/nft/mint-nft` with `JSONMetaDataURL` pointing at `public/seed-metadata.json` in dev

## After write / copy

1. `run_workspace_command`: `["npm","install"]` with `cwd` the template path (or the user’s copy)
2. `run_workspace_command`: `["npm","run","build"]` same `cwd`, fix until exit code 0
3. Tell the user: start ONODE, run `npm run dev`, open the printed `http` URL, sign in with a real OASIS avatar

## Composable with IDE demos

- **MCP, no app:** for zero-code demos, the user can still use `docs/recipes/demo-flows.md` and tools like `oasis_workflow_mint_solana_nft` while the IDE is logged in.
- **This app:** is for “I own the repo and need copy-pastable `fetch` code against ONODE”.

## Acceptance (agent)

- `npm run build` completes with no missing import errors
- README in the template explains the proxy, `.env`, and the production BFF warning
