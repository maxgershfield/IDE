import React, { useState } from 'react';
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

export const StarnetSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [connectionStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');

  return (
    <>
      <div className="settings-info-box">
        <strong>STARNET</strong> is the OASIS versioned registry for holonic assets. Assets, OAPPs,
        templates, and procedures published from the IDE are discoverable, forkable, and
        commercially licensable by any team in the network.
      </div>

      <p className="settings-section-heading">Organisation</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Namespace</div>
            <div className="settings-row-desc">
              Your STARNET org namespace (e.g. <code style={{ fontSize: 11 }}>my-org</code>).
              Assets publish under <code style={{ fontSize: 11 }}>starnet://namespace/asset</code>.
            </div>
          </div>
          <div className="settings-row-control" style={{ width: 200 }}>
            <input
              type="text"
              className="settings-input"
              placeholder="my-namespace"
              value={settings.starnetNamespace}
              onChange={(e) => updateSettings({ starnetNamespace: e.target.value })}
            />
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Publishing Defaults</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Default Visibility</div>
            <div className="settings-row-desc">
              Visibility applied when publishing assets from the IDE
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.starnetPublishVisibility}
              onChange={(e) =>
                updateSettings({
                  starnetPublishVisibility: e.target.value as 'public' | 'private' | 'friends',
                })
              }
            >
              <option value="public">Public</option>
              <option value="friends">Friends Only</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Allow Forks</div>
            <div className="settings-row-desc">
              Let other builders fork your published assets. Forks inherit parent lineage.
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.starnetAllowForks}
              onChange={(v) => updateSettings({ starnetAllowForks: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Auto-Publish on Build</div>
            <div className="settings-row-desc">
              Automatically publish a new STARNET version when a build succeeds
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.starnetAutoPublish}
              onChange={(v) => updateSettings({ starnetAutoPublish: v })}
            />
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Connection</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">STARNET Status</div>
            <div className="settings-row-desc">Connectivity to the STARNET registry</div>
          </div>
          <div
            className="settings-row-control"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {connectionStatus === 'connected' ? (
              <>
                <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                <span style={{ fontSize: 12, color: 'var(--success)' }}>Connected</span>
              </>
            ) : connectionStatus === 'disconnected' ? (
              <>
                <XCircle size={14} style={{ color: 'var(--error)' }} />
                <span style={{ fontSize: 12, color: 'var(--error)' }}>Unreachable</span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Not checked</span>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">STAR WebAPI / STARNET endpoint</div>
            <div className="settings-row-desc">
              STAR WebAPI base (origin only; the app appends <code style={{ fontSize: 11 }}>/api/...</code>).
              Example: <code style={{ fontSize: 11 }}>https://star.oasisweb4.one</code>, not{' '}
              <code style={{ fontSize: 11 }}>.../star/api</code>. When this field is set, it takes precedence
              over <code style={{ fontSize: 11 }}>STAR_API_URL</code> in <code style={{ fontSize: 11 }}>.env</code>{' '}
              for the STARNET view and for <strong>local</strong> MCP (<code style={{ fontSize: 11 }}>MCP/dist</code>{' '}
              stdio). The Composer agent&apos;s <code style={{ fontSize: 11 }}>star_*</code> tools need that same
              STAR host: use local MCP when this points at a remote STAR, or set{' '}
              <code style={{ fontSize: 11 }}>OASIS_MCP_TRANSPORT=http</code> only if you accept hosted MCP&apos;s own STAR routing.
            </div>
          </div>
          <div className="settings-row-control" style={{ width: 300 }}>
            <input
              type="text"
              className="settings-input"
              placeholder="https://star.oasisweb4.one"
              value={settings.starnetEndpointOverride}
              onChange={(e) => updateSettings({ starnetEndpointOverride: e.target.value })}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() => updateSettings({ starnetEndpointOverride: 'http://127.0.0.1:50564' })}
              >
                Local STAR
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() =>
                  updateSettings({ starnetEndpointOverride: 'https://star.oasisweb4.one' })
                }
              >
                Remote star.oasisweb4.one
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={() => updateSettings({ starnetEndpointOverride: '' })}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button
          className="settings-btn settings-btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={() => window.electronAPI?.openUrl?.('https://starnet.oasis.ac')}
        >
          <ExternalLink size={12} />
          Open STARNET
        </button>
      </div>
    </>
  );
};
