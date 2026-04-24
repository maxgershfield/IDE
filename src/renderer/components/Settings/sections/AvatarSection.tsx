import React from 'react';
import { LogOut, Link, Shield, ExternalLink } from 'lucide-react';
import { useSettings } from '../../../contexts/SettingsContext';
import { useAuth } from '../../../contexts/AuthContext';

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <label className="settings-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="settings-toggle-slider" />
  </label>
);

export const AvatarSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { loggedIn, username, avatarId, logout } = useAuth();

  const initial = username ? username.charAt(0).toUpperCase() : '?';

  // The OASIS Avatar ID is the cryptographically signed identity that links to
  // wallet, karma, and STARNET publishing — it is already the "linked wallet" identity.
  const hasIdentity = loggedIn && !!avatarId;
  const shortAvatarId = avatarId
    ? `${avatarId.slice(0, 10)}…${avatarId.slice(-6)}`
    : null;

  return (
    <>
      <p className="settings-section-heading">Identity</p>

      {loggedIn ? (
        <div className="settings-avatar-header">
          <div className="settings-avatar-orb">{initial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="settings-avatar-name">{username}</div>
            <div className="settings-avatar-id">
              {avatarId ? `ID: ${avatarId.slice(0, 28)}…` : 'No avatar ID'}
            </div>
          </div>
          <div className="settings-avatar-karma">
            <div className="settings-karma-value">—</div>
            <div className="settings-karma-label">Karma</div>
          </div>
        </div>
      ) : (
        <div className="settings-info-box">
          <strong>Not logged in.</strong> Log in to link your OASIS Avatar and enable karma,
          reputation, and STARNET publishing.
        </div>
      )}

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Avatar Sync</div>
            <div className="settings-row-desc">
              Persist session identity across restarts. Conversations and actions are linked to your
              Avatar.
            </div>
          </div>
          <div className="settings-row-control">
            <Toggle
              checked={settings.avatarSyncEnabled}
              onChange={(v) => updateSettings({ avatarSyncEnabled: v })}
            />
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Wallet</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div
              className="settings-row-label"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Link size={14} />
              Linked Wallet
            </div>
            <div className="settings-row-desc">
              {hasIdentity
                ? 'Your OASIS Avatar is your cryptographically signed identity. Wallet linking is managed through your Avatar.'
                : 'Log in to link your OASIS Avatar identity and wallet.'}
            </div>
          </div>
          <div className="settings-row-control" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            {hasIdentity ? (
              <>
                <span className="settings-badge settings-badge-success">Linked</span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'Fira Code, monospace',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {shortAvatarId}
                </span>
              </>
            ) : (
              <span className="settings-badge settings-badge-warning">Not linked</span>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div
              className="settings-row-label"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Shield size={14} />
              NFT Entitlement
            </div>
            <div className="settings-row-desc">
              Founder Annual ($249) or Founder Lifetime ($449) grants grandfathered GA access
            </div>
          </div>
          <div className="settings-row-control" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="settings-badge settings-badge-warning">None</span>
            <button
              className="settings-btn settings-btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => window.electronAPI?.openUrl?.('https://oasis.ac/founder')}
            >
              <ExternalLink size={11} />
              Details
            </button>
          </div>
        </div>
      </div>

      <p className="settings-section-heading">Reputation</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Karma Score</div>
            <div className="settings-row-desc">
              Accumulated from STARNET contributions, published assets, and peer recognition
            </div>
          </div>
          <div className="settings-row-control">
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--warning)' }}>—</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Reputation Tier</div>
            <div className="settings-row-desc">Increases trust weighting on STARNET assets</div>
          </div>
          <div className="settings-row-control">
            <span className="settings-badge settings-badge-accent">New Builder</span>
          </div>
        </div>
      </div>

      {loggedIn && (
        <>
          <p className="settings-section-heading">Session</p>
          <div className="settings-group">
            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Log Out</div>
                <div className="settings-row-desc">
                  Signs out this session and clears stored credentials
                </div>
              </div>
              <div className="settings-row-control">
                <button
                  className="settings-btn settings-btn-danger"
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={logout}
                >
                  <LogOut size={13} />
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
