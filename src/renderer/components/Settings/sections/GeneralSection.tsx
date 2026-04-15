import React from 'react';
import { useSettings } from '../../../contexts/SettingsContext';
import { useTheme } from '../../../contexts/ThemeContext';

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <label className="settings-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="settings-toggle-slider" />
  </label>
);

const FONT_FAMILIES = [
  { value: 'default', label: 'Default' },
  { value: 'fira-code', label: 'Fira Code' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'cascadia-code', label: 'Cascadia Code' },
  { value: 'source-code-pro', label: 'Source Code Pro' },
  { value: 'monospace', label: 'System Monospace' },
];

export const GeneralSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { setTheme } = useTheme();

  const handleThemeChange = (theme: 'dark' | 'light' | 'oasis') => {
    updateSettings({ theme });
    setTheme(theme);
  };

  return (
    <>
      <p className="settings-section-heading">Appearance</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Theme</div>
            <div className="settings-row-desc">Choose the IDE colour scheme</div>
          </div>
          <div className="settings-row-control">
            <div className="settings-segmented">
              {(['dark', 'light', 'oasis'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`settings-segmented-btn${settings.theme === t ? ' active' : ''}`}
                  onClick={() => handleThemeChange(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Font Size</div>
            <div className="settings-row-desc">Editor font size in pixels</div>
          </div>
          <div className="settings-row-control">
            <input
              type="number"
              className="settings-number-input"
              value={settings.fontSize}
              min={10}
              max={24}
              onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Font Family</div>
            <div className="settings-row-desc">Editor monospace font</div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.fontFamily}
              onChange={(e) => updateSettings({ fontFamily: e.target.value })}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Layout</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Title Bar</div>
            <div className="settings-row-desc">Show title bar in agent layout</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.showTitleBar}
              onChange={(v) => updateSettings({ showTitleBar: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Status Bar</div>
            <div className="settings-row-desc">Show status bar at the bottom of the window</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.showStatusBar}
              onChange={(v) => updateSettings({ showStatusBar: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Review Control Location</div>
            <div className="settings-row-desc">
              Show inline diff review controls in top level breadcrumbs or floating island
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.reviewControlLocation}
              onChange={(e) =>
                updateSettings({
                  reviewControlLocation: e.target.value as 'breadcrumb' | 'floating',
                })
              }
            >
              <option value="breadcrumb">Breadcrumb</option>
              <option value="floating">Floating Island</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Auto-hide editor when empty</div>
            <div className="settings-row-desc">Hide the editor panel when no file is open</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.autoHideEditorWhenEmpty}
              onChange={(v) => updateSettings({ autoHideEditorWhenEmpty: v })}
            />
          </div>
        </div>
      </div>
    </>
  );
};
