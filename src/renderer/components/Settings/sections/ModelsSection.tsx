import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useSettings } from '../../../contexts/SettingsContext';
import { IDE_CHAT_MODELS, IdeChatProviderId } from '../../../constants/ideChatModels';

const PROVIDER_LABELS: Record<IdeChatProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
};

const PROVIDER_ORDER: IdeChatProviderId[] = ['openai', 'anthropic', 'google', 'xai'];

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <label className="settings-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="settings-toggle-slider" />
  </label>
);

const ApiKeyField: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, placeholder, value, onChange }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <div className="settings-row-label">{label}</div>
      </div>
      <div className="settings-row-control" style={{ width: 280 }}>
        <div className="settings-api-key-row">
          <input
            type={visible ? 'text' : 'password'}
            className="settings-api-key-input"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            style={{ padding: '5px 8px', minWidth: 32 }}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide key' : 'Show key'}
          >
            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ModelsSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const toggleModel = (modelId: string) => {
    const current = settings.enabledModels;
    const next = current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId];
    updateSettings({ enabledModels: next });
  };

  const updateApiKey = (provider: keyof typeof settings.apiKeys, value: string) => {
    updateSettings({ apiKeys: { ...settings.apiKeys, [provider]: value } });
  };

  const modelsByProvider = PROVIDER_ORDER.map((provider) => ({
    provider,
    label: PROVIDER_LABELS[provider],
    models: IDE_CHAT_MODELS.filter((m) => m.provider === provider),
  }));

  return (
    <>
      <p className="settings-section-heading">Available Models</p>
      <div className="settings-info-box">
        <strong>Enable or disable models</strong> to control which ones appear in the model picker.
        Disabled models are excluded from auto-routing and manual selection.
      </div>

      {modelsByProvider.map(({ provider, label, models }) => (
        <div key={provider}>
          <p
            className="settings-section-heading"
            style={{ fontSize: 11, marginTop: 16, marginBottom: 8 }}
          >
            {label}
          </p>
          <div className="settings-model-list">
            {models.map((m) => (
              <div key={m.id} className="settings-model-row">
                <div className="settings-model-info">
                  <span className="settings-model-label">{m.label}</span>
                  <span className="settings-model-provider">{m.id}</span>
                </div>
                <Toggle
                  checked={settings.enabledModels.includes(m.id)}
                  onChange={() => toggleModel(m.id)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="settings-section-heading" style={{ marginTop: 24 }}>
        API Keys
      </p>
      <div className="settings-info-box">
        Keys are stored in your local settings file and passed to the OASIS main process. They are
        never sent to OASIS servers — they go directly to the respective provider.
      </div>
      <div className="settings-group">
        <ApiKeyField
          label="OpenAI API Key"
          placeholder="sk-..."
          value={settings.apiKeys.openai}
          onChange={(v) => updateApiKey('openai', v)}
        />
        <ApiKeyField
          label="Anthropic API Key"
          placeholder="sk-ant-..."
          value={settings.apiKeys.anthropic}
          onChange={(v) => updateApiKey('anthropic', v)}
        />
        <ApiKeyField
          label="Google AI Key"
          placeholder="AIza..."
          value={settings.apiKeys.google}
          onChange={(v) => updateApiKey('google', v)}
        />
        <ApiKeyField
          label="xAI API Key"
          placeholder="xai-..."
          value={settings.apiKeys.xai}
          onChange={(v) => updateApiKey('xai', v)}
        />
        <ApiKeyField
          label="ElevenLabs API Key"
          placeholder="el-..."
          value={settings.apiKeys.elevenlabs}
          onChange={(v) => updateApiKey('elevenlabs', v)}
        />
      </div>
    </>
  );
};
