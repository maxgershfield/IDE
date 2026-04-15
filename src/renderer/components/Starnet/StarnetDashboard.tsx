import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  Upload,
  Download,
  Search,
  Star,
  Package,
  Users,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
} from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  fetchAllOapps,
  fetchMyOapps,
  downloadOapp,
  pingStarApi,
  getStarApiUrl,
  oappTypeLabel,
  type OAPPRecord,
  type StarApiStatus,
} from '../../services/starApiService';
import './StarnetDashboard.css';

type Tab = 'mine' | 'discover';

// ─── Derived stat helpers ─────────────────────────────────────────────────────

function totalInstalls(oapps: OAPPRecord[]): number {
  return oapps.reduce((s, o) => s + (o.numberOfInstalls ?? 0), 0);
}

function totalForks(oapps: OAPPRecord[]): number {
  return oapps.reduce((s, o) => s + (o.numberOfForks ?? 0), 0);
}

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
  onDownload?: (id: string) => void;
  downloading?: boolean;
}> = ({ oapp, mine, onDownload, downloading }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(oapp.id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="sn-oapp-row">
      <div className="sn-oapp-row-main">
        <span className="sn-oapp-name">{oapp.name}</span>
        <TypeBadge type={oapp.oAPPType} />
        {mine && oapp.isPublished && <span className="sn-badge sn-badge--published">Published</span>}
        {mine && !oapp.isPublished && <span className="sn-badge sn-badge--draft">Draft</span>}
      </div>
      {oapp.description && (
        <div className="sn-oapp-desc">{oapp.description}</div>
      )}
      <div className="sn-oapp-row-meta">
        <span className="sn-oapp-stat">
          <Download size={10} /> {oapp.numberOfInstalls ?? 0} installs
        </span>
        <span className="sn-oapp-stat">
          <Copy size={10} /> {oapp.numberOfForks ?? 0} forks
        </span>
        {oapp.publishedByAvatarUsername && (
          <span className="sn-oapp-stat">
            <Users size={10} /> {oapp.publishedByAvatarUsername}
          </span>
        )}
        {oapp.version && <span className="sn-oapp-stat">v{oapp.version}</span>}
        <div className="sn-oapp-spacer" />
        {!mine && onDownload && (
          <button
            className="sn-action-btn"
            disabled={downloading}
            title="Install / clone"
            onClick={() => onDownload(oapp.id)}
          >
            {downloading ? <Loader2 size={11} className="sn-spin" /> : <Download size={11} />}
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
      Expected at <code className="sn-code">{url}</code>. Start the STAR WebAPI or update the endpoint
      in Settings → STARNET.
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
  const [myOapps, setMyOapps] = useState<OAPPRecord[]>([]);
  const [allOapps, setAllOapps] = useState<OAPPRecord[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [publishingWs, setPublishingWs] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  // auth token from localStorage (same approach as oportal-repo)
  const token = (() => {
    try {
      const raw = localStorage.getItem('oasis_auth') || localStorage.getItem('starnet_auth');
      if (raw) {
        const p = JSON.parse(raw);
        return p.token || p.jwtToken || null;
      }
    } catch { /* ignore */ }
    return null;
  })();

  const checkStatus = useCallback(async () => {
    setApiStatus('loading');
    const ok = await pingStarApi(baseUrl);
    if (!ok) { setApiStatus('offline'); return false; }
    // Server is up — determine if we have a usable token
    setApiStatus(token ? 'ok' : 'auth');
    return true;
  }, [baseUrl, token]);

  const loadMine = useCallback(async () => {
    setLoadingMine(true);
    setError('');
    try {
      const data = await fetchMyOapps(baseUrl, token);
      setMyOapps(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load your OAPPs');
    } finally {
      setLoadingMine(false);
    }
  }, [baseUrl, token]);

  const loadAll = useCallback(async () => {
    setLoadingAll(true);
    setError('');
    try {
      const data = await fetchAllOapps(baseUrl, token);
      setAllOapps(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load STARNET registry');
    } finally {
      setLoadingAll(false);
    }
  }, [baseUrl, token]);

  const boot = useCallback(async () => {
    const ok = await checkStatus();
    // Only fetch data if the server is reachable AND we have a token.
    // Without a token, STAR OAPP endpoints hang rather than returning 401.
    if (!ok || !token) return;
    await Promise.all([loadMine(), loadAll()]);
  }, [checkStatus, loadMine, loadAll, token]);

  useEffect(() => { boot(); }, [boot]);

  const handleRetry = () => boot();

  const handleRefresh = () => {
    if (tab === 'mine') loadMine();
    else loadAll();
  };

  const handleDownload = async (id: string) => {
    setDownloading(id);
    try {
      await downloadOapp(baseUrl, id, token);
    } catch (e: any) {
      setError(e?.message ?? 'Install failed');
    } finally {
      setDownloading(null);
    }
  };

  // Publish: reads .star-workspace.json from the open workspace folder
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
      await import('../../services/starApiService').then(({ publishOapp }) =>
        publishOapp(baseUrl, oappId, token)
      );
      setPublishFeedback('Published successfully.');
      await loadMine();
    } catch (e: any) {
      setPublishFeedback(e?.message ?? 'Publish failed');
    } finally {
      setPublishingWs(false);
    }
  };

  // Filter discover list by search
  const filtered = searchQuery.trim()
    ? allOapps.filter((o) => {
        const q = searchQuery.toLowerCase();
        return (
          o.name?.toLowerCase().includes(q) ||
          o.description?.toLowerCase().includes(q) ||
          o.publishedByAvatarUsername?.toLowerCase().includes(q)
        );
      })
    : allOapps;

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
            title="Publish the OAPP in the current workspace"
            onClick={handlePublishWorkspace}
          >
            {publishingWs ? (
              <Loader2 size={12} className="sn-spin" />
            ) : (
              <Upload size={12} />
            )}
            Publish OAPP
          </button>
        )}
        <button
          className="sn-icon-btn"
          title="Refresh"
          onClick={handleRefresh}
          disabled={apiStatus === 'loading' || loadingMine || loadingAll}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Publish feedback ── */}
      {publishFeedback && (
        <div className={`sn-feedback ${publishFeedback.includes('success') ? 'sn-feedback--ok' : 'sn-feedback--err'}`}>
          {publishFeedback}
        </div>
      )}

      {/* ── Stat chips (my holons only) ── */}
      {apiStatus === 'ok' && (
        <div className="sn-stats-row">
          <StatChip icon={<Package size={12} />} label="published" value={myOapps.length} />
          <StatChip icon={<Download size={12} />} label="installs" value={totalInstalls(myOapps)} />
          <StatChip icon={<Copy size={12} />} label="forks" value={totalForks(myOapps)} />
          <StatChip icon={<Zap size={12} />} label="in registry" value={allOapps.length} />
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="sn-tab-bar">
        <button
          className={`sn-tab${tab === 'mine' ? ' sn-tab--active' : ''}`}
          onClick={() => setTab('mine')}
        >
          <Star size={12} /> My Holons
        </button>
        <button
          className={`sn-tab${tab === 'discover' ? ' sn-tab--active' : ''}`}
          onClick={() => setTab('discover')}
        >
          <Package size={12} /> Discover
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
              Log in with your OASIS Avatar (top-right of the IDE) to browse and publish holons.
              <br />
              <span style={{ marginTop: 6, display: 'block', opacity: 0.6 }}>
                STAR API: <code className="sn-code">{baseUrl}</code>
              </span>
            </div>
          </div>
        ) : tab === 'mine' ? (
          <>
            {loadingMine ? (
              <div className="sn-loading"><Loader2 size={16} className="sn-spin" /> Loading your holons</div>
            ) : myOapps.length === 0 ? (
              <EmptyList label={
                loggedIn
                  ? 'No OAPPs found. Create one with the STAR CLI, then publish it here.'
                  : 'Log in to see your published OAPPs.'
              } />
            ) : (
              <div className="sn-list">
                {myOapps.map((o) => (
                  <OappRow key={o.id} oapp={o} mine />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Search bar */}
            <div className="sn-search-row">
              <Search size={13} className="sn-search-icon" />
              <input
                className="sn-search-input"
                placeholder="Search OAPPs, holons, templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {loadingAll ? (
              <div className="sn-loading"><Loader2 size={16} className="sn-spin" /> Loading registry</div>
            ) : filtered.length === 0 ? (
              <EmptyList label={
                searchQuery ? 'No results matching your search.' : 'STARNET registry is empty.'
              } />
            ) : (
              <div className="sn-list">
                {filtered.map((o) => (
                  <OappRow
                    key={o.id}
                    oapp={o}
                    onDownload={handleDownload}
                    downloading={downloading === o.id}
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
