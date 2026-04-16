import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  Upload,
  Download,
  Search,
  Star,
  Package,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Globe,
} from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  fetchMyOapps,
  downloadOapp,
  pingStarApi,
  getStarApiUrl,
  getStarToken,
  oappTypeLabel,
  totalInstalls,
  totalDownloads,
  publishOapp,
  type OAPPRecord,
  type StarApiStatus,
} from '../../services/starApiService';
import './StarnetDashboard.css';

type Tab = 'mine' | 'discover';

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatusPill: React.FC<{ status: StarApiStatus }> = ({ status }) => {
  if (status === 'loading' || status === 'idle')
    return (
      <span className="sn-status sn-status--checking">
        <Loader2 size={10} className="sn-spin" /> Connecting
      </span>
    );
  if (status === 'ok')
    return (
      <span className="sn-status sn-status--ok">
        <CheckCircle2 size={10} /> Online
      </span>
    );
  if (status === 'auth')
    return (
      <span className="sn-status sn-status--auth">
        <CheckCircle2 size={10} /> Online — log in
      </span>
    );
  return (
    <span className="sn-status sn-status--offline">
      <XCircle size={10} /> Offline
    </span>
  );
};

const StatChip: React.FC<{ icon: React.ReactNode; label: string; value: number | string }> = ({
  icon,
  label,
  value,
}) => (
  <div className="sn-stat-chip">
    <span className="sn-stat-icon">{icon}</span>
    <span className="sn-stat-value">{value}</span>
    <span className="sn-stat-label">{label}</span>
  </div>
);

const TypeBadge: React.FC<{ type?: number }> = ({ type }) => (
  <span className={`sn-badge sn-badge--type${type ?? 0}`}>{oappTypeLabel(type)}</span>
);

