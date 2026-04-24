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
  }, []);

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

    const ok = await pingStarApi(baseUrl);
    apiStatusRef.current = ok ? 'ok' : 'offline';
    if (!ok) return;

    // Fast path: disk cache
    const disk = await hydrateStarnetCatalogFromDisk(baseUrl, tok, avatarId);
    if (disk.holons && disk.holons.length > 0) {
      holonsRef.current = disk.holons;
      pushSnapshot();
    }
    if (disk.oapps && disk.oapps.length > 0) {
      oappsRef.current = disk.oapps;
      pushSnapshot();
    }

    // Full network fetch (parallel)
    const [holons, oapps] = await Promise.allSettled([
      fetchAllHolons(baseUrl, tok, avatarId, {}),
      fetchMyOapps(baseUrl, tok, avatarId, {}),
    ]);
    if (holons.status === 'fulfilled') holonsRef.current = holons.value;
    if (oapps.status === 'fulfilled') oappsRef.current = oapps.value;
    pushSnapshot();
  }, [loggedIn, baseUrl, avatarId, pushSnapshot]);

  // Run on login / avatar / baseUrl change
  useEffect(() => {
    if (!loggedIn) {
      holonsRef.current = [];
      oappsRef.current = [];
      return;
    }
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
