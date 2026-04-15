/**
 * Lightweight STAR WebAPI client for the renderer process.
 *
 * Base URL precedence:
 *   1. settings.starnetEndpointOverride (user-set)
 *   2. VITE_STAR_API_URL build-time env
 *   3. Default STAR WebAPI local port (50564)
 */

export const DEFAULT_STAR_API_URL = 'http://127.0.0.1:50564';

export function getStarApiUrl(override?: string): string {
  if (override?.trim()) return override.trim();
  return (import.meta as any).env?.VITE_STAR_API_URL?.trim() || DEFAULT_STAR_API_URL;
}

export interface OAPPRecord {
  id: string;
  name: string;
  description?: string;
  oAPPType?: number;
  oAPPTypeStr?: string;
  version?: string;
  publishedOn?: string;
  publishedByAvatarId?: string;
  publishedByAvatarUsername?: string;
  numberOfInstalls?: number;
  numberOfForks?: number;
  karma?: number;
  isPublished?: boolean;
}

/** 'auth' = server is reachable but no JWT token yet; 'ok' = reachable + token present */
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

async function starFetch<T>(
  baseUrl: string,
  endpoint: string,
  token: string | null,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // 10-second timeout — some STAR endpoints are slow but do eventually respond.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.message || j?.Message || j?.result?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const json = await res.json();
  return (json?.result !== undefined ? json.result : json) as T;
}

export async function fetchAllOapps(baseUrl: string, token: string | null): Promise<OAPPRecord[]> {
  const data = await starFetch<OAPPRecord[] | { result?: OAPPRecord[] }>(baseUrl, '/api/OAPPs', token);
  return Array.isArray(data) ? data : [];
}

export async function fetchMyOapps(baseUrl: string, token: string | null): Promise<OAPPRecord[]> {
  const data = await starFetch<OAPPRecord[] | any>(
    baseUrl,
    '/api/OAPPs/load-all-for-avatar',
    token
  );
  return Array.isArray(data) ? data : [];
}

export async function publishOapp(baseUrl: string, oappId: string, token: string | null): Promise<void> {
  await starFetch<unknown>(baseUrl, `/api/OAPPs/${oappId}/publish`, token, { method: 'POST' });
}

export async function downloadOapp(baseUrl: string, oappId: string, token: string | null): Promise<void> {
  await starFetch<unknown>(baseUrl, `/api/OAPPs/${oappId}/download`, token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function pingStarApi(baseUrl: string): Promise<boolean> {
  // Use the Avatar/current endpoint: fast, always returns JSON (401 when unauth),
  // never hangs like some OAPP list routes do on the .NET Kestrel server.
  // Also try a root GET as a fallback (returns 404 if running).
  try {
    const res = await fetch(`${baseUrl}/api/Avatar/current`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    // Any response from Kestrel (200, 401, 403, 404) means the server is up.
    return true;
  } catch {
    // Try root as a last resort (some builds redirect / → swagger).
    try {
      const res2 = await fetch(`${baseUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return true;
    } catch {
      return false;
    }
  }
}