const OappRow: React.FC<{
  oapp: OAPPRecord;
  mine?: boolean;
  onInstall?: (id: string) => void;
  installing?: boolean;
}> = ({ oapp, mine, onInstall, installing }) => {
  const [copied, setCopied] = useState(false);
  const installs = totalInstalls(oapp);
  const downloads = totalDownloads(oapp);

  const handleCopy = () => {
    navigator.clipboard.writeText(oapp.id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="sn-oapp-row">
      <div className="sn-oapp-row-main">
        <span className="sn-oapp-name">{oapp.name || oapp.id}</span>
        <TypeBadge type={oapp.oappType} />
        {mine && oapp.sourcePublishedOnSTARNET && (
          <span className="sn-badge sn-badge--published">
            <Globe size={8} /> STARNET
          </span>
        )}
        {mine && !oapp.sourcePublishedOnSTARNET && (
          <span className="sn-badge sn-badge--draft">Local</span>
        )}
      </div>
      {oapp.description && <div className="sn-oapp-desc">{oapp.description}</div>}
      <div className="sn-oapp-row-meta">
        {installs > 0 && (
          <span className="sn-oapp-stat">
            <Download size={10} /> {installs} installs
          </span>
        )}
        {downloads > 0 && (
          <span className="sn-oapp-stat">
            <Copy size={10} /> {downloads} downloads
          </span>
        )}
        {oapp.zomes && oapp.zomes.length > 0 && (
          <span className="sn-oapp-stat">
            <Zap size={10} /> {oapp.zomes.length} zome{oapp.zomes.length !== 1 ? 's' : ''}
          </span>
        )}
        {oapp.version && <span className="sn-oapp-stat">v{oapp.version}</span>}
        <div className="sn-oapp-spacer" />
        {!mine && onInstall && (
          <button
            className="sn-action-btn"
            disabled={installing}
            title="Install"
            onClick={() => onInstall(oapp.id)}
          >
            {installing ? <Loader2 size={11} className="sn-spin" /> : <Download size={11} />}
            Install
          </button>
        )}
        <button className="sn-action-btn sn-action-btn--ghost" title="Copy ID" onClick={handleCopy}>
          {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
        </button>
      </div>
    </div>
  );
};

// ─── Empty / offline states ───────────────────────────────────────────────────

const Offline: React.FC<{ url: string; onRetry: () => void }> = ({ url, onRetry }) => (
  <div className="sn-empty">
    <XCircle size={28} style={{ color: 'var(--error, #f44747)', marginBottom: 8 }} />
    <div className="sn-empty-title">STAR API not reachable</div>
    <div className="sn-empty-sub">
      Expected at <code className="sn-code">{url}</code>. Start the STAR WebAPI or update the
      endpoint in Settings → STARNET.
    </div>
    <button className="sn-retry-btn" onClick={onRetry}>
      <RefreshCw size={12} /> Retry
    </button>
  </div>
);

const EmptyList: React.FC<{ label: string }> = ({ label }) => (
  <div className="sn-empty sn-empty--sm">
    <Package size={22} style={{ opacity: 0.3, marginBottom: 6 }} />
    <div className="sn-empty-sub">{label}</div>
  </div>
);

// ─── Main dashboard ───────────────────────────────────────────────────────────

export const StarnetDashboard: React.FC = () => {
  const { settings } = useSettings();
  const { loggedIn } = useAuth();
  const { workspacePath } = useWorkspace();

  const baseUrl = getStarApiUrl(settings.starnetEndpointOverride);

  const [apiStatus, setApiStatus] = useState<StarApiStatus>('idle');
  const [tab, setTab] = useState<Tab>('mine');
  const [oapps, setOapps] = useState<OAPPRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [publishingWs, setPublishingWs] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  // Token lives in main process — fetch via IPC, not localStorage
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    getStarToken().then(setToken);
  }, [loggedIn]); // re-fetch when auth state changes

  const checkStatus = useCallback(async (tok: string | null) => {
    setApiStatus('loading');
    const ok = await pingStarApi(baseUrl);
    if (!ok) { setApiStatus('offline'); return false; }
    setApiStatus(tok ? 'ok' : 'auth');
    return true;
  }, [baseUrl]);

  const loadOapps = useCallback(async (tok: string | null) => {
    if (!tok) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchMyOapps(baseUrl, tok);
      setOapps(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load OAPPs from STAR');
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const boot = useCallback(async (tok: string | null) => {
    const ok = await checkStatus(tok);
    if (!ok || !tok) return;
    await loadOapps(tok);
  }, [checkStatus, loadOapps]);

  useEffect(() => { boot(token); }, [token]);

  const handleRetry = () => boot(token);
  const handleRefresh = () => loadOapps(token);

  const handleInstall = async (id: string) => {
    setInstalling(id);
    try {
      await downloadOapp(baseUrl, id, token);
    } catch (e: any) {
      setError(e?.message ?? 'Install failed');
    } finally {
      setInstalling(null);
    }
  };

  const handlePublishWorkspace = async () => {
    if (!workspacePath) {
      setPublishFeedback('No workspace open. Open a folder first.');
      return;
    }
    setPublishingWs(true);
    setPublishFeedback('');
    try {
      const ws = await window.electronAPI?.readStarWorkspace?.(workspacePath);
      if (!ws) {
        setPublishFeedback('No .star-workspace.json found in current folder.');
        return;
      }
      const oappId = ws.oappId as string | undefined;
      if (!oappId) {
        setPublishFeedback('.star-workspace.json has no oappId. Run `star create` first.');
        return;
      }
      await publishOapp(baseUrl, oappId, token);
      setPublishFeedback('Published to STARNET.');
      await loadOapps(token);
    } catch (e: any) {
      setPublishFeedback(e?.message ?? 'Publish failed');
    } finally {
      setPublishingWs(false);
    }
  };

  // Tabs: "mine" = OAPPs I've created; "discover" = those published on STARNET
  const myOapps = oapps;
  const publishedOapps = oapps.filter((o) => o.sourcePublishedOnSTARNET);

  const visibleList = tab === 'mine' ? myOapps : publishedOapps;
  const filtered = searchQuery.trim()
    ? visibleList.filter((o) => {
        const q = searchQuery.toLowerCase();
        return (
          (o.name ?? '').toLowerCase().includes(q) ||
          (o.description ?? '').toLowerCase().includes(q)
        );
      })
    : visibleList;

  const totalInst = oapps.reduce((s, o) => s + totalInstalls(o), 0);
  const totalDl = oapps.reduce((s, o) => s + totalDownloads(o), 0);
  const publishedCount = publishedOapps.length;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="sn-dashboard">
      {/* ── Top bar ── */}
      <div className="sn-topbar">
        <span className="sn-topbar-title">STARNET</span>
        <StatusPill status={apiStatus} />
        <div className="sn-topbar-spacer" />
        {workspacePath && (
          <button
            className="sn-primary-btn"
            disabled={publishingWs || apiStatus !== 'ok'}
            title="Publish the OAPP in the current workspace to STARNET"
            onClick={handlePublishWorkspace}
          >
            {publishingWs ? <Loader2 size={12} className="sn-spin" /> : <Upload size={12} />}
            Publish OAPP
          </button>
        )}
        <button
          className="sn-icon-btn"
          title="Refresh"
          onClick={handleRefresh}
          disabled={loading || apiStatus === 'loading'}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Publish feedback ── */}
      {publishFeedback && (
        <div
          className={`sn-feedback ${publishFeedback.includes('STARNET') ? 'sn-feedback--ok' : 'sn-feedback--err'}`}
        >
          {publishFeedback}
        </div>
      )}

      {/* ── Stat chips ── */}
      {apiStatus === 'ok' && oapps.length > 0 && (
        <div className="sn-stats-row">
          <StatChip icon={<Package size={12} />} label="OAPPs" value={oapps.length} />
          <StatChip icon={<Globe size={12} />} label="on STARNET" value={publishedCount} />
          <StatChip icon={<Download size={12} />} label="installs" value={totalInst} />
          <StatChip icon={<Copy size={12} />} label="downloads" value={totalDl} />
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="sn-tab-bar">
        <button
          className={`sn-tab${tab === 'mine' ? ' sn-tab--active' : ''}`}
          onClick={() => setTab('mine')}
        >
          <Star size={12} /> My OAPPs
        </button>
        <button
          className={`sn-tab${tab === 'discover' ? ' sn-tab--active' : ''}`}
          onClick={() => setTab('discover')}
        >
          <Globe size={12} /> On STARNET
        </button>
      </div>

      {/* ── Body ── */}
      <div className="sn-body">
        {apiStatus === 'offline' ? (
          <Offline url={baseUrl} onRetry={handleRetry} />
        ) : apiStatus === 'auth' ? (
          <div className="sn-empty">
            <CheckCircle2 size={28} style={{ color: '#4ec9b0', marginBottom: 8 }} />
            <div className="sn-empty-title">STAR is running</div>
            <div className="sn-empty-sub">
              Log in with your OASIS Avatar (top-left of the IDE title bar) to browse your holons.
              <span style={{ marginTop: 6, display: 'block', opacity: 0.6 }}>
                STAR API: <code className="sn-code">{baseUrl}</code>
              </span>
            </div>
          </div>
        ) : loading ? (
          <div className="sn-loading">
            <Loader2 size={16} className="sn-spin" /> Loading from STAR API
          </div>
        ) : (
          <>
            {/* Search bar — only for discover tab */}
            {tab === 'discover' && (
              <div className="sn-search-row">
                <Search size={13} className="sn-search-icon" />
                <input
                  className="sn-search-input"
                  placeholder="Filter published OAPPs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {filtered.length === 0 ? (
              <EmptyList
                label={
                  tab === 'mine'
                    ? 'No OAPPs found. Create one with `star create` in the terminal.'
                    : searchQuery
                    ? 'No results matching your search.'
                    : 'None of your OAPPs have been published to STARNET yet.'
                }
              />
            ) : (
              <div className="sn-list">
                {filtered.map((o) => (
                  <OappRow
                    key={o.id}
                    oapp={o}
                    mine={tab === 'mine'}
                    onInstall={tab === 'discover' ? handleInstall : undefined}
                    installing={installing === o.id}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {error && <div className="sn-error-bar">{error}</div>}
      </div>
    </div>
  );
};
