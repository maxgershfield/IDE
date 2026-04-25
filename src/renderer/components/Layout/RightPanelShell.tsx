import React from 'react';
import { useA2A } from '../../contexts/A2AContext';
import './RightPanelShell.css';

export type RightPanelTabId = 'composer' | 'inbox' | 'tools' | 'npc' | 'agents';

interface RightPanelShellProps {
  composer: React.ReactNode;
  inbox: React.ReactNode;
  tools: React.ReactNode;
  npcVoice: React.ReactNode;
  agents: React.ReactNode;
}

const TABS: { id: RightPanelTabId; label: React.ReactNode }[] = [
  { id: 'composer', label: 'Composer' },
  { id: 'tools',    label: 'OASIS Tools' },
  { id: 'agents',   label: 'Agents' },
];

/**
 * OASIS_IDE-style right column: horizontal tabs so the AI surface gets full height like Composer.
 * Active tab is managed in A2AContext so cross-panel navigation (e.g. Agent -> Inbox compose)
 * works without prop drilling.
 */
export const RightPanelShell: React.FC<RightPanelShellProps> = ({ composer, inbox, tools, npcVoice, agents }) => {
  const { activeTab, setActiveTab } = useA2A();

  return (
    <div className="right-panel-shell">
      <div className="right-panel-shell-tabs" role="tablist" aria-label="Right panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`right-panel-shell-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="right-panel-shell-tabs-spacer" />
      </div>
      <div
        className="right-panel-shell-body"
        role="tabpanel"
        hidden={false}
      >
        {activeTab === 'composer' && <div className="right-panel-shell-pane">{composer}</div>}
        {activeTab === 'inbox' && <div className="right-panel-shell-pane">{inbox}</div>}
        {activeTab === 'tools' && <div className="right-panel-shell-pane">{tools}</div>}
        {activeTab === 'npc' && <div className="right-panel-shell-pane">{npcVoice}</div>}
        {activeTab === 'agents' && <div className="right-panel-shell-pane">{agents}</div>}
      </div>
    </div>
  );
};
