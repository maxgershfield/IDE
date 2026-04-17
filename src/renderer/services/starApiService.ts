/**
 * Lightweight STAR WebAPI client for the renderer process.
 *
 * Base URL precedence:
 *   1. settings.starnetEndpointOverride (user-set)
 *   2. VITE_STAR_API_URL build-time env
 *   3. runtimeDefault (from main process: launchSettings + /api/Health probe)
 *   4. Default STAR WebAPI local port (50564)
 *
 * Token: fetched from the Electron main process via `window.electronAPI.authGetToken()`
 * (stored in userData/oasis-ide-auth.json). Never sourced from localStorage.
 */

export const DEFAULT_STAR_API_URL = 'http://127.0.0.1:50564';

export function getStarApiUrl(override?: string, runtimeDefault?: string): string {
  if (override?.trim()) return override.trim();
  const vite = (import.meta as any).env?.VITE_STAR_API_URL?.trim();
  if (vite) return vite;
  if (runtimeDefault?.trim()) return runtimeDefault.trim();
  return DEFAULT_STAR_API_URL;
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

/**
 * True when STAR exposes STARNET visibility flags on the OAPP.
 * JSON may use camelCase or PascalCase depending on serializer settings.
 */
export function isOappFlaggedOnStarnet(o: OAPPRecord): boolean {
  if (o.sourcePublishedOnSTARNET || o.sourcePublicOnSTARNET) return true;
  const r = o as unknown as Record<string, unknown>;
  return Boolean(r.SourcePublishedOnSTARNET ?? r.SourcePublicOnSTARNET);
}

/**
 * OAPPTemplate rows (component holon library) created via MCP / registration scripts.
 * These may not set SourcePublishedOnSTARNET until full source upload, but still belong in the STARNET catalog UI.
 *
 * Detection strategy (OR of any):
 *  - oappType === 5 (OAPPTemplate enum) – set by proper CreateAsync path
 *  - metaData.OAPPType === "5" – set by the fixed POST /api/OAPPs controller
 *  - oappTypeStr === "oapptemplate" – explicit string from seed script
 *  - name ends with "Template" – all component holon templates follow this convention
 */
export function isComponentHolonTemplateOapp(o: OAPPRecord): boolean {
  if (o.oappType === 5) return true;
  const r = o as unknown as Record<string, unknown>;
  const s = r.oappTypeStr ?? r.OappTypeStr;
  if (typeof s === 'string' && s.toLowerCase() === 'oapptemplate') return true;
  const meta = r.metaData as Record<string, unknown> | undefined;
  if (meta?.OAPPType === '5' || meta?.oappType === '5') return true;
  const name = typeof o.name === 'string' ? o.name : '';
  return name.endsWith('Template') || name.endsWith('template');
}

/** Use for "On STARNET" list: registered templates or STARNET visibility flags. */
export function isOappListedForStarnetDiscover(o: OAPPRecord): boolean {
  return isOappFlaggedOnStarnet(o) || isComponentHolonTemplateOapp(o);
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

/** One holon row from STAR WebAPI `GET /api/Holons` (OASIS `STARHolon` / `IHolon` JSON). */
export interface StarHolonRecord {
  id: string;
  name?: string;
  description?: string;
  holonType?: number | string;
  createdDate?: string;
  modifiedDate?: string;
  isActive?: boolean;
  metaData?: Record<string, string>;
}

function pickStr(r: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickHolonType(r: Record<string, unknown>): number | string | undefined {
  const v =
    r.holonType ?? r.HolonType ?? r.holon_type ?? r.type ?? r.Type;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return v;
  return undefined;
}

/** STAR `GET /api/Holons` often sends `holonId: 00000000-...` with the real id on `starnetdna.id`. */
const EMPTY_GUID_RE = /^0{8}-0{4}-0{4}-0{4}-0{12}$/i;

function isEmptyGuidString(s: string): boolean {
  return EMPTY_GUID_RE.test(s.trim());
}

function asRecord(o: unknown): Record<string, unknown> | null {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  return o as Record<string, unknown>;
}

function normalizeHolonRecord(raw: unknown): StarHolonRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const dna = asRecord(
    r.starnetdna ?? r.STARNETDNA ?? r.Starnetdna ?? r.StarnetDNA ?? r.starnetDna
  );

  const idRaw =
    r.id ??
    r.Id ??
    r.holonId ??
    r.HolonId ??
    r.starHolonId ??
    r.STARHolonId;
  let id =
    typeof idRaw === 'string'
      ? idRaw
      : idRaw !== undefined && idRaw !== null
        ? String(idRaw)
        : '';

  const dnaIdRaw = dna?.id ?? dna?.Id;
  const dnaId =
    typeof dnaIdRaw === 'string'
      ? dnaIdRaw
      : dnaIdRaw !== undefined && dnaIdRaw !== null
        ? String(dnaIdRaw)
        : '';

  if (!id || isEmptyGuidString(id)) {
    if (dnaId && !isEmptyGuidString(dnaId)) id = dnaId;
  }
  if (!id) return null;

  const name =
    pickStr(r, 'name', 'Name') ?? (dna ? pickStr(dna, 'name', 'Name') : undefined);
  const description =
    pickStr(r, 'description', 'Description') ?? (dna ? pickStr(dna, 'description', 'Description') : undefined);

  let holonType = pickHolonType(r);
  if (holonType === undefined) {
    const st = dna?.starnetHolonType ?? dna?.STARNETHolonType;
    if (typeof st === 'string' && st.length > 0) holonType = st;
  }

  const metaRoot = asRecord(r.metaData ?? r.MetaData);
  const metaDna = asRecord(dna?.metaData ?? dna?.MetaData);
  let metaObj: Record<string, string> | undefined;
  if (metaDna || metaRoot) {
    const o: Record<string, string> = {};
    for (const src of [metaDna, metaRoot]) {
      if (!src) continue;
      for (const [k, v] of Object.entries(src)) {
        if (v !== undefined && v !== null) o[k] = String(v);
      }
    }
    metaObj = Object.keys(o).length ? o : undefined;
  }

  return {
    id,
    name,
    description,
    holonType,
    createdDate: pickStr(r, 'createdDate', 'CreatedDate') ?? (dna ? pickStr(dna, 'createdOn', 'CreatedOn') : undefined),
    modifiedDate: pickStr(r, 'modifiedDate', 'ModifiedDate') ?? (dna ? pickStr(dna, 'modifiedOn', 'ModifiedOn') : undefined),
    isActive: typeof r.isActive === 'boolean' ? r.isActive : typeof r.IsActive === 'boolean' ? r.IsActive : undefined,
    metaData: metaObj,
  };
}

/**
 * STAR often returns `OASISResult<T>` JSON with the payload in `result`, sometimes nested more than once.
 * Follow `result` / `Result` until we hit an array (or surface `isError`).
 */
function unwrapHolonListPayload(data: unknown): unknown[] {
  let cur: unknown = data;
  for (let depth = 0; depth < 10; depth++) {
    if (Array.isArray(cur)) return cur;
    if (cur === null || cur === undefined) return [];
    if (typeof cur !== 'object') return [];
    const o = cur as Record<string, unknown>;
    if (o.isError === true || o.IsError === true) {
      const msg =
        (typeof o.message === 'string' && o.message.length > 0 ? o.message : null) ??
        (typeof o.Message === 'string' && o.Message.length > 0 ? o.Message : null) ??
        'Holon list request failed';
      throw new Error(msg);
    }
    const next = o.result ?? o.Result;
    if (next === undefined || next === null) return [];
    cur = next;
  }
  return [];
}

/** Metadata flag: row came from `GET /api/Holons` (STAR holon instance). */
export const CATALOG_SOURCE_INSTANCE = 'holon-instance';
/** Metadata flag: row came from OAPPTemplate OAPP (`load-all-for-avatar`). */
export const CATALOG_SOURCE_OAPP_TEMPLATE = 'oapp-template';

/**
 * Maps an OAPPTemplate OAPP to a holon-shaped row for the STARNET Holons tab.
 * The component holon library is registered via POST /api/OAPPs (type Template), not only POST /api/Holons.
 */
export function oappTemplateToCatalogHolonRow(o: OAPPRecord): StarHolonRecord {
  return {
    id: String(o.id),
    name: o.name,
    description: o.description,
    holonType: 'OAPPTemplate',
    metaData: {
      catalogSource: CATALOG_SOURCE_OAPP_TEMPLATE,
    },
  };
}

/**
 * Merges STAR holon instances (`load-all-for-avatar` + `GET /api/Holons`, see fetchAllHolons) with OAPPTemplate OAPPs from the same avatar.
 * Without this, the Holons tab only shows instances; the 24+ component templates would appear only under OAPPs.
 */
export function mergeHolonCatalogView(instances: StarHolonRecord[], oapps: OAPPRecord[]): StarHolonRecord[] {
  const templateRows: StarHolonRecord[] = [];
  const seenTpl = new Set<string>();
  for (const o of oapps) {
    if (!isComponentHolonTemplateOapp(o)) continue;
    const id = String(o.id);
    if (seenTpl.has(id)) continue;
    seenTpl.add(id);
    templateRows.push(oappTemplateToCatalogHolonRow(o));
  }
  const seenId = new Set(templateRows.map((r) => r.id));
  const withInstances: StarHolonRecord[] = [...templateRows];
  for (const h of instances) {
    if (seenId.has(h.id)) continue;
    seenId.add(h.id);
    const base = h.metaData ?? {};
    withInstances.push({
      ...h,
      metaData: {
        ...base,
        catalogSource: base.catalogSource ?? CATALOG_SOURCE_INSTANCE,
      },
    });
  }
  withInstances.sort((a, b) =>
    (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' })
  );
  return withInstances;
}

// ─── In-memory list cache (renderer) ─────────────────────────────────────────

/**
 * In-memory TTL after a successful STARNET list fetch (60s).
 * Durable cache: userData `oasis-ide-starnet-list-cache.json` (cleared with invalidateStarnetListCache).
 */
const STARNET_LIST_CACHE_TTL_MS = 60_000;

interface ListCacheEntry<T> {
  data: T;
  storedAt: number;
}

const oappsListCache = new Map<string, ListCacheEntry<OAPPRecord[]>>();
const holonsListCache = new Map<string, ListCacheEntry<StarHolonRecord[]>>();

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h | 0;
}

function listCacheKey(
  kind: 'oapps' | 'holons',
  baseUrl: string,
  token: string | null,
  avatarId?: string | null
): string {
  const norm = baseUrl.replace(/\/$/, '');
  const aid = (avatarId ?? '').trim();
  const tid = token ? `t:${token.length}:${hashString(token)}` : 't:none';
  return `${kind}|${norm}|${aid}|${tid}`;
}

/** Stable cache key for STARNET list payloads (memory + durable disk). */
export function buildStarnetListCacheKey(
  kind: 'oapps' | 'holons',
  baseUrl: string,
  token: string | null,
  avatarId?: string | null
): string {
  return listCacheKey(kind, baseUrl, token, avatarId);
}

async function readStarnetListFromDisk(
  key: string,
  kind: 'oapps' | 'holons'
): Promise<unknown | null> {
  try {
    const entry = await window.electronAPI?.starnetListCacheGet?.(key);
    if (!entry || entry.kind !== kind) return null;
    return entry.payload;
  } catch {
    return null;
  }
}

async function writeStarnetListToDisk(
  key: string,
  kind: 'oapps' | 'holons',
  payload: unknown
): Promise<void> {
  try {
    await window.electronAPI?.starnetListCacheSet?.(key, {
      storedAt: Date.now(),
      kind,
      payload,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Read last persisted OAPP and holon lists (Electron userData) for instant paint before network refresh.
 */
export async function hydrateStarnetCatalogFromDisk(
  baseUrl: string,
  token: string | null,
  avatarId?: string | null
): Promise<{ oapps: OAPPRecord[] | null; holons: StarHolonRecord[] | null }> {
  const ko = listCacheKey('oapps', baseUrl, token, avatarId);
  const kh = listCacheKey('holons', baseUrl, token, avatarId);
  const [rawO, rawH] = await Promise.all([
    readStarnetListFromDisk(ko, 'oapps'),
    readStarnetListFromDisk(kh, 'holons'),
  ]);
  const oapps = Array.isArray(rawO) ? (rawO as OAPPRecord[]) : null;
  const holons = Array.isArray(rawH) ? (rawH as StarHolonRecord[]) : null;
  return {
    oapps: oapps && oapps.length > 0 ? oapps : null,
    holons: holons && holons.length > 0 ? holons : null,
  };
}

function getListCache<T>(map: Map<string, ListCacheEntry<T>>, key: string): T | null {
  const e = map.get(key);
  if (!e) return null;
  if (Date.now() - e.storedAt > STARNET_LIST_CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return e.data;
}

function setListCache<T>(map: Map<string, ListCacheEntry<T>>, key: string, data: T): void {
  map.set(key, { data, storedAt: Date.now() });
}

/** Optional flags for STARNET list calls used by the IDE STARNET dashboard. */
export type StarListFetchOptions = {
  /** Skip cache and replace stored entry (Refresh, after publish/install). */
  forceRefresh?: boolean;
};

/** Drop cached OAPP and holon lists (e.g. after logout or endpoint switch). */
export function invalidateStarnetListCache(): void {
  oappsListCache.clear();
  holonsListCache.clear();
  void window.electronAPI?.starnetListCacheClear?.();
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

/** First calls after STAR WebAPI start can block on OASIS boot (Holons, OAPPs, etc.). 15s was too short and surfaced as "The user aborted a request." */
const STAR_API_FETCH_TIMEOUT_MS = 180_000;

function isAbortError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    (e as { name: string }).name === 'AbortError'
  );
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** When AuthContext has no avatarId, derive it from the JWT so STAR filters holons correctly. */
function tryAvatarIdFromJwt(token: string | null): string | undefined {
  if (!token) return undefined;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return undefined;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    if (pad === 2) payload += '==';
    else if (pad === 3) payload += '=';
    const json: Record<string, unknown> = JSON.parse(atob(payload));
    const id = json.id ?? json.avatarId ?? json.sub;
    if (typeof id === 'string' && GUID_RE.test(id)) return id;
  } catch {
    /* ignore */
  }
  return undefined;
}

async function starFetch<T>(
  baseUrl: string,
  endpoint: string,
  token: string | null,
  options: RequestInit = {},
  avatarId?: string | null
): Promise<T> {
  const url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const aid = avatarId?.trim();
  const headerAvatar =
    aid && GUID_RE.test(aid) ? aid : tryAvatarIdFromJwt(token);
  if (headerAvatar) headers['X-Avatar-Id'] = headerAvatar;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STAR_API_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (e: unknown) {
    if (isAbortError(e)) {
      throw new Error(
        'STAR API request timed out while loading. If the API just started, wait for OASIS boot to finish, then click Refresh.'
      );
    }
    throw e;
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
  // STAR API wraps in { result: [...] } (camelCase or PascalCase)
  if (json?.result !== undefined) return json.result as T;
  if (json?.Result !== undefined) return json.Result as T;
  return json as T;
}

/**
 * Pull one holon list endpoint; returns [] on HTTP/logic errors so callers can merge safely.
 */
async function fetchHolonListFromEndpoint(
  baseUrl: string,
  endpoint: string,
  token: string | null,
  avatarId?: string | null
): Promise<StarHolonRecord[]> {
  try {
    const data = await starFetch<unknown>(baseUrl, endpoint, token, {}, avatarId);
    const raw = unwrapHolonListPayload(data);
    const out: StarHolonRecord[] = [];
    for (const item of raw) {
      const n = normalizeHolonRecord(item);
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Load STAR holon instances for the current avatar via `GET /api/Holons/load-all-for-avatar`.
 * When `forceRefresh` is true, also merges `GET /api/Holons` for legacy rows that only appear on the generic list.
 * Does not cache an empty result (avoids a stuck empty list after seeding or slow first load).
 */
export async function fetchAllHolons(
  baseUrl: string,
  token: string | null,
  avatarId?: string | null,
  options?: StarListFetchOptions
): Promise<StarHolonRecord[]> {
  const key = listCacheKey('holons', baseUrl, token, avatarId);
  if (!options?.forceRefresh) {
    const hit = getListCache(holonsListCache, key);
    if (hit && hit.length > 0) return hit;
  }
  const forAvatar = await fetchHolonListFromEndpoint(
    baseUrl,
    '/api/Holons/load-all-for-avatar',
    token,
    avatarId
  );
  let out: StarHolonRecord[];
  if (options?.forceRefresh) {
    const allHolons = await fetchHolonListFromEndpoint(
      baseUrl,
      '/api/Holons',
      token,
      avatarId
    );
    const byId = new Map<string, StarHolonRecord>();
    for (const h of forAvatar) byId.set(h.id, h);
    for (const h of allHolons) {
      if (!byId.has(h.id)) byId.set(h.id, h);
    }
    out = Array.from(byId.values());
  } else {
    out = [...forAvatar];
  }
  out.sort((a, b) =>
    (a.name ?? a.id).localeCompare(b.name ?? b.id, undefined, { sensitivity: 'base' })
  );
  if (out.length > 0) {
    setListCache(holonsListCache, key, out);
    void writeStarnetListToDisk(key, 'holons', out);
  }
  return out;
}

// ─── Public API calls ─────────────────────────────────────────────────────────

/**
 * Load all OAPPs for the currently authenticated avatar.
 * Uses /api/OAPPs/load-all-for-avatar — this endpoint responds reliably with auth.
 */
export async function fetchMyOapps(
  baseUrl: string,
  token: string | null,
  avatarId?: string | null,
  options?: StarListFetchOptions
): Promise<OAPPRecord[]> {
  const key = listCacheKey('oapps', baseUrl, token, avatarId);
  if (!options?.forceRefresh) {
    const hit = getListCache(oappsListCache, key);
    if (hit) return hit;
  }
  const data = await starFetch<OAPPRecord[] | unknown>(
    baseUrl,
    '/api/OAPPs/load-all-for-avatar',
    token,
    {},
    avatarId
  );
  const arr = Array.isArray(data) ? data : [];
  setListCache(oappsListCache, key, arr);
  if (arr.length > 0) void writeStarnetListToDisk(key, 'oapps', arr);
  return arr;
}

/**
 * Publish an OAPP to STARNET by its holon ID.
 */
export async function publishOapp(
  baseUrl: string,
  oappId: string,
  token: string | null,
  avatarId?: string | null
): Promise<void> {
  await starFetch<unknown>(baseUrl, `/api/OAPPs/${oappId}/publish`, token, { method: 'POST' }, avatarId);
}

/**
 * Install / download an OAPP by its holon ID.
 */
export async function downloadOapp(
  baseUrl: string,
  oappId: string,
  token: string | null,
  avatarId?: string | null
): Promise<void> {
  await starFetch<unknown>(
    baseUrl,
    `/api/OAPPs/${oappId}/download`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    avatarId
  );
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
