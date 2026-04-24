# Recipe: Community / social OAPP (mobile + GeoNFTs + time-lock)

Use this recipe when the user describes a **community app with real-world location features, time-locked interaction, and NFT rewards** — e.g. "an outdoor mission app", "time-locked community platform", "geo-cached NFT rewards for visiting locations", or anything that mixes social interaction with physical-world mechanics.

---

## Default stack (Expo + React Native)

| Layer | Default choice | Why |
|---|---|---|
| **Mobile frontend** | **Expo** (`create-expo-app`) + React Native | Cross-platform iOS + Android from one codebase; Expo Go for instant testing with no Xcode/Android Studio |
| **Navigation** | `expo-router` (file-based) | Maps to natural screen flow: Feed → Missions → Profile |
| **Auth** | OASIS ONODE JWT via REST | `POST /api/avatar/authenticate`; store JWT in `expo-secure-store` |
| **Location** | `expo-location` | Foreground + background permissions; returns `{ latitude, longitude, accuracy }` |
| **Green space lookup** | OpenStreetMap Overpass API (free, no key) | Query parks/gardens near a lat/lng — see query pattern below |
| **Backend** (optional) | Node.js + Express on the same machine, or ONODE for holon persistence | Minimal: just one scheduled-unlock endpoint; everything else goes through OASIS MCP / ONODE |
| **State** | Zustand | Lightweight; pairs well with Expo and async ONODE fetches |
| **Notifications** | `expo-notifications` | Push reminders for mission days and unlock windows |

Alternative if the user prefers web-first: **Vite + React + react-leaflet** (see `minimal-vite-browser-oapp.md`), but location accuracy and push notifications are weaker.

---

## Core OASIS capabilities to wire up

### 1. Identity and login
```
ONODE endpoint: POST http://127.0.0.1:5003/api/avatar/authenticate
Body: { username, password }
Returns: { Token, avatarId }
```
Store the JWT and avatarId in `expo-secure-store`. Pass `Authorization: Bearer <token>` on every subsequent ONODE / STAR call.

MCP tool in Execute mode:
```json
{ "tool": "oasis_get_avatar_detail", "arguments": { "username": "alice" } }
```

### 2. Quest / mission system
Use STAR holons to define outdoor missions. Each mission has a target location, description, and reward NFT reference.

MCP tools:
```json
{ "tool": "star_create_mission", "arguments": { "name": "Visit Hyde Park", "description": "Walk to the bandstand in Hyde Park and check in.", "objectives": "Arrive within 50m of lat 51.5073, lng -0.1657" } }
{ "tool": "star_create_quest", "arguments": { "name": "Green Spaces Week 1", "description": "Complete 3 outdoor missions to earn your first GeoNFT." } }
```
Save the returned `id` fields — link missions to quests and quests to users via holons.

### 3. NFT rewards
Two-step: mint a reward NFT, then geo-anchor it at the mission location so it can only be "collected" by someone physically present.

**Step A — mint the reward NFT:**
```json
{ "tool": "oasis_workflow_mint_nft", "arguments": { "chain": "solana", "username": "alice", "password": "...", "symbol": "PARK1", "title": "Hyde Park Explorer", "description": "Earned by visiting Hyde Park, April 2026." } }
```
Returns `mintTxId`, `tokenAddress`, `explorerUrl`.

**Step B — place at coordinates:**
```json
{
  "tool": "oasis_place_geo_nft",
  "arguments": {
    "originalOASISNFTId": "<returned-nft-id>",
    "latitude": 51.5073,
    "longitude": -0.1657,
    "allowOtherPlayersToAlsoCollect": false,
    "permSpawn": false,
    "respawnDurationInSeconds": 0
  }
}
```
The NFT now lives at those real-world coordinates. The mobile app queries `oasis_get_geo_nfts` for the user's avatar to check what they have collected.

**Read GeoNFTs for a user:**
```json
{ "tool": "oasis_get_geo_nfts", "arguments": { "avatarId": "<avatarId>" } }
```

### 4. Green space discovery (OpenStreetMap Overpass API)
OASIS does not provide a green-space search; use the Overpass API directly from the backend or from the mobile app.

**Overpass QL query** — parks within 1 km of a user:
```
[out:json][timeout:10];
(
  node["leisure"="park"](around:1000,{LAT},{LNG});
  way["leisure"="park"](around:1000,{LAT},{LNG});
  relation["leisure"="park"](around:1000,{LAT},{LNG});
);
out center;
```
Endpoint: `https://overpass-api.de/api/interpreter?data=<url-encoded-query>`

Returns GeoJSON-like nodes with `lat`, `lon`, and `tags.name`. Pick the 3 closest by distance (Haversine), assign each one a STAR mission.

