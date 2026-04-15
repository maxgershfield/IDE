import React from 'react';
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

type Provider = 'mongodb' | 'holochain' | 'ipfs' | 'solana' | 'sqlite';

interface ProviderMeta {
  id: Provider;
  name: string;
  type: string;
  desc: string;
  statusClass: 'connected' | 'disconnected' | 'unknown';
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'mongodb',
    name: 'MongoDB',
    type: 'Document DB',
    desc: 'Default OASIS provider. Supports holons, avatars, and all OAPP data.',
    statusClass: 'unknown',
  },
  {
    id: 'holochain',
    name: 'Holochain',
    type: 'Distributed P2P',
    desc: 'Agent-centric distributed computing. Holons live in the Holochain DHT.',
    statusClass: 'unknown',
  },
  {
    id: 'ipfs',
    name: 'IPFS',
    type: 'Content-Addressed',
    desc: 'Immutable content store. Use for media, lore, and large binary assets.',
    statusClass: 'unknown',
  },
  {
    id: 'solana',
    name: 'Solana',
    type: 'Blockchain (L1)',
    desc: 'NFT minting, token-gated assets, and on-chain provenance.',
    statusClass: 'unknown',
  },
  {
    id: 'sqlite',
    name: 'SQLite (Local)',
    type: 'Local DB',
    desc: 'Offline-first. No network required. Not suitable for shared holons.',
    statusClass: 'unknown',
  },
];

export const DataProvidersSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const toggleFallback = (id: string) => {
    const current = settings.fallbackProviders;
    const next = current.includes(id) ? current.filter((p) => p !== id) : [...current, id];
    updateSettings({ fallbackProviders: next });
  };

  return (
    <>
      <div className="settings-info-box">
        <strong>WEB4 Data Providers</strong> are the storage and chain backends behind OASIS holons.
        Holons are provider-agnostic — changing the primary provider migrates storage without
        changing the application model. Fallback providers activate automatically if the primary
        becomes unreachable.
      </div>

      <p className="settings-section-heading">Primary Provider</p>
      <div className="settings-provider-grid">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`settings-provider-card${settings.primaryProvider === p.id ? ' active' : ''}`}
            onClick={() => updateSettings({ primaryProvider: p.id })}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span
                className={`settings-status-dot ${p.statusClass}`}
                style={{ display: 'inline-block' }}
              />
              <span className="settings-provider-name">{p.name}</span>
            </div>
            <div className="settings-provider-type">{p.type}</div>
          </button>
        ))}
      </div>

      <p className="settings-section-heading">Fallback Chain</p>
      <div className="settings-group">
        {PROVIDERS.filter((p) => p.id !== settings.primaryProvider).map((p) => (
          <div key={p.id} className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{p.name}</div>
              <div className="settings-row-desc">{p.desc}</div>
            </div>
            <div className="settings-row-control">
              <Toggle
                checked={settings.fallbackProviders.includes(p.id)}
                onChange={() => toggleFallback(p.id)}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="settings-section-heading">Replication</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Auto-Replicate Holons</div>
            <div className="settings-row-desc">
              Automatically write holons to all enabled providers for resilience. When a provider
              fails, another takes over without application-level changes.
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.autoReplicateHolons}
              onChange={(v) => updateSettings({ autoReplicateHolons: v })}
            />
          </div>
        </div>
      </div>

      <div className="settings-info-box" style={{ marginTop: 8 }}>
        Provider connection status will be live once the OASIS platform is running. Offline
        providers are marked red; the IDE will route to the next available fallback automatically.
      </div>
    </>
  );
};
