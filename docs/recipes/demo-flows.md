# Demo flows: OASIS + STAR in action

These are real **Agent mode** prompts. Paste any of them into the Composer (switch to **Agent** mode first) and press Enter. The IDE agent calls the OASIS and STAR tools for you — no manual API calls, no shell scripts, no boilerplate.

Each flow highlights something no other IDE can do.

---

## What you can do with an NPC like Martinez (plain English)

You now have **two live handles**, not just a text file:

| Handle | What it is | What it unlocks |
|--------|------------|-----------------|
| **STAR holon id** | A permanent record in OASIS for this character | Tie quests, karma, inventory, and server events to **the same** Martinez everywhere you plug in OASIS. Other creators can fork or install packs from STARNET later. |
| **ElevenLabs agent id** | A real-time voice persona | Players talk to Martinez through your stack (usually a small backend or NUI that calls ElevenLabs), with the **attitude** you described (clipped, corrupt cop). |

You do **not** need to understand APIs to **start**: use the drop-in resource below so your server already “knows” both ids in one place.

### Vibe-coder path: two clicks, no “wire this resource” essay

After Flow 1 (or any run that wrote `npcs/<name>.json`), from the **OASIS-IDE** folder run:

```bash
npm run export-fivem-npc
```

That reads `npcs/martinez.json` (repo root or IDE `npcs/`) and writes **`fivem-resources/MartinezOasisNpc/`** with `fxmanifest.lua`, `config.lua`, and **`README.txt`** (only two steps: copy folder into your server `resources`, add `ensure MartinezOasisNpc` to `server.cfg`).

Optional: `node scripts/export-fivem-npc-from-json.mjs path/to/npc.json path/to/outputFolder`

**Roadmap (more seamless):** a post-flow button in the IDE (“Export FiveM folder”) that runs this script and opens the folder in Finder, plus a future OASIS bridge script that reads `MartinezOasisNpcConfig` and calls ONODE for you.

---

## Prerequisites for all flows

| Requirement | Where to configure |
|---|---|
| ONODE running on `http://127.0.0.1:5003` | Settings > Integrations, or set `OASIS_API_URL` |
| STAR WebAPI running (default dev URL `http://127.0.0.1:50564` per `launchSettings.json`) | Set `STAR_API_URL` if you use a different port; MCP defaults to 50564 |
| Logged in with an OASIS Avatar | Settings > Avatar (or the login prompt on first open) |
| MCP server started | The IDE starts it automatically when a workspace is open; MCP binary is at `MCP/dist/src/index.js` |

**All tools below are implemented in `MCP/src/tools/starTools.ts` and `elevenLabsTools.ts` and compiled to `MCP/dist/src/`.** If the tools previously showed as "not recognized", restart the IDE (or the MCP server process) to reload the new dist.

---

## Flow 1 — Create an NPC with a live voice

**What this demonstrates:** STAR NPC holons + ElevenLabs conversational voice agents, created from a single natural-language description. No other IDE touches any part of this pipeline.

**Extra prerequisite:** `ELEVENLABS_API_KEY` set in Settings > Integrations.

**Paste into Agent mode:**

```
I want to create a corrupt detective NPC for my FiveM RP server. His name is Martinez — 40s, hardened, speaks in short clipped sentences, takes bribes. Use star_create_npc to register him in STAR with his personality traits and role, then use elevenlabs_create_agent to give him a conversational voice (deep, world-weary, authoritative). Save his STAR holon ID and ElevenLabs agent_id to npcs/martinez.json so I can wire him into the game server.
```

**What the agent does:**

1. `mcp_invoke star_create_npc` — Martinez registered as a STAR holon with name, personality, role, dialogue traits linked to the logged-in Avatar
2. `mcp_invoke elevenlabs_list_voices` — scans available voice profiles for a match (deep, authoritative)
3. `mcp_invoke elevenlabs_create_agent` — creates a live ElevenLabs conversational agent with system prompt built from Martinez's personality
4. `write_file npcs/martinez.json` — workspace file with `{ starHolonId, elevenLabsAgentId, name, voice }`

