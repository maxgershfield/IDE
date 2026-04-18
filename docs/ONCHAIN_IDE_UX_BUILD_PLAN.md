# On-chain IDE UX: staged build plan

This document breaks implementation into **ordered stages** so we can ship incrementally. It matches the UX direction discussed for the IDE: **visible chain context**, **status indicators**, **better OASIS Tools**, **Composer quick actions**, and **clear empty states**.

**Related docs**

- Chain tiers, MCP mint scope, entitlements model: [ONCHAIN_IDE_CHAIN_READINESS_AND_ENTITLEMENTS.md](./ONCHAIN_IDE_CHAIN_READINESS_AND_ENTITLEMENTS.md)
- Agent context and MCP tool categories: `src/shared/agentContextPack.ts`

---

## Goals

1. Users see **which chain and environment** they are targeting without retyping it every turn.
2. Users discover **wallet / NFT / health** MCP tools without memorizing names.
3. **Composer** offers **one-click prompts** that include the selected chain (Agent mode).
4. **ONODE** and **MCP** connection state is visible at a glance.
5. **No false promises**: chain pickers use the **Tier A mint workflow** list (Solana + fixed EVM set from `MCP/src/clients/oasisClient.ts`), not the broad ONODE `/supported-chains` enum alone.

---

## Non-goals (this build plan)

- Implementing the full **NFT entitlement** JWT product (ONODE endpoints, Stripe, contract deploy). That remains specified in the readiness doc; IDE can reserve UI hooks later.
- Replacing **Data Providers** settings with chain selection (storage vs minting stay separate).
- One-click **mainnet** spends without a confirmation step.

---

## Architecture (reference)

```
Settings (persist)     Status strip (read/write)
       │                          │
       └──────────┬─────────────────┘
                  ▼
         Composer chips + agent context pack
                  │
         Electron: listTools / healthCheck / executeTool / agentTurn
                  │
              MCP + ONODE
```

---

## Stage 1: Persisted chain context + status strip

**Objective:** Single source of truth for **default chain** and **Solana cluster**, shown in the UI and available for later agent injection.

| Task | Notes |
|------|--------|
| Extend `OASISSettings` | Add fields, for example: `onChainDefaultChain` (string union matching MCP workflow keys), `onChainSolanaCluster` (`devnet` \| `mainnet-beta` \| `mainnet` alias handling). |
| Defaults | Safe default: `solana` + `devnet` (or team choice). |
| `mergeWithDefaults` | Deep-merge any new nested object if you add one. |
| Main process | Ensure `getSettings` / `setSettings` persist new keys (follow existing pattern in `src/main/`). |
| `StatusBar` | Replace or augment placeholder: show **chain** (dropdown or compact select), **Solana cluster** when chain is Solana, optional **hide** if `showStatusBar` is false (already in settings). |
| ONODE pill | Call existing `window.electronAPI.healthCheck()` on an interval or on focus; show connected / disconnected / unknown. |
| MCP pill | Use `useMCP().tools.length` and loading state: show count or “not configured” when 0. |

**Acceptance**

- Changing chain or cluster in the status strip persists across restart.
- Status strip respects **Settings → General** if you already gate the status bar visibility.

**Files (expected)**

- `src/renderer/contexts/SettingsContext.tsx`
- `src/renderer/components/Layout/StatusBar.tsx` (+ CSS)
- `src/main/*` settings merge if not generic JSON

---

## Stage 2: Settings section “On-chain”

**Objective:** Same knobs as the status strip, plus documentation and safety copy.

| Task | Notes |
|------|--------|
| Add nav item | `SettingsNav.tsx`: new entry under OASIS group, for example `onchain` \| “On-chain”. |
| New section component | `OnChainSection.tsx`: mirrors chain + Solana cluster, link to `docs/ONCHAIN_IDE_CHAIN_READINESS_AND_ENTITLEMENTS.md`, short warning about mainnet costs. |
| Wire `SettingsModal` | Register section in `SECTION_COMPONENTS`. |

**Acceptance**

- Opening Settings and changing values updates the same persisted fields as Stage 1 (single source of truth).

**Files (expected)**

- `src/renderer/components/Settings/SettingsNav.tsx`
- `src/renderer/components/Settings/SettingsModal.tsx`
- `src/renderer/components/Settings/sections/OnChainSection.tsx` (new)

---

## Stage 3: OASIS Tools panel upgrade

**Objective:** Move from a passive list to a **discoverable** tool surface.

| Task | Notes |
|------|--------|
| Search | Filter tools by name / description (client-side). |
| Category chips | Buckets derived from tool name prefixes: `oasis_` subgroups (`oasis_workflow_*`, `oasis_*wallet*`, `oasis_*nft*`, `oasis_health*`, `star_*`, other). Tune labels in one place. |
| Copy prompt | Button that copies a **short, deterministic** instruction for the agent, for example: “Run `oasis_health_check` with `{}`.” For tools with required args, copy a template that names the args (user fills in secrets in Composer). |
| Run (optional in this stage) | For tools with **empty or trivial** `inputSchema.required`, call `executeTool` from `MCPContext`. **Do not** auto-run financial transactions without confirmation modal. |

