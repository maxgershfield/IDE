/**
 * Schema for `.star-workspace.json` — project-level config placed at the root of
 * any metaverse/game project opened in the OASIS IDE.
 *
 * The IDE reads this file automatically and uses it to:
 *  - inject engine-specific context into the agent prompt
 *  - pre-fill builder forms with sensible defaults
 *  - target the right scaffold / publish commands
 */

export type GameEngine = 'hyperfy' | 'threejs' | 'babylonjs' | 'unity' | 'roblox';

export interface StarWorkspaceConfig {
  /** Human-readable project name. */
  name: string;

  /** Longer description (OAPP pitch, IDE builder, etc.). */
  description?: string;

  /** Which game/world engine this project uses. Drives agent context injection. */
  gameEngine?: GameEngine;

  /** STARNET OAPP project id (set after first `star publish`). */
  oasisProjectId?: string;

  /**
   * OAPP holon id returned by STAR create — used by IDE **Publish OAPP** alongside `oasisProjectId`.
   * Prefer keeping both in sync when the IDE registers the OAPP.
   */
  oappId?: string;

  /** Template / holon ids the user chose in the STARNET builder (hint for agents). */
  selectedStarnetHolonIds?: string[];

  /** Short classification for agent context (e.g. metaverse-rp-server, oapp). */
  projectType?: string;

  /** ISO timestamp when the IDE ran **Create OAPP in this folder**. */
  ideOappCreatedAt?: string;

  /** OASIS avatar / publisher id linked to this project. */
  oasisPublisherId?: string;

  /** STARNET network environment. Default: 'testnet'. */
  starnetNetwork?: 'mainnet' | 'testnet';

  /** ElevenLabs conversational agent id pre-configured for this project. */
  elevenLabsAgentId?: string;

  /** Schema version of this config file. */
  version?: string;
}