**What you get:** A named, voiced, persistent NPC whose identity lives in your STAR graph and whose voice lives in ElevenLabs. Players can talk to him in real time. Other developers can fork his holon from STARNET. No other IDE has this pipeline — not Cursor, not Copilot, not Claude Code.

**See also:** `npc-with-voice.json` recipe for the raw `mcp_invoke` argument shapes.

---

## Flow 2 — Build a 3-mission quest arc

**What this demonstrates:** AI-generated narrative content committed directly into STAR holons via `star_create_mission` and `star_create_quest`. The quest graph panel renders the result. This is what it looks like when an AI writes lore and a game engine actually receives it.

**Paste into Agent mode:**

```
Design a 3-mission heist arc for a casino RP server. The story is called "The Meridian Job". Mission 1 is recon — scope the casino layout and get past security without tipping them off. Mission 2 is crew assembly — recruit a safecracker, a driver, and a hacker from contacts around the city. Mission 3 is the job itself — execute the heist during the New Year's gala.

For each mission, use star_create_mission with AI-generated objectives, trigger conditions, and rewards. Then use star_create_quest to link all three missions into an arc. Save the full arc as quests/meridian-job.json with the STAR holon IDs.
```

**What the agent does:**

1. `mcp_invoke star_create_mission` × 3 — each mission created as a STAR holon with objectives, triggers, and reward structure
2. `mcp_invoke star_create_quest` — quest arc holon linking all three missions in sequence
3. `write_file quests/meridian-job.json` — full arc with `{ questId, missions: [{ missionId, name, objectives }] }`

**What you get:** A live quest arc persisted to STARNET, linked to your Avatar, ready to fire in any OASIS-connected game. The quest graph panel in the IDE can render it visually. Other server owners can find and fork it from STARNET.

**See also:** `quest-chain.json` recipe, `quest-create.json` recipe.

---

## Flow 3 — Publish an OAPP to STARNET

**What this demonstrates:** Creating an OAPP and publishing it to STARNET — the versioned registry where any team can discover, install, and fork your work. This is "GitHub for game content and business processes," and it is the moment where building inside OASIS IDE stops being local and becomes networked.

**Paste into Agent mode:**

```
I have built an NPC pack for FiveM RP servers — it contains the Martinez detective, a bar owner, and a street fixer, each with STAR holons and ElevenLabs voices. I want to package this as an OAPP called "MarketDistrict-NPCs" and publish it to STARNET so other server owners can install it.

Use star_create_oapp to create the OAPP with name "MarketDistrict-NPCs", a description of what the pack includes, and version 1.0.0. Then use star_publish_oapp to publish it. Save the resulting OAPP ID and STARNET URL to README.md.
```

**What the agent does:**

1. `mcp_invoke star_create_oapp` — OAPP holon created on STARNET with metadata, version, Avatar attribution
2. `mcp_invoke star_publish_oapp` — OAPP listed as publicly discoverable on STARNET with version history
3. `write_file` / `read_file README.md` — OAPP ID and STARNET install command appended to the project README

**What you get:** Your NPC pack is on STARNET. Other developers run `star oapp install MarketDistrict-NPCs` and get the same NPCs in their server, with your Avatar credited. Every fork inherits your lineage. Every install is a potential platform API event.

**See also:** `oapp-starnet-publish.json` recipe, `oapp-create.json` recipe (CLI variant).

---

## Flow 4 — Mint a cross-game inventory item as an NFT

**What this demonstrates:** One prompt turns a concept into an on-chain NFT linked to a STAR inventory item holon — equippable across any OASIS-connected game. No other IDE touches any part of this: not the mint, not the inventory holon, not the cross-game graph linkage.

**Paste into Agent mode:**

```
I want to create a legendary weapon for my game server: the Meridian Plasma Rifle, a reward for players who complete the Meridian Job quest arc. It should be an NFT on Solana so players truly own it.

Use oasis_workflow_mint_solana_nft to mint it with name "Meridian Plasma Rifle", symbol "MPR", a description of what it is, and a rarity of legendary. Then use star_create_item to register it as a STAR inventory item holon with the NFT token address attached. Save the result to items/meridian-plasma-rifle.json.
```

