import React from 'react';
import { Zap, BarChart2, Target, Cpu, type LucideIcon } from 'lucide-react';
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

type RoutingTier = 'fast' | 'balanced' | 'frontier' | 'specialist';

interface TierMeta {
  id: RoutingTier;
  Icon: LucideIcon;
  name: string;
  desc: string;
}

const TIERS: TierMeta[] = [
  { id: 'fast',       Icon: Zap,       name: 'Fast',       desc: 'Cheap, quick completions' },
  { id: 'balanced',   Icon: BarChart2, name: 'Balanced',   desc: 'Quality and cost tradeoff' },
  { id: 'frontier',   Icon: Target,    name: 'Frontier',   desc: 'Best model for hard tasks' },
  { id: 'specialist', Icon: Cpu,       name: 'Specialist', desc: 'Code, vision, long context' },
];

export const AIRoutingSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  return (
    <>
      <div className="settings-info-box">
        <strong>AI Routing</strong> selects the most cost-effective model that meets the quality bar
        for each task. <strong>Holonic BRAID</strong> compiles reasoning graphs once and re-runs
        them with smaller models, reducing cost on recurring patterns.
      </div>

      <p className="settings-section-heading">Default Routing Tier</p>
      <div className="settings-tier-grid">
        {TIERS.map(({ id, Icon, name, desc }) => (
          <button
            key={id}
            type="button"
            className={`settings-tier-card${settings.routingTier === id ? ' active' : ''}`}
            onClick={() => updateSettings({ routingTier: id })}
          >
            <div className="settings-tier-icon">
              <Icon size={20} strokeWidth={1.5} />
            </div>
            <div className="settings-tier-name">{name}</div>
            <div className="settings-tier-desc">{desc}</div>
          </button>
        ))}
      </div>

      <p className="settings-section-heading">Transparency</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Show Which Model Ran</div>
            <div className="settings-row-desc">
              Display the model (or tier) used at the bottom of each chat response
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.showModelInChat}
              onChange={(v) => updateSettings({ showModelInChat: v })}
            />
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Holonic BRAID</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Reuse Cached Reasoning Graphs</div>
            <div className="settings-row-desc">
              When BRAID has compiled a graph for this class of task, reuse it with a smaller model.
              Reduces cost on repeated patterns.
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.braidGraphReuse}
              onChange={(v) => updateSettings({ braidGraphReuse: v })}
            />
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Org Policy</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Maximum Allowed Tier</div>
            <div className="settings-row-desc">
              Pin an upper limit on the routing tier. Useful for cost management in team
              deployments. "None" means no restriction.
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.maxRoutingTier}
              onChange={(e) =>
                updateSettings({
                  maxRoutingTier: e.target.value as RoutingTier | 'none',
                })
              }
            >
              <option value="none">No limit</option>
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="frontier">Frontier</option>
              <option value="specialist">Specialist</option>
            </select>
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Cost Budgets</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Per Session Cap (USD)</div>
            <div className="settings-row-desc">
              Soft spending limit per composer session. Set to 0 to disable.
            </div>
          </div>
          <div className="settings-row-control">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>$</span>
              <input
                type="number"
                className="settings-number-input"
                value={settings.costBudgetPerSession}
                min={0}
                step={0.5}
                onChange={(e) =>
                  updateSettings({ costBudgetPerSession: Number(e.target.value) })
                }
              />
            </div>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Monthly Cap (USD)</div>
            <div className="settings-row-desc">
              Soft monthly spending limit. Set to 0 to disable.
            </div>
          </div>
          <div className="settings-row-control">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>$</span>
              <input
                type="number"
                className="settings-number-input"
                value={settings.costBudgetPerMonth}
                min={0}
                step={1}
                onChange={(e) =>
                  updateSettings({ costBudgetPerMonth: Number(e.target.value) })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
