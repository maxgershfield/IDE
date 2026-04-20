# On-chain in OASIS IDE: chain readiness, NFT entitlements, and UX roadmap

This document captures a **chain-by-chain readiness** view from the OASIS monorepo, an **NFT entitlement model** for selling IDE capabilities (for example chain packs), and a **roadmap** to make on-chain actions easy inside the IDE.

**Sources:** `ProviderType` enum, `Providers/Blockchain/*` provider classes, `MCP/src/clients/oasisClient.ts` (mint workflow), `ONODE/.../WalletController.cs` (`/api/wallet/supported-chains`), `OASIS-IDE` agent context and settings.

---

## 1. How to read “readiness”

Four layers often disagree. Product and IDE surfaces should be explicit about which layer they use.

| Layer | Meaning |
|--------|--------|
| **A. Provider class** | Which interfaces the provider implements (`IOASISBlockchainStorageProvider`, `IOASISNFTProvider`, `IOASISSmartContractProvider`). |
| **B. MCP mint workflow** | `oasis_workflow_mint_nft` resolves **Solana + a fixed EVM set** in `MCP/src/clients/oasisClient.ts`. |
| **C. MCP wallet helpers** | `oasis_create_wallet_full` maps only a **subset** of provider names to enum ids in the MCP client (for example `SolanaOASIS`, `EthereumOASIS`, `ArbitrumOASIS`, `PolygonOASIS`). |
| **D. ONODE `GET /api/wallet/supported-chains`** | Enumerates most `ProviderType` values that are not storage or cloud, and currently marks **`isActive: true` for all**. This is **aspirational**, not a guarantee of DNA registration or operational health. |

**Implication:** Do not rely on `/supported-chains` alone for IDE UX. Prefer capability flags backed by deployment config (DNA), health checks, and the mint workflow map.

---

## 2. Chain-by-chain readiness matrix

### Tier A: MCP mint workflow wired today (`oasis_workflow_mint_nft`)

These are the chains explicitly mapped in `MCP/src/clients/oasisClient.ts` (`MINT_WORKFLOW_EVM` plus Solana). This is the **narrowest “works end-to-end in MCP”** list for mint.

| User chain key | ProviderType | NFT standard in workflow | Explorer bases (in MCP) |
|------------------|--------------|--------------------------|-------------------------|
| `solana` | `SolanaOASIS` | SPL | Cluster-dependent |
| `ethereum` | `EthereumOASIS` | ERC-721 | etherscan.io |
| `base` | `BaseOASIS` | ERC-721 | basescan.org |
| `arbitrum` | `ArbitrumOASIS` | ERC-721 | arbiscan.io |
| `polygon` | `PolygonOASIS` | ERC-721 | polygonscan.com |
| `optimism` | `OptimismOASIS` | ERC-721 | optimistic.etherscan.io |
| `avalanche` | `AvalancheOASIS` | ERC-721 | snowtrace.io |
| `bnb` | `BNBChainOASIS` | ERC-721 | bscscan.com |
| `fantom` | `FantomOASIS` | ERC-721 | ftmscan.com |

Aliases in MCP include: `eth`, `arb`, `matic`, `op`, `avax`, `bsc`, `ftm` (see `MINT_WORKFLOW_CHAIN_ALIASES` in `oasisClient.ts`).

### Tier B: EVM Web3Core family, strong NFT surface, not yet in MCP mint map

These use `Web3CoreOASISBaseProvider` (or equivalent) and implement `IOASISNFTProvider` in the same general Nethereum-style path as Tier A. **Extending the mint workflow** here is mostly **adding entries** to `MINT_WORKFLOW_EVM` (plus explorer URLs) and regression tests, not new provider concepts.

Examples in repo: `RootstockOASIS`, `ScrollOASIS`, `LineaOASIS`, `ZkSyncOASIS`, `MonadOASIS`, `TONOASIS` (TON EVM path).

### Tier C: Non-EVM or distinct SDK, `IOASISNFTProvider` in code, not in MCP mint workflow

Separate workflows are needed (wallet shape, tx format, metadata): for example `AptosOASIS`, `NEAROASIS`, `SuiOASIS`, `PolkadotOASIS`, `CosmosBlockChainOASIS`, `CardanoOASIS`, `ElrondOASIS`, `EOSIOOASIS`, `TelosOASIS`, `TRONOASIS`, `HashgraphOASIS`, `BlockStackOASIS`, `AlephiumOASIS`, `ChainLinkOASIS` (oracle or infra role; treat as special), `BitcoinOASIS` (interface present; expect real-world constraints unlike EVM NFTs).

### Tier D: Blockchain or network stack, no `IOASISNFTProvider` on main class

Expect contract and transfer work, not standard OASIS NFT mint until implemented: for example `StarknetOASIS`, `RadixOASIS`, `ZcashOASIS`, `MidenOASIS`, `AztecOASIS`.

**Note:** An `XRPLOASIS` provider project exists under `Providers/Blockchain`; it is not listed in `ProviderType` in `OASIS Architecture/NextGenSoftware.OASIS.API.Core/Enums/ProviderType.cs` at the time of this document. Treat as integration in progress unless the enum and registration are aligned.

### Tier E: Special