**What the agent does:**

1. `mcp_invoke oasis_workflow_mint_solana_nft` — mints the NFT on Solana, returns transaction ID + token address + explorer link
2. `mcp_invoke star_create_item` — STAR inventory item holon created with `nftTokenAddress`, rarity, stats, and quest link (to the Meridian Job questId from Flow 2)
3. `write_file items/meridian-plasma-rifle.json` — `{ mintTxId, tokenAddress, explorerUrl, starItemHolonId }`

**What you get:** An NFT the player owns on-chain, an inventory item the game server queries via OASIS, and a quest reward that is verifiably scarce. The item travels with the player's Avatar across every OASIS-connected experience. No other IDE has this in a single agent turn.

**See also:** `nft-game-item.json` recipe.

---

## Flow 5 — Check your Avatar status

**What this demonstrates:** Identity is always present in OASIS IDE. Your Avatar is not a login screen — it is a persistent record that accumulates karma, wallet balances, inventory, and a history of everything you have built. This prompt makes that concrete in under 10 seconds.

**Paste into Agent mode:**

```
Show me my current OASIS Avatar status. Use oasis_get_avatar_detail to get my level, karma score, and wallet addresses. Then use oasis_search_holons to find holons I have created in this workspace today (search by metadata key "oasis.ide" and today's date). Give me a summary: who I am, what I have built today, and what my karma score is.
```

**What the agent does:**

1. `mcp_invoke oasis_get_avatar_detail` — returns Avatar level, karma, wallet addresses, username, join date
2. `mcp_invoke oasis_search_holons` — searches by `oasis.ide.*` metadata filter and today's date range
3. Composes a human-readable summary: identity + work done today

**What you get:** Proof that your work session has a permanent record tied to a verifiable identity — not just files in a folder. Everything built in Flows 1-4 is in that search result. The karma score reflects it. This is the framing that makes every other flow more meaningful, and it is what no horizontal IDE can offer.

**See also:** `avatar-status.json` recipe.

---

## Running all five flows together

The flows above are designed to chain. If you run them in order, by the end of Flow 5 your Avatar will show:

- Martinez NPC holon + ElevenLabs agent (Flow 1)
- The Meridian Job quest arc (Flow 2)
- MarketDistrict-NPCs OAPP on STARNET (Flow 3)
- Meridian Plasma Rifle NFT + inventory item (Flow 4)

All linked to one Avatar, with one karma score, in one STARNET namespace. That is the OASIS IDE value proposition made tangible: **building software is inseparable from owning and publishing what you build.**

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `mcp_invoke` returns "MCP not connected" | Check Settings > MCP — the server path should point to `MCP/dist/src/index.js`. Reload the IDE to restart the MCP child process. |
| Tool returns "Unknown tool prefix" or "Unknown STAR tool" | The IDE MCP process is running an old build. Reload the IDE window (`Cmd+R`) to restart the MCP child from the new `dist/`. |
| `star_create_*` returns connection error | STAR WebAPI is not running. Start it from the STAR ODK project and confirm it listens on `http://127.0.0.1:5001` (or set `STAR_API_URL`). |
| `star_create_*` returns 401 | Avatar not beamed in to STAR. Call `star_beam_in` with your credentials first, or re-login in Settings > Avatar. |
| `oasis_workflow_mint_*` returns error | Confirm ONODE is running on port 5003 and your Avatar wallet is funded (Solana devnet tokens for testing). |
| ElevenLabs tools return "ELEVENLABS_API_KEY is not set" | Set `ELEVENLABS_API_KEY` in Settings > Integrations. The MCP process picks it up on next restart. |
| ElevenLabs tools return 401 | The API key is invalid or expired. Generate a new one at elevenlabs.io. |
| Agent says "I cannot find that tool" | Confirm you are in **Agent** mode (not Chat mode). Chat mode is text-only and has no tool access. |
