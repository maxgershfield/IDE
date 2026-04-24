import axios from 'axios';
import { normalizeStarApiBaseUrl } from '../../shared/starApiBaseUrl.js';
import type { OASISAPIClient } from './OASISAPIClient.js';

/**
 * Fetches counts the OASIS Portal can show: A2A inbox (OASIS API) and NFTs (STAR WebAPI),
 * so the IDE can notice changes without opening the browser.
 */
export type PortalActivityPollResult =
  | {
      ok: true;
      a2aMessageCount: number;
      /** Length of /api/NFTs/load-all-for-avatar, or null if STAR request failed. */
      nftCount: number | null;
      a2aError?: string;
      starError?: string;
    }
  | { ok: false; error: string };

export async function fetchPortalActivitySnapshot(
  oasis: OASISAPIClient,
  starBaseUrl: string,
  token: string
): Promise<PortalActivityPollResult> {
  if (!token?.trim()) {
    return { ok: false, error: 'not_authenticated' };
  }

  let a2aMessageCount = 0;
  let a2aError: string | undefined;
  try {
    const msgs = await oasis.getPendingA2AMessages();
    a2aMessageCount = Array.isArray(msgs) ? msgs.length : 0;
  } catch (e: unknown) {
    a2aError = e instanceof Error ? e.message : String(e);
  }

  const normalized = normalizeStarApiBaseUrl(starBaseUrl.trim() || 'http://127.0.0.1:50564');
  const url = `${normalized}/api/NFTs/load-all-for-avatar`;
  let nftCount: number | null = null;
  let starError: string | undefined;
  try {
    const r = await axios.get<unknown>(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 25000,
      validateStatus: (s) => s < 500
    });
    if (r.status >= 400) {
      starError = `HTTP ${r.status}`;
    } else {
      const d = r.data as Record<string, unknown> & { result?: unknown };
      const list = d.result !== undefined ? d.result : d;
      nftCount = Array.isArray(list) ? list.length : 0;
    }
  } catch (e: unknown) {
    starError = e instanceof Error ? e.message : String(e);
  }

  return {
    ok: true,
    a2aMessageCount,
    nftCount,
    a2aError,
    starError
  };
}
