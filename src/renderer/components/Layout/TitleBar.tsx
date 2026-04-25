import React, { useEffect, useRef, useState } from 'react';
import { Settings, LogOut, LogIn, ExternalLink, MessageSquare } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { buildPortalUrl } from '../../utils/portalUrl';
import { useAuth } from '../../contexts/AuthContext';
import { useA2A } from '../../contexts/A2AContext';
import { LoginModal } from '../Auth/LoginModal';
import './TitleBar.css';

/**
 * Full-width title bar that sits above all IDE panels.
 *
 * On macOS (hiddenInset), the native traffic lights are painted at ~(12, 10).
 * This bar reserves that space and acts as the window drag handle.
 * Interactive children must opt out of drag with -webkit-app-region: no-drag.
 */
export const TitleBar: React.FC = () => {
  const { openSettings, settings } = useSettings();
  const { loggedIn, username, logout } = useAuth();
  const { activeTab, setActiveTab } = useA2A();
  const [showLogin, setShowLogin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = username
    ? username.slice(0, 2).toUpperCase()
    : '?';

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleAvatarClick = () => {
    if (!loggedIn) {
      setShowLogin(true);
    } else {
      setShowMenu((v) => !v);
    }
  };

  const handleLogout = async () => {
    setShowMenu(false);
    await logout();
  };

  return (
    <>
      <div className="title-bar">
        <div className="title-bar-traffic-zone" />

        {/* ── Avatar / login chip ── right after traffic lights */}
        <div className="title-bar-avatar-zone" ref={menuRef}>
          {loggedIn ? (
            <button
              type="button"
              className="title-bar-avatar-btn"
              title={username ?? 'Avatar'}
              aria-label="Avatar menu"
              onClick={handleAvatarClick}
            >
              <span className="title-bar-avatar-orb">{initials}</span>
              <span className="title-bar-avatar-name">{username}</span>
            </button>
          ) : (
            <button
              type="button"
              className="title-bar-login-btn"
              onClick={() => setShowLogin(true)}
            >
              <LogIn size={12} strokeWidth={1.8} />
              Sign in
            </button>
          )}

          {showMenu && (
            <div className="title-bar-avatar-menu">
              <div className="title-bar-avatar-menu-user">{username}</div>
              <button
                type="button"
                className="title-bar-avatar-menu-item"
                onClick={handleLogout}
              >
                <LogOut size={12} /> Log out
              </button>
            </div>
          )}
        </div>

        <span className="title-bar-label">OASIS IDE</span>
        <div className="title-bar-spacer" />

        <button
          type="button"
          className="title-bar-portal-btn"
          title="Open OASIS Web Portal in the default browser (wallets, NFTs, stats)"
          aria-label="Open OASIS Web Portal in browser"
          onClick={() => {
            const u = buildPortalUrl(settings.portalBaseUrl);
            void window.electronAPI?.openUrl?.(u);
          }}
        >
          <ExternalLink size={12} strokeWidth={1.8} />
          <span className="title-bar-portal-label">Portal</span>
        </button>

        <button
          type="button"
          className={`title-bar-message-btn${activeTab === 'inbox' ? ' active' : ''}`}
          title="Open A2A inbox"
          aria-label="Open A2A inbox"
          aria-pressed={activeTab === 'inbox'}
          onClick={() => setActiveTab(activeTab === 'inbox' ? 'composer' : 'inbox')}
        >
          <MessageSquare size={14} strokeWidth={1.7} />
        </button>

        <button
          type="button"
          className="title-bar-settings-btn"
          title="Settings"
          aria-label="Open Settings"
          onClick={() => openSettings('general')}
        >
          <Settings size={15} strokeWidth={1.6} />
        </button>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
};
