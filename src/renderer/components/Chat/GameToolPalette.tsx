import React from 'react';
import { GAME_QUICK_ACTION_ORDER, GAME_QUICK_ACTIONS, type GameQuickActionId } from '../../constants/gameQuickActions';

export interface GameToolPaletteProps {
  /** Opens the inline Composer workflow (assistant thread + actions), same pattern as on-chain mint / wallet. */
  onStartWorkflow: (actionId: GameQuickActionId) => void;
}

export const GameToolPalette: React.FC<GameToolPaletteProps> = ({ onStartWorkflow }) => {
  return (
    <div className="game-tool-palette" aria-label="Game Dev quick actions">
      <span className="game-tool-palette__heading">Quick actions</span>
      <div className="game-tool-palette__actions" role="list">
        {GAME_QUICK_ACTION_ORDER.map((id) => {
          const action = GAME_QUICK_ACTIONS[id];
          return (
            <button
              key={id}
              type="button"
              role="listitem"
              className="game-tool-palette__btn"
              title={`Open ${action.title} workflow in Composer`}
              onClick={() => onStartWorkflow(id)}
            >
              <span className="game-tool-palette__label">{action.label}</span>
              <span className="game-tool-palette__sublabel">{action.sublabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
