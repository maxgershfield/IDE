import React from 'react';
import './StatusBar.css';

/**
 * VS Code / Cursor-style status strip (branch + indicators are placeholders until wired to git).
 */
export const StatusBar: React.FC = () => {
  return (
    <div className="ide-status-bar" role="status">
      <div className="ide-status-bar-left">
        <span className="ide-status-item" title="Workspace">
          OASIS IDE
        </span>
      </div>
      <div className="ide-status-bar-right">
        <span className="ide-status-item ide-status-quiet">0 ⚠</span>
        <span className="ide-status-item ide-status-quiet">0 ✕</span>
      </div>
    </div>
  );
};
