import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Ticket } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchEntitlementSlotsView,
  type FetchEntitlementSlotsResult,
} from '../../services/entitlementSlotsService';
import { ENTITLEMENT_CATALOG_VERSION } from '../../../shared/entitlementSlotsTypes';
import { PassSkuMiniLockup } from './PassSkuMiniLockup';
import './EntitlementSlotsPanel.css';

function statusLabel(s: FetchEntitlementSlotsResult['rows'][0]['effectiveStatus']): string {
  if (s === 'active') return 'Active';
  if (s === 'pending') return 'Pending';
  return 'Locked';
}

/** Same rules as `pass-lockup-editor.html` (formatDisplayNameFromUsername). */
function formatPassDisplayName(username: string): string {
  const u = username.replace(/^@/, '');
  return u
    .split(/[._\s-]+/)
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

export const EntitlementSlotsPanel: React.FC = () => {
  const { settings } = useSettings();
  const { loggedIn, refreshStatus, username } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FetchEntitlementSlotsResult | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const spinIframeRef = useRef<HTMLIFrameElement>(null);

  const passDisplayName = loggedIn && username ? formatPassDisplayName(username) : null;
  const passHandle =
    loggedIn && username ? (username.startsWith('@') ? username : `@${username}`) : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refreshStatus();
      const jwt = (await window.electronAPI?.authGetToken?.()) ?? null;
      const result = await fetchEntitlementSlotsView(settings.oasisApiEndpoint, jwt);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [settings.oasisApiEndpoint, refreshStatus]);

  useEffect(() => {
    void load();
  }, [load, loggedIn]);

  const rows = data?.rows ?? [];
  const selectedRow = selectedSkuId ? rows.find((r) => r.skuId === selectedSkuId) : undefined;

  /** Keep a pass selected whenever the catalog has rows so the detail panel stays visible. */
  useEffect(() => {
    if (rows.length === 0) {
      setSelectedSkuId(null);
      return;
    }
    setSelectedSkuId((prev) => {
      if (prev && rows.some((r) => r.skuId === prev)) return prev;
      return rows[0].skuId;
    });
  }, [rows]);

  const handleCardActivate = (row: FetchEntitlementSlotsResult['rows'][0]) => {
    setSelectedSkuId(row.skuId);
  };

  const sendPassIdentityToSpinPreview = useCallback(() => {
    const win = spinIframeRef.current?.contentWindow;
    if (!win) return;
    if (loggedIn && username) {
      win.postMessage(
        {
          type: 'oasis-pass-identity',
          displayName: formatPassDisplayName(username),
          handle: username.startsWith('@') ? username : `@${username}`,
        },
        '*'
      );
    } else {
      win.postMessage({ type: 'oasis-pass-identity', displayName: null, handle: null }, '*');
    }
  }, [loggedIn, username]);

  useEffect(() => {
    sendPassIdentityToSpinPreview();
  }, [sendPassIdentityToSpinPreview, selectedSkuId]);

  const spinPreviewSrc =
    selectedRow != null
      ? `${import.meta.env.BASE_URL}pass-lockup-editor.html?embed=1&skuId=${encodeURIComponent(selectedRow.skuId)}`
      : '';

  return (
    <div className="ent-dashboard">
      <header className="ent-topbar">
        <Ticket size={16} strokeWidth={1.5} aria-hidden />
        <span className="ent-topbar-title">IDE Passes</span>
        <span className="ent-topbar-spacer" />
        <button
          type="button"
          className="ent-btn ent-btn-primary"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={12} className={loading ? 'ent-spin' : ''} />
          Refresh
        </button>
      </header>

      {data?.info ? (
        <div className="ent-banner ent-banner--info" role="status">
          {data.info}
        </div>
      ) : null}

      {data?.error ? (
        <div className="ent-banner ent-banner--warn" role="status">
          {data.error}
        </div>
      ) : null}

      {data?.catalogMismatch ? (
        <div className="ent-banner" role="status">
          Catalog version from server ({data.catalogVersion}) differs from this IDE build (
          {ENTITLEMENT_CATALOG_VERSION}). Update the app for the latest pass list.
        </div>
      ) : null}

      <div className="ent-body">
        <div className="ent-scroll">
          {!loggedIn ? (
            <p className="ent-desc" style={{ marginBottom: 12 }}>
              Log in to verify which passes are linked to your avatar. Slots below show the full catalog;
              states stay locked until ONODE verifies holdings. Pass artwork on each card uses sample names until
              you log in, then shows your avatar username.
            </p>
          ) : null}

          <div className="ent-grid">
            {rows.map((row) => (
              <article
                key={row.skuId}
                role="button"
                tabIndex={0}
                className={`ent-card${
                  row.effectiveStatus === 'active'
                    ? ' ent-card--active'
                    : row.effectiveStatus === 'pending'
                      ? ' ent-card--pending'
                      : ''
                }${selectedSkuId === row.skuId ? ' ent-card--selected' : ''}`}
                onClick={() => handleCardActivate(row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardActivate(row);
                  }
                }}
              >
                <PassSkuMiniLockup
                  skuId={row.skuId}
                  displayName={passDisplayName}
                  handle={passHandle}
                />
                <div className="ent-card-head">
                  <h2 className="ent-card-title">{row.title}</h2>
                  <span
                    className={`ent-pill ent-pill--${
                      row.effectiveStatus === 'active'
                        ? 'active'
                        : row.effectiveStatus === 'pending'
                          ? 'pending'
                          : 'locked'
                    }`}
                  >
                    {statusLabel(row.effectiveStatus)}
                  </span>
                </div>
                <div className="ent-cat">{row.category}</div>
              </article>
            ))}
          </div>
        </div>

        <aside className="ent-detail-panel" aria-label="Pass details">
          {selectedRow ? (
            <>
              <div className="ent-detail-scroll">
                <div className="ent-detail-head">
                  <h2 className="ent-detail-title">{selectedRow.title}</h2>
                </div>
                <div className="ent-detail-meta">
                  <span
                    className={`ent-pill ent-pill--${
                      selectedRow.effectiveStatus === 'active'
                        ? 'active'
                        : selectedRow.effectiveStatus === 'pending'
                          ? 'pending'
                          : 'locked'
                    }`}
                  >
                    {statusLabel(selectedRow.effectiveStatus)}
                  </span>
                  <span className="ent-cat">{selectedRow.category}</span>
                </div>
                <p className="ent-detail-sku">
                  <span className="ent-detail-label">SKU</span> <code>{selectedRow.skuId}</code>
                </p>
                <section className="ent-detail-section">
                  <h3 className="ent-detail-h">About this pass</h3>
                  <p className="ent-desc">{selectedRow.shortDescription}</p>
                </section>
                <section className="ent-detail-section">
                  <h3 className="ent-detail-h">What it unlocks</h3>
                  <p className="ent-detail-body">{selectedRow.unlocksSummary}</p>
                </section>
                <section className="ent-detail-section">
                  <h3 className="ent-detail-h">Feature flags</h3>
                  <ul className="ent-detail-flags">
                    {selectedRow.featureFlags.map((f) => (
                      <li key={f}>
                        <code>{f}</code>
                      </li>
                    ))}
                  </ul>
                </section>
                {(selectedRow.effectiveStatus === 'active' || selectedRow.effectiveStatus === 'pending') &&
                (selectedRow.walletAddress || selectedRow.tokenId || selectedRow.chain || selectedRow.verifiedAt) ? (
                  <section className="ent-detail-section">
                    <h3 className="ent-detail-h">Verification</h3>
                    {selectedRow.verifiedAt ? (
                      <p className="ent-detail-body">Verified at: {selectedRow.verifiedAt}</p>
                    ) : null}
                    <div className="ent-meta">
                      {selectedRow.chain ? `${selectedRow.chain}` : null}
                      {selectedRow.tokenId ? ` · token ${selectedRow.tokenId}` : null}
                      {selectedRow.walletAddress ? ` · ${selectedRow.walletAddress}` : null}
                    </div>
                  </section>
                ) : null}
              </div>
              <div className="ent-detail-bottom">
                <p className="ent-detail-hint">Select another pass in the grid to compare details.</p>
                <div className="ent-detail-spin">
                  <iframe
                    ref={spinIframeRef}
                    title="Pass 3D preview"
                    src={spinPreviewSrc}
                    onLoad={() => sendPassIdentityToSpinPreview()}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="ent-detail-placeholder">Loading pass list…</p>
          )}
        </aside>
      </div>

      <footer className="ent-foot">
        Catalog v{ENTITLEMENT_CATALOG_VERSION}
        {data?.generatedAt ? ` · Last sync ${data.generatedAt}` : null}
        {data?.avatarId ? ` · Avatar ${data.avatarId}` : null}. Spec:{' '}
        <code style={{ fontSize: 10 }}>OASIS-IDE/docs/NFT_ENTITLEMENT_SLOTS_SPEC.md</code>
        {' · '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            void window.electronAPI?.openUrl?.('https://oasis.ac/founder');
          }}
        >
          Founder access
        </a>
      </footer>
    </div>
  );
};