In **Execute mode** the agent can scaffold a Node.js helper:
```js
// run_workspace_command: ["node", "scripts/find-parks.mjs", "51.5073", "-0.1657"]
```

### 5. Time-lock communication
OASIS has no built-in scheduler. Two clean patterns:

**Pattern A — server-side holon flag (simplest):**
Store a `communityUnlockWindow` holon with fields `{ unlockedDayOfWeek: 4, unlockedHourStart: 18, unlockedHourEnd: 22 }`. App reads the holon on load and computes whether "now" is inside the window. No cron needed.

```json
{
  "tool": "oasis_save_holon",
  "arguments": {
    "holon": {
      "name": "ThursdayUnlockConfig",
      "customData": {
        "type": "oasis.ide.time-lock",
        "unlockedDayOfWeek": 4,
        "unlockedHourStart": 18,
        "unlockedHourEnd": 22,
        "timezone": "UTC"
      }
    }
  }
}
```
Read it back with `oasis_get_holon` using the returned `id`.

**Pattern B — backend cron (more control):**
Add an Express route `GET /api/community/is-open` that returns `{ open: true/false, nextOpen: "<iso-date>" }`. A node-cron job sets a Redis/file flag at the unlock hour. The mobile app polls this endpoint.

---

## Expo project scaffold

The agent should use `write_files` to create this structure when the user says "build it" or clicks "Proceed":

```
community-app/
  package.json          (expo, expo-router, expo-location, expo-secure-store, expo-notifications, zustand)
  app.json              (Expo config, permissions: LOCATION, NOTIFICATIONS)
  app/
    _layout.tsx         (Stack navigator root, auth guard)
    index.tsx           (Feed / missions list)
    mission/[id].tsx    (Single mission: map, check-in button, NFT reward status)
    profile.tsx         (Avatar, collected GeoNFTs, karma)
  src/
    api/
      onode.ts          (fetch wrapper: POST /api/avatar/authenticate, GET holons, etc.)
      overpass.ts       (green space query helper)
    store/
      auth.ts           (Zustand slice: jwt, avatarId)
      missions.ts       (Zustand slice: missions list, active mission)
    utils/
      geo.ts            (Haversine distance, inside-radius check)
      timeLock.ts       (isUnlockWindowOpen from holon config)
  README.md
```

After `write_files` run:
```
run_workspace_command: ["npx", "create-expo-app@latest", "--template", "blank-typescript", "community-app"]
```
then overwrite with the scaffolded files. (Or scaffold directly without `create-expo-app` by writing all files and using `npx expo start` as the dev command.)

---

## End-to-end agent turn sequence (Execute mode)

1. `mcp_invoke oasis_health_check` — confirm ONODE is reachable.
2. `mcp_invoke star_create_mission` × N — one mission per green space location.
3. `mcp_invoke star_create_quest` — link missions into a weekly arc.
4. `mcp_invoke oasis_workflow_mint_nft` × N — one reward NFT per mission.
5. `mcp_invoke oasis_place_geo_nft` × N — geocache each NFT at its mission coordinates.
6. `mcp_invoke oasis_save_holon` — store `ThursdayUnlockConfig` time-lock record.
7. `write_files` — scaffold the Expo app with `src/api/onode.ts` pre-wired to the ONODE base URL.
8. `run_workspace_command ["npx","expo","start"]` — start dev server.

---

## Acceptance checks (agent)

- **Real project:** `npx expo start` (or `npm run start` in the app folder) runs without red module-resolution errors. Prefer `npx tsc --noEmit` if TypeScript template is used.
- **No fake packages:** dependencies are real npm packages or local paths; do not invent `@vendor/holon-sdk` style names.
- **Tool names:** GeoNFT flows use `oasis_*` tools from the allowlist, not non-existent `star_*` geo helpers (see Key invariants below).
- **User-facing URL:** tell the user the exact dev URL or Expo QR flow from the terminal output, not a guessed port.

---

## Key invariants for this recipe

- **Never** use `star_list_geonft` / `star_get_geonft` / `star_place_geonft` — those names do not exist. GeoNFT tools are under `oasis_*` prefix (see allowlist).
- `oasis_place_geo_nft` requires the NFT to already exist (`originalOASISNFTId`) and to be owned by the authenticated avatar. Mint first, then place.
- Overpass API is a **third-party service** — the agent should document the URL and not claim OASIS provides green-space search natively.
- Expo dev server binds to a random LAN port (usually 8081). Tell the user to run `npx expo start` and scan the QR code with the **Expo Go** app, or press `w` for a web preview.
- Time-lock logic belongs in the app (or backend), not on-chain. Store config as an OASIS holon so it can be updated without a code deploy.
