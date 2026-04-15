import React from 'react';
import { Settings } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import './TitleBar.css';

/**
 * Full-width title bar that sits above all IDE panels.
 *
 * On macOS (hiddenInset), the native traffic lights are painted at ~(12, 10).
 * This bar reserves that space and acts as the window drag handle.
 * Interactive children must opt out of drag with -webkit-app-region: no-drag.
 */
export const TitleBar: React.FC = () => {
  const { openSettings } = useSettings();

  return (
    <div className="title-bar">
      <div className="title-bar-traffic-zone" />
      <span className="title-bar-label">OASIS IDE</span>
      <div className="title-bar-spacer" />
      <button
        type="button"
        className="title-bar-settings-btn"
        title="Settings"
        aria-label="Open Settings"
        onClick={() => openSettings('general')}
      >
        <Settings size={15} strokeWidth={1.6} />
      </button>
    </div>
  );
};
