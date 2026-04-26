/**
 * Always-on STARNET catalog loader.
 *
 * Mount this once at the app root (inside IdeChatProvider + StarnetCatalogProvider).
 * It runs independently of which activity view is visible so the catalog snapshot in
 * StarnetCatalogContext is always populated for the Composer agent context pack.
 *
 * StarnetDashboard continues to have its own identical fetch loop for display purposes
 * (stats, tab rendering, install, publish) — this hook only keeps the context snapshot alive
 * when the dashboard is not visible.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useStarnetCatalog } from '../contexts/StarnetCatalogContext';
import {
  getStarApiUrl,
  getStarToken,
  pingStarApi,
  fetchAllHolons,
  fetchMyOapps,
  hydrateStarnetCatalogFromDisk,
  mergeHolonCatalogView,
  type OAPPRecord,
  type StarHolonRecord,
  type StarApiStatus,
} from '../services/starApiService';

/** Milliseconds between background re-polls while app is open. 5 minutes. */
const BACKGROUND_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useStarnetCatalogLoader() {
  const { settings } = useSettings();
  const { loggedIn, avatarId } = useAuth();
  const { setStarnetCatalogSnapshot } = useStarnetCatalog();

  const [resolvedStarFromMain, setResolvedStarFromMain] = useState<string | undefined>(undefined);
  useEffect(() => {
    const api = (window as any).electronAPI;
    api?.starGetResolvedApiUrl?.().then((u: string) => setResolvedStarFromMain(u)).catch(() => {});
  }, [settings.starnetEndpointOverride]);

  const baseUrl = getStarApiUrl(settings.starnetEndpointOverride, resolvedStarFromMain);

  const holonsRef = useRef<StarHolonRecord[]>([]);
  const oappsRef = useRef<OAPPRecord[]>([]);
  const apiStatusRef = useRef<StarApiStatus>('idle');

  const pushSnapshot = useCallback(() => {
    if (!loggedIn) return;
    const merged = mergeHolonCatalogView(holonsRef.current, oappsRef.current);
    setStarnetCatalogSnapshot({
      holonCatalogRows: merged,
      oapps: oappsRef.current,
      baseUrl,
      apiReady: apiStatusRef.current === 'ok',
      loggedIn: true,
    });
  }, [loggedIn, baseUrl, setStarnetCatalogSnapshot]);

  const load = useCallback(async (tok: string | null) => {
    if (!tok || !loggedIn) return;

    // 1) Durable disk cache first (userData) — same source the STARNET view uses for quick paint.
    //    The agent must see this even if /api/Health is slow or momentarily fails (previously we
    //    returned early before hydrate, so the context stayed empty while the tab could show rows).
    apiStatusRef.current = 'loading';
    const disk = await hydrateStarnetCatalogFromDisk(baseUrl, tok, avatarId);
    if (disk.holons && disk.holons.length > 0) {
      holonsRef.current = disk.holons;
    }
    if (disk.oapps && disk.oapps.length > 0) {
      oappsRef.current = disk.oapps;
    }
    if (holonsRef.current.length > 0 || oappsRef.current.length > 0) {
      pushSnapshot();
    }

    // 2) Reachability (updates apiReady in snapshot)
    const ok = await pingStarApi(baseUrl);
    apiStatusRef.current = ok ? 'ok' : 'offline';
    pushSnapshot();
    if (!ok) {
      return;
    }

    // 3) Full network refresh: each path updates the snapshot as it finishes so OAPPs are not
    // held behind a slow holon list (and `onHolonListPartial` paints avatar holons early).
    await Promise.allSettled([
      (async () => {
        const h = await fetchAllHolons(baseUrl, tok, avatarId, {
          onHolonListPartial: (rows) => {
            holonsRef.current = rows;
            pushSnapshot();
          },
        });
        holonsRef.current = h;
        pushSnapshot();
      })(),
      (async () => {
        const o = await fetchMyOapps(baseUrl, tok, avatarId, {});
        oappsRef.current = o;
        pushSnapshot();
      })(),
    ]);
  }, [loggedIn, baseUrl, avatarId, pushSnapshot]);

  // Run on login / avatar / baseUrl change — clear refs so we never show holons from a previous STAR base/avatar in agent context.
  useEffect(() => {
    if (!loggedIn) {
      holonsRef.current = [];
      oappsRef.current = [];
      return;
    }
    holonsRef.current = [];
    oappsRef.current = [];
    getStarToken().then((tok) => load(tok)).catch(() => {});
  }, [loggedIn, avatarId, baseUrl, load]);

  // Background re-poll
  useEffect(() => {
    if (!loggedIn) return;
    const id = window.setInterval(() => {
      getStarToken().then((tok) => load(tok)).catch(() => {});
    }, BACKGROUND_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loggedIn, load]);
}
