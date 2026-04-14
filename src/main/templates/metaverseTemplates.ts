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
            dev: 'hyperfy dev',
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
};