| Provider | Role | Readiness note |
|----------|------|----------------|
| `MoralisOASIS` | Indexing and Web3 API style; implements `IOASISNFTProvider` | Strong for **reads** (ownership, balances) for entitlements; not interchangeable with “user’s L1” for all writes unless explicitly designed |
| `TelegramOASIS` | Network or social integration (`Providers/Network/`) | Not an L1; should not be presented as a user “chain” in IDE chain pickers even if enum-driven lists include it |

### Tier F: Enum without matching blockchain provider project in this tree

Examples: `SEEDSOASIS`, `LoomOASIS`, `StellarOASIS` appear in `ProviderType` but did not have a matching `Providers/Blockchain` project in the snapshot used for this doc. Treat as **not implemented here** until a provider project and DNA wiring exist.

---

## 3. NFT entitlement model (IDE chain packs and paid features)

**Goal:** Selling **NFTs** (or SBTs) that **unlock** IDE capabilities, for example a “Base + Arbitrum” pack, premium RPC, or gated templates. The NFT is the **commercial instrument**; **server-issued authorization** is the **enforcement layer**.

### 3.1 Catalog objects (server-side)

- **`entitlementId`:** stable UUID in your product catalog.
- **`sku`:** human slug (for example `ide-pack-evm-l2-2026`).
- **`features[]`:** machine flags (for example `mcp.mint.evm`, `template.game.evm`, `rpc.premium`, `chain.base`).
- **`chainScope`:** optional list of MCP chain keys (`base`, `solana`, …) or `ProviderType` names that this SKU unlocks.
- **`onChainRules`:** per chain where applicable:
  - `contractAddress`
  - `tokenStandard` (`erc721`, `erc1155`, `spl`, …)
  - optional `tokenId` for ERC-1155
  - `minBalance` (usually 1)
- **`issuerAddresses`:** allow-listed deployers or factories you trust for that SKU.

### 3.2 User grant (materialized after verification)

- **`avatarId`:** OASIS identity.
- **`entitlementId`**, **`source`:** `purchase` | `airdrop` | `trial`.
- **`verifiedAt`**, optional **`expiresAt`** (subscriptions).
- **`evidence`:** chain id, contract, last known owner wallet (for audit; not for primary crypto verification alone).

### 3.3 Verification modes

| Mode | When to use |
|------|----------------|
| **Indexer or OASIS read** | Periodic refresh: “does this wallet still hold the NFT?” Moralis, Alchemy, or provider reads fit here. |
| **Wallet link (sign once)** | Bind **external wallet** to **avatar** with a signed message; then indexer checks use that wallet. |
| **Tx proof** | Optional advanced path; heavier UX. |

**Recommended default:** one-time **wallet link** plus **indexer-backed** refresh for JWT issuance.

### 3.4 JWT claims (short-lived)

Example shape (illustrative, not a standard):

- `ent`: list of entitlement SKUs or ids.
- `chains`: allowed MCP chain keys or feature flags.
- `exp`: expiry.

Only **ONODE** (or a dedicated auth service) should mint these JWTs after verification.

### 3.5 Refresh and revocation

- JWT TTL **15–60 minutes**; refresh re-checks ownership.
- Transfer or burn removes access on next refresh.
- Subscription SKUs use **`expiresAt`** or merchant webhooks.

### 3.6 Metadata and privacy

- Keep **on-chain metadata minimal**; rich copy lives in **off-chain catalog** tied to `sku`.

---

## 4. Roadmap: easy on-chain actions in the IDE

| Pillar | Description |
|--------|-------------|
| **Chain context** | Single “Active chain” and **environment** (devnet versus mainnet) in IDE settings; inject into agent context and default MCP args. |
| **Actions hub** | One panel: mint NFT, create wallet, send tx, testnet faucet links, open explorer; Tier A chains first. |
| **Recipes** | Extend `OASIS-IDE/docs/recipes/` with chain-tier-specific flows (EVM versus Solana versus future Tier C). |
| **Honest supported list** | Replace or augment `/supported-chains` with **capability flags** (`mintWorkflow`, `walletCreate`, `nftProvider`) from DNA plus implementation matrix in this doc. |
| **Entitlement-aware UI** | Gate premium templates or chain packs on JWT claims; “Verify wallet” when missing. |
| **Safety** | Mainnet confirmations, fee hints, no secret logging. |

**Suggested phases**

1. **MVP:** Tier A only in primary UI; document Tier B as “add mapping” work.
2. **v2:** Extend `MINT_WORKFLOW_EVM` and wallet client maps for Tier B.
3. **v3:** Tier C per-chain wizards (wallet plus mint plus template).
4. **Parallel:** Ship entitlement service and JWT integration for paid SKUs.

---

## 5. Related paths in the repo

| Topic | Location |
|--------|-----------|
| **IDE Passes panel (IDE slots UI + API)** | `OASIS-IDE/docs/NFT_ENTITLEMENT_SLOTS_SPEC.md`, `GET /api/ide/entitlement-slots` |
| Mint workflow chain map | `MCP/src/clients/oasisClient.ts` |
| MCP tool definitions | `MCP/src/tools/oasisTools.ts` |
| Supported chains API | `ONODE/NextGenSoftware.OASIS.API.ONODE.WebAPI/Controllers/WalletController.cs` |
| Provider enum | `OASIS Architecture/NextGenSoftware.OASIS.API.Core/Enums/ProviderType.cs` |
| IDE agent context | `OASIS-IDE/src/shared/agentContextPack.ts` |

---

## 6. Document history

- **2026-04-18:** Initial version (readiness tiers, entitlement model, IDE roadmap).
