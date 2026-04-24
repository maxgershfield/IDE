/**
 * Starter template file-trees for metaverse world projects.
 * Each template returns an array of { path, content } tuples that the
 * scaffold IPC handler writes relative to the chosen workspace root.
 */

export interface TemplateFile {
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function starWorkspaceJson(name: string, engine: string): string {
  return JSON.stringify(
    {
      name,
      gameEngine: engine,
      starnetNetwork: 'testnet',
      version: '1.0.0',
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Hyperfy
// ---------------------------------------------------------------------------

export function getHyperfyTemplate(projectName: string): TemplateFile[] {
  return [
    {
      path: '.star-workspace.json',
      content: starWorkspaceJson(projectName, 'hyperfy'),
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: projectName,
          version: '0.1.0',
          type: 'module',
          scripts: {
            dev: 'hyperfy dev --port 5174',
            build: 'hyperfy build',
            deploy: 'star publish --provider hyperfy',
          },
          dependencies: {
            hyperfy: 'latest',
          },
        },
        null,
        2
      ),
    },
    {
      path: 'world.js',
      content: `// ${projectName} — Hyperfy world entry point
// Docs: https://docs.hyperfy.io  |  OASIS: https://docs.oasisweb4.com

import { oasisHolon } from './lib/oasis.js';

export default function World({ world }) {
  // Spawn terrain
  world.add({
    type: 'mesh',
    geometry: 'plane',
    material: { color: '#2a7a3b' },
    position: [0, 0, 0],
    scale: [200, 1, 200],
    receiveShadow: true,
  });

  // Example NPC — replace with your own
  world.add({
    type: 'avatar',
    src: '/avatars/guide.vrm',
    position: [0, 0, -5],
    components: [
      {
        type: 'ai-agent',
        script: '/scripts/guide-agent.js',
        greeting: 'Welcome to ${projectName}! What quest shall we begin?',
      },
    ],
  });

  // Persist world state to OASIS holons
  world.on('playerJoin', async (player) => {
    await oasisHolon.load(player.id);
  });

  world.on('playerLeave', async (player) => {
    await oasisHolon.save(player.id, player.state);
  });
}
`,
    },
    {
      path: 'lib/oasis.js',
      content: `// Thin OASIS holon helper for Hyperfy worlds
const ONODE = import.meta.env.VITE_ONODE_URL ?? 'http://127.0.0.1:5003';

export const oasisHolon = {
  async load(playerId) {
    const res = await fetch(\`\${ONODE}/api/data/load-holon/\${playerId}\`);
    if (!res.ok) return null;
    return res.json();
  },
  async save(playerId, state) {
    const res = await fetch(\`\${ONODE}/api/data/save-holon\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holonId: playerId, ...state }),
    });
    if (!res.ok) throw new Error(\`Holon save failed: \${res.status}\`);
    return res.json();
  },
};
`,
    },
    {
      path: 'scripts/guide-agent.js',
      content: `// Guide NPC agent script (ELIZA hook)
// Replace greeting and topics with your own lore.
export default {
  greeting: 'Hello traveller — I am your guide.',
  topics: {
    quest: 'I know of three quests nearby. Which interests you?',
    lore: 'This land was forged by the OASIS Architects long before memory.',
    help: 'Ask me about quests, lore, or the map.',
  },
};
`,
    },
    {
      path: '.env.example',
      content: `VITE_ONODE_URL=http://127.0.0.1:5003
VITE_ELEVENLABS_AGENT_ID=
`,
    },
    {
      path: 'README.md',
      content: `# ${projectName}

Hyperfy world scaffolded by the **OASIS IDE**.

## Getting started

\`\`\`bash
npm install
npm run dev        # local dev server
npm run deploy     # publish to STARNET via star CLI
\`\`\`

## Key files

| File | Purpose |
|------|---------|
| \`world.js\` | World entry — add terrain, NPCs, events |
| \`lib/oasis.js\` | OASIS holon helper (player state persistence) |
| \`scripts/guide-agent.js\` | Starter NPC dialogue script |
| \`.star-workspace.json\` | Engine + OASIS project config |

## OASIS integration

- **Holons** — store player inventory, quest progress, stats cross-world.
- **GeoNFTs** — anchor in-world locations to real or map coordinates.
- **STARNET** — publish and monetise your world as an OAPP.
`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Three.js (Vite + R3F)
// ---------------------------------------------------------------------------

export function getThreejsTemplate(projectName: string): TemplateFile[] {
  return [
    {
      path: '.star-workspace.json',
      content: starWorkspaceJson(projectName, 'threejs'),
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: projectName,
          version: '0.1.0',
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
            deploy: 'star publish',
          },
          dependencies: {
            three: '^0.163.0',
            '@react-three/fiber': '^8.16.0',
            '@react-three/drei': '^9.105.0',
            '@pixiv/three-vrm': '^2.1.0',
            react: '^18.3.0',
            'react-dom': '^18.3.0',
          },
          devDependencies: {
            vite: '^5.2.0',
            '@vitejs/plugin-react': '^4.2.0',
          },
        },
        null,
        2
      ),
    },
    {
      path: 'vite.config.js',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
`,
    },
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <style>body { margin: 0; background: #000; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'src/main.jsx',
      content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { World } from './World.jsx';

createRoot(document.getElementById('root')).render(<World />);
`,
    },
    {
      path: 'src/World.jsx',
      content: `import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Stars, OrbitControls, Environment } from '@react-three/drei';
import { Terrain } from './components/Terrain.jsx';
import { GuideNPC } from './components/GuideNPC.jsx';

export function World() {
  return (
    <Canvas camera={{ position: [0, 5, 15], fov: 70 }} shadows>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
      <Sky sunPosition={[100, 20, 100]} />
      <Stars radius={200} depth={50} count={3000} />

      <Suspense fallback={null}>
        <Terrain />
        <GuideNPC position={[0, 0, -5]} />
      </Suspense>

      <OrbitControls />
      <Environment preset="sunset" />
    </Canvas>
  );
}
`,
    },
    {
      path: 'src/components/Terrain.jsx',
      content: `import React from 'react';

export function Terrain() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[200, 200, 32, 32]} />
      <meshStandardMaterial color="#3a7d44" />
    </mesh>
  );
}
`,
    },
    {
      path: 'src/components/GuideNPC.jsx',
      content: `import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

export function GuideNPC({ position }) {
  const ref = useRef();
  const [showDialogue, setShowDialogue] = useState(false);

  // Gentle idle bob
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.position.y = Math.sin(Date.now() * 0.001) * 0.05;
    }
  });

  return (
    <group position={position}>
      {/* Placeholder capsule — swap for a .vrm avatar via @pixiv/three-vrm */}
      <mesh ref={ref} castShadow onClick={() => setShowDialogue((v) => !v)}>
        <capsuleGeometry args={[0.4, 1.2, 8, 16]} />
        <meshStandardMaterial color="#6366f1" />
      </mesh>

      {showDialogue && (
        <Html center position={[0, 2, 0]}>
          <div style={{
            background: 'rgba(10,10,20,0.92)',
            border: '1px solid #6366f1',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#e2e8f0',
            fontSize: 13,
            maxWidth: 240,
            backdropFilter: 'blur(6px)',
          }}>
            Welcome to <strong style={{ color: '#a78bfa' }}>the world</strong>.
            Ask me about quests or lore.
          </div>
        </Html>
      )}
    </group>
  );
}
`,
    },
    {
      path: 'src/lib/oasis.js',
      content: `// OASIS holon helper for Three.js worlds
const ONODE = import.meta.env.VITE_ONODE_URL ?? 'http://127.0.0.1:5003';

export async function loadPlayerHolon(playerId) {
  const res = await fetch(\`\${ONODE}/api/data/load-holon/\${playerId}\`);
  if (!res.ok) return null;
  return res.json();
}

export async function savePlayerHolon(playerId, state) {
  const res = await fetch(\`\${ONODE}/api/data/save-holon\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holonId: playerId, ...state }),
  });
  if (!res.ok) throw new Error(\`Holon save failed: \${res.status}\`);
  return res.json();
}
`,
    },
    {
      path: '.env.example',
      content: `VITE_ONODE_URL=http://127.0.0.1:5003
VITE_ELEVENLABS_AGENT_ID=
`,
    },
    {
      path: 'README.md',
      content: `# ${projectName}

Three.js + React Three Fiber world scaffolded by the **OASIS IDE**.

## Getting started

\`\`\`bash
npm install
npm run dev        # Vite dev server
npm run build      # Production bundle
npm run deploy     # Publish to STARNET via star CLI
\`\`\`

## Key files

| File | Purpose |
|------|---------|
| \`src/World.jsx\` | Root Canvas + scene composition |
| \`src/components/Terrain.jsx\` | Ground plane (replace with height map) |
| \`src/components/GuideNPC.jsx\` | Starter NPC with dialogue bubble |
| \`src/lib/oasis.js\` | Holon helpers for player state |
| \`.star-workspace.json\` | Engine + OASIS project config |

## Next steps

1. Swap the capsule NPC for a \`.vrm\` avatar using \`@pixiv/three-vrm\`.
2. Add ElevenLabs voice via the **NPC Voice** builder in the IDE.
3. Create quests with the **New Quest** builder and register them on STARNET.
`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Babylon.js (Vite)
// ---------------------------------------------------------------------------

export function getBabylonTemplate(projectName: string): TemplateFile[] {
  return [
    {
      path: '.star-workspace.json',
      content: starWorkspaceJson(projectName, 'babylonjs'),
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: projectName,
          version: '0.1.0',
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
            deploy: 'star publish',
          },
          dependencies: {
            '@babylonjs/core': '^7.10.0',
            '@babylonjs/gui': '^7.10.0',
            '@babylonjs/loaders': '^7.10.0',
            '@babylonjs/materials': '^7.10.0',
          },
          devDependencies: {
            vite: '^5.2.0',
          },
        },
        null,
        2
      ),
    },
    {
      path: 'vite.config.js',
      content: `import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // Babylon is a large ESM package — pre-bundle for faster dev restarts
    include: ['@babylonjs/core', '@babylonjs/gui', '@babylonjs/loaders'],
  },
  server: { port: 5174 },
});
`,
    },
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #renderCanvas { width: 100%; height: 100%; overflow: hidden; }
    </style>
  </head>
  <body>
    <canvas id="renderCanvas"></canvas>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
    },
    {
      path: 'src/main.js',
      content: `import { createScene } from './scene.js';

const canvas = document.getElementById('renderCanvas');
const { engine } = await createScene(canvas);

engine.runRenderLoop(() => engine.scenes[0]?.render());
window.addEventListener('resize', () => engine.resize());
`,
    },
    {
      path: 'src/scene.js',
      content: `import {
  Engine,
  Scene,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  ArcRotateCamera,
} from '@babylonjs/core';
import { createGuideNPC } from './npc.js';

export async function createScene(canvas) {
  const engine = new Engine(canvas, true, { adaptToDeviceRatio: true });
  const scene = new Scene(engine);

  // Camera
  const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3, 20, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 60;

  // Lights
  new HemisphericLight('ambientLight', new Vector3(0, 1, 0), scene).intensity = 0.5;
  const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene);
  sun.intensity = 1.2;

  // Ground
  const ground = MeshBuilder.CreateGround('terrain', { width: 200, height: 200, subdivisions: 32 }, scene);
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = new Color3(0.23, 0.49, 0.27);
  ground.material = groundMat;

  // Starter NPC
  createGuideNPC(scene, new Vector3(0, 0, -5));

  return { engine, scene };
}
`,
    },
    {
      path: 'src/npc.js',
      content: `import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  ActionManager,
  ExecuteCodeAction,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Rectangle, Control } from '@babylonjs/gui';

export function createGuideNPC(scene, position) {
  // Placeholder capsule — swap for .glb model via SceneLoader
  const body = MeshBuilder.CreateCapsule('guide', { height: 1.8, radius: 0.4 }, scene);
  body.position = position.clone();

  const mat = new StandardMaterial('guideMat', scene);
  mat.diffuseColor = new Color3(0.39, 0.4, 0.95);
  body.material = mat;

  // GUI label
  const ui = AdvancedDynamicTexture.CreateFullscreenUI('npcUI', true, scene);
  const label = new TextBlock();
  label.text = '';
  label.color = '#e2e8f0';
  label.fontSize = 14;
  label.top = '-100px';
  ui.addControl(label);

  // Click to show dialogue
  body.actionManager = new ActionManager(scene);
  let open = false;
  body.actionManager.registerAction(
    new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
      open = !open;
      label.text = open ? 'Welcome, traveller. Ask me about quests.' : '';
    })
  );

  return body;
}
`,
    },
    {
      path: 'src/lib/oasis.js',
      content: `// OASIS holon helper for Babylon.js worlds
const ONODE = import.meta.env.VITE_ONODE_URL ?? 'http://127.0.0.1:5003';

export async function loadPlayerHolon(playerId) {
  const res = await fetch(\`\${ONODE}/api/data/load-holon/\${playerId}\`);
  if (!res.ok) return null;
  return res.json();
}

export async function savePlayerHolon(playerId, state) {
  const res = await fetch(\`\${ONODE}/api/data/save-holon\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holonId: playerId, ...state }),
  });
  if (!res.ok) throw new Error(\`Holon save failed: \${res.status}\`);
  return res.json();
}
`,
    },
    {
      path: '.env.example',
      content: `VITE_ONODE_URL=http://127.0.0.1:5003
VITE_ELEVENLABS_AGENT_ID=
`,
    },
    {
      path: 'README.md',
      content: `# ${projectName}

Babylon.js world scaffolded by the **OASIS IDE**.

## Getting started

\`\`\`bash
npm install
npm run dev        # Vite dev server
npm run build      # Production bundle
npm run deploy     # Publish to STARNET via star CLI
\`\`\`

## Key files

| File | Purpose |
|------|---------|
| \`src/scene.js\` | Engine + scene setup, camera, lights, terrain |
| \`src/npc.js\` | Starter NPC with Babylon GUI dialogue |
| \`src/lib/oasis.js\` | Holon helpers for player state |
| \`.star-workspace.json\` | Engine + OASIS project config |

## Next steps

1. Replace the capsule NPC with a \`.glb\` model using \`@babylonjs/loaders SceneLoader\`.
2. Add Havok physics: \`scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin())\`.
3. Wire ElevenLabs NPC voice from the **NPC Voice** builder in the IDE.
`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TEMPLATE_REGISTRY: Record<
  string,
  (projectName: string) => TemplateFile[]
> = {
  hyperfy: getHyperfyTemplate,
  threejs: getThreejsTemplate,
  babylonjs: getBabylonTemplate,
  'rp-server': getRpServerTemplate,
  'quest-chain': getQuestChainTemplate,
  'npc-pack': getNpcPackTemplate,
  'item-drop': getItemDropTemplate,
  'content-creator': getContentCreatorTemplate,
};

// ─── Content Template metadata ────────────────────────────────────────────────
// Used by MetaverseTemplatePanel to display cards and prompt for variables.
export type { ContentTemplateVariable, ContentTemplateMeta } from '../../shared/templateTypes.js';
import type { ContentTemplateMeta } from '../../shared/templateTypes.js';

export const TEMPLATE_META: ContentTemplateMeta[] = [
  {
    id: 'rp-server',
    name: 'GTA-style RP Server',
    description: 'Lore bible, factions, quest arcs, NPC roster, and server config for a roleplay world.',
    category: 'rp-server',
    emoji: '🏙',
    variables: [
      { key: 'WORLD_NAME', prompt: 'World name', default: 'Neon District' },
      { key: 'CITY_NAME', prompt: 'City name', default: 'Los Santos' },
      { key: 'NUM_FACTIONS', prompt: 'Number of factions', default: '3' },
      { key: 'MONTHLY_PRICE', prompt: 'Monthly subscription price (USD)', default: '9.99' },
    ],
    postInstallPrompt:
      'My RP server world is called {{WORLD_NAME}} set in {{CITY_NAME}}. Generate a lore bible, {{NUM_FACTIONS}} faction summaries, and a starter quest arc using the Lore Studio.',
  },
  {
    id: 'quest-chain',
    name: 'Quest Chain',
    description: 'Linked quest series with objectives JSON and STAR quest hooks ready to publish.',
    category: 'quest-chain',
    emoji: '⚔️',
    variables: [
      { key: 'CHAIN_NAME', prompt: 'Quest chain name', default: 'The Iron Path' },
      { key: 'GAME_SOURCE', prompt: 'Game / platform', default: 'OurWorld' },
      { key: 'NUM_QUESTS', prompt: 'Number of quests', default: '5' },
    ],
    postInstallPrompt:
      'Create a {{NUM_QUESTS}}-quest chain called {{CHAIN_NAME}} in the STAR system for {{GAME_SOURCE}}.',
  },
  {
    id: 'npc-pack',
    name: 'NPC Pack',
    description: 'Roster + voice assignment scaffolding for a faction of NPCs with ElevenLabs slots.',
    category: 'npc-pack',
    emoji: '🧑‍🤝‍🧑',
    variables: [
      { key: 'PACK_NAME', prompt: 'Pack name', default: 'Syndicate Crew' },
      { key: 'NUM_NPCS', prompt: 'Number of NPCs', default: '5' },
      { key: 'FACTION', prompt: 'Faction name', default: 'The Iron Syndicate' },
    ],
    postInstallPrompt:
      'Generate {{NUM_NPCS}} diverse NPC characters for the {{FACTION}} faction. For each NPC: name, role, personality, and create an ElevenLabs voice agent.',
  },
  {
    id: 'item-drop',
    name: 'Cross-game Item Drop',
    description: 'Item schema + drop table config ready to mint as an OASIS NFT across games.',
    category: 'item-drop',
    emoji: '🎁',
    variables: [
      { key: 'ITEM_NAME', prompt: 'Item name', default: 'Shadow Blade' },
      { key: 'ITEM_RARITY', prompt: 'Rarity (common / rare / legendary)', default: 'rare' },
      { key: 'GAME_SOURCE', prompt: 'Source game', default: 'ODOOM' },
    ],
    postInstallPrompt:
      'Mint a {{ITEM_RARITY}} rarity item called {{ITEM_NAME}} as an NFT for {{GAME_SOURCE}}. Set up the drop table.',
  },
  {
    id: 'content-creator',
    name: 'Content Creator Kit',
    description: 'Video script templates, thumbnail brief, and 30-day posting schedule for a game creator.',
    category: 'content-creator',
    emoji: '🎬',
    variables: [
      { key: 'GAME_NAME', prompt: 'Game / world name', default: 'OurWorld' },
      { key: 'CREATOR_NICHE', prompt: 'Creator niche', default: 'lore deep-dives' },
    ],
    postInstallPrompt:
      'Help me build a content strategy for {{GAME_NAME}} focused on {{CREATOR_NICHE}}. Generate 10 video script outlines and a 30-day posting schedule.',
  },
];

// ─── Phase 5 Content Templates ────────────────────────────────────────────────

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export function getContentTemplateFiles(
  templateId: string,
  variables: Record<string, string>
): TemplateFile[] {
  const s = (t: string) => substitute(t, variables);
  switch (templateId) {
    case 'rp-server': {
      const w = variables['WORLD_NAME'] ?? 'World';
      const c = variables['CITY_NAME'] ?? 'City';
      const price = variables['MONTHLY_PRICE'] ?? '9.99';
      return [
        { path: '.star-workspace.json', content: JSON.stringify({ name: w, projectType: 'metaverse-rp-server', starnetNetwork: 'testnet', version: '1.0.0' }, null, 2) },
        { path: 'lore/lore-bible.md', content: `# ${w} — Lore Bible\n\n> Set in the city of ${c}.\n\n## Overview\n\n<!-- Generated by OASIS IDE. Use the Lore Studio to expand. -->\n` },
        { path: 'lore/factions.json', content: JSON.stringify([], null, 2) },
        { path: 'quests/arc-01.json', content: JSON.stringify({ name: 'Arc 01', quests: [] }, null, 2) },
        { path: 'npcs/roster.json', content: JSON.stringify([], null, 2) },
        { path: 'scripts/server-config.json', content: JSON.stringify({ world: w, city: c, maxPlayers: 64, monthlyPrice: parseFloat(price) }, null, 2) },
        { path: 'README.md', content: s(`# Getting started with {{WORLD_NAME}}\n\nWelcome to **{{WORLD_NAME}}**, set in {{CITY_NAME}}.\n\n## Quick start\n\n1. Open the Lore Studio tab in the IDE and generate your lore bible.\n2. Use NPC Voice Studio to create faction NPCs.\n3. Create quests with \`star quest create\` or via the agent.\n`) },
      ];
    }
    case 'quest-chain': {
      const chain = variables['CHAIN_NAME'] ?? 'Quest Chain';
      const n = parseInt(variables['NUM_QUESTS'] ?? '5', 10);
      const game = variables['GAME_SOURCE'] ?? 'Game';
      return [
        { path: '.star-workspace.json', content: JSON.stringify({ name: chain, projectType: 'quest-chain', gameSource: game, starnetNetwork: 'testnet', version: '1.0.0' }, null, 2) },
        { path: `quests/${chain}/overview.md`, content: s(`# {{CHAIN_NAME}}\n\nA ${n}-quest chain for **{{GAME_SOURCE}}**.\n\n## Quests\n\n${Array.from({ length: n }, (_, i) => `${i + 1}. Quest ${i + 1} — *TBD*`).join('\n')}\n`) },
        { path: `quests/${chain}/objectives.json`, content: JSON.stringify({ chain, gameSource: game, quests: [] }, null, 2) },
        { path: 'README.md', content: s(`# {{CHAIN_NAME}}\n\nQuest chain for {{GAME_SOURCE}}. Edit \`quests/{{CHAIN_NAME}}/objectives.json\` then ask the agent to publish via STAR.\n`) },
      ];
    }
    case 'npc-pack': {
      const pack = variables['PACK_NAME'] ?? 'NPC Pack';
      const faction = variables['FACTION'] ?? 'Faction';
      return [
        { path: '.star-workspace.json', content: JSON.stringify({ name: pack, projectType: 'npc-pack', starnetNetwork: 'testnet', version: '1.0.0' }, null, 2) },
        { path: `npcs/${pack}/roster.json`, content: JSON.stringify({ pack, faction, npcs: [] }, null, 2) },
        { path: `npcs/${pack}/voices.json`, content: JSON.stringify({ pack, voices: [] }, null, 2) },
        { path: 'README.md', content: s(`# {{PACK_NAME}}\n\nNPC pack for the **{{FACTION}}** faction.\n\nOpen NPC Voice Studio in the IDE to create voice agents for each NPC.\n`) },
      ];
    }
    case 'item-drop': {
      const item = variables['ITEM_NAME'] ?? 'Item';
      const rarity = variables['ITEM_RARITY'] ?? 'common';
      const game = variables['GAME_SOURCE'] ?? 'Game';
      return [
        { path: '.star-workspace.json', content: JSON.stringify({ name: item, projectType: 'item-drop', gameSource: game, starnetNetwork: 'testnet', version: '1.0.0' }, null, 2) },
        { path: `items/${item}.json`, content: JSON.stringify({ name: item, rarity, gameSource: game, nftMinted: false, contractAddress: null, tokenId: null }, null, 2) },
        { path: 'scripts/drop-table.json', content: JSON.stringify({ items: [{ name: item, rarity, dropChance: rarity === 'legendary' ? 0.01 : rarity === 'rare' ? 0.05 : 0.2 }] }, null, 2) },
        { path: 'README.md', content: s(`# {{ITEM_NAME}}\n\nA **{{ITEM_RARITY}}** item for {{GAME_SOURCE}}.\n\nAsk the agent to mint this as an NFT:\n> "Mint {{ITEM_NAME}} as a {{ITEM_RARITY}} NFT on Solana for {{GAME_SOURCE}}"\n`) },
      ];
    }
    case 'content-creator': {
      const game = variables['GAME_NAME'] ?? 'Game';
      const niche = variables['CREATOR_NICHE'] ?? 'gameplay';
      return [
        { path: '.star-workspace.json', content: JSON.stringify({ name: `${game} Content`, projectType: 'generic', starnetNetwork: 'testnet', version: '1.0.0' }, null, 2) },
        { path: 'content/video-scripts/template.md', content: `# Video Script Template\n\n**Game:** ${game}\n**Niche:** ${niche}\n\n## Hook (0–10s)\n\n<!-- Grab attention -->\n\n## Main Content (10s–8min)\n\n<!-- Core content -->\n\n## CTA (last 30s)\n\n<!-- Subscribe / join Discord / OASIS link -->\n` },
        { path: 'content/thumbnail-brief.md', content: `# Thumbnail Brief — ${game}\n\n**Niche:** ${niche}\n\n- Main subject: *character or moment from the game*\n- Text overlay: *short hook (max 5 words)*\n- Style: high contrast, readable at 120px width\n` },
        { path: 'content/posting-schedule.md', content: `# 30-Day Posting Schedule\n\n**Game:** ${game}\n\n| Day | Topic | Platform |\n|-----|-------|----------|\n| 1 | Introduction to ${game} | YouTube |\n| 3 | ${niche} deep-dive #1 | YouTube + TikTok |\n| 7 | ${niche} deep-dive #2 | YouTube |\n| … | … | … |\n\n*Ask the agent to fill in all 30 days.*\n` },
        { path: 'README.md', content: s(`# {{GAME_NAME}} Content Creator Kit\n\n**Niche:** {{CREATOR_NICHE}}\n\nAsk the agent:\n> "Generate 10 video script outlines and a full 30-day posting schedule for {{GAME_NAME}} focused on {{CREATOR_NICHE}}"\n`) },
      ];
    }
    default:
      return [];
  }
}

// ─── Phase 5 additional template functions ────────────────────────────────────

export function getRpServerTemplate(projectName: string): TemplateFile[] {
  return getContentTemplateFiles('rp-server', { WORLD_NAME: projectName, CITY_NAME: 'New City', NUM_FACTIONS: '3', MONTHLY_PRICE: '9.99' });
}

export function getQuestChainTemplate(projectName: string): TemplateFile[] {
  return getContentTemplateFiles('quest-chain', { CHAIN_NAME: projectName, GAME_SOURCE: 'OurWorld', NUM_QUESTS: '5' });
}

export function getNpcPackTemplate(projectName: string): TemplateFile[] {
  return getContentTemplateFiles('npc-pack', { PACK_NAME: projectName, NUM_NPCS: '5', FACTION: 'Unknown Faction' });
}

export function getItemDropTemplate(projectName: string): TemplateFile[] {
  return getContentTemplateFiles('item-drop', { ITEM_NAME: projectName, ITEM_RARITY: 'rare', GAME_SOURCE: 'OurWorld' });
}

export function getContentCreatorTemplate(projectName: string): TemplateFile[] {
  return getContentTemplateFiles('content-creator', { GAME_NAME: projectName, CREATOR_NICHE: 'gameplay' });
}
