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

export const AgentsSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  return (
    <>
      <p className="settings-section-heading">Chat Behaviour</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Text Size</div>
            <div className="settings-row-desc">Adjust the conversation text size</div>
          </div>
          <div className="settings-row-control">
            <div className="settings-segmented">
              {(['default', 'large'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`settings-segmented-btn${settings.textSize === s ? ' active' : ''}`}
                  onClick={() => updateSettings({ textSize: s })}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Auto-Clear Chat</div>
            <div className="settings-row-desc">
              After periods of inactivity, open a new conversation
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.autoClearChat}
              onChange={(v) => updateSettings({ autoClearChat: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Submit with ⌘ + Enter</div>
            <div className="settings-row-desc">
              When enabled, ⌘ + Enter submits and Enter inserts a newline
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.submitWithCmdEnter}
              onChange={(v) => updateSettings({ submitWithCmdEnter: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Max Tab Count</div>
            <div className="settings-row-desc">Limit how many chat tabs can be open at once</div>
          </div>
          <div className="settings-row-control">
            <input
              type="number"
              className="settings-number-input"
              value={settings.maxTabCount}
              min={1}
              max={20}
              onChange={(e) => updateSettings({ maxTabCount: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Queue Messages</div>
            <div className="settings-row-desc">
              Behaviour when sending a message while agent is running
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.queueMessages}
              onChange={(e) =>
                updateSettings({
                  queueMessages: e.target.value as 'immediate' | 'after-current',
                })
              }
            >
              <option value="after-current">Send after current message</option>
              <option value="immediate">Send immediately</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Usage Summary</div>
            <div className="settings-row-desc">
              When to show the usage summary at the bottom of the chat pane
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.usageSummaryDisplay}
              onChange={(e) =>
                updateSettings({
                  usageSummaryDisplay: e.target.value as 'auto' | 'always' | 'never',
                })
              }
            >
              <option value="auto">Auto</option>
              <option value="always">Always</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Agent Autocomplete</div>
            <div className="settings-row-desc">Contextual suggestions while prompting Agent</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.agentAutocomplete}
              onChange={(v) => updateSettings({ agentAutocomplete: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Agent context packing</div>
            <div className="settings-row-desc">
              <strong>Search-first</strong> (recommended) sends a short system pack and a STARNET pointer
              so the model lists holons via tools—fewer API tokens. <strong>Full</strong> preloads the STARNET
              catalog table every turn (higher token use, useful when you hit rate limits on tool calls
              or want the model to see all rows without calling mcp list tools first).
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.agentContextPacking}
              onChange={(e) =>
                updateSettings({ agentContextPacking: e.target.value as 'searchFirst' | 'full' })
              }
            >
              <option value="searchFirst">Search-first (omits full STARNET table — use if tokens matter)</option>
              <option value="full">Full (recommended — STARNET list from IDE in context)</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Agent input budget</div>
            <div className="settings-row-desc">
              <strong>Normal</strong> is the default. Choose <strong>Low</strong> to shorten sent chat history, tool
              result snippets, planning doc, workspace tree, and autoloaded rules (fewer tokens per request; helps
              with OpenAI TPM rate limits).
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.agentInputBudget}
              onChange={(e) =>
                updateSettings({ agentInputBudget: e.target.value as 'normal' | 'low' })
              }
            >
              <option value="normal">Normal</option>
              <option value="low">Low (reduce tokens per request)</option>
            </select>
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Agent Review</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Start Agent Review on Commit</div>
            <div className="settings-row-desc">
              Automatically review your changes for issues after each commit
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.startAgentReviewOnCommit}
              onChange={(v) => updateSettings({ startAgentReviewOnCommit: v })}
            />
          </div>
        </div>
      </div>
    </>
  );
};
