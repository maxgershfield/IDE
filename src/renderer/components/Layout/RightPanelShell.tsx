import React, { useState } from 'react';
import { useGameDev } from '../../contexts/GameDevContext';
import './RightPanelShell.css';

export type RightPanelTabId = 'composer' | 'inbox' | 'tools';

interface RightPanelShellProps {
  composer: React.ReactNode;
  inbox: React.ReactNode;
  tools: React.ReactNode;
}

const TABS: { id: RightPanelTabId; label: string }[] = [
  { id: 'composer', label: 'Composer' },
  { id: 'inbox', label: 'A2A Inbox' },
  { id: 'tools', label: 'OASIS Tools' }
];

/**
 * Cursor-style right column: horizontal tabs so the AI surface gets full height like Composer.
 */
export const RightPanelShell: React.FC<RightPanelShellProps> = ({ composer, inbox, tools }) => {
  const [active, setActive] = useState<RightPanelTabId>('composer');
  const { isGameDevMode, toggleGameDevMode } = useGameDev();

  return (
    <div className="right-panel-shell">
      <div className="right-panel-shell-tabs" role="tablist" aria-label="Right panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={`right-panel-shell-tab ${active === t.id ? 'active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="right-panel-shell-tabs-spacer" />
        <button
          type="button"
          className={`right-panel-shell-gamedev-toggle${isGameDevMode ? ' is-on' : ''}`}
          onClick={toggleGameDevMode}
          title={
            isGameDevMode
              ? 'Game Dev mode on — click to disable. Agent uses metaverse game context: quests, NPCs, ElevenLabs voice, world engine templates.'
              : 'Enable Game Dev mode — loads metaverse game developer context for quests, NPCs, ElevenLabs voice, Three.js/Hyperfy/Unity/Roblox.'
          }
          aria-pressed={isGameDevMode}
        >
          {isGameDevMode ? '🎮 Game Dev' : '🎮'}
        </button>
      </div>
      <div
        className="right-panel-shell-body"
        role="tabpanel"
        hidden={false}
      >
        {active === 'composer' && <div className="right-panel-shell-pane">{composer}</div>}
        {active === 'inbox' && <div className="right-panel-shell-pane">{inbox}</div>}
        {active === 'tools' && <div className="right-panel-shell-pane">{tools}</div>}
      </div>
    </div>
  );
};