**Acceptance**

- With MCP connected, user can find `oasis_workflow_mint_nft` via search or category in seconds.
- Copy prompt produces pasteable text; no silent mainnet execution.

**Files (expected)**

- `src/renderer/components/OASISTools/OASISToolsPanel.tsx`
- `src/renderer/components/OASISTools/OASISToolsPanel.css` (if needed)
- Small helper: `src/renderer/utils/mcpToolCategories.ts` (optional)

---

## Stage 4: Composer quick actions (Agent mode)

**Objective:** Chips that **prefill** the composer with prompts which include **chain** and **cluster** from settings.

| Task | Notes |
|------|--------|
| UI row | In `ComposerSessionPanel` (or child), add a collapsible “On-chain” quick actions row when mode is **Agent** (and optionally **Game Dev**). |
| Actions | At minimum: **Mint NFT (workflow)** (references `oasis_workflow_mint_nft` and inserts placeholder username/password reminder or “use session” per your auth rules), **Create wallet** (points to `oasis_create_wallet` / `oasis_create_wallet_full` with doc link), **Health check**. |
| Inject | Reuse pattern from `GameToolPalette` (`onInjectPrompt`). |
| Context injection (recommended) | Append a short line to the **agent context** for that turn or globally: “User default chain: …, Solana cluster: …”. Implement via existing `contextPack` plumbing in `ideAgentLoop` / `agentTurn` payload (verify where `getAgentContextPack()` is merged and add a small append from settings). |

**Acceptance**

- Clicking a chip fills the composer with a prompt that includes the **current** default chain and cluster.
- If not logged in, chip text or banner tells the user that mint and wallet flows expect an OASIS avatar session where applicable.

**Files (expected)**

- `src/renderer/components/Chat/ComposerSessionPanel.tsx`
- `src/renderer/services/ideAgentLoop.ts` and/or `src/shared/agentContextPack.ts` (append only; keep pack version in mind)
- Optional: `src/renderer/constants/onChainQuickPrompts.ts`

---

## Stage 5: First-run and empty-state messaging

**Objective:** Reduce confusion when MCP or login is missing.

| Task | Notes |
|------|--------|
| MCP zero tools | Banner in Composer and/or OASIS Tools: set `OASIS_MCP_SERVER_PATH`, rebuild MCP, restart IDE (link `README.md` section). |
| Not logged in | Subtle banner or inline hint where Stage 4 chips mention avatar credentials. |
| Dedupe | One banner component or shared copy to avoid three different wordings. |

**Acceptance**

- Fresh install with no MCP path shows a clear remediation path, not a silent “0 tools” only.

**Files (expected)**

- `src/renderer/components/Chat/ChatInterface.tsx` or `ComposerSessionPanel.tsx`
- `src/renderer/components/OASISTools/OASISToolsPanel.tsx`

---

## Stage 6 (later): Wallet / activity dashboard

**Objective:** Optional fourth activity or subview: recent txs, linked wallets, explorer links. Depends on ONODE APIs and product scope.

Defer until Stages 1–5 are stable. Outline only: new panel, `GET` wallet endpoints, no new blockchain semantics in the IDE shell without API support.

---

## Testing checklist (manual)

| Stage | Check |
|-------|--------|
| 1 | Restart app: chain and cluster unchanged; health and MCP reflect reality. |
| 2 | Settings and status strip stay in sync. |
| 3 | Search and categories behave with 100+ tools; copy works. |
| 4 | Chip text includes selected chain; agent request includes appended context if implemented. |
| 5 | Remove MCP path: banner appears; restore path: banner clears after refresh. |

Run `npm run build` in `OASIS-IDE` after each stage per repo conventions.

---

## Implementation order

1. **Stage 1** (foundation)
2. **Stage 2** (settings parity)
3. **Stage 3** (tools discovery)
4. **Stage 4** (composer + context)
5. **Stage 5** (polish)
6. **Stage 6** (future)

---

## Document history

- **2026-04-18:** Initial staged build plan.
- **2026-04-18:** Stages 1–5 implemented in the IDE: persisted `onChainDefaultChain` / `onChainSolanaCluster`, status bar and **On-chain** settings, upgraded OASIS Tools panel, Composer on-chain quick palette + agent context note, MCP missing banner.
- **2026-04-18:** On-chain quick actions open **`OnChainAssistantModal`** (assistant-led steps in a chat-style modal) and run MCP with a Cursor-style **`McpToolCallCard`** inline result, instead of injecting prompts into the main composer.
