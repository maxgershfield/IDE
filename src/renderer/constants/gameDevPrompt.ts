/**
 * Game Dev mode: system prompt and engine-specific context blocks.
 * Injected as `contextPack` when `composerMode === 'game'`.
 */

export const HYPERFY_CONTEXT = `
### Engine: Hyperfy (Three.js + PhysX + WebXR)
- Worlds are described in \`world.js\` (or \`.hyp\` zip) using \`world.add()\`, \`world.createEntity()\`.
- VRM avatars supported natively; import via \`world.loadVRM(url)\`.
- NPC AI: built-in ELIZA agent hooks — attach with \`entity.addComponent('ai-agent', { script })\`.
- Physics: Rapier/PhysX via \`world.addRigidBody()\`, \`world.addCollider()\`.
- OASIS integration: \`fetch\` to ONODE REST (\`/api/data/save-holon\`) for cross-world persistence.
- Publishing: \`star publish --provider hyperfy\` deploys to STARNET with a holon anchor.
`;

export const THREEJS_CONTEXT = `
### Engine: Three.js (browser-native)
- Scene graph: \`THREE.Scene\`, \`THREE.PerspectiveCamera\`, \`THREE.WebGLRenderer\`.
- Assets: \`GLTFLoader\`, \`DRACOLoader\` for compressed models.
- Physics: \`cannon-es\` or \`rapier-js\` (\`@dimforge/rapier3d-compat\`).
- Avatar: load \`.vrm\` with \`@pixiv/three-vrm\`.
- Multiplayer: Colyseus (\`colyseus.js\`) or Partykit for room state.
- OASIS integration: holons store world state; GeoNFTs anchor locations via ONODE API.
- Build: \`vite\` + \`npm run build\`; deploy via \`star publish\` or static host.
`;

export const BABYLONJS_CONTEXT = `
### Engine: Babylon.js (browser-native)
- Scene: \`new BABYLON.Engine(canvas)\`, \`new BABYLON.Scene(engine)\`.
- Physics: built-in Havok or Ammo.js plugin via \`scene.enablePhysics()\`.
- Avatar: \`BABYLON.SceneLoader.ImportMesh\` with \`.glb\`/\`.vrm\` + community VRM loader.
- GUI: \`@babylonjs/gui\` for in-world HUD overlays.
- OASIS integration: \`fetch\` ONODE holons for persistent inventory / quest state.
- Build: \`webpack\` or \`vite\`; publish with \`star publish\`.
`;

export const UNITY_CONTEXT = `
### Engine: Unity (via Unity MCP bridge)
- Scenes managed via MCP tools: \`unity_create_gameobject\`, \`unity_attach_script\`, \`unity_list_scene_objects\`.
- C# scripts should use the \`OASISResult<T>\` pattern for all OASIS API calls.
- STAR SDK: \`STARAPIClient\` in the Unity package; call \`star_beam_in\` to authenticate players.
- Tests: \`unity_run_tests\` runs EditMode + PlayMode suites and returns pass/fail.
- Build: trigger via \`run_workspace_command\` with Unity CLI \`-batchmode -buildTarget\` flags.
- DO NOT add duplicate code paths or silent catch blocks — fix the root invariant (see AGENTS.md).
`;

export const ROBLOX_CONTEXT = `
### Engine: Roblox (Lua scripting via HTTP API)
- LocalScripts handle client UI/camera; Scripts (ServerScript) own game state.
- OASIS integration: use \`HttpService:RequestAsync\` to POST/GET \`https://api.oasisweb4.com/api/data/save-holon\`.
- Quests: store state in a DataStore + mirror to OASIS holon for cross-platform leaderboards.
- NPC dialogue: trigger ElevenLabs TTS via proxy (Roblox cannot call ElevenLabs directly; route through ONODE proxy endpoint).
- Publish: use Roblox CLI (\`rbxcloud\`) for CI/CD; upload assets via AssetDelivery API.
`;

const ENGINE_BLOCKS: Record<string, string> = {
  hyperfy: HYPERFY_CONTEXT,
  threejs: THREEJS_CONTEXT,
  babylonjs: BABYLONJS_CONTEXT,
  unity: UNITY_CONTEXT,
  roblox: ROBLOX_CONTEXT
};

export const GAME_DEV_SYSTEM_PROMPT = `
You are an expert metaverse game developer assistant running inside the OASIS IDE.
You have access to the full STAR CLI (via run_star_cli), OASIS MCP tools (via mcp_invoke),
and workspace file tools (read_file, write_file, list_directory, workspace_grep, run_workspace_command).

## Your core responsibilities
1. **Build game worlds** — scaffold scenes, entities, physics, and NPC logic for the chosen engine.
2. **Wire OASIS identity** — use holons for persistent player state, GeoNFTs to anchor world locations, STARNET to publish OAPPs.
3. **NPC voice** — use ElevenLabs tools (elevenlabs_list_voices, elevenlabs_tts_preview, elevenlabs_create_agent) to give NPCs real voices.
4. **Quests & missions** — use star_create_quest / star_create_mission / star_create_npc MCP tools to register game content on-chain.
5. **Write real code** — use write_file to generate world scripts, components, and config files directly into the workspace.

## Coding rules (non-negotiable)
- Fix root causes. Never add duplicate code paths, silent catch blocks, or "if new fails try old" fallbacks.
- Use OASISResult<T> (or engine equivalent) for all OASIS API surface. Return real errors.
- Prefer small, composable files. One concern per file.

## Workflow
1. read_file / list_directory to understand the project structure.
2. workspace_grep to find existing patterns before adding new ones.
3. write_file to create or update source files.
4. run_workspace_command to install deps and build.
5. mcp_invoke with star_* tools to register quests/NPCs on STARNET.
6. mcp_invoke with elevenlabs_* tools to preview / assign NPC voices.
`;

/**
 * Returns the full game dev context pack, optionally injecting engine-specific
 * hints based on a detected or configured engine name.
 */
export function getGameDevContextPack(engine?: string): string {
  const engineKey = (engine ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const engineBlock = ENGINE_BLOCKS[engineKey] ?? '';
  return `${GAME_DEV_SYSTEM_PROMPT}${engineBlock}`.trim();
}
