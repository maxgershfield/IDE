import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { buildPortalUrl } from '../../utils/portalUrl';
import './PortalActivityBanner.css';

const BASELINE_KEY = 'oasis-ide:portal-activity-baseline-v1';

type Baseline = { avatarId: string; a2a: number; nft: number | null };

function readBaseline(): Baseline | null {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Baseline;
    if (typeof o.avatarId !== 'string' || typeof o.a2a !== 'number') return null;
    if (o.nft != null && typeof o.nft !== 'number') return null;
    return o;
  } catch {
    return null;
  }
}

function writeBaseline(b: Baseline): void {
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

/**
 * When the user enables portal activity notifications, polls the same A2A + STAR NFT
 * sources the OASIS Web Portal uses, and shows a small banner on increases.
 */
export const PortalActivityBanner: React.FC = () => {
  const { loggedIn, avatarId } = useAuth();
  const { settings } = useSettings();
  const { portalBaseUrl, portalActivityNotify, portalActivityPollSec } = settings;
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const baselineRef = useRef<Baseline | null>(readBaseline());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollSec = Math.min(3600, Math.max(30, portalActivityPollSec || 120));

  const markSeen = useCallback((a2a: number, nft: number | null) => {
    if (!avatarId) return;
    const next: Baseline = { avatarId, a2a, nft };
    baselineRef.current = next;
    writeBaseline(next);
  }, [avatarId]);

  const openPortal = useCallback(async () => {
    if (typeof window.electronAPI?.pollPortalActivity === 'function' && avatarId) {
      const r = await window.electronAPI.pollPortalActivity();
      if (r?.ok) {
        markSeen(r.a2aMessageCount, r.nftCount);
      }
    }
    const u = buildPortalUrl(portalBaseUrl);
    void window.electronAPI?.openUrl?.(u);
    setVisible(false);
    setMessage(null);
  }, [avatarId, markSeen, portalBaseUrl]);

  const runPoll = useCallback(async () => {
    if (!loggedIn || !avatarId || !settings.portalActivityNotify) return;
    if (typeof window.electronAPI?.pollPortalActivity !== 'function') return;
    const res = await window.electronAPI.pollPortalActivity();
    if (!res || !res.ok) return;
    const { a2aMessageCount, nftCount } = res;
    const prev = baselineRef.current;
    if (!prev || prev.avatarId !== avatarId) {
      markSeen(a2aMessageCount, nftCount);
      return;
    }
    const a2aUp = a2aMessageCount > prev.a2a;
    const nftUp =
      prev.nft != null && nftCount != null && typeof nftCount === 'number' && nftCount > prev.nft;
    if (!a2aUp && !nftUp) {
      return;
    }
    const parts: string[] = [];
    if (a2aUp) {
      const d = a2aMessageCount - prev.a2a;
      parts.push(
        d === 1 ? '1 new A2A message' : `${d} new A2A messages`
      );
    }
    if (nftUp && nftCount != null) {
      const d = nftCount - (prev.nft as number);
      parts.push(
        d === 1 ? '1 new NFT on your STAR list' : `${d} new NFTs on your STAR list`
      );
    }
    setMessage(`Portal activity: ${parts.join(' · ')}. Open the portal to see details.`);
    setVisible(true);
  }, [avatarId, loggedIn, markSeen, settings.portalActivityNotify]);

  useEffect(() => {
    baselineRef.current = readBaseline();
  }, [avatarId]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!loggedIn || !portalActivityNotify) {
      return;
    }
    void runPoll();
    timerRef.current = setInterval(() => {
      void runPoll();
    }, pollSec * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loggedIn, portalActivityNotify, pollSec, runPoll, avatarId]);

  const onDismiss = useCallback(async () => {
    setVisible(false);
    setMessage(null);
    if (typeof window.electronAPI?.pollPortalActivity !== 'function' || !avatarId) return;
    const r = await window.electronAPI.pollPortalActivity();
    if (r?.ok) {
      markSeen(r.a2aMessageCount, r.nftCount);
    }
  }, [avatarId, markSeen]);

  if (!visible || !message) return null;

  return (
    <div className="portal-activity-banner" role="status">
      <div className="portal-activity-banner-text">{message}</div>
      <div className="portal-activity-banner-actions">
        <button type="button" className="portal-activity-banner-btn portal-activity-banner-btn--primary" onClick={openPortal}>
          Open portal
        </button>
        <button
          type="button"
          className="portal-activity-banner-btn"
          onClick={onDismiss}
        >
          Dismiss
        </button>
        <button
          type="button"
          className="portal-activity-banner-dismiss"
          onClick={onDismiss}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    </div>
  );
};
