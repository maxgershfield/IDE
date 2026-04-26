import {
  ENTITLEMENT_CATALOG_VERSION,
  type EntitlementSlotStatus,
  type EntitlementSlotViewRow,
  type IdeEntitlementSlotsApiResponse,
} from '../../shared/entitlementSlotsTypes';
import { ENTITLEMENT_SLOTS_CATALOG } from '../../shared/entitlementSlotsCatalog';
import { BUNDLE_OASIS_API_BASE } from '../../shared/oasisIdeBundleDefaults.js';

function resolveOasisBaseUrl(oasisApiEndpoint: string | undefined): string {
  const t = (oasisApiEndpoint ?? '').trim();
  if (t) return t.replace(/\/$/, '');
  return BUNDLE_OASIS_API_BASE;
}

function normalizeStates(body: IdeEntitlementSlotsApiResponse | null): Record<
  string,
  { status: EntitlementSlotStatus } & Record<string, string | undefined>
> {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  const states = (b.states ?? b.States) as Record<string, unknown> | undefined;
  if (!states || typeof states !== 'object') return {};
  return states as Record<string, { status: EntitlementSlotStatus } & Record<string, string | undefined>>;
}

export interface FetchEntitlementSlotsResult {
  rows: EntitlementSlotViewRow[];
  catalogVersion: string;
  generatedAt?: string;
  avatarId?: string;
  catalogMismatch: boolean;
  /** User-facing problem (ONODE down, 5xx, etc.). */
  error?: string;
  /** Non-alarming note (e.g. entitlement API not deployed on this ONODE). */
  info?: string;
}

/**
 * Merges local catalog with ONODE GET /api/ide/entitlement-slots.
 * On failure, returns catalog with all slots locked and error message.
 */
export async function fetchEntitlementSlotsView(
  oasisApiEndpoint: string | undefined,
  jwt: string | null
): Promise<FetchEntitlementSlotsResult> {
  const base = resolveOasisBaseUrl(oasisApiEndpoint);
  const url = `${base}/api/ide/entitlement-slots`;

  /** No token yet: show catalog as locked without treating it as a fetch error (user may log in next). */
  if (!jwt?.trim()) {
    return {
      rows: mergeStates({}),
      catalogVersion: ENTITLEMENT_CATALOG_VERSION,
      catalogMismatch: false,
    };
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt.trim()}`,
        Accept: 'application/json',
      },
    });

    const text = await res.text();
    let body: IdeEntitlementSlotsApiResponse | null = null;
    try {
      body = text ? (JSON.parse(text) as IdeEntitlementSlotsApiResponse) : null;
    } catch {
      body = null;
    }

    if (res.status === 404) {
      return {
        rows: mergeStates({}),
        catalogVersion: ENTITLEMENT_CATALOG_VERSION,
        catalogMismatch: false,
        info:
          'Browsing the built-in pass list. This ONODE does not expose pass verification yet (404), so every slot stays locked until that API is deployed. That is expected here, not a sign you have no purchases.',
      };
    }

    if (res.status === 401) {
      return {
        rows: mergeStates({}),
        catalogVersion: ENTITLEMENT_CATALOG_VERSION,
        catalogMismatch: false,
        error: 'Session expired or unauthorized. Log in again to load pass states.',
      };
    }

    if (!res.ok || !body) {
      return {
        rows: mergeStates({}),
        catalogVersion: ENTITLEMENT_CATALOG_VERSION,
        catalogMismatch: false,
        error: `Could not sync pass state (${res.status}). Check that ONODE is running at ${base}.`,
      };
    }

    const raw = body as Record<string, unknown>;
    const states = normalizeStates(body as IdeEntitlementSlotsApiResponse);
    const sv = String(raw.catalogVersion ?? raw.CatalogVersion ?? ENTITLEMENT_CATALOG_VERSION);
    const catalogMismatch = sv !== ENTITLEMENT_CATALOG_VERSION;
    const generatedAt =
      typeof raw.generatedAt === 'string'
        ? raw.generatedAt
        : typeof raw.GeneratedAt === 'string'
          ? raw.GeneratedAt
          : undefined;
    const avatarId =
      typeof raw.avatarId === 'string'
        ? raw.avatarId
        : typeof raw.AvatarId === 'string'
          ? raw.AvatarId
          : undefined;

    return {
      rows: mergeStates(states),
      catalogVersion: sv,
      generatedAt,
      avatarId,
      catalogMismatch,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      rows: mergeStates({}),
      catalogVersion: ENTITLEMENT_CATALOG_VERSION,
      catalogMismatch: false,
      error: `Network error: ${msg}`,
    };
  }
}

function pickStr(obj: unknown, a: string, b: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const r = obj as Record<string, unknown>;
  const v = r[a] ?? r[b];
  return typeof v === 'string' ? v : undefined;
}

function mergeStates(
  states: Record<string, { status?: EntitlementSlotStatus } & Record<string, string | undefined>>
): EntitlementSlotViewRow[] {
  return ENTITLEMENT_SLOTS_CATALOG.map((c) => {
    const s = states[c.skuId];
    const raw = pickStr(s, 'status', 'Status');
    const effectiveStatus: EntitlementSlotStatus =
      raw === 'active' || raw === 'pending' || raw === 'locked' ? raw : 'locked';
    return {
      ...c,
      effectiveStatus,
      verifiedAt: pickStr(s, 'verifiedAt', 'VerifiedAt'),
      walletAddress: pickStr(s, 'walletAddress', 'WalletAddress'),
      chain: pickStr(s, 'chain', 'Chain'),
      tokenId: pickStr(s, 'tokenId', 'TokenId'),
    };
  });
}
