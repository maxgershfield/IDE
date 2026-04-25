import React, { Suspense, lazy, useEffect, useState } from 'react';
import './BottomPanel.css';

type BottomTabId = 'problems' | 'output' | 'debug' | 'terminal' | 'ports';

const TerminalPanel = lazy(() =>
  import('../Terminal/TerminalPanel').then((m) => ({ default: m.TerminalPanel }))
);

const TABS: { id: BottomTabId; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'debug', label: 'Debug Console' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'ports', label: 'Ports' }
];

export const BottomPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<BottomTabId>('terminal');

  useEffect(() => {
    if (!TABS.some((tab) => tab.id === activeTab)) {
      setActiveTab('terminal');
    }
  }, [activeTab]);

  return (
    <div className="bottom-panel-wrapper">
      <div className="bottom-panel-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`bottom-panel-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="bottom-panel-content">
        {activeTab === 'terminal' && (
          <Suspense
            fallback={
              <div className="bottom-panel-placeholder">
                <p>Loading terminal…</p>
              </div>
            }
          >
            <TerminalPanel />
          </Suspense>
        )}
        {activeTab === 'output' && (
          <div className="bottom-panel-placeholder">
            <p>Output from build and tasks will appear here.</p>
          </div>
        )}
        {activeTab === 'problems' && (
          <div className="bottom-panel-placeholder">
            <p>Problems and errors will appear here.</p>
          </div>
        )}
        {activeTab === 'debug' && (
          <div className="bottom-panel-placeholder">
            <p>Debug console output will appear here.</p>
          </div>
        )}
        {activeTab === 'ports' && (
          <div className="bottom-panel-placeholder">
            <p>Forwarded ports and URLs will appear here when a dev server is tracked.</p>
          </div>
        )}
      </div>
    </div>
  );
};
