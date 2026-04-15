import React from 'react';
import {
  Target,
  Users,
  BookOpen,
  Mic,
  Package,
  Map,
  type LucideIcon,
} from 'lucide-react';
import { useSettings } from '../../../contexts/SettingsContext';
import { useGameDev } from '../../../contexts/GameDevContext';

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <label className="settings-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="settings-toggle-slider" />
  </label>
);

type PaletteKey = keyof NonNullable<ReturnType<typeof useSettings>['settings']['gameToolPalette']>;

const PALETTE_TOOLS: Array<{ key: PaletteKey; label: string; Icon: LucideIcon }> = [
  { key: 'quest',   label: 'Quest',   Icon: Target   },
  { key: 'npc',     label: 'NPC',     Icon: Users    },
  { key: 'lore',    label: 'Lore',    Icon: BookOpen },
  { key: 'voice',   label: 'Voice',   Icon: Mic      },
  { key: 'item',    label: 'Item',    Icon: Package  },
  { key: 'mission', label: 'Mission', Icon: Map      },
];

const PRESETS = [
  { id: 'fivem',    label: 'FiveM / GTA RP',    desc: 'Lua + CFX framework, STARNET RP pack' },
  { id: 'metaverse', label: 'Generic Metaverse', desc: 'OASIS STAR SDK, holons, STARNET' },
  { id: 'custom',   label: 'Custom',             desc: 'Define your own system prompt below' },
] as const;

export const GameDevSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { isGameDevMode, toggleGameDevMode } = useGameDev();

  const handleGameDevToggle = (v: boolean) => {
    if (v !== isGameDevMode) toggleGameDevMode();
    updateSettings({ gameDevMode: v });
  };

  const updatePalette = (key: PaletteKey, value: boolean) => {
    updateSettings({ gameToolPalette: { ...settings.gameToolPalette, [key]: value } });
  };

  return (
    <>
      <div className="settings-info-box">
        <strong>Game Dev Mode</strong> biases the OASIS agent toward metaverse and game development
        workflows, pre-loads the STAR CLI quick-reference prompt, and shows the Game Tool Palette in
        the Composer.
      </div>

      <p className="settings-section-heading">Mode</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Enable Game Dev Mode</div>
            <div className="settings-row-desc">
              Activates the game-biased system prompt and Tool Palette. This is the same toggle as
              in the Composer header.
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle checked={isGameDevMode} onChange={handleGameDevToggle} />
          </div>
        </div>
      </div>

      <p className="settings-section-heading">System Prompt Preset</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {PRESETS.map((preset) => (
          <div
            key={preset.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'var(--bg-secondary)',
              border: `1px solid ${
                settings.gameDevPromptPreset === preset.id ? 'var(--accent)' : 'var(--border)'
              }`,
              borderRadius: 6,
              cursor: 'pointer',
              gap: 12,
              transition: 'border-color 0.1s',
            }}
            onClick={() => updateSettings({ gameDevPromptPreset: preset.id })}
          >
            <input
              type="radio"
              readOnly
              checked={settings.gameDevPromptPreset === preset.id}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                {preset.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {preset.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {settings.gameDevPromptPreset === 'custom' && (
        <>
          <p className="settings-section-heading">Custom System Prompt</p>
          <div className="settings-group">
            <div style={{ padding: '12px 16px' }}>
              <textarea
                className="settings-input"
                style={{ resize: 'vertical', minHeight: 120, fontFamily: 'inherit' }}
                placeholder="Enter your custom game dev system prompt..."
                value={settings.gameDevCustomPrompt}
                onChange={(e) => updateSettings({ gameDevCustomPrompt: e.target.value })}
              />
            </div>
          </div>
        </>
      )}

      <p className="settings-section-heading">Tool Palette</p>
      <div className="settings-palette-grid">
        {PALETTE_TOOLS.map(({ key, label, Icon }) => (
          <div key={key} className="settings-palette-card">
            <Icon size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span className="settings-palette-label">{label}</span>
            <Toggle
              checked={settings.gameToolPalette[key]}
              onChange={(v) => updatePalette(key, v)}
            />
          </div>
        ))}
      </div>

      <p className="settings-section-heading">ElevenLabs Voice Credits</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Voice Credits Balance</div>
            <div className="settings-row-desc">
              Characters remaining in your ElevenLabs plan. Requires an API key in Models settings.
            </div>
          </div>
          <div className="settings-row-control">
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>—</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">ElevenLabs Dashboard</div>
          </div>
          <div className="settings-row-control">
            <button
              className="settings-btn settings-btn-secondary"
              onClick={() => window.electronAPI?.openUrl?.('https://elevenlabs.io/app')}
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
