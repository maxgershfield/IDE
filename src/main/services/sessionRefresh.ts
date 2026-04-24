/**
 * Schedules JWT refresh via OASIS POST /api/avatar/refresh-token before access token expiry.
 */
import { Buffer } from 'node:buffer';
import type { OASISAPIClient } from './OASISAPIClient.js';
import type { MCPServerManager } from './MCPServerManager.js';
import { saveAuth } from './AuthStore.js';

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Decode JWT `exp` (seconds) to milliseconds since epoch. */
export function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    if (pad === 2) payload += '==';
    else if (pad === 3) payload += '=';
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { exp?: number };
    if (typeof json.exp === 'number') return json.exp * 1000;
  } catch {
    return null;
  }
  return null;
}

export function clearSessionRefreshTimer(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000;
const MIN_DELAY_MS = 15_000;
const FALLBACK_INTERVAL_MS = 10 * 60 * 1000;

export interface SessionRefreshDeps {
  oasisClient: OASISAPIClient;
  mcpManager: MCPServerManager;
  getUsername: () => string | undefined;
  getAvatarId: () => string | undefined;
}

/**
 * Schedule a single refresh before JWT expiry, then re-schedule recursively.
 */
export function scheduleSessionRefresh(deps: SessionRefreshDeps): void {
  clearSessionRefreshTimer();
  const rt = deps.oasisClient.getRefreshToken();
  const jwt = deps.oasisClient.getAuthToken();
  if (!rt || !jwt) {
    return;
  }

  const expMs = decodeJwtExpMs(jwt);
  const now = Date.now();
  let delay: number;
  if (expMs != null) {
    delay = Math.max(MIN_DELAY_MS, expMs - REFRESH_BEFORE_EXPIRY_MS - now);
  } else {
    delay = FALLBACK_INTERVAL_MS;
  }

  refreshTimer = setTimeout(() => {
    void runRefreshAndReschedule(deps);
  }, delay);
}

async function runRefreshAndReschedule(deps: SessionRefreshDeps): Promise<void> {
  const rt = deps.oasisClient.getRefreshToken();
  if (!rt) {
    return;
  }
  try {
    const out = await deps.oasisClient.refreshSession(rt);
    await saveAuth({
      token: out.token,
      refreshToken: out.refreshToken || rt,
      username: out.username ?? deps.getUsername(),
      avatarId: out.avatarId || deps.getAvatarId()
    });
    deps.mcpManager.setOasisJwtToken(out.token);
    deps.mcpManager.setOasisAvatarId(out.avatarId || deps.getAvatarId() || null);
    try {
      await deps.mcpManager.restartOASISMCP();
    } catch (e: unknown) {
      console.warn('[SessionRefresh] MCP restart after token refresh failed:', e);
    }
    console.log('[SessionRefresh] JWT refreshed successfully');
    scheduleSessionRefresh(deps);
  } catch (e: unknown) {
    console.error('[SessionRefresh] Refresh failed:', e);
    refreshTimer = setTimeout(() => {
      void runRefreshAndReschedule(deps);
    }, 60_000);
  }
}

/**
 * If JWT expires within `withinMs`, refresh immediately (e.g. on cold start with stale token).
 */
export async function refreshSessionIfExpiringSoon(
  deps: SessionRefreshDeps,
  withinMs: number
): Promise<boolean> {
  const rt = deps.oasisClient.getRefreshToken();
  const jwt = deps.oasisClient.getAuthToken();
  if (!rt || !jwt) {
    return false;
  }
  const expMs = decodeJwtExpMs(jwt);
  if (expMs == null) {
    return false;
  }
  if (expMs - Date.now() > withinMs) {
    return false;
  }
  try {
    const out = await deps.oasisClient.refreshSession(rt);
    await saveAuth({
      token: out.token,
      refreshToken: out.refreshToken || rt,
      username: out.username ?? deps.getUsername(),
      avatarId: out.avatarId || deps.getAvatarId()
    });
    deps.mcpManager.setOasisJwtToken(out.token);
    deps.mcpManager.setOasisAvatarId(out.avatarId || deps.getAvatarId() || null);
    try {
      await deps.mcpManager.restartOASISMCP();
    } catch (e: unknown) {
      console.warn('[SessionRefresh] MCP restart after startup refresh failed:', e);
    }
    console.log('[SessionRefresh] JWT refreshed on startup (was expiring soon)');
    return true;
  } catch (e: unknown) {
    console.warn('[SessionRefresh] Startup refresh failed:', e);
    return false;
  }
}
