export type GameQuickActionId =
  | 'newOapp'
  | 'newWorld'
  | 'quest'
  | 'npc'
  | 'missionArc'
  | 'npcVoice'
  | 'mintItem'
  | 'dialogueTree'
  | 'lore'
  | 'geoHotspot';

export interface GameQuickActionDef {
  id: GameQuickActionId;
  /** Button label in the quick palette */
  label: string;
  sublabel: string;
  /** Title in the inline workflow header */
  title: string;
  /** Assistant intro shown in the thread (first bubble) */
  intro: string;
  builderId?: string;
  injectPrompt?: string;
  /** Primary button in the footer */
  primaryAction: 'insertPrompt' | 'openBuilder';
  primaryLabel: string;
}

export const GAME_QUICK_ACTIONS: Record<GameQuickActionId, GameQuickActionDef> = {
  newOapp: {
    id: 'newOapp',
    label: 'Build plan',
    sublabel: 'Agent',
    title: 'Build an OASIS app',
    intro:
      'Tell me what you want to build — a game world, social app, quest chain, NFT drop, anything on the OASIS platform.\n\n' +
      'I will scan your workspace, pick the right STARNET holons and starter template, write a numbered build plan, and then execute it step-by-step when you say go.\n\n' +
      'Describe your idea below, or paste a brief spec.',
    primaryAction: 'insertPrompt',
    primaryLabel: 'Use guided build flow →',
    injectPrompt:
      'Build a new OASIS app for me. First scan the workspace and STARNET catalog, then propose a plan (template, holons, build order). When I approve, execute each step.',
  },
  newWorld: {
    id: 'newWorld',
    label: 'New World',
    sublabel: 'Scaffold',
    title: 'New World',
    intro:
      'Opens the New World scaffold in the editor. Name the world, set options, then use Send to chat from the builder when it is ready.',
    builderId: 'newWorld',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open New World builder',
  },
  quest: {
    id: 'quest',
    label: 'New Quest',
    sublabel: 'STARNET',
    title: 'New Quest',
    intro:
      'Opens the Quest builder for STARNET. Define objectives and hooks, then submit from the builder into this chat when offered.',
    builderId: 'quest',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open Quest builder',
  },
  npc: {
    id: 'npc',
    label: 'New NPC',
    sublabel: 'Holon',
    title: 'New NPC',
    intro:
      'Opens the NPC holon builder. Fill identity and metadata, then send to chat from the form when ready.',
    builderId: 'npc',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open NPC builder',
  },
  missionArc: {
    id: 'missionArc',
    label: 'Mission Arc',
    sublabel: 'STARNET',
    title: 'Mission Arc',
    intro:
      'Opens the Mission Arc builder for multi-step STARNET missions. Complete the arc fields in the editor tab.',
    builderId: 'missionArc',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open Mission Arc builder',
  },
  npcVoice: {
    id: 'npcVoice',
    label: 'NPC Voice',
    sublabel: 'ElevenLabs',
    title: 'NPC Voice',
    intro:
      'Opens the ElevenLabs voice setup for an NPC. Configure voice id and samples in the builder, then continue in chat as prompted.',
    builderId: 'npcVoice',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open NPC Voice builder',
  },
  mintItem: {
    id: 'mintItem',
    label: 'Mint Item',
    sublabel: 'NFT',
    title: 'Mint Item',
    intro:
      'Opens the in-game item NFT minting helper. For full on-chain mint with MCP and cluster choice, use Mint NFT in the On-chain quick actions instead.',
    builderId: 'mintItem',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open Mint Item builder',
  },
  dialogueTree: {
    id: 'dialogueTree',
    label: 'Dialogue Tree',
    sublabel: 'JSON',
    title: 'Dialogue Tree',
    intro:
      'Opens the dialogue tree JSON editor. Structure branches and conditions, then send from the builder when ready.',
    builderId: 'dialogueTree',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open Dialogue Tree builder',
  },
  lore: {
    id: 'lore',
    label: 'Generate Lore',
    sublabel: 'Workspace',
    title: 'Generate Lore',
    intro:
      'Opens the lore generator against your workspace context. Adjust prompts in the builder and send results into chat.',
    builderId: 'lore',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open Lore generator',
  },
  geoHotspot: {
    id: 'geoHotspot',
    label: 'GeoHotSpot',
    sublabel: 'GeoNFT',
    title: 'GeoHotSpot',
    intro:
      'Opens the GeoHotSpot / GeoNFT placement helper. Set location and metadata in the builder tab.',
    builderId: 'geoHotspot',
    primaryAction: 'openBuilder',
    primaryLabel: 'Open GeoHotSpot builder',
  },
};

/** Stable order for the quick palette row */
export const GAME_QUICK_ACTION_ORDER: GameQuickActionId[] = [
  'newOapp',
  'newWorld',
  'quest',
  'npc',
  'missionArc',
  'npcVoice',
  'mintItem',
  'dialogueTree',
  'lore',
  'geoHotspot',
];
