import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Layers,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { useStarnetCatalog } from '../../contexts/StarnetCatalogContext';
import {
  fetchMyOapps,
  fetchAllHolons,
  hydrateStarnetCatalogFromDisk,
  invalidateStarnetListCache,
  downloadOapp,
  pingStarApi,
  getStarApiUrl,
  getStarToken,
  oappTypeLabel,
  totalInstalls,
  totalDownloads,
  publishOapp,
  isOappListedForStarnetDiscover,
  mergeHolonCatalogView,
  countHolonCatalogBySource,
  CATALOG_SOURCE_OAPP_TEMPLATE,
  type OAPPRecord,
  type StarHolonRecord,
  type StarApiStatus,
} from '../../services/starApiService';
import { holonTypeNameFromEnum } from '../../services/holonTypeLabels';
import { StarnetBuildTab } from './StarnetBuildTab';
import './StarnetDashboard.css';

type Tab = 'mine' | 'discover';
type MainCatalog = 'oapps' | 'holons' | 'match';

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

const StatChip: React.FC<{ icon: React.ReactNode; label: string; value: number | string; title?: string }> = ({
  icon,
  label,
  value,
  title,
}) => (
  <div className="sn-stat-chip" title={title}>
    <span className="sn-stat-icon">{icon}</span>
    <span className="sn-stat-value">{value}</span>
    <span className="sn-stat-label">{label}</span>
  </div>
);

const TypeBadge: React.FC<{ type?: number }> = ({ type }) => (
  <span className={`sn-badge sn-badge--type${type ?? 0}`}>{oappTypeLabel(type)}</span>
);

const HolonTypeBadge: React.FC<{ holonType: number | string | undefined }> = ({ holonType }) => (
  <span className="sn-badge sn-badge--holon-type">{holonTypeNameFromEnum(holonType)}</span>
);

