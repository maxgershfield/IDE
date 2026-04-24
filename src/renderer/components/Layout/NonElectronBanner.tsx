import React, { useState } from 'react';
import { isElectronRenderer } from '../../utils/isElectronRenderer';
import './NonElectronBanner.css';

/**
 * Shown when the UI is opened in a normal browser (e.g. after `npm run dev:vite` at http://127.0.0.1:3000).
 * Preload is not injected there, so terminal, workspace picker, and IPC-backed features cannot run.
 */
export const NonElectronBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isElectronRenderer()) {
    return null;
  }

  return (
    <div className="non-electron-banner" role="status">
      <div className="non-electron-banner-inner">
        <strong>Desktop app required</strong>
        <span>
          This page is open in a <em>browser</em>. OASIS IDE is an <strong>Electron</strong> app: the
          integrated terminal, native file dialogs, and backend APIs use the desktop window only.
        </span>
        <span className="non-electron-banner-hint">
          Quit this tab. From the <code>OASIS-IDE</code> folder run <code>npm run dev</code> and use the
          window that opens (not Chrome/Safari at localhost).
        </span>
        <button type="button" className="non-electron-banner-dismiss" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  );
};
