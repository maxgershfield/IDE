# OASIS IDE: Metaverse Game Vibe Coding Build Plan

**Goal:** Pre-configure the OASIS IDE to be the go-to tool for metaverse game vibe coders.
One developer should be able to sit down and build AI-powered RP servers, NPC packs with real
voices, quest arcs, cross-game items, and content pipelines without knowing the full STAR CLI
or OASIS API surface — the IDE does it for them.

---

## Contents

1. [Phase 0 — Foundations (env + allowlist)](#phase-0)
2. [Phase 1 — Game Dev Mode + Tool Palette](#phase-1)
3. [Phase 1.5 — Browser World Engine Integrations (Hyperfy / Three.js / Babylon.js)](#phase-15)
4. [Phase 2 — ElevenLabs NPC Voice Studio](#phase-2)
5. [Phase 2.5 — Unity MCP Bridge](#phase-25)
6. [Phase 3 — Lore and Dialogue Generator](#phase-3)
7. [Phase 4 — Genies Avatar Studio Panel](#phase-4)
8. [Phase 5 — Metaverse Starter Templates](#phase-5)
9. [Phase 5.5 — Roblox Template](#phase-55)
10. [Phase 6 — .star-workspace.json Manifest](#phase-6)
11. [Testing and QA checklist](#testing)
12. [Dependency map](#dependencies)
13. [Appendix: Hyperfy — Competitor, Target, or Foundation?](#hyperfy-analysis)

---

## Existing codebase reference

| File | Role |
|------|------|
| `src/main/services/MCPServerManager.ts` | Spawns `oasis-unified` MCP child; `buildMcpChildEnv()` injects env vars |
| `src/main/services/AgentToolExecutor.ts` | `run_star_cli`, `mcp_invoke`, `read_file`, `list_directory`, `workspace_grep`, `run_workspace_command` |
| `src/main/services/agentMcpAllowlist.ts` | `AGENT_MCP_ALLOWLIST` Set gates what `mcp_invoke` can call |
| `src/renderer/constants/ideChatModels.ts` | `ComposerModeId = 'chat' \| 'agent'`; model catalog |
| `src/renderer/components/Chat/ComposerSessionPanel.tsx` | Per-session composer: mode selector, agent loop, model picker |
| `src/renderer/components/Chat/ChatInterface.tsx` | Tab bar shell; renders one `ComposerSessionPanel` per session |
| `src/renderer/components/Layout/RightPanelStack.tsx` | Vertically resizable right column: Chat / Inbox / OASISTools |
| `src/renderer/App.tsx` | Root: providers + layout; all panels assembled here |
| `src/main/preload.ts` | `window.electronAPI` IPC surface |
| `src/main/index.ts` | Main process: IPC handlers, `MCPServerManager`, `AgentToolExecutor` wiring |
| `src/shared/agentContextPack.ts` | Injects workspace context into every agent turn |

---

<a name="phase-0"></a>
## Phase 0 — Foundations (env + allowlist)

**Scope:** No UI. Prepares the engine that all later phases depend on.

### 0.1 Extend `buildMcpChildEnv()` in `MCPServerManager.ts`

Add two new optional env vars to the child process alongside `OASIS_API_URL` / `STAR_API_URL`:

```typescript
// in buildMcpChildEnv(), after STAR_API_URL block:
const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim();
if (elevenLabsKey) {
  env.ELEVENLABS_API_KEY = elevenLabsKey;
}
const geniesClientId = process.env.GENIES_CLIENT_ID?.trim();
if (geniesClientId) {
  env.GENIES_CLIENT_ID = geniesClientId;
}
```

This means anyone running the IDE with `ELEVENLABS_API_KEY` set in their shell will automatically
have it available inside every MCP tool call — no separate config UI required for MVP.

### 0.2 Extend `AGENT_MCP_ALLOWLIST` in `agentMcpAllowlist.ts`

Add the game-dev tool names that the OASIS unified MCP server already exposes (or will expose
after Phase 2 backend additions). Group them clearly:

```typescript
// --- Quest and mission management ---
'star_create_quest',         // already present — verify
'star_get_quest',            // already present
'star_list_quests',          // already present
'star_update_quest',
'star_delete_quest',
'star_add_quest_objective',
'star_complete_quest_objective',
'star_create_mission',
'star_list_missions',
'star_get_mission',
// --- NFT / inventory (game items) ---
'star_mint_inventory_nft',
'oasis_workflow_mint_nft',   // already present
'oasis_workflow_mint_solana_nft', // already present
'star_list_inventory_items',
'star_create_inventory_item',
// --- NPC holons ---
'star_create_npc',
'star_get_npc',
'star_list_npcs',
'star_update_npc',
// --- GeoHotSpots ---
'star_create_geohotspot',
'star_list_geohotspots',
// --- ElevenLabs voice (via MCP unified server) ---
'elevenlabs_list_voices',
'elevenlabs_tts_preview',
'elevenlabs_create_agent',
'elevenlabs_clone_voice',
```

**Important:** only add a name here when the MCP server actually implements the tool.
For tools not yet in the MCP server, add them as stubs that return `{ error: 'not yet implemented' }`
so the allowlist is ready and the agent gets a clean message rather than a generic failure.

### 0.3 Add `write_file` to `AgentToolExecutor`

The game dev agent needs to write files (lore bibles, dialogue JSON, quest templates).
Add `write_file` as a new case in `AgentToolExecutor.execute()`:

```typescript
case 'write_file':
  return await this.writeFile(toolCallId, args);
```

Implementation — `writeFile()` private method:

```typescript
private async writeFile(
  toolCallId: string,
  args: Record<string, unknown>
): Promise<AgentToolExecutionResult> {
  const p = typeof args.path === 'string' ? args.path : '';
  const content = typeof args.content === 'string' ? args.content : '';
  if (!p) {
    return { toolCallId, content: 'write_file requires path', isError: true };
  }
  if (content.length > 2 * 1024 * 1024) {
    return { toolCallId, content: 'write_file: content too large (max 2 MiB)', isError: true };
  }
  let full: string;
  try {
    full = this.resolveWorkspacePath(p);
  } catch (e) {
    return { toolCallId, content: (e as Error).message, isError: true };
  }
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
  return { toolCallId, content: `wrote ${content.length} chars to ${p}` };
}
```

Add `'write_file'` to the tool definitions string in `agentContextPack.ts` so the model knows it exists.

---

<a name="phase-1"></a>
## Phase 1 — Game Dev Mode + Tool Palette

**Scope:** Renderer only (no new IPC). Pure TypeScript / React.

### 1.1 Extend `ComposerModeId`

**File:** `src/renderer/constants/ideChatModels.ts`

```typescript
export type ComposerModeId = 'chat' | 'agent' | 'game';
```

Add a storage key:

```typescript
export const IDE_GAME_DEV_STORAGE_KEY = 'oasis-ide-game-dev-config';
```

### 1.2 Add game mode to `ComposerSessionPanel`

**File:** `src/renderer/components/Chat/ComposerSessionPanel.tsx`

The existing mode selector renders `chat` and `agent` buttons. Add a third:

```tsx
<button
  className={`composer-mode-btn${composerMode === 'game' ? ' is-active' : ''}`}
  onClick={() => setComposerMode('game')}
  title="Game Dev mode — optimised for metaverse / RP server vibe coding"
>
  Game
</button>
```

When `composerMode === 'game'`:
- Force the underlying loop to run in agent mode (game dev always needs tools)
- Prepend the GAME_DEV_SYSTEM_PROMPT (see 1.3) to the first message in the context pack
- Show the Game Tool Palette (see 1.4) above the message input

### 1.3 Game Dev System Prompt

**File:** `src/renderer/constants/gameDevPrompt.ts` (new file)

```typescript
export const GAME_DEV_SYSTEM_PROMPT = `
You are an expert metaverse game developer assistant running inside the OASIS IDE.
You have access to the full STAR CLI (via run_star_cli), OASIS MCP tools (via mcp_invoke),
and workspace file tools (read_file, write_file, list_directory, workspace_grep).

Your job is to help developers vibe-code metaverse games: RP servers, quest arcs, NPC packs,
cross-game inventory items, GeoHotSpots, lore bibles, and ElevenLabs voice agents for NPCs.

STAR CLI quick reference (always use --non-interactive / -n flag for scripted calls):
  star -n quest create --name "..." --description "..." --game-source "OurWorld"
  star -n quest add-objective --quest-id <id> --name "..." --type KillMonsters --target-count 10
  star -n nft mint --name "..." --description "..." --image-url "..."
  star -n holon create --name "..." --type NPC
  star -n inventoryitem create --name "..." --description "..."

Key MCP tools:
  star_create_quest, star_add_quest_objective, star_create_npc, star_create_mission,
  star_mint_inventory_nft, star_create_geohotspot, elevenlabs_create_agent,
  elevenlabs_list_voices, oasis_save_holon

Output format for multi-step work:
  1. Say what you are about to do in one line.
  2. Execute with tools — show the command or tool call.
  3. Report result. If something fails, fix the root cause, not a fallback.
  4. After all steps, print a summary with IDs and next steps.

When writing files to the workspace, use write_file. Always put quest data in quests/,
NPC data in npcs/, lore in lore/, and generated scripts in scripts/.
`.trim();
```

### 1.4 Game Tool Palette

**File:** `src/renderer/components/Chat/GameToolPalette.tsx` (new file)

A horizontal strip of quick-action buttons that appears above the message input in game mode.
Each button injects a pre-written prompt into the chat input box (does not auto-send — the
developer reviews and sends).

```tsx
import React from 'react';

interface PaletteAction {
  label: string;
  icon: string;
  prompt: string;
}

const ACTIONS: PaletteAction[] = [
  {
    label: 'New Quest',
    icon: '⚔',
    prompt: 'Create a new quest. Ask me for the name, description, number of objectives, and game source before creating it.'
  },
  {
    label: 'New NPC',
    icon: '🧑',
    prompt: 'Create a new NPC character. Ask me for the name, faction, role, personality traits, and whether they need an ElevenLabs voice agent.'
  },
  {
    label: 'Generate Lore',
    icon: '📖',
    prompt: 'Help me generate a lore bible for my game world. Ask me for the world name, setting (city/fantasy/sci-fi), number of factions, and tone. Then write it to lore/lore-bible.md.'
  },
  {
    label: 'Mission Arc',
    icon: '🗺',
    prompt: 'Design a 5-mission story arc. Ask me for the faction name, protagonist, antagonist, and final reward. Create each mission with star_create_mission and link them.'
  },
  {
    label: 'Mint Item',
    icon: '💎',
    prompt: 'Mint a new in-game inventory item as an NFT. Ask me for the item name, description, rarity (common/rare/legendary), and which game it belongs to.'
  },
  {
    label: 'NPC Voice',
    icon: '🎙',
    prompt: 'Set up an ElevenLabs voice agent for an NPC. Ask me for the NPC name, personality description, and preferred voice style. Then create the agent and save the agent_id to npcs/<name>.json.'
  },
  {
    label: 'GeoHotSpot',
    icon: '📍',
    prompt: 'Create a GeoHotSpot for a real-world location trigger. Ask me for the location name, lat/long (or description), and what quest it links to.'
  },
  {
    label: 'Dialogue Tree',
    icon: '💬',
    prompt: 'Generate a branching dialogue tree for an NPC. Ask me for the NPC name, their role in the story, and 3 conversation topics. Write the result to npcs/<name>-dialogue.json.'
  }
];

interface GameToolPaletteProps {
  onInjectPrompt: (prompt: string) => void;
}

export const GameToolPalette: React.FC<GameToolPaletteProps> = ({ onInjectPrompt }) => {
  return (
    <div className="game-tool-palette">
      <div className="game-tool-palette__label">Quick actions</div>
      <div className="game-tool-palette__actions">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            className="game-tool-palette__btn"
            title={action.prompt}
            onClick={() => onInjectPrompt(action.prompt)}
          >
            <span className="game-tool-palette__icon">{action.icon}</span>
            <span className="game-tool-palette__label-text">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
```

CSS class `game-tool-palette` goes in `ChatInterface.css` — a single horizontal scrolling strip
with dark background and small pill-style buttons.

### 1.5 Wire palette into `ComposerSessionPanel`

The session panel already manages a `input` / `draft` state for the text area.
Pass `onInjectPrompt` as:

```typescript
const handleInjectPrompt = useCallback((prompt: string) => {
  setDraft(prompt);  // or setInput — whatever the textarea state variable is
}, []);
```

Then render `<GameToolPalette onInjectPrompt={handleInjectPrompt} />` immediately above the
textarea when `composerMode === 'game'`.

### 1.6 Context pack game branch

**File:** `src/shared/agentContextPack.ts`

Add a `gameMode?: boolean` parameter to `getAgentContextPack()`. When true:

```typescript
if (opts.gameMode) {
  sections.push(`## Game Dev Mode
Active STAR project: ${opts.workspacePath ?? 'no workspace'}
Available quick tools: run_star_cli, mcp_invoke (see allowlist), write_file, read_file
Key directories: quests/, npcs/, lore/, scripts/, templates/
ElevenLabs integration: ${process.env.ELEVENLABS_API_KEY ? 'configured' : 'set ELEVENLABS_API_KEY to enable'}
`);
}
```

Pass `gameMode: composerMode === 'game'` from `ComposerSessionPanel` when calling the agent loop.

---

<a name="phase-15"></a>
## Phase 1.5 — Browser World Engine Integrations (Hyperfy / Three.js / Babylon.js)

**Scope:** Starter templates + agent context extensions for the three dominant browser-native
world building stacks. No new IPC required — uses `write_file`, `run_workspace_command`, and
the existing static preview server.

### Background: the two paradigms

In 2026, metaverse game worlds are built in two ways. The first is browser-native vibe coding:
Three.js or Babylon.js scenes generated by AI, running immediately in a browser tab with no
build step or engine install. The second is traditional engines (Unity, Godot, Unreal) with
MCP bridges that let an agent directly manipulate the editor — covered in Phase 2.5.

This phase targets the browser-native paradigm, which is the primary vibe coder workflow and
the easiest on-ramp for non-traditional developers.

**Browser engine comparison:**

| Engine | Best for | OASIS fit |
|--------|----------|-----------|
| **Three.js + React Three Fiber** | Creative/experimental, React-heavy, rapid prototyping | Excellent — massive ecosystem, Claude/AI knows it deeply, simple setup |
| **Babylon.js** | Multiplayer games, WebXR/VR, physics, audio — batteries included | Strong — built-in Havok physics, WebXR first-class, Microsoft-backed |
| **Hyperfy** | Open metaverse worlds, persistent multiplayer, VRM avatars, NFT worlds | Perfect — built on Three.js + PhysX, supports WebXR + VRM + NFT ownership + ELIZA AI agents |

### 1.5.1 Hyperfy integration (highest priority)

**Why Hyperfy is the most important integration:**

Hyperfy is an open-source (GPL-3) browser metaverse engine built on Three.js + PhysX. It
has native support for WebXR, VRM portable avatars, NFT-minted world ownership, real-time
multi-user collaboration, and has already integrated the ELIZA AI agent framework so NPCs
can live inside worlds natively. Every one of those features maps directly to an OASIS primitive:

| Hyperfy native feature | OASIS equivalent |
|------------------------|-----------------|
| NFT-minted world ownership | OASIS GeoNFT / world holon on STARNET |
| VRM portable avatars | OASIS Avatar (WEB4 cross-game identity) |
| ELIZA AI agents in world | STAR NPC holons + ElevenLabs voice agents |
| JavaScript app framework | Agent generates app code via `write_file` |
| Self-hosted on custom domain | OASIS ONODE hosting layer |
| Real-time multi-user | Existing Hyperfy networking (Socket.io-based) |

**New starter template:** `src/main/templates/metaverse/hyperfy-world/`

Files created in workspace:
```
package.json          → { "scripts": { "dev": "hyperfy dev", "build": "hyperfy build" } }
src/world.js          → minimal Hyperfy world with one spawn point
src/npcs/             → empty directory, agent writes NPC components here
quests/               → empty directory, agent writes quest JSON here
lore/                 → empty directory
.star-workspace.json  → { "projectType": "metaverse-rp-server", "gameEngine": "hyperfy" }
README.md             → setup instructions
```

**Agent context additions** in `gameDevPrompt.ts` when Hyperfy project detected (via
`.star-workspace.json` `gameEngine: "hyperfy"`):

```typescript
export const HYPERFY_CONTEXT = `
## Hyperfy World Development

Hyperfy app component pattern:
  export default function MyApp({ world }) {
    const mesh = world.create('mesh', { geometry: 'box', material: { color: 'red' } })
    mesh.position.set(0, 1, 0)
    world.on('update', delta => { /* game loop */ })
  }

NPC component pattern:
  export default function NPC({ world }) {
    const npc = world.create('avatar', { src: './avatars/npc.vrm' })
    npc.position.set(2, 0, 2)
    // Attach ElevenLabs agent_id for voice via OASIS NPC holon
  }

VRM avatar loading: world.create('avatar', { src: 'url-to-vrm-file.vrm' })
Physics: world.create('rigidbody', { type: 'dynamic' })
Colliders: world.create('collider', { geometry: 'box', size: [1, 1, 1] })
NFT world minting: handled via OASIS star_create_geohotspot + STARNET publish
Run: npm run dev (opens on localhost:3000)
`.trim();
```

**Game Tool Palette additions** (when Hyperfy project active):
- "Add NPC to World" → injects Hyperfy NPC component prompt
- "Add Quest Zone" → creates GeoHotSpot + Hyperfy trigger zone linked to STAR quest
- "Publish World" → injects STARNET publish prompt with Hyperfy build output

### 1.5.2 Three.js + React Three Fiber agent context

Three.js is the most AI-friendly 3D library — Claude and other models know it deeply due to
its prevalence in training data. No dedicated panel needed; the agent context and a starter
template are sufficient.

**New starter template:** `src/main/templates/metaverse/threejs-world/`

Files:
```
package.json           → React + Three.js + R3F + drei + Vite
src/App.tsx            → minimal R3F Canvas with OrbitControls
src/World.tsx          → scene placeholder
src/npcs/              → empty
quests/                → empty
index.html
vite.config.ts
.star-workspace.json   → { "projectType": "metaverse-rp-server", "gameEngine": "threejs" }
```

**Agent context additions** (`gameDevPrompt.ts` Three.js branch):

```typescript
export const THREEJS_CONTEXT = `
## Three.js + React Three Fiber

R3F scene pattern:
  import { Canvas } from '@react-three/fiber'
  import { OrbitControls, Float } from '@react-three/drei'

  export default function World() {
    return (
      <Canvas camera={{ position: [0, 5, 10] }}>
        <ambientLight intensity={0.5} />
        <OrbitControls />
        <mesh position={[0, 1, 0]}>
          <boxGeometry />
          <meshStandardMaterial color="royalblue" />
        </mesh>
      </Canvas>
    )
  }

Physics: use @react-three/rapier (RigidBody, Collider components)
Multiplayer: use Liveblocks or Partykit for shared state
NPC movement: useFrame hook for per-frame updates
Run: npm run dev (Vite dev server)
`.trim();
```

### 1.5.3 Babylon.js agent context

Babylon.js is the right choice when a dev needs WebXR, built-in physics (Havok), audio,
and a structured game loop — "batteries included" for serious browser games.

**New starter template:** `src/main/templates/metaverse/babylonjs-world/`

Files:
```
package.json           → Babylon.js + Vite
src/main.ts            → BabylonJS Engine + Scene setup
src/npcs/              → empty
quests/                → empty
index.html
.star-workspace.json   → { "projectType": "metaverse-rp-server", "gameEngine": "babylonjs" }
```

**Agent context additions** (`gameDevPrompt.ts` Babylon branch):

```typescript
export const BABYLONJS_CONTEXT = `
## Babylon.js

Scene setup:
  const engine = new BABYLON.Engine(canvas, true)
  const scene = new BABYLON.Scene(engine)
  const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI/2, Math.PI/4, 10, BABYLON.Vector3.Zero(), scene)
  camera.attachControl(canvas, true)
  const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene)
  const box = BABYLON.MeshBuilder.CreateBox('box', { size: 1 }, scene)
  engine.runRenderLoop(() => scene.render())

Physics (Havok): scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), new HavokPlugin())
WebXR: await scene.createDefaultXRExperienceAsync({ floorMeshes: [ground] })
Inspector: scene.debugLayer.show()  ← extremely useful for visual debugging
Collision: mesh.checkCollisions = true; camera.checkCollisions = true
Run: npm run dev
`.trim();
```

### 1.5.4 Engine detection and context switching

**File:** `src/shared/agentContextPack.ts`

On workspace open, read `.star-workspace.json`. If `gameEngine` is set, inject the matching
engine context block into the game dev system prompt:

```typescript
const ENGINE_CONTEXTS: Record<string, string> = {
  'hyperfy': HYPERFY_CONTEXT,
  'threejs': THREEJS_CONTEXT,
  'babylonjs': BABYLONJS_CONTEXT,
  'unity': UNITY_CONTEXT,   // added in Phase 2.5
};

if (opts.gameMode && opts.starConfig?.gameEngine) {
  const engineCtx = ENGINE_CONTEXTS[opts.starConfig.gameEngine];
  if (engineCtx) sections.push(engineCtx);
}
```

### 1.5.5 Static preview for browser worlds

The IDE already has `previewStaticFolder` / `StaticPreviewService`. For browser world projects
using Vite (`threejs`, `babylonjs`, `hyperfy`), the agent should:

1. Call `run_workspace_command` with `["npm", "run", "build"]` to produce `dist/`
2. Then call `previewStaticFolder("dist")` to serve it and open in browser

Alternatively, for dev mode preview: add `run_workspace_command` with `["npm", "run", "dev"]`
and surface the Vite dev server URL in the IDE status bar (passed back via stdout parsing).

### 1.5.6 Files changed

| New files | Modified files |
|-----------|---------------|
| `src/main/templates/metaverse/hyperfy-world/*` | `gameDevPrompt.ts` (engine contexts) |
| `src/main/templates/metaverse/threejs-world/*` | `agentContextPack.ts` (engine detection) |
| `src/main/templates/metaverse/babylonjs-world/*` | `starWorkspaceTypes.ts` (add `gameEngine` field) |

**Effort estimate:** 2 days

---

<a name="phase-2"></a>
## Phase 2 — ElevenLabs NPC Voice Studio

**Scope:** New panel + new IPC channels + MCP server extension.

### 2.1 New IPC channels

**File:** `src/main/preload.ts` — add to `window.electronAPI`:

```typescript
elevenlabsListVoices: () => Promise<ElevenLabsVoice[]>;
elevenlabsPreviewVoice: (voiceId: string, text: string) => Promise<{ audioBase64: string }>;
elevenlabsCreateAgent: (params: ElevenLabsAgentParams) => Promise<{ agentId: string }>;
elevenlabsTts: (voiceId: string, text: string) => Promise<{ audioBase64: string }>;
```

**File:** `src/main/index.ts` — add IPC handlers:

```typescript
ipcMain.handle('elevenlabs:list-voices', async () => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, error: 'ELEVENLABS_API_KEY not set' };
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey }
  });
  const data = await res.json() as { voices: ElevenLabsVoice[] };
  return { ok: true, voices: data.voices };
});

ipcMain.handle('elevenlabs:tts', async (_e, voiceId: string, text: string) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, error: 'ELEVENLABS_API_KEY not set' };
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' })
    }
  );
  const buf = await res.arrayBuffer();
  return { ok: true, audioBase64: Buffer.from(buf).toString('base64') };
});

ipcMain.handle('elevenlabs:create-agent', async (_e, params: ElevenLabsAgentParams) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, error: 'ELEVENLABS_API_KEY not set' };
  const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      conversation_config: {
        agent: {
          prompt: { prompt: params.systemPrompt },
          first_message: params.firstMessage,
          language: 'en'
        }
      },
      tts: { voice_id: params.voiceId }
    })
  });
  const data = await res.json() as { agent_id: string };
  return { ok: true, agentId: data.agent_id };
});
```

Add the shared types in `src/shared/agentTurnTypes.ts` or a new `src/shared/elevenLabsTypes.ts`:

```typescript
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

export interface ElevenLabsAgentParams {
  name: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
}
```

### 2.2 New renderer panel

**File:** `src/renderer/components/NPC/NPCVoicePanel.tsx` (new)

Component structure:

```
NPCVoicePanel
  ├─ ApiKeyBanner          (shows warning if ELEVENLABS_API_KEY not set)
  ├─ VoiceLibrary          (grid of voices with name, labels, play button)
  ├─ NPCCreatorForm        (name, role, personality, faction, voice picker)
  └─ CreatedAgentsList     (persisted in localStorage: npc name → agent_id)
```

Key behaviour:

1. On mount: calls `window.electronAPI.elevenlabsListVoices()`. Renders voice cards.
2. Each voice card has a Play button: calls `elevenlabsTts(voiceId, "Hello, traveller.")`,
   decodes base64, plays via `new Audio('data:audio/mpeg;base64,' + audioBase64).play()`.
3. Form: NPC name, role (dropdown: shop owner / gang leader / quest giver / taxi / guard / custom),
   personality (text area), faction (text), selected voice (from library).
4. "Create NPC Voice Agent" button:
   - AI generates the system prompt: calls `window.electronAPI.chatComplete(...)` with a short
     prompt that expands the user's inputs into a full ElevenLabs system prompt.
   - Calls `elevenlabsCreateAgent(params)`.
   - Saves `{ npcName, agentId, voiceId, role }` to `localStorage['oasis-npc-agents']`.
   - Writes `npcs/<npcName>.json` to workspace via `window.electronAPI.writeFile(...)`.
5. "Link to STAR Quest" button: injects a prompt into the chat asking the agent to attach
   the NPC's `agentId` to a STAR quest narrative attachment.

### 2.3 Wire panel into `RightPanelShell`

**File:** `src/renderer/components/Layout/RightPanelShell.tsx`

Add an NPC Voice tab alongside the existing OASIS Tools and Agents tabs. Only show the tab
header indicator when `ELEVENLABS_API_KEY` is configured (check via a new IPC ping on mount,
or show it always but with the "configure" banner inside).

### 2.4 MCP server additions (backend)

These tools need to be implemented in `MCP/src/tools/` for the MCP child process:

| Tool name | Input | Output |
|-----------|-------|--------|
| `elevenlabs_list_voices` | `{}` | `{ voices: ElevenLabsVoice[] }` |
| `elevenlabs_tts_preview` | `{ voice_id, text }` | `{ audio_url }` (presigned or base64) |
| `elevenlabs_create_agent` | `{ name, system_prompt, first_message, voice_id }` | `{ agent_id }` |
| `elevenlabs_clone_voice` | `{ name, files: string[] }` | `{ voice_id }` |

These use the `ELEVENLABS_API_KEY` from the MCP child env (injected by Phase 0.1).
Once implemented, the game dev agent can call them via `mcp_invoke` inside the agent loop.

---

<a name="phase-25"></a>
## Phase 2.5 — Unity MCP Bridge

**Scope:** Connect the OASIS IDE agent loop to a locally running Unity Editor via the MCP
protocol. Enables the agent to create GameObjects, write C# scripts, run tests, and read
the Console — all from inside the IDE chat — while simultaneously creating matching OASIS
STAR holons for cross-game persistence.

### Background: Unity + MCP in 2026

Two mature open-source packages expose the Unity Editor as an MCP server:

| Package | Transport | Key features |
|---------|-----------|-------------|
| `CoplayDev/unity-mcp` | HTTP (default) + stdio | Asset management, scene control, script editing, editor automation |
| `IvanMurzak/Unity-MCP` | HTTP + CLI (`unity-mcp-cli`) | Editor + Runtime integration, any C# method becomes a tool with one attribute, AI-driven debugging |

Unity's official **AI Gateway** (planned 2026) will formalise this pattern at the platform
level. Meta's **XR Unity MCP Extension** already handles spatial/Quest development. The
pattern is the de facto standard for AI-assisted Unity development.

The workflow the agent can execute:
1. Create a GameObject in the current scene
2. Attach a C# script with behaviour
3. Run tests and read Console output
4. Verify the result and iterate

When combined with OASIS STAR, the agent creates the Unity object **and** the matching STAR
NPC holon in the same turn — the NPC's identity lives in OASIS (portable, cross-game); the
game object lives in Unity (engine-native).

### 2.5.1 Second MCP server in `MCPServerManager`

**File:** `src/main/services/MCPServerManager.ts`

`MCPServerManager` already supports multiple servers via `this.servers: Map<string, MCPServerConnection>`.
Add a new method alongside `startOASISMCP()`:

```typescript
/**
 * Connect to a locally running unity-mcp HTTP transport.
 * Requires the developer to have installed unity-mcp in their Unity project.
 * Default port matches IvanMurzak/Unity-MCP default (8090).
 */
async startUnityMCP(port: number = 8090): Promise<void> {
  try {
    const { StreamableHTTPClientTransport } = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp.js'
    );
    const client = new Client({ name: 'oasis-ide-unity', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${port}/mcp`)
    );
    await client.connect(transport);
    const listResult = await client.listTools();
    this.servers.set('unity', {
      client,
      transport,
      status: 'running',
      tools: listResult.tools || []
    });
    console.log(`[MCP] Unity MCP connected on port ${port} with ${listResult.tools?.length ?? 0} tools`);
  } catch (err) {
    console.warn('[MCP] Unity MCP not available (is Unity open with unity-mcp installed?):', err);
    // Non-fatal: IDE works without Unity MCP
  }
}

async isUnityMCPRunning(): Promise<boolean> {
  const conn = this.servers.get('unity');
  return conn?.status === 'running';
}
```

Add a new IPC handler in `main/index.ts`:

```typescript
ipcMain.handle('unity:connect', async (_e, port?: number) => {
  try {
    await mcpManager.startUnityMCP(port ?? 8090);
    const tools = await mcpManager.listTools('unity').catch(() => []);
    return { ok: true, toolCount: tools.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

ipcMain.handle('unity:status', async () => {
  return { connected: await mcpManager.isUnityMCPRunning() };
});
```

### 2.5.2 Unity tool names in `agentMcpAllowlist`

**File:** `src/main/services/agentMcpAllowlist.ts`

Add a second set alongside the `oasis_*` / `star_*` block:

```typescript
// --- Unity Editor (via unity-mcp local server) ---
'unity_create_gameobject',
'unity_update_gameobject',
'unity_delete_gameobject',
'unity_attach_script',
'unity_get_scene',
'unity_list_gameobjects',
'unity_run_tests',
'unity_get_console_logs',
'unity_manage_asset',
'unity_execute_menu_item',
```

Names follow the `CoplayDev/unity-mcp` schema. If the installed package uses different names,
they can be aliased in the `AgentToolExecutor.mcpInvoke` path or normalised in a thin wrapper.

### 2.5.3 Update `AgentToolExecutor.mcpInvoke` for multi-server routing

**File:** `src/main/services/AgentToolExecutor.ts`

Currently `mcp_invoke` forwards all calls to `deps.mcpExecuteTool` which routes to
`oasis-unified`. For Unity tools, route to the `unity` server instead:

```typescript
private async mcpInvoke(
  toolCallId: string,
  args: Record<string, unknown>
): Promise<AgentToolExecutionResult> {
  const tool = typeof args.tool === 'string' ? args.tool.trim() : '';
  // ... existing validation ...

  // Route to correct MCP server based on tool name prefix
  const serverKey = tool.startsWith('unity_') ? 'unity' : 'oasis-unified';
  const fn = serverKey === 'unity'
    ? this.deps.mcpExecuteUnityTool
    : this.deps.mcpExecuteTool;

  if (!fn) {
    return {
      toolCallId,
      content: serverKey === 'unity'
        ? 'Unity MCP not connected. Open Unity with the unity-mcp package installed, then click "Connect Unity" in the IDE status bar.'
        : 'MCP is not wired in this build.',
      isError: true
    };
  }
  // ... rest unchanged ...
}
```

Add `mcpExecuteUnityTool` to `AgentToolExecutorDeps`:

```typescript
export interface AgentToolExecutorDeps {
  mcpExecuteTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  mcpExecuteUnityTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}
```

Wire the new dependency in `main/index.ts` where `AgentToolExecutor` is constructed:

```typescript
agentToolExecutor = new AgentToolExecutor(fileSystemService, {
  mcpExecuteTool: (name, args) => mcpManager.executeTool(name, args),
  mcpExecuteUnityTool: (name, args) => mcpManager.executeTool(name, args, 'unity'),
});
```

Update `MCPServerManager.executeTool` to accept an optional `serverName` parameter:

```typescript
async executeTool(toolName: string, args: any, serverName: string = 'oasis-unified'): Promise<any>
```

### 2.5.4 "Connect Unity" button in status bar

**File:** `src/renderer/components/Layout/StatusBar.tsx`

Add a small indicator in the status bar:

```tsx
const [unityConnected, setUnityConnected] = useState(false);

// Poll status on mount
useEffect(() => {
  const check = async () => {
    const result = await window.electronAPI.unityStatus?.();
    setUnityConnected(result?.connected ?? false);
  };
  check();
  const interval = setInterval(check, 10_000);
  return () => clearInterval(interval);
}, []);

// In render:
{window.electronAPI.unityConnect && (
  <button
    className={`status-bar-unity-btn${unityConnected ? ' is-connected' : ''}`}
    title={unityConnected ? 'Unity MCP connected' : 'Click to connect Unity Editor'}
    onClick={async () => {
      const result = await window.electronAPI.unityConnect();
      setUnityConnected(result.ok);
    }}
  >
    {unityConnected ? 'Unity ✓' : 'Connect Unity'}
  </button>
)}
```

Add `unityConnect` and `unityStatus` to `window.electronAPI` in `preload.ts`.

### 2.5.5 Unity context in game dev system prompt

**File:** `src/renderer/constants/gameDevPrompt.ts`

```typescript
export const UNITY_CONTEXT = `
## Unity Editor via MCP

When Unity is connected (status bar shows "Unity ✓"), you can control the Unity Editor
directly using unity_* tools via mcp_invoke.

Key tools:
  unity_create_gameobject  — { name, position, rotation, scale, parentName? }
  unity_attach_script      — { gameObjectName, scriptContent, scriptName }
  unity_run_tests          — { testFilter? } → returns pass/fail + Console output
  unity_get_console_logs   — { logType?: 'error'|'warning'|'log' }
  unity_manage_asset       — { action: 'import'|'delete'|'move', assetPath, ... }

Cross-engine NPC pattern:
  When creating an NPC in Unity, always also run:
    mcp_invoke star_create_npc { name, faction, role }  ← OASIS STAR holon
    mcp_invoke elevenlabs_create_agent { ... }           ← voice agent
  Store the returned holon ID in the Unity script as a string field so the
  game can query OASIS for quest state and inventory at runtime.

Genies avatars in Unity:
  Use NativeGenie component to load a Genies avatar for the NPC.
  Map the OASIS Avatar ID to the Genie Avatar ID in the NPC holon.
`.trim();
```

### 2.5.6 End-to-end scenario: Unity NPC with OASIS identity

When Game Dev Mode is active and Unity is connected, the agent can execute this entire
sequence in a single turn:

```
Developer: "Add a gang enforcer NPC called Viper to the current Unity scene.
            Give him a menacing voice. Link him to the active quest."

Agent:
  1. mcp_invoke unity_create_gameobject { name: "Viper", position: [5, 0, 3] }
  2. mcp_invoke star_create_npc { name: "Viper", faction: "gang", role: "enforcer" }
     → returns holon_id: "npc-viper-abc123"
  3. mcp_invoke elevenlabs_list_voices → selects deep male voice
  4. mcp_invoke elevenlabs_create_agent { name: "Viper", systemPrompt: "...", voiceId: "..." }
     → returns agent_id: "el-agent-xyz"
  5. mcp_invoke unity_attach_script {
       gameObjectName: "Viper",
       scriptName: "ViperNPC",
       scriptContent: "public class ViperNPC : MonoBehaviour { public string oasisHolonId = \"npc-viper-abc123\"; ... }"
     }
  6. write_file npcs/viper.json { holonId, agentId, voiceId, questId }
  7. mcp_invoke unity_run_tests → verifies scene compiles without errors
```

One conversation. NPC exists in Unity, in OASIS STAR, with a voice — cross-game persistent.

### 2.5.7 Files changed

| New files | Modified files |
|-----------|---------------|
| none | `MCPServerManager.ts` (+`startUnityMCP`, `isUnityMCPRunning`, multi-server `executeTool`) |
| none | `AgentToolExecutor.ts` (+`mcpExecuteUnityTool` dep, routing in `mcpInvoke`) |
| none | `agentMcpAllowlist.ts` (+`unity_*` names) |
| none | `preload.ts` (+`unityConnect`, `unityStatus`) |
| none | `main/index.ts` (+IPC handlers, updated executor construction) |
| none | `StatusBar.tsx` (+Connect Unity indicator) |
| none | `gameDevPrompt.ts` (+`UNITY_CONTEXT`) |

**Effort estimate:** 2 days

**Prerequisite for developer:** Install `com.ivanmurzak.unity-mcp` or `com.coplaydev.unity-mcp`
in their Unity project via OpenUPM or Git URL. The IDE provides setup instructions in the
status bar tooltip when Unity is not detected.

---

<a name="phase-3"></a>
## Phase 3 — Lore and Dialogue Generator

**Scope:** Renderer-only panel with write_file integration. No new IPC required.

### 3.1 New panel

**File:** `src/renderer/components/Lore/LoreStudioPanel.tsx` (new)

This panel is a structured form that feeds AI generation. It deliberately avoids being a
freeform chat — it gives users concrete fields so the output is deterministic and reusable.

Sections:

#### Section A: World Builder
- World name (text input)
- Setting (dropdown: cyberpunk city / fantasy kingdom / sci-fi colony / modern crime / post-apocalyptic / custom)
- Tone (dropdown: gritty / comedic / epic / horror / neutral)
- Factions: repeating row of `{name, alignment, territory}`, add/remove buttons
- Key locations: repeating row of `{name, description}`
- Generate button → calls `chatComplete` with a structured prompt → streams output into preview pane → "Save to lore/lore-bible.md" button calls `writeFile`

#### Section B: NPC Roster
- Repeating form rows: `{name, faction, role, traits (comma-separated), voiceStyle}`
- "Generate Backstory" per NPC row → generates a 2-paragraph backstory
- "Generate Dialogue Tree" per NPC row → generates a `DialogueNode[]` JSON structure

**DialogueNode schema** (written to `npcs/<name>-dialogue.json`):
```typescript
interface DialogueNode {
  id: string;
  npcLine: string;
  playerOptions: Array<{
    text: string;
    nextNodeId: string | null;
    questTrigger?: string;      // quest id to start/advance
    karmaChange?: number;
  }>;
}
```

#### Section C: Quest Arc Designer
- Arc name (text), faction (dropdown from Factions above)
- Number of missions: 3 / 5 / 7
- Protagonist name, antagonist name
- Final reward description
- "Generate Arc" button → calls `chatComplete` to expand into full mission summaries
- "Create in STAR" button → for each mission, calls `run_star_cli` via the agent loop:
  ```
  star -n quest create --name "<mission name>" --description "<summary>" ...
  ```
  Returns a table of quest IDs. Saves to `quests/<arc-name>.json`.

### 3.2 Wire into tab system

Add "Lore Studio" as a tab inside the bottom panel or as a sidebar tab. The exact placement
depends on screen real estate preference — bottom panel (`BottomPanel.tsx`) is suggested as it
gives full-width for the form without crowding the right column.

**File:** `src/renderer/components/BottomPanel/BottomPanel.tsx`

The bottom panel already hosts the terminal. Add a `Lore` tab alongside `Terminal`:

```tsx
type BottomTab = 'terminal' | 'lore';
```

---

<a name="phase-4"></a>
## Phase 4 — Genies Avatar Studio Panel

**Scope:** Iframe embed panel + OASIS holon link.

**Background:** Ready Player Me was sunset January 31, 2026. Genies is the current Unity/VR
SDK-verified alternative. They provide an iframe-based avatar creator that can be embedded
directly.

### 4.1 IPC channel for avatar export

**File:** `src/main/preload.ts` — add:

```typescript
geniesGetAvatarUrl: () => Promise<string>;
```

**File:** `src/main/index.ts` — handler:

```typescript
ipcMain.handle('genies:get-avatar-url', async () => {
  const clientId = process.env.GENIES_CLIENT_ID?.trim();
  if (!clientId) {
    return 'https://genies.com/creator'; // public fallback
  }
  return `https://genies.com/creator?client_id=${clientId}`;
});
```

### 4.2 New panel

**File:** `src/renderer/components/Avatar/AvatarStudioPanel.tsx` (new)

```tsx
export const AvatarStudioPanel: React.FC = () => {
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [exportedGlbUrl, setExportedGlbUrl] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.geniesGetAvatarUrl().then(setAvatarUrl);
  }, []);

  // Listen for postMessage from iframe on avatar creation completion
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'genies:avatar-created') {
        setExportedGlbUrl(e.data.glbUrl);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div className="avatar-studio-panel">
      <div className="avatar-studio-panel__header">
        <h3>Avatar Studio</h3>
        {exportedGlbUrl && (
          <button onClick={() => handleImportToOasis(exportedGlbUrl)}>
            Import to OASIS
          </button>
        )}
      </div>
      {avatarUrl ? (
        <iframe
          src={avatarUrl}
          className="avatar-studio-panel__frame"
          allow="camera; microphone"
          title="Genies Avatar Creator"
        />
      ) : (
        <div className="avatar-studio-panel__loading">Loading avatar creator...</div>
      )}
    </div>
  );
};
```

`handleImportToOasis` injects a prompt into the chat: "Import this avatar GLB to OASIS:
`{exportedGlbUrl}` — create an OASIS avatar holon with it and save the holon ID."
The agent then uses `oasis_save_holon` via `mcp_invoke`.

### 4.3 Wire into `RightPanelShell`

Add "Avatar" as a tab in the right panel shell alongside Agents and OASIS Tools.

---

<a name="phase-5"></a>
## Phase 5 — Metaverse Starter Templates

**Scope:** Template system in main process + renderer template picker UI.

### 5.1 Template format

**File:** `src/main/templates/metaverse/` (new directory)

Each template is a directory with:
- `template.json` — metadata + file list
- `files/` — the actual files, with `{{VARIABLE}}` placeholders

Template manifest schema:

```typescript
interface MetaverseTemplate {
  id: string;
  name: string;
  description: string;
  category: 'rp-server' | 'quest-chain' | 'npc-pack' | 'item-drop' | 'content-creator';
  variables: Array<{ key: string; prompt: string; default?: string }>;
  files: Array<{ src: string; dest: string }>;
  postInstallPrompt: string;
}
```

### 5.2 Five templates

#### Template 1: GTA-style RP Server (`rp-server`)
Variables: `WORLD_NAME`, `CITY_NAME`, `NUM_FACTIONS`, `MONTHLY_PRICE`

Files created in workspace:
```
lore/lore-bible.md          → placeholder with {{WORLD_NAME}} etc.
lore/factions.json          → empty faction array
quests/arc-01.json          → empty quest chain
npcs/roster.json            → empty NPC list
scripts/server-config.json  → RP server settings (max players, access price)
README.md                   → "Getting started with {{WORLD_NAME}}"
```

Post-install prompt: "My RP server world is called {{WORLD_NAME}} set in {{CITY_NAME}}.
Generate a lore bible, 3 faction summaries, and a starter quest arc using the Lore Studio."

#### Template 2: Quest Chain (`quest-chain`)
Variables: `CHAIN_NAME`, `GAME_SOURCE`, `NUM_QUESTS`

Files:
```
quests/{{CHAIN_NAME}}/overview.md
quests/{{CHAIN_NAME}}/objectives.json
```

Post-install prompt: "Create a {{NUM_QUESTS}}-quest chain called {{CHAIN_NAME}} in the STAR
system for {{GAME_SOURCE}}."

#### Template 3: NPC Pack (`npc-pack`)
Variables: `PACK_NAME`, `NUM_NPCS`, `FACTION`

Files:
```
npcs/{{PACK_NAME}}/roster.json      → empty array
npcs/{{PACK_NAME}}/voices.json      → empty voice assignments
```

Post-install prompt: "Generate {{NUM_NPCS}} diverse NPC characters for the {{FACTION}} faction.
For each NPC: name, role, personality, and create an ElevenLabs voice agent."

#### Template 4: Cross-game Item Drop (`item-drop`)
Variables: `ITEM_NAME`, `ITEM_RARITY`, `GAME_SOURCE`

Files:
```
items/{{ITEM_NAME}}.json            → item schema
scripts/drop-table.json             → drop probability config
```

Post-install prompt: "Mint a {{ITEM_RARITY}} rarity item called {{ITEM_NAME}} as an NFT for
{{GAME_SOURCE}}. Set up the drop table."

#### Template 5: Content Creator Kit (`content-creator`)
Variables: `GAME_NAME`, `CREATOR_NICHE`

Files:
```
content/video-scripts/template.md
content/thumbnail-brief.md
content/posting-schedule.md
```

Post-install prompt: "Help me build a content strategy for {{GAME_NAME}} focused on
{{CREATOR_NICHE}}. Generate 10 video script outlines and a 30-day posting schedule."

### 5.3 New IPC channels

**File:** `src/main/preload.ts`:
```typescript
listMetaverseTemplates: () => Promise<MetaverseTemplate[]>;
applyMetaverseTemplate: (templateId: string, variables: Record<string, string>) =>
  Promise<{ ok: boolean; filesCreated: string[]; error?: string }>;
```

**File:** `src/main/index.ts`:

```typescript
ipcMain.handle('templates:list-metaverse', async () => {
  // Read template.json from each subdirectory of dist/main/templates/metaverse/
  // Return array of MetaverseTemplate metadata (without files content)
});

ipcMain.handle('templates:apply-metaverse', async (_e, templateId, variables) => {
  // Load the template, substitute variables, write files to workspace
  // Return { ok, filesCreated }
});
```

### 5.4 Template picker UI

**File:** `src/renderer/components/Templates/MetaverseTemplatePanel.tsx` (new)

A card grid of the 5 templates. Clicking a card opens a small variable-input modal.
After filling variables, clicking "Apply Template" calls `applyMetaverseTemplate`, then
injects the `postInstallPrompt` (with variables substituted) into the chat in game mode.

Wire into the IDE as a panel accessible from:
- The "Welcome" screen when no workspace is open
- A "New from Template" button in the file explorer header

---

<a name="phase-55"></a>
## Phase 5.5 — Roblox Template

**Scope:** A Roblox Lua starter template + agent context for the Roblox Studio ecosystem.
No MCP bridge (Roblox Studio is a proprietary closed editor). OASIS integrates via direct
HTTP REST calls from Lua scripts to the OASIS API.

### Background

Roblox has 120M+ monthly active users and a developer economy built on Lua scripting inside
the proprietary Roblox Studio desktop app. While an MCP bridge is not feasible (Studio does
not expose an MCP surface), Roblox games can call external HTTP endpoints — meaning a Roblox
game can query OASIS for quest state, avatar inventory, and karma directly from a Lua script
at runtime.

This makes OASIS the cross-platform identity and quest layer that sits above Roblox, rather
than inside it. A player's OASIS Avatar connects to their Roblox character; quest progress
and inventory sync via the OASIS WEB4 REST API.

### 5.5.1 New starter template

**File:** `src/main/templates/metaverse/roblox/`

Files:
```
src/ServerScriptService/OASISBridge.server.lua   → OASIS REST client (quest/avatar calls)
src/ServerScriptService/QuestManager.server.lua  → quest start/complete wiring
src/ReplicatedStorage/OASISConfig.lua            → OASIS_API_URL, player avatar ID mapping
src/StarterPlayer/StarterCharacterScripts/HUD.client.lua → quest HUD display
quests/                                          → quest JSON authored in OASIS IDE
npcs/                                            → NPC dialogue authored in OASIS IDE
lore/                                            → lore bible
README.md                                        → "How to install: copy src/ into Roblox Studio"
.star-workspace.json                             → { "projectType": "metaverse-rp-server", "gameEngine": "roblox" }
```

### 5.5.2 OASIS Lua client template

The core `OASISBridge.server.lua` exposes simple wrappers over OASIS REST:

```lua
-- OASISBridge.server.lua
local HttpService = game:GetService("HttpService")
local OASISConfig = require(game.ReplicatedStorage.OASISConfig)

local OASISBridge = {}

function OASISBridge.getQuestProgress(avatarId, questId)
  local url = OASISConfig.API_URL .. "/api/quests/" .. questId .. "/progress?avatarId=" .. avatarId
  local response = HttpService:GetAsync(url, true, {
    ["Authorization"] = "Bearer " .. OASISConfig.JWT_TOKEN
  })
  return HttpService:JSONDecode(response)
end

function OASISBridge.completeObjective(avatarId, questId, objectiveId)
  local body = HttpService:JSONEncode({ avatarId = avatarId, objectiveId = objectiveId })
  HttpService:PostAsync(
    OASISConfig.API_URL .. "/api/quests/" .. questId .. "/objectives/" .. objectiveId .. "/complete",
    body, Enum.HttpContentType.ApplicationJson, false,
    { ["Authorization"] = "Bearer " .. OASISConfig.JWT_TOKEN }
  )
end

function OASISBridge.getInventory(avatarId)
  local url = OASISConfig.API_URL .. "/api/avatar/" .. avatarId .. "/inventory"
  local response = HttpService:GetAsync(url, true)
  return HttpService:JSONDecode(response)
end

return OASISBridge
```

### 5.5.3 Agent context for Roblox

**File:** `src/renderer/constants/gameDevPrompt.ts`

```typescript
export const ROBLOX_CONTEXT = `
## Roblox Studio + OASIS Integration

Roblox games call OASIS via HTTP from ServerScriptService scripts (HttpService).
The OASIS bridge is at src/ServerScriptService/OASISBridge.server.lua.

Key pattern:
  local OASISBridge = require(game.ServerScriptService.OASISBridge)
  local progress = OASISBridge.getQuestProgress(player.UserId, questId)

Quest workflow:
  1. Author quests in OASIS IDE using STAR CLI or mcp_invoke star_create_quest
  2. Save quest IDs to quests/<name>.json
  3. In Roblox, load quest IDs from a RemoteEvent and call OASISBridge.getQuestProgress

NPC dialogue:
  Write NPC dialogue trees to npcs/<name>-dialogue.json in OASIS IDE.
  In Roblox, load dialogue via HttpService and display using a ScreenGui.

IMPORTANT: Roblox requires HttpService to be enabled in Game Settings > Security.
IMPORTANT: Use OASIS server-side JWT; never expose API keys in client scripts.
`.trim();
```

### 5.5.4 Files changed

| New files | Modified files |
|-----------|---------------|
| `src/main/templates/metaverse/roblox/*` | `gameDevPrompt.ts` (+`ROBLOX_CONTEXT`) |
| | `agentContextPack.ts` (Roblox branch in engine detection) |

**Effort estimate:** 1 day

---

<a name="phase-6"></a>
## Phase 6 — `.star-workspace.json` Manifest

**Scope:** Main process reads manifest on workspace open; renderer surfaces project state.

### 6.1 Schema

**File:** `src/shared/starWorkspaceTypes.ts` (new)

```typescript
export interface StarWorkspaceConfig {
  projectType: 'metaverse-rp-server' | 'quest-chain' | 'npc-pack' | 'item-drop' | 'generic';
  gameEngine?: 'unity' | 'unreal' | 'godot' | 'custom';
  gameSource?: string;                // e.g. "OurWorld", "ODOOM", "OQuake"
  starApiUrl?: string;                // override STAR_API_URL for this project
  npcRoster?: string[];               // NPC names (loads npcs/<name>.json on open)
  activeQuestChain?: string;          // loads quests/<name>.json context
  defaultComposerMode?: 'chat' | 'agent' | 'game';
  elevenLabsProjectId?: string;       // optional ElevenLabs project scoping
  geniesProjectId?: string;           // optional Genies project scoping
}
```

### 6.2 Read manifest on workspace open

**File:** `src/main/services/FileSystemService.ts`

When `setWorkspacePath(p)` is called (on workspace open), check for `.star-workspace.json`:

```typescript
async readStarWorkspaceConfig(): Promise<StarWorkspaceConfig | null> {
  const wp = this.getWorkspacePath();
  if (!wp) return null;
  try {
    const raw = await fs.readFile(path.join(wp, '.star-workspace.json'), 'utf-8');
    return JSON.parse(raw) as StarWorkspaceConfig;
  } catch {
    return null;
  }
}
```

### 6.3 IPC: surface config to renderer

**File:** `src/main/preload.ts`:
```typescript
getStarWorkspaceConfig: () => Promise<StarWorkspaceConfig | null>;
```

**File:** `src/main/index.ts`:
```typescript
ipcMain.handle('workspace:get-star-config', async () => {
  return fileSystemService.readStarWorkspaceConfig();
});
```

### 6.4 Use in renderer

**File:** `src/renderer/contexts/WorkspaceContext.tsx`

On workspace path change, call `getStarWorkspaceConfig()` and store in context:

```typescript
interface WorkspaceContextValue {
  // ...existing...
  starConfig: StarWorkspaceConfig | null;
}
```

Then in `ComposerSessionPanel.tsx`: if `starConfig?.defaultComposerMode === 'game'`,
auto-set `composerMode` to `'game'` on session creation.

And in `MCPServerManager.ts`: if `starConfig?.starApiUrl`, use it to override `STAR_API_URL`
in the child env via a new `setProjectStarApiUrl(url)` method (call after workspace open).

---

<a name="testing"></a>
## Testing and QA Checklist

### Phase 0
- [ ] Set `ELEVENLABS_API_KEY=test_key` before starting IDE; open DevTools in main process; confirm the MCP child env contains it
- [ ] Call `mcp_invoke` with `star_create_npc` from agent loop; verify it either succeeds or returns "not yet implemented" (not an allowlist rejection)
- [ ] Agent loop calls `write_file`; confirm file appears in workspace

### Phase 1
- [ ] "Game" button appears in mode selector
- [ ] Switching to Game mode injects GAME_DEV_SYSTEM_PROMPT into context pack (check via DevTools or agent debug log)
- [ ] Each palette button populates the text area with the expected prompt (does not auto-send)
- [ ] Game mode forces agent loop (not chat-only path)
- [ ] `localStorage['oasis-ide-composer-mode']` persists `'game'` across reload

### Phase 2
- [ ] With `ELEVENLABS_API_KEY` set: Voice panel loads and lists voices
- [ ] Play button produces audible output
- [ ] "Create NPC Voice Agent" form: submitting creates an ElevenLabs conversational agent; `agent_id` returned and stored
- [ ] Agent loop: `mcp_invoke` with `elevenlabs_create_agent` succeeds end-to-end
- [ ] Without `ELEVENLABS_API_KEY`: banner shown, no crash

### Phase 3
- [ ] Lore Studio tab appears in bottom panel
- [ ] "Generate Lore Bible" writes `lore/lore-bible.md` to workspace
- [ ] Dialogue tree JSON is valid `DialogueNode[]` schema
- [ ] "Create in STAR" button fires `run_star_cli` for each mission; quest IDs returned

### Phase 4
- [ ] Genies iframe loads with public fallback URL when `GENIES_CLIENT_ID` not set
- [ ] `window.postMessage({ type: 'genies:avatar-created', glbUrl: '...' })` triggers "Import to OASIS" button appearing
- [ ] Import injects correct chat prompt

### Phase 5
- [ ] Template picker shows 5 cards
- [ ] Applying "GTA-style RP Server" template creates expected files in workspace
- [ ] Post-install prompt is injected into game mode chat with variables substituted
- [ ] Template files survive workspace close/reopen

### Phase 6
- [ ] Workspace with `.star-workspace.json` containing `defaultComposerMode: 'game'` auto-activates game mode
- [ ] `starApiUrl` override is passed to MCP child env
- [ ] Missing / malformed `.star-workspace.json` does not crash workspace open

---

<a name="dependencies"></a>
## Dependency Map

### New npm packages required

| Package | Used for | Install |
|---------|----------|---------|
| none | ElevenLabs HTTP API called directly via `fetch` | — |
| none | Genies via iframe postMessage | — |

No new packages needed for MVP. The ElevenLabs TypeScript SDK (`elevenlabs`) can be added
later if the direct REST calls become unwieldy, but fetch is sufficient for Phase 2.

### Feature dependency order

```
Phase 0 (env + allowlist + write_file)
   └── Phase 1 (game mode — uses write_file + context pack)
   └── Phase 1.5 (browser worlds — uses write_file + run_workspace_command + static preview)
   └── Phase 2 (voice — uses ElevenLabs env + allowlist)
   └── Phase 2.5 (Unity MCP — uses allowlist + multi-server MCPServerManager)
   └── Phase 3 (lore — uses write_file + chatComplete)
Phase 1 (game mode)
   └── Phase 1.5 (engine context detection uses game mode context pack)
   └── Phase 2.5 (Unity context injected in game mode system prompt)
   └── Phase 3 (lore studio — shown in game mode bottom panel)
   └── Phase 5 (templates — injects into game mode chat)
   └── Phase 5.5 (Roblox template — injects into game mode chat)
Phase 6 (manifest — workspace-level config)
   └── Enhances Phase 1 (auto game mode)
   └── Enhances Phase 1.5 (engine detection via gameEngine field)
   └── Enhances Phase 2 (project-scoped ElevenLabs)
   └── Enhances Phase 2.5 (Unity MCP port override)
Phase 4 (avatar — standalone, only needs Phase 0 for MCP save)
Phase 5 (templates — needs Phase 3 to be maximally useful but can ship standalone)
Phase 5.5 (Roblox — standalone template, no MCP dependency)
```

### Files changed per phase summary

| Phase | New files | Modified files |
|-------|-----------|---------------|
| 0 | `src/shared/elevenLabsTypes.ts` | `MCPServerManager.ts`, `agentMcpAllowlist.ts`, `AgentToolExecutor.ts`, `agentContextPack.ts` |
| 1 | `src/renderer/constants/gameDevPrompt.ts`, `src/renderer/components/Chat/GameToolPalette.tsx` | `ideChatModels.ts`, `ComposerSessionPanel.tsx`, `ChatInterface.css`, `agentContextPack.ts` |
| 1.5 | `src/main/templates/metaverse/hyperfy-world/*`, `src/main/templates/metaverse/threejs-world/*`, `src/main/templates/metaverse/babylonjs-world/*` | `gameDevPrompt.ts`, `agentContextPack.ts`, `starWorkspaceTypes.ts` |
| 2 | `src/renderer/components/NPC/NPCVoicePanel.tsx`, `MCP/src/tools/elevenlabs.ts` | `preload.ts`, `main/index.ts`, `RightPanelShell.tsx` |
| 2.5 | none | `MCPServerManager.ts`, `AgentToolExecutor.ts`, `agentMcpAllowlist.ts`, `preload.ts`, `main/index.ts`, `StatusBar.tsx`, `gameDevPrompt.ts` |
| 3 | `src/renderer/components/Lore/LoreStudioPanel.tsx` | `BottomPanel.tsx` |
| 4 | `src/renderer/components/Avatar/AvatarStudioPanel.tsx` | `preload.ts`, `main/index.ts`, `RightPanelShell.tsx` |
| 5 | `src/main/templates/metaverse/rp-server/*` etc., `src/renderer/components/Templates/MetaverseTemplatePanel.tsx` | `preload.ts`, `main/index.ts`, `FileExplorer.tsx` |
| 5.5 | `src/main/templates/metaverse/roblox/*` | `gameDevPrompt.ts`, `agentContextPack.ts` |
| 6 | `src/shared/starWorkspaceTypes.ts` | `FileSystemService.ts`, `preload.ts`, `main/index.ts`, `WorkspaceContext.tsx`, `ComposerSessionPanel.tsx`, `MCPServerManager.ts` |

---

## Estimated effort

| Phase | Complexity | Estimate |
|-------|-----------|----------|
| 0 — Foundations | Low | 1 day |
| 1 — Game Dev Mode | Medium | 2 days |
| 1.5 — Browser World Engines (Hyperfy / Three.js / Babylon.js) | Low-Medium | 2 days |
| 2 — ElevenLabs Voice | Medium-High | 3 days |
| 2.5 — Unity MCP Bridge | Medium | 2 days |
| 3 — Lore Studio | Medium | 2 days |
| 4 — Avatar Studio | Low-Medium | 1 day |
| 5 — Metaverse Starter Templates | Medium | 2 days |
| 5.5 — Roblox Template | Low | 1 day |
| 6 — Manifest | Low | 1 day |
| **Total** | | **~17 days** |

**MVP sprint (6 days):** Phase 0 + Phase 1 + Phase 2 — game mode, voice NPCs, ship before
GTA 6 console launch (November 6, 2026).

**Extended sprint (10 days):** Add Phase 1.5 + Phase 2.5 — browser world templates and Unity
MCP bridge. Unlocks Hyperfy world building and Unity game dev in the same IDE, same agent loop,
same OASIS identity layer.

**Full build (17 days):** All phases. Every major metaverse game dev workflow — browser native,
Unity, Roblox — covered from a single IDE, with OASIS as the cross-game identity and publishing
backbone.

---

<a name="hyperfy-analysis"></a>
## Appendix: Hyperfy — Competitor, Target, or Foundation?

This section documents the competitive analysis of Hyperfy relative to OASIS IDE, and the
strategic options available as OASIS grows into the world-building layer.

### What Hyperfy actually is

Hyperfy is an open-source (GPL-3.0) browser metaverse **world destination platform** — not a
developer tool. The distinction is fundamental:

- Hyperfy is where players **go** — visit worlds in a browser, walk around, interact with objects and NPCs
- OASIS IDE is where developers **build** — write code, create quests, configure NPCs, publish assets

There is no product overlap. The gap between them is precisely where OASIS IDE sits.

### Does Hyperfy have a vibe coding tool?

No. Their developer workflow is: `npx hyperfy create`, write JavaScript in VS Code or Cursor,
save, hot-reload in browser. They provide zero AI code generation. You need an external IDE to
write their app code.

| Feature | Hyperfy | OASIS IDE |
|---------|---------|-----------|
| In-world drag-and-drop editor | Yes (Tab key) | No (not the use case) |
| JavaScript app framework | Yes (`apps/<slug>/index.js`) | Via agent + `write_file` |
| AI code generation | **No** | Yes — core feature |
| Quest / NPC authoring tools | **No** | Yes — STAR + NPC Voice Studio |
| In-IDE AI chat / agent loop | **No** | Yes |
| ELIZA agent integration | Partial (agents run in-world; you write code manually) | Via ElevenLabs + STAR NPC holons |
| STARNET publishing | **No** | Yes — native |
| Cross-game avatar identity | **No** | Yes — OASIS Avatar (WEB4) |

The ELIZA integration is often cited as an AI feature but is misunderstood: an ELIZA-based agent
character can *exist inside* a Hyperfy world, but creating it requires manually writing ELIZA
config and Hyperfy app code. There is no guided tooling. OASIS IDE's NPC Voice Studio is what
actually does that job.

### Grounding facts on Hyperfy's size and trajectory

| Fact | Detail |
|------|--------|
| Team | One founder ("Ash"). Self-funded. No VC. Described as a passion project. |
| Token (HYPER) | Launched Jan 2025 at $280M market cap (speculation). Current market cap: ~$133K–$212K. ~99.9% decline from peak. |
| License | GPL-3.0 — forkable, but derivative works must also be GPL-3 |
| Architecture | Three.js + PhysX + WebXR + VRM + SQLite + Node.js |
| Coding tools | None |

The token collapse means Hyperfy has no treasury to fund engineering at scale. The project
survives on open-source community contributions, not revenue or investment.

### How hard would it be to replicate Hyperfy's features?

If OASIS ever wanted to own the world layer — not just the IDE layer:

| Component | Effort |
|-----------|--------|
| Three.js scene + PhysX physics | 2–3 weeks |
| WebXR support | 1 week (browser native) |
| VRM avatar loading (`@pixiv/three-vrm`) | 1 week |
| Real-time multiplayer (Socket.io / Partykit) | 2–3 weeks |
| In-world drag-and-drop editor | 4–6 weeks (most custom part) |
| Self-hosting (Node.js + SQLite) | 1 week |
| NFT world ownership (ERC-721 + OASIS GeoNFT) | 1–2 weeks (GeoNFT already exists) |
| OASIS-native additions (STAR quests, holons, STARNET publish) | 2–4 weeks (already built, just wiring) |
| **Total MVP world layer** | **~12–16 weeks, team of 2–3** |

Under GPL-3, the Hyperfy codebase can also be forked directly and modified — as long as
modifications are released under the same licence. For an open-source OASIS world layer,
this is a viable path that compresses the estimate significantly.

### Three strategic options

**Option A — Integrate (recommended now)**

Treat Hyperfy as a target platform. OASIS IDE becomes the best tool for building Hyperfy
worlds. The "New Hyperfy World" template (Phase 1.5) covers this. No competition, pure
value-add. Developers who build on Hyperfy use OASIS IDE; their OASIS Avatars and STAR quests
become the identity and quest layer running above Hyperfy worlds.

**Option B — Fork and extend (medium term, 3–4 months)**

Fork Hyperfy under GPL-3, remove the HYPER token dependency, replace it with OASIS Avatar
holons and STARNET world publishing. The result is an "OASIS World" layer: a browser metaverse
platform where every world is a holon, every avatar is an OASIS Avatar, every NPC has a STAR
identity, and every world is published to STARNET. One founder team produced the original in
roughly 2 years of evenings; a focused 2–3 person OASIS team with the existing STAR/STARNET
infrastructure could fork and extend it to a releasable state in 3–4 months.

**Option C — Build from scratch on Babylon.js (longer term, 6–9 months)**

Use Babylon.js as the foundation (better built-in game engine features, Microsoft backing,
WebXR first-class, no GPL constraints) and build the OASIS World layer natively. More
architectural control and no licence restrictions on commercial distribution. The higher
effort is justified if OASIS wants to treat the world layer as a commercially licensed product
rather than open-source.

**Recommended path:** Start with Option A (Phase 1.5 already specifies this). Evaluate Option B
at the point where OASIS has 500+ active game dev subscribers — at that scale, owning the
world layer creates a compounding platform advantage that Phase 1.5 integration alone cannot
achieve.

### What actually threatens OASIS IDE in this space

Hyperfy is not a threat. The real competitive risks are well-funded incumbents that could add
developer tooling to their existing creator ecosystems:

| Risk | Player | Why it matters | OASIS defence |
|------|--------|---------------|---------------|
| AI world scripting inside Roblox Studio | Roblox ($2.5B revenue, 120M MAU) | Captures Roblox devs before they discover OASIS | Roblox template + OASIS as cross-platform identity layer above Roblox |
| AI code assistant inside Unreal / UEFN | Epic Games (Fortnite Creative, 30M+ creators) | Locks in the largest game-native creator cohort | Unity/Godot focus first; Unreal template when UEFN AI ships |
| Unity AI Gateway (official, planned 2026) | Unity (engine used by ~50% of mobile games) | Native Unity AI tool competes for Unity segment | Phase 2.5 Unity MCP Bridge ships before Gateway GA; OASIS cross-game identity is the differentiator Unity cannot offer |

None of these players are building the cross-game identity layer, the quest system, the NFT
primitives, or the STARNET publishing layer. Their tools are engine-specific. OASIS IDE's moat
— cross-engine, cross-game OASIS Avatar identity — survives even if Unity ships an AI
assistant, because Unity's AI assistant cannot give an NPC an identity that persists across
every game the player ever plays.