const HolonRow: React.FC<{
  holon: StarHolonRecord;
  onUseInComposer?: (holon: StarHolonRecord) => void;
}> = ({ holon, onUseInComposer }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(holon.id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const active =
    holon.isActive === undefined ? null : holon.isActive ? 'Active' : 'Inactive';
  const fromTemplate =
    holon.metaData?.catalogSource === CATALOG_SOURCE_OAPP_TEMPLATE;
  return (
    <div className="sn-oapp-row sn-holon-row">
      <div className="sn-oapp-row-main">
        <span className="sn-oapp-name">{holon.name || holon.id}</span>
        <HolonTypeBadge holonType={holon.holonType} />
        {fromTemplate ? (
          <span className="sn-badge sn-badge--published" title="Registered as OAPPTemplate (component library)">
            Library template
          </span>
        ) : (
          <span className="sn-badge sn-badge--draft" title="STAR holon instance (load-all-for-avatar)">
            Instance
          </span>
        )}
        {active && (
          <span className={`sn-badge ${holon.isActive ? 'sn-badge--published' : 'sn-badge--draft'}`}>
            {active}
          </span>
        )}
      </div>
      {holon.description && <div className="sn-oapp-desc">{holon.description}</div>}
      <div className="sn-oapp-row-meta">
        <span className="sn-oapp-stat sn-code" title="Holon id">
          {holon.id}
        </span>
        <div className="sn-oapp-spacer" />
        {onUseInComposer && (
          <button
            type="button"
            className="sn-action-btn sn-action-btn--ghost"
            title="Put this holon in the composer as context for your next message"
            onClick={() => onUseInComposer(holon)}
          >
            <MessageSquare size={11} />
            Chat
          </button>
        )}
        <button className="sn-action-btn sn-action-btn--ghost" title="Copy id" onClick={handleCopy}>
          {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
        </button>
      </div>
    </div>
  );
};

const OappRow: React.FC<{
  oapp: OAPPRecord;
  mine?: boolean;
  onInstall?: (id: string) => void;
  installing?: boolean;
  onUseInComposer?: (oapp: OAPPRecord) => void;
}> = ({ oapp, mine, onInstall, installing, onUseInComposer }) => {
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
        {mine && isOappListedForStarnetDiscover(oapp) && (
          <span className="sn-badge sn-badge--published">
            <Globe size={8} /> STARNET
          </span>
        )}
        {mine && !isOappListedForStarnetDiscover(oapp) && (
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
        {onUseInComposer && (
          <button
            type="button"
            className="sn-action-btn sn-action-btn--ghost"
            title="Put this OAPP in the composer as context for your next message"
            onClick={() => onUseInComposer(oapp)}
          >
            <MessageSquare size={11} />
            Chat
          </button>
        )}
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
  const { loggedIn, avatarId } = useAuth();
  const { workspacePath } = useWorkspace();

  /** Base URL from main (launchSettings + /api/Health probe); aligns STARNET tab with MCP STAR_API_URL. */
  const [resolvedStarFromMain, setResolvedStarFromMain] = useState<string | undefined>(undefined);
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { starGetResolvedApiUrl?: () => Promise<string> } })
      .electronAPI;
    api?.starGetResolvedApiUrl?.().then((u) => setResolvedStarFromMain(u)).catch(() => {});
  }, []);

  const baseUrl = getStarApiUrl(settings.starnetEndpointOverride, resolvedStarFromMain);
  const { injectComposerDraft } = useIdeChat();
  const { setStarnetCatalogSnapshot } = useStarnetCatalog();

  const injectHolonToComposer = useCallback(
    (h: StarHolonRecord) => {
      const nm = (h.name || h.id).replace(/\*/g, '');
      injectComposerDraft(
        `[STARNET holon] **${nm}**\n` +
          `- id: \`${h.id}\`\n` +
          `- type: ${holonTypeNameFromEnum(h.holonType)}\n` +
          `- description: ${(h.description || '').trim().replace(/\r?\n/g, ' ').slice(0, 1200)}\n\n` +
          `(STAR base URL for this IDE view: \`${baseUrl}\`)\n\n` +
          `Help me use this holon in my OAPP or answer questions about it.`
      );
    },
    [injectComposerDraft, baseUrl]
  );

  const injectOappToComposer = useCallback(
    (o: OAPPRecord) => {
      const nm = (o.name || o.id).replace(/\*/g, '');
      injectComposerDraft(
        `[STARNET OAPP] **${nm}**\n` +
          `- id: \`${o.id}\`\n` +
          `- type: ${oappTypeLabel(o.oappType)}\n` +
          `- version: ${o.version ?? '—'}\n` +
          `- description: ${(o.description || '').trim().replace(/\r?\n/g, ' ').slice(0, 1200)}\n\n` +
          `(STAR base URL: \`${baseUrl}\`)\n\n` +
          `Help me plan changes, publish, or compose with this OAPP.`
      );
    },
    [injectComposerDraft, baseUrl]
  );

  const [apiStatus, setApiStatus] = useState<StarApiStatus>('idle');
  /** Default to Holons tab (OAPPs stay one click away on the OAPPs tab). */
  const [mainCatalog, setMainCatalog] = useState<MainCatalog>('holons');
  const [tab, setTab] = useState<Tab>('mine');
  const [oapps, setOapps] = useState<OAPPRecord[]>([]);
  const [holons, setHolons] = useState<StarHolonRecord[]>([]);
  const [holonError, setHolonError] = useState('');
  /** OAPP list load (full-page spinner only while on OAPPs tab; see `mainCatalog`). */
  const [loading, setLoading] = useState(false);
  /** Holon list load (inline spinner on Holons tab; runs in parallel with OAPPs). */
  const [loadingHolons, setLoadingHolons] = useState(false);
  /** True after holons have been fetched at least once (lazy tab or full refresh). */
  const [holonsCatalogReady, setHolonsCatalogReady] = useState(false);
  const holonsFetchedRef = useRef(false);
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

  /**
   * Fetch OAPPs and holons in parallel (same cost to STAR as sequential, much faster wall-clock).
   * Each list clears its own loading flag when done so the Holons tab is not blocked by slow OAPP payloads.
   */
  const loadStarDataFull = useCallback(
    async (tok: string | null, opts?: { forceRefresh?: boolean }) => {
      if (!tok) return;
      setLoading(true);
      setLoadingHolons(true);
      setHolonError('');
      setError('');

      const fetchOpts = { forceRefresh: opts?.forceRefresh === true };

      if (!fetchOpts.forceRefresh) {
        const disk = await hydrateStarnetCatalogFromDisk(baseUrl, tok, avatarId);
        if (disk.oapps && disk.oapps.length > 0) {
          setOapps(disk.oapps);
          setLoading(false);
        }
        if (disk.holons && disk.holons.length > 0) {
          setHolons(disk.holons);
          setLoadingHolons(false);
          setHolonsCatalogReady(true);
          holonsFetchedRef.current = true;
        }
      }

      const runOapps = async () => {
        try {
          const o = await fetchMyOapps(baseUrl, tok, avatarId, fetchOpts);
          setOapps(o);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Failed to load OAPPs from STAR');
        } finally {
          setLoading(false);
        }
      };

      const runHolons = async () => {
        try {
          const h = await fetchAllHolons(baseUrl, tok, avatarId, {
            ...fetchOpts,
            onHolonListPartial: (rows) => {
              setHolons(rows);
            },
          });
          setHolons(h);
        } catch (e: unknown) {
          setHolonError(e instanceof Error ? e.message : 'Failed to load holons from STAR');
        } finally {
          holonsFetchedRef.current = true;
          setHolonsCatalogReady(true);
          setLoadingHolons(false);
        }
      };

      await Promise.allSettled([runOapps(), runHolons()]);
    },
    [baseUrl, avatarId]
  );

  const boot = useCallback(async (tok: string | null) => {
    const ok = await checkStatus(tok);
    if (!ok || !tok) return;
    holonsFetchedRef.current = false;
    await loadStarDataFull(tok);
  }, [checkStatus, loadStarDataFull]);

  useEffect(() => {
    holonsFetchedRef.current = false;
    setHolons([]);
    setHolonsCatalogReady(false);
    invalidateStarnetListCache();
  }, [token]);

  useEffect(() => {
    void boot(token);
  }, [token, boot, avatarId]);

  const handleRetry = useCallback(async () => {
    const ok = await checkStatus(token);
    if (!ok || !token) return;
    await loadStarDataFull(token, { forceRefresh: true });
  }, [checkStatus, token, loadStarDataFull]);

  const handleRefresh = () => loadStarDataFull(token, { forceRefresh: true });

  const handleInstall = async (id: string) => {
    setInstalling(id);
    try {
      await downloadOapp(baseUrl, id, token, avatarId);
      await loadStarDataFull(token, { forceRefresh: true });
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
      await publishOapp(baseUrl, oappId, token, avatarId);
      setPublishFeedback('Published to STARNET.');
      await loadStarDataFull(token, { forceRefresh: true });
    } catch (e: any) {
      setPublishFeedback(e?.message ?? 'Publish failed');
    } finally {
      setPublishingWs(false);
    }
  };

  // Tabs: "mine" = OAPPs I've created; "discover" = STARNET-visible or OAPPTemplate library rows
  const myOapps = oapps;
  const publishedOapps = oapps.filter((o) => isOappListedForStarnetDiscover(o));

  const visibleList = tab === 'mine' ? myOapps : publishedOapps;
  const filteredOapps = searchQuery.trim()
    ? visibleList.filter((o) => {
        const q = searchQuery.toLowerCase();
        return (
          (o.name ?? '').toLowerCase().includes(q) ||
          (o.description ?? '').toLowerCase().includes(q)
        );
      })
    : visibleList;

  /** Instances from GET /api/Holons plus OAPPTemplate rows (same library as register_starnet_component_holons.mjs). */
  const holonCatalogRows = useMemo(() => mergeHolonCatalogView(holons, oapps), [holons, oapps]);
  const holonCountParts = useMemo(
    () => countHolonCatalogBySource(holonCatalogRows),
    [holonCatalogRows]
  );

  useEffect(() => {
    if (!loggedIn) return;
    setStarnetCatalogSnapshot({
      holonCatalogRows,
      oapps,
      baseUrl,
      apiReady: apiStatus === 'ok',
      loggedIn: true
    });
  }, [holonCatalogRows, oapps, baseUrl, apiStatus, loggedIn, setStarnetCatalogSnapshot]);

  const filteredHolons = searchQuery.trim()
    ? holonCatalogRows.filter((h) => {
        const q = searchQuery.toLowerCase();
        const typeLabel = holonTypeNameFromEnum(h.holonType).toLowerCase();
        const src = (h.metaData?.catalogSource ?? '').toLowerCase();
        return (
          (h.name ?? '').toLowerCase().includes(q) ||
          (h.description ?? '').toLowerCase().includes(q) ||
          h.id.toLowerCase().includes(q) ||
          typeLabel.includes(q) ||
          src.includes(q)
        );
      })
    : holonCatalogRows;

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
          disabled={loading || loadingHolons || apiStatus === 'loading'}
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
      {apiStatus === 'ok' && (oapps.length > 0 || holonsCatalogReady || loadingHolons) && (
        <div className="sn-stats-row">
          <StatChip icon={<Package size={12} />} label="OAPPs" value={oapps.length} />
          <StatChip
            icon={<Layers size={12} />}
            label="Catalog rows"
            title="Total rows in the Holons tab: STAR holon instances (inst) plus OAPPTemplate OAPPs shown as “Library template” (lib). Not the same as raw GET /api/Holons count alone."
            value={
              loadingHolons
                ? '…'
                : holonsCatalogReady
                  ? `${holonCatalogRows.length} (${holonCountParts.fromInstances} inst · ${holonCountParts.fromLibrary} lib)`
                  : '—'
            }
          />
          <StatChip icon={<Globe size={12} />} label="on STARNET" value={publishedCount} />
          <StatChip icon={<Download size={12} />} label="installs" value={totalInst} />
          <StatChip icon={<Copy size={12} />} label="downloads" value={totalDl} />
        </div>
      )}

      {/* ── Catalog: OAPPs vs Holons ── */}
      <div className="sn-tab-bar sn-tab-bar--primary">
        <button
          type="button"
          className={`sn-tab${mainCatalog === 'oapps' ? ' sn-tab--active' : ''}`}
          onClick={() => setMainCatalog('oapps')}
        >
          <Package size={12} /> OAPPs
        </button>
        <button
          type="button"
          className={`sn-tab${mainCatalog === 'holons' ? ' sn-tab--active' : ''}`}
          onClick={() => setMainCatalog('holons')}
        >
          <Layers size={12} /> Holons
        </button>
        <button
          type="button"
          className={`sn-tab${mainCatalog === 'match' ? ' sn-tab--active' : ''}`}
          title="Rank holons from a short phrase (local only). Puts a draft in the Composer on the right — no chat here."
          onClick={() => setMainCatalog('match')}
        >
          <Sparkles size={12} /> Match
        </button>
      </div>

      {/* ── OAPP sub-tabs ── */}
      {mainCatalog === 'oapps' && (
        <div className="sn-tab-bar sn-tab-bar--secondary">
          <button
            type="button"
            className={`sn-tab${tab === 'mine' ? ' sn-tab--active' : ''}`}
            onClick={() => setTab('mine')}
          >
            <Star size={12} /> My OAPPs
          </button>
          <button
            type="button"
            className={`sn-tab${tab === 'discover' ? ' sn-tab--active' : ''}`}
            onClick={() => setTab('discover')}
          >
            <Globe size={12} /> On STARNET
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="sn-body">
        {mainCatalog === 'match' ? (
          apiStatus === 'offline' ? (
            <Offline url={baseUrl} onRetry={handleRetry} />
          ) : apiStatus === 'auth' ? (
            <div className="sn-empty">
              <CheckCircle2 size={28} style={{ color: '#4ec9b0', marginBottom: 8 }} />
              <div className="sn-empty-title">Log in to use Match</div>
              <div className="sn-empty-sub">
                Sign in with your OASIS Avatar (title bar), then open <strong>Match</strong> again to rank holons
                from a phrase.
                <span style={{ marginTop: 6, display: 'block', opacity: 0.6 }}>
                  STAR API: <code className="sn-code">{baseUrl}</code>
                </span>
              </div>
            </div>
          ) : (
            <StarnetBuildTab
              holonCatalogRows={holonCatalogRows}
              baseUrl={baseUrl}
              holonsLoading={loadingHolons}
              onDraftToComposer={injectComposerDraft}
            />
          )
        ) : apiStatus === 'offline' ? (
          <Offline url={baseUrl} onRetry={handleRetry} />
        ) : apiStatus === 'auth' ? (
          <div className="sn-empty">
            <CheckCircle2 size={28} style={{ color: '#4ec9b0', marginBottom: 8 }} />
            <div className="sn-empty-title">STAR is running</div>
            <div className="sn-empty-sub">
              Log in with your OASIS Avatar (top-left of the IDE title bar) to load your OAPPs and holons
              from STAR.
              <span style={{ marginTop: 6, display: 'block', opacity: 0.6 }}>
                STAR API: <code className="sn-code">{baseUrl}</code>
              </span>
            </div>
          </div>
        ) : loading && mainCatalog === 'oapps' ? (
          <div className="sn-loading">
            <Loader2 size={16} className="sn-spin" /> Loading OAPPs from STAR API
          </div>
        ) : (
          <>
            {(mainCatalog === 'holons' || (mainCatalog === 'oapps' && tab === 'discover')) && (
              <div className="sn-search-row">
                <Search size={13} className="sn-search-icon" />
                <input
                  className="sn-search-input"
                  placeholder={
                    mainCatalog === 'holons'
                      ? 'Filter holons by name, type, or id...'
                      : 'Filter published OAPPs...'
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {mainCatalog === 'oapps' &&
              (filteredOapps.length === 0 ? (
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
                  {filteredOapps.map((o) => (
                    <OappRow
                      key={o.id}
                      oapp={o}
                      mine={tab === 'mine'}
                      onInstall={tab === 'discover' ? handleInstall : undefined}
                      installing={installing === o.id}
                      onUseInComposer={injectOappToComposer}
                    />
                  ))}
                </div>
              ))}

            {mainCatalog === 'holons' && (
              <>
                <p className="sn-catalog-hint">
                  Merged catalog: &quot;Library template&quot; rows are your OAPPTemplate OAPPs (same flow as{' '}
                  <code className="sn-code">register_starnet_component_holons.mjs</code>). &quot;Instance&quot; rows
                  come from <code className="sn-code">GET /api/Holons</code>. Registered templates appear here even
                  when only a few STAR holon instances exist.
                </p>
                {holonError && (
                  <div className="sn-feedback sn-feedback--err" style={{ border: 'none' }}>
                    {holonError}
                  </div>
                )}
                {loadingHolons && !holonError ? (
                  <div className="sn-loading sn-loading--inline">
                    <Loader2 size={14} className="sn-spin" /> Loading holons
                  </div>
                ) : filteredHolons.length === 0 && !holonError ? (
                  <EmptyList
                    label={`No holon catalog entries at ${baseUrl}. Log in, point Settings → STARNET at this API, run scripts/register_starnet_component_holons.mjs (templates), and/or POST /api/Holons for instances.`}
                  />
                ) : (
                  !holonError && (
                    <div className="sn-list">
                      {filteredHolons.map((h) => (
                        <HolonRow key={h.id} holon={h} onUseInComposer={injectHolonToComposer} />
                      ))}
                    </div>
                  )
                )}
              </>
            )}
          </>
        )}

        {error && <div className="sn-error-bar">{error}</div>}
      </div>
    </div>
  );
};
