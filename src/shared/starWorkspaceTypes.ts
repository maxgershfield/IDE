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

  /** Which game/world engine this project uses. Drives agent context injection. */
  gameEngine?: GameEngine;

  /** STARNET OAPP project id (set after first `star publish`). */
  oasisProjectId?: string;

  /** OASIS avatar / publisher id linked to this project. */
  oasisPublisherId?: string;

  /** STARNET network environment. Default: 'testnet'. */
  starnetNetwork?: 'mainnet' | 'testnet';

  /** ElevenLabs conversational agent id pre-configured for this project. */
  elevenLabsAgentId?: string;

  /** Schema version of this config file. */
  version?: string;
}
