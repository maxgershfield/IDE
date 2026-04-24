import React from 'react';
import { ExternalLink } from 'lucide-react';

interface UsageBarProps {
  label: string;
  used: number;
  total: number;
  unit?: string;
}

const UsageBar: React.FC<UsageBarProps> = ({ label, used, total, unit = '%' }) => {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : used;
  const fillClass =
    pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : '';

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
          {unit === '%' ? `${Math.round(pct)}%` : `${used} / ${total} ${unit}`}
        </span>
      </div>
      <div className="settings-progress-bar">
        <div
          className={`settings-progress-fill${fillClass ? ` ${fillClass}` : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0/mo',
    features: ['Core editor shell', 'Limited MCP/STAR calls', 'No bundled AI credits'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$20–35/mo',
    features: ['Full IDE + MCP', 'STARNET hooks', 'Monthly AI credits', 'Avatar sync'],
  },
  {
    id: 'pro-plus',
    name: 'Pro+',
    price: '$50–80/mo',
    features: ['Higher credit pools', 'Priority routing', 'All Pro features'],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$30–50/seat',
    features: ['Shared org assets', 'Admin basics', 'Volume steps'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    features: ['SSO', 'Audit exports', 'Data residency', 'SOP tooling'],
  },
];

export const PlanUsageSection: React.FC = () => {
  const currentTier = 'free';

  const handleOpenBillingPortal = () => {
    if (window.electronAPI?.openUrl) {
      window.electronAPI.openUrl('https://oasis.ac/billing');
    }
  };

  return (
    <>
      <p className="settings-section-heading">Current Plan</p>
      <div className="settings-plan-card">
        <div className="settings-plan-card-header">
          <span className="settings-plan-name">Free</span>
          <span className="settings-badge settings-badge-accent">Current</span>
        </div>
        <div className="settings-plan-price">$0 / month</div>
        <div className="settings-plan-reset" style={{ marginTop: 8 }}>
          Upgrade to unlock AI credits, STARNET publishing, and Avatar sync.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="settings-btn settings-btn-secondary" onClick={handleOpenBillingPortal}>
            Manage
          </button>
          <button className="settings-btn settings-btn-primary" onClick={handleOpenBillingPortal}>
            Upgrade
          </button>
        </div>
      </div>

      <p className="settings-section-heading">Included Usage</p>
      <div className="settings-group">
        <div style={{ padding: '16px 16px 8px' }}>
          <UsageBar label="Auto requests" used={0} total={100} />
          <UsageBar label="API requests" used={0} total={100} />
        </div>
        <div className="settings-row" style={{ minHeight: 'auto', paddingTop: 10, paddingBottom: 10 }}>
          <div className="settings-row-info">
            <div className="settings-row-label">On-Demand Usage</div>
            <div className="settings-row-desc">
              Billed in arrears after monthly limit is reached
            </div>
          </div>
          <div className="settings-row-control">
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
              $0 / $100
            </span>
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Founder Access</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">NFT Entitlement</div>
            <div className="settings-row-desc">
              Link a Founder Annual or Founder Lifetime NFT to unlock grandfathered access
            </div>
          </div>
          <div className="settings-row-control">
            <span className="settings-badge settings-badge-warning">Not linked</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Learn about Founder NFTs</div>
            <div className="settings-row-desc">$249 Annual · $449 Lifetime (GA baseline)</div>
          </div>
          <div className="settings-row-control">
            <button
              className="settings-btn settings-btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => window.electronAPI?.openUrl?.('https://oasis.ac/founder')}
            >
              <ExternalLink size={12} />
              Details
            </button>
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Available Plans</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className="settings-plan-card"
            style={{
              border: tier.id === currentTier ? '1px solid var(--accent)' : undefined,
              marginBottom: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="settings-plan-name" style={{ fontSize: 14 }}>
                {tier.name}
              </div>
              {tier.id === currentTier && (
                <span className="settings-badge settings-badge-accent" style={{ fontSize: 10 }}>
                  Active
                </span>
              )}
            </div>
            <div className="settings-plan-price" style={{ fontSize: 12, marginTop: 2 }}>
              {tier.price}
            </div>
            <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
              {tier.features.map((f) => (
                <li
                  key={f}
                  style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
};
