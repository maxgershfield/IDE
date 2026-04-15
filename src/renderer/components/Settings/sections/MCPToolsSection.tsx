import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useMCP } from '../../../contexts/MCPContext';
import { useSettings } from '../../../contexts/SettingsContext';

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <label className="settings-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="settings-toggle-slider" />
  </label>
);

export const MCPToolsSection: React.FC = () => {
  const { tools, loading, refreshTools } = useMCP();
  const { settings, updateSettings } = useSettings();

  return (
    <>
      <div className="settings-info-box">
        <strong>MCP Servers</strong> give the agent access to external tools. Servers are configured
        via environment variables or the OASIS config file. Tool counts reflect currently running
        servers.
      </div>

      <p className="settings-section-heading">Installed MCP Servers</p>
      <div className="settings-mcp-list">
        {loading && (
          <div className="settings-empty" style={{ padding: '16px' }}>
            Loading tools...
          </div>
        )}

        {!loading && tools.length === 0 && (
          <div className="settings-empty" style={{ padding: '16px' }}>
            No MCP servers connected. Set OASIS_MCP_SERVER_PATH and restart.
          </div>
        )}

        {!loading && tools.length > 0 && (
          <div className="settings-mcp-row" style={{ background: 'rgba(0,122,204,0.06)' }}>
            <div
              className="settings-mcp-icon"
              style={{ background: '#007acc', color: 'white', fontWeight: 700 }}
            >
              O
            </div>
            <div className="settings-mcp-info">
              <div className="settings-mcp-name">
                oasis-unified
                <span className="settings-badge settings-badge-success" style={{ fontSize: 10 }}>
                  Running
                </span>
              </div>
              <div className="settings-mcp-tools">{tools.length} tools enabled</div>
            </div>
            <Toggle checked={true} onChange={() => {}} />
          </div>
        )}
      </div>

      <button
        type="button"
        className="settings-btn settings-btn-secondary"
        style={{ marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        onClick={refreshTools}
      >
        <RefreshCw size={13} />
        Refresh Tools
      </button>

      <p className="settings-section-heading">Browser</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Browser Automation</div>
            <div className="settings-row-desc">How the agent opens browser previews</div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.browserAutomation}
              onChange={(e) =>
                updateSettings({
                  browserAutomation: e.target.value as 'browser-tab' | 'external',
                })
              }
            >
              <option value="browser-tab">Browser Tab</option>
              <option value="external">External Browser</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Show Localhost Links in Browser</div>
            <div className="settings-row-desc">
              Automatically open localhost links in the browser tab
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.showLocalhostLinks}
              onChange={(v) => updateSettings({ showLocalhostLinks: v })}
            />
          </div>
        </div>
      </div>
    </>
  );
};
