import React from 'react';
import { useEditorTab } from '../../contexts/EditorTabContext';
import { NEW_OAPP_PLANNING_PROMPT } from '../../constants/gameDevPrompt';

interface PaletteAction {
  label: string;
  sublabel: string;
  /** Opens a structured builder tab in the editor. */
  builderId?: string;
  /** Fills the composer with a planning-first prompt (no builder). */
  injectPrompt?: string;
}

const ACTIONS: PaletteAction[] = [
  {
    label: 'New OAPP',
    sublabel: 'Plan',
    injectPrompt: NEW_OAPP_PLANNING_PROMPT
  },
  { label: 'New World', sublabel: 'Scaffold', builderId: 'newWorld' },
  { label: 'New Quest', sublabel: 'STARNET', builderId: 'quest' },
  { label: 'New NPC', sublabel: 'Holon', builderId: 'npc' },
  { label: 'Mission Arc', sublabel: 'STARNET', builderId: 'missionArc' },
  { label: 'NPC Voice', sublabel: 'ElevenLabs', builderId: 'npcVoice' },
  { label: 'Mint Item', sublabel: 'NFT', builderId: 'mintItem' },
  { label: 'Dialogue Tree', sublabel: 'JSON', builderId: 'dialogueTree' },
  { label: 'Generate Lore', sublabel: 'Workspace', builderId: 'lore' },
  { label: 'GeoHotSpot', sublabel: 'GeoNFT', builderId: 'geoHotspot' }
];

export interface GameToolPaletteProps {
  /** Fills the composer textarea when an action uses \`injectPrompt\`. */
  onInjectPrompt?: (prompt: string) => void;
}

export const GameToolPalette: React.FC<GameToolPaletteProps> = ({ onInjectPrompt }) => {
  const { openBuilderTab } = useEditorTab();

  return (
    <div className="game-tool-palette" aria-label="Game Dev quick actions">
      <span className="game-tool-palette__heading">Quick actions</span>
      <div className="game-tool-palette__actions" role="list">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            role="listitem"
            className="game-tool-palette__btn"
            title={
              action.injectPrompt
                ? 'Insert a plan-first prompt into the composer'
                : `Open ${action.label} builder`
            }
            onClick={() => {
              if (action.injectPrompt && onInjectPrompt) {
                onInjectPrompt(action.injectPrompt);
                return;
              }
              if (action.builderId) {
                openBuilderTab(action.builderId);
              }
            }}
          >
            <span className="game-tool-palette__label">{action.label}</span>
            <span className="game-tool-palette__sublabel">{action.sublabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
