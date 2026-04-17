# STAR CLI Recipes

These recipe files define documented, non-interactive STAR CLI commands and MCP tool sequences for use by the OASIS IDE Agent (`run_star_cli` and `mcp_invoke` tools).

## Rules for the agent

### STAR CLI recipes (`run_star_cli`)
- Always pass `-n` (non-interactive) and `--json` (machine-readable output).
- `argv[0]` must always be the literal string `"star"`.
- Do **not** invent flags — use only the patterns in these files.
- Beam-in credentials come from `--username` / `--password` or `STAR_CLI_USERNAME` / `STAR_CLI_PASSWORD` env vars (already set in workspace context when the user is logged in).
- Exit code `0` = success. Exit code `1` = general error. Exit code `2` = missing args/credentials. Exit code `3` = interactive input required (do not retry — report to user).
- On success, stdout is a single JSON line: `{ "success": true, "message": "...", "data": ... }`.
- On failure, stdout is a JSON line: `{ "success": false, "exitCode": N, "error": "...", "detail": "..." }`.

### MCP sequence recipes (`mcp_invoke`)
- These use `type: "mcp_invoke_sequence"` and document multi-step flows over the Unified MCP.
- Call each step via `mcp_invoke` with `{ "tool": "<toolName>", "arguments": { ... } }`.
- Requires ONODE running (OASIS tools) and/or STAR WebAPI running (star_* tools).
- Save ids returned by each step — later steps often depend on them.

## Recipe index

### Demo flows (start here)

| File | Description |
|------|-------------|
| `demo-flows.md` | **5 copy-pasteable Agent mode prompts** showcasing OASIS + STAR end-to-end. Start here for demos and onboarding. |

### App scaffold recipes

| File | Stack | Description |
|------|-------|-------------|
| `community-social-app.md` | Expo + React Native, Node.js, OSM Overpass | Community / social OAPP with GeoNFTs, STAR missions, time-lock unlock windows, and OpenStreetMap green-space lookup. Mobile-first. |

### MCP sequence recipes

| File | Tools used | Description |
|------|-----------|-------------|
| `npc-with-voice.json` | `star_create_npc`, `elevenlabs_list_voices`, `elevenlabs_create_agent` | Create a STAR NPC holon with a live ElevenLabs conversational voice agent |
| `quest-chain.json` | `star_create_mission` × N, `star_create_quest` | Build a multi-mission quest arc — each mission a STAR holon, linked by a quest holon |
| `oapp-starnet-publish.json` | `star_create_oapp`, `star_publish_oapp` | Create an OAPP and publish it to STARNET so others can discover and install it |
| `nft-game-item.json` | `oasis_workflow_mint_solana_nft`, `star_create_item` | Mint an NFT and link it to a STAR inventory item holon for cross-game equipping |
| `avatar-status.json` | `oasis_get_avatar_detail`, `oasis_search_holons` | Check Avatar identity, karma, and all holons created in the current session |

### STAR CLI recipes

| File | Command family | Description |
|------|---------------|-------------|
| `star-status.json` | status / help | Verify CLI is reachable and show STAR version |
| `avatar-beamin.json` | avatar | Authenticate (beam in) as an OASIS avatar |
| `oapp-list.json` | oapp | List all OAPPs for logged-in avatar |
| `oapp-create.json` | oapp | Create a new OAPP (non-interactive scripted) |
| `oapp-show.json` | oapp | Show a single OAPP by name or id |
| `oapp-light.json` | oapp | Run Light generation from a DNA file |
| `holon-list.json` | holon | List holons |
| `holon-show.json` | holon | Show a single holon by id |
| `holon-create.json` | holon | Create a holon (non-interactive) |
| `zome-list.json` | zome | List zomes |
| `quest-list.json` | quest | List quests |
| `quest-create.json` | quest | Create a quest (non-interactive) — single quest; for a full arc see `quest-chain.json` |
