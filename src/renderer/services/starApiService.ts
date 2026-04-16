/**
 * Lightweight STAR WebAPI client for the renderer process.
 *
 * Base URL precedence:
 *   1. settings.starnetEndpointOverride (user-set)
 *   2. VITE_STAR_API_URL build-time env
 *   3. Default STAR WebAPI local port (50564)
 *
 * Token: fetched from the Electron main process via `window.electronAPI.authGetToken()`
 * (stored in userData/oasis-ide-auth.json). Never sourced from localStorage.
 */

export const DEFAULT_STAR_API_URL = 'http://127.0.0.1:50564';

export function getStarApiUrl(override?: string): string {
  if (override?.trim()) return override.trim();
  return (import.meta as any).env?.VITE_STAR_API_URL?.trim() || DEFAULT_STAR_API_URL;
}

/** Retrieve the JWT from the Electron main process. */
export async function getStarToken(): Promise<string | null> {
  try {
    return (await window.electronAPI?.authGetToken?.()) ?? null;
  } catch {
    return null;
  }
}

// ─── OAPP record — field names match the STAR WebAPI response ─────────────────

export interface OAPPRecord {
  id: string;
  name: string;
  description?: string;
  /** e.g. 0=Default,1=Console,2=WebAPI,3=Blazor,4=MAUI,5=Template,6=Generated */
  oappType?: number;
  version?: string;
  createdDate?: string;
  modifiedDate?: string;
  createdByAvatarId?: string;
  /** True when the OAPP has been pushed to STARNET */
  sourcePublishedOnSTARNET?: boolean;
  /** True when publicly visible on STARNET */
  sourcePublicOnSTARNET?: boolean;
  /** Download/install totals */
  totalSourceDownloads?: number;
  totalSelfContainedDownloads?: number;
  totalSelfContainedFullDownloads?: number;
  totalSourceInstalls?: number;
  totalSelfContainedInstalls?: number;
  totalSelfContainedFullInstalls?: number;
  /** Zomes attached to this OAPP */
  zomes?: unknown[];
}

/** Total installs across all delivery forms */
export function totalInstalls(o: OAPPRecord): number {
  return (o.totalSourceInstalls ?? 0)
    + (o.totalSelfContainedInstalls ?? 0)
    + (o.totalSelfContainedFullInstalls ?? 0);
}

/** Total downloads across all delivery forms */
export function totalDownloads(o: OAPPRecord): number {
  return (o.totalSourceDownloads ?? 0)
    + (o.totalSelfContainedDownloads ?? 0)
    + (o.totalSelfContainedFullDownloads ?? 0);
}

export type StarApiStatus = 'idle' | 'loading' | 'ok' | 'auth' | 'offline';

const OAPP_TYPE_LABELS: Record<number, string> = {
  0: 'Default',
  1: 'Console',
  2: 'WebAPI',
  3: 'Blazor',
  4: 'MAUI',
  5: 'Template',
  6: 'Generated',
};

export function oappTypeLabel(type?: number): string {
  if (type === undefined || type === null) return 'OAPP';
  return OAPP_TYPE_LABELS[type] ?? 'OAPP';
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function starFetch<T>(
  baseUrl: string,
  endpoint: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.message || j?.Message || j?.result?.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json();
  // STAR API wraps in { result: [...] }
  return (json?.result !== undefined ? json.result : json) as T;
}

// ─── Public API calls ─────────────────────────────────────────────────────────

/**
 * Load all OAPPs for the currently authenticated avatar.
 * Uses /api/OAPPs/load-all-for-avatar — this endpoint responds reliably with auth.
 */
export async function fetchMyOapps(baseUrl: string, token: string | null): Promise<OAPPRecord[]> {
  const data = await starFetch<OAPPRecord[] | unknown>(
    baseUrl,
    '/api/OAPPs/load-all-for-avatar',
    token
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Publish an OAPP to STARNET by its holon ID.
 */
export async function publishOapp(
  baseUrl: string,
  oappId: string,
  token: string | null
): Promise<void> {
  await starFetch<unknown>(baseUrl, `/api/OAPPs/${oappId}/publish`, token, { method: 'POST' });
}

/**
 * Install / download an OAPP by its holon ID.
 */
export async function downloadOapp(
  baseUrl: string,
  oappId: string,
  token: string | null
): Promise<void> {
  await starFetch<unknown>(baseUrl, `/api/OAPPs/${oappId}/download`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Ping: hits /api/Avatar/current which always responds quickly (200 or 401).
 * Never uses /api/OAPPs which hangs for unauthenticated requests.
 */
export async function pingStarApi(baseUrl: string): Promise<boolean> {
  try {
    await fetch(`${baseUrl}/api/Avatar/current`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return true;
  } catch {
    try {
      await fetch(`${baseUrl}/`, { method: 'GET', signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      return false;
    }
  }
}
