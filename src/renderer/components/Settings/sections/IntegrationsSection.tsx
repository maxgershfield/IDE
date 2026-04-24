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
              ONODE base URL (paths use <code style={{ fontSize: 11 }}>/api/...</code>). If{' '}
              <code style={{ fontSize: 11 }}>OASIS_API_URL</code> is set in{' '}
              <code style={{ fontSize: 11 }}>.env</code>, it wins over this field. Leave blank for local{' '}
              <code style={{ fontSize: 11 }}>127.0.0.1:5003</code> when env is unset.
            </div>
          </div>
          <div className="settings-row-control" style={{ width: 280 }}>
            <input
              type="text"
              className="settings-input"
              placeholder="https://api.oasisweb4.one"
              value={settings.oasisApiEndpoint}
              onChange={(e) => updateSettings({ oasisApiEndpoint: e.target.value })}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() => updateSettings({ oasisApiEndpoint: 'http://127.0.0.1:5003' })}
              >
                Local
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() => updateSettings({ oasisApiEndpoint: 'https://api.oasisweb4.one' })}
              >
                Remote api.oasisweb4.one
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() => updateSettings({ oasisApiEndpoint: '' })}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="settings-section-heading">OASIS Web Portal</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Portal URL</div>
            <div className="settings-row-desc">
              Where the browser opens for &quot;Open portal&quot; (wallets, NFTs, stats). Use the same
              environment you deploy the portal to, for example <code style={{ fontSize: 11 }}>/portal/</code> on
              oasisweb4.one.
            </div>
          </div>
          <div className="settings-row-control" style={{ width: 300 }}>
            <input
              type="text"
              className="settings-input"
              placeholder="https://oasisweb4.one/portal/"
              value={settings.portalBaseUrl}
              onChange={(e) => updateSettings({ portalBaseUrl: e.target.value })}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() => updateSettings({ portalBaseUrl: 'https://oasisweb4.one/portal/' })}
              >
                Production
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                onClick={() => {
                  const b = (settings.portalBaseUrl || 'https://oasisweb4.one/portal/').replace(/\/?$/, '/');
                  void window.electronAPI?.openUrl?.(b);
                }}
              >
                <ExternalLink size={12} />
                Open in browser
              </button>
            </div>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Notify when portal data changes</div>
            <div className="settings-row-desc">
              Periodically checks A2A inbox and STAR NFT list (same APIs the portal uses). Shows a short
              alert in the IDE if new messages or NFTs appear. Uses your STARNET endpoint from the STARNET
              settings tab.
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.portalActivityNotify}
              onChange={(v) => updateSettings({ portalActivityNotify: v })}
            />
          </div>
        </div>
        {settings.portalActivityNotify ? (
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">Poll interval (seconds)</div>
              <div className="settings-row-desc">How often to check for new activity. Minimum 30.</div>
            </div>
            <div className="settings-row-control">
              <input
                type="number"
                className="settings-input"
                style={{ maxWidth: 100 }}
                min={30}
                max={3600}
                value={settings.portalActivityPollSec}
                onChange={(e) => {
                  const n = Math.min(3600, Math.max(30, Math.floor(Number(e.target.value) || 120)));
                  updateSettings({ portalActivityPollSec: n });
                }}
              />
            </div>
          </div>
        ) : null}
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
