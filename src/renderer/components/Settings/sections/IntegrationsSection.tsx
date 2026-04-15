import React, { useEffect, useState } from 'react';
import { ExternalLink, CheckCircle2, XCircle } from 'lucide-react';
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

type ConnectionState = 'unknown' | 'connected' | 'disconnected';

export const IntegrationsSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [oasisStatus, setOasisStatus] = useState<ConnectionState>('unknown');

  useEffect(() => {
    const check = async () => {
      try {
        if (window.electronAPI?.healthCheck) {
          const h = await window.electronAPI.healthCheck();
          setOasisStatus(h?.status === 'healthy' ? 'connected' : 'disconnected');
        }
      } catch {
        setOasisStatus('disconnected');
      }
    };
    check();
  }, []);

  const StatusIcon: React.FC<{ state: ConnectionState }> = ({ state }) => {
    if (state === 'connected')
      return <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />;
    if (state === 'disconnected') return <XCircle size={14} style={{ color: 'var(--error)' }} />;
    return (
      <span
        className="settings-status-dot unknown"
        style={{ display: 'inline-block', marginRight: 2 }}
      />
    );
  };

  return (
    <>
      <p className="settings-section-heading">Source Control</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">GitHub</div>
            <div className="settings-row-desc">
              Connect GitHub to use Cloud Agents and review pull requests
            </div>
          </div>
          <div className="settings-row-control" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {settings.githubConnected ? (
              <>
                <span className="settings-badge settings-badge-success">Connected</span>
                <button
                  className="settings-btn settings-btn-secondary"
                  onClick={() => updateSettings({ githubConnected: false })}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                className="settings-btn settings-btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => window.electronAPI?.openUrl?.('https://oasis.ac/connect/github')}
              >
                <ExternalLink size={12} />
                Connect
              </button>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">GitLab</div>
            <div className="settings-row-desc">Connect GitLab for source control and CI/CD integration</div>
          </div>
          <div className="settings-row-control" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {settings.gitlabConnected ? (
              <>
                <span className="settings-badge settings-badge-success">Connected</span>
                <button
                  className="settings-btn settings-btn-secondary"
                  onClick={() => updateSettings({ gitlabConnected: false })}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                className="settings-btn settings-btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => window.electronAPI?.openUrl?.('https://oasis.ac/connect/gitlab')}
              >
                <ExternalLink size={12} />
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="settings-section-heading">OASIS Platform</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">OASIS API</div>
            <div className="settings-row-desc">
              Connection to the OASIS backend (ONODE). Status reflects the last health check.
            </div>
          </div>
          <div className="settings-row-control" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <StatusIcon state={oasisStatus} />
            <span
              style={{
                fontSize: 12,
                color:
                  oasisStatus === 'connected'
                    ? 'var(--success)'
                    : oasisStatus === 'disconnected'
                    ? 'var(--error)'
                    : 'var(--text-secondary)',
              }}
            >
              {oasisStatus === 'connected'
                ? 'Healthy'
                : oasisStatus === 'disconnected'
                ? 'Unreachable'
                : 'Checking...'}
            </span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">API Endpoint Override</div>
            <div className="settings-row-desc">
              Custom OASIS API URL. Leave blank to use the default (OASIS_API_URL env or built-in).
            </div>
          </div>
          <div className="settings-row-control" style={{ width: 240 }}>
            <input
              type="text"
              className="settings-input"
              placeholder="https://api.oasis.ac"
              value={settings.oasisApiEndpoint}
              onChange={(e) => updateSettings({ oasisApiEndpoint: e.target.value })}
            />
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Browser</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Browser Automation</div>
            <div className="settings-row-desc">
              How the IDE opens browser previews and web interactions
            </div>
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
            <div className="settings-row-desc">Automatically open localhost links in the browser tab</div>
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
