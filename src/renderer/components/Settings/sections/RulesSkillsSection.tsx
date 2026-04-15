import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useSettings, FilePathRule } from '../../../contexts/SettingsContext';

export const RulesSkillsSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [newAlwaysRule, setNewAlwaysRule] = useState('');
  const [newGlob, setNewGlob] = useState('');
  const [newRuleContent, setNewRuleContent] = useState('');

  const addAlwaysRule = () => {
    const trimmed = newAlwaysRule.trim();
    if (!trimmed) return;
    updateSettings({ alwaysAppliedRules: [...settings.alwaysAppliedRules, trimmed] });
    setNewAlwaysRule('');
  };

  const removeAlwaysRule = (idx: number) => {
    updateSettings({
      alwaysAppliedRules: settings.alwaysAppliedRules.filter((_, i) => i !== idx),
    });
  };

  const addFilePathRule = () => {
    const glob = newGlob.trim();
    const content = newRuleContent.trim();
    if (!glob || !content) return;
    const rule: FilePathRule = { glob, content };
    updateSettings({ filePathRules: [...settings.filePathRules, rule] });
    setNewGlob('');
    setNewRuleContent('');
  };

  const removeFilePathRule = (idx: number) => {
    updateSettings({
      filePathRules: settings.filePathRules.filter((_, i) => i !== idx),
    });
  };

  return (
    <>
      <div className="settings-info-box">
        <strong>Rules</strong> provide domain-specific knowledge and coding standards to the agent.
        Always-applied rules are included in every conversation. File-path rules activate only when
        the agent references matching files.
      </div>

      <p className="settings-section-heading">Always-Applied Rules</p>
      <div className="settings-group">
        {settings.alwaysAppliedRules.length === 0 && (
          <div className="settings-empty" style={{ padding: '16px' }}>
            No always-applied rules yet
          </div>
        )}
        {settings.alwaysAppliedRules.map((rule, i) => (
          <div key={i} className="settings-rule-item">
            <span className="settings-rule-text">{rule}</span>
            <button
              type="button"
              className="settings-btn settings-btn-danger"
              style={{ padding: '3px 6px' }}
              onClick={() => removeAlwaysRule(i)}
              aria-label="Remove rule"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
          <input
            type="text"
            className="settings-input"
            placeholder="Add a rule (e.g. use OASISResult<T> for all return types)"
            value={newAlwaysRule}
            onChange={(e) => setNewAlwaysRule(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAlwaysRule()}
          />
          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            onClick={addAlwaysRule}
            style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >
            <Plus size={13} />
            Add
          </button>
        </div>
      </div>

      <p className="settings-section-heading">File-Path Rules</p>
      <div className="settings-group">
        {settings.filePathRules.length === 0 && (
          <div className="settings-empty" style={{ padding: '16px' }}>
            No file-path rules yet
          </div>
        )}
        {settings.filePathRules.map((rule, i) => (
          <div key={i} className="settings-rule-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                marginBottom: 4,
              }}
            >
              <span
                className="settings-badge settings-badge-accent"
                style={{ fontFamily: 'Fira Code, monospace', fontSize: 11 }}
              >
                {rule.glob}
              </span>
              <button
                type="button"
                className="settings-btn settings-btn-danger"
                style={{ padding: '3px 6px' }}
                onClick={() => removeFilePathRule(i)}
                aria-label="Remove rule"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <span className="settings-rule-text" style={{ fontSize: 11 }}>
              {rule.content}
            </span>
          </div>
        ))}
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            className="settings-input"
            placeholder="Glob pattern (e.g. src/**/*.tsx)"
            value={newGlob}
            onChange={(e) => setNewGlob(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="settings-input"
              placeholder="Rule content for matching files"
              value={newRuleContent}
              onChange={(e) => setNewRuleContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFilePathRule()}
            />
            <button
              type="button"
              className="settings-btn settings-btn-secondary"
              onClick={addFilePathRule}
              style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
            >
              <Plus size={13} />
              Add
            </button>
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Skills</p>
      <div className="settings-group">
        <div className="settings-empty">
          <p>Skills provide specialised capabilities and workflows to the agent.</p>
          <p style={{ marginTop: 8 }}>
            Place skill files in <code style={{ fontSize: 11 }}>.oasis/skills/</code> inside your
            workspace to activate them.
          </p>
        </div>
      </div>
    </>
  );
};
