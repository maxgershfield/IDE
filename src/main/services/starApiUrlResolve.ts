/**
 * Resolves STAR WebAPI base URL for the IDE and MCP child process.
 *
 * Precedence (must match renderer `getStarApiUrl` in `starApiService.ts`):
 *   1. Settings disk: starnetEndpointOverride (Integrations > STARNET), when non-empty
 *   2. STAR_API_URL environment variable (shell / OASIS-IDE/.env)
 *   3. First reachable candidate: URL from STAR WebAPI launchSettings.json (repo-relative), then common dev ports
 *   4. Fallback http://127.0.0.1:50564
 *
 * Rationale: a stale `STAR_API_URL=http://127.0.0.1:50564` in `.env.example`-style files must not
 * override the user's STARNET endpoint in Settings — otherwise the STARNET tab loads holons from
 * the correct host while the MCP child still hits localhost and returns ECONNREFUSED.
 */
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeStarApiBaseUrl } from '../../shared/starApiBaseUrl.js';

export const FALLBACK_STAR_API_URL = 'http://127.0.0.1:50564';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedResolved: string | null = null;

/** Clear cached URL so the next resolve can re-read env, settings, or probe (e.g. after Settings change). */
export function resetStarApiCache(): void {
  cachedResolved = null;
}

function tryReadLaunchSettingsStarUrl(): string | null {
  const candidates = [
    path.join(__dirname, '../../../../STAR ODK/NextGenSoftware.OASIS.STAR.WebAPI/Properties/launchSettings.json'),
    path.join(process.cwd(), 'STAR ODK/NextGenSoftware.OASIS.STAR.WebAPI/Properties/launchSettings.json'),
    path.join(process.cwd(), '../STAR ODK/NextGenSoftware.OASIS.STAR.WebAPI/Properties/launchSettings.json'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf8');
      const json = JSON.parse(raw) as {
        profiles?: Record<string, { applicationUrl?: string }>;
      };
      const httpProfile = json.profiles?.http ?? json.profiles?.https;
      const appUrl = httpProfile?.applicationUrl;
      if (!appUrl || typeof appUrl !== 'string') continue;
      const parts = appUrl.split(';').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (!part.startsWith('http://') && !part.startsWith('https://')) continue;
        try {
          const u = new URL(part);
          const host = u.hostname === 'localhost' ? '127.0.0.1' : u.hostname;
          const port =
            u.port ||
            (u.protocol === 'https:' ? '443' : '80');
          return `${u.protocol}//${host}:${port}`;
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function probeHealth(baseUrl: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    try {
      const u = new URL(`${baseUrl.replace(/\/$/, '')}/api/Health`);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        u,
        { method: 'GET', timeout: timeoutMs },
        (res) => {
          finish(res.statusCode !== undefined && res.statusCode < 500);
        }
      );
      req.on('error', () => finish(false));
      req.on('timeout', () => {
        req.destroy();
        finish(false);
      });
      req.end();
    } catch {
      finish(false);
    }
  });
}

/**
 * Call once during app startup (before MCP starts), and after Settings updates to STARNET endpoint.
 * Caches the result for sync readers.
 *
 * @param settingsStarnetOverride optional trimmed value from disk (starnetEndpointOverride)
 */
export async function resolveStarApiBaseUrl(settingsStarnetOverride?: string): Promise<string> {
  if (cachedResolved) {
    return cachedResolved;
  }

  const fromSettings = settingsStarnetOverride?.trim();
  if (fromSettings) {
    cachedResolved = normalizeStarApiBaseUrl(fromSettings);
    return cachedResolved;
  }

  const envUrl = process.env.STAR_API_URL?.trim();
  if (envUrl) {
    cachedResolved = normalizeStarApiBaseUrl(envUrl);
    return cachedResolved;
  }

  const fromLaunch = tryReadLaunchSettingsStarUrl();
  const candidates: string[] = [];
  const push = (u: string | null | undefined) => {
    if (!u) return;
    const n = u.replace(/\/$/, '');
    if (!candidates.includes(n)) {
      candidates.push(n);
    }
  };
  push(fromLaunch);
  push(FALLBACK_STAR_API_URL);
  push('http://127.0.0.1:5001');

  for (const base of candidates) {
    const normalized = normalizeStarApiBaseUrl(base);
    if (await probeHealth(normalized, 1200)) {
      cachedResolved = normalized;
      return cachedResolved;
    }
  }

  cachedResolved = normalizeStarApiBaseUrl(fromLaunch ?? FALLBACK_STAR_API_URL);
  return cachedResolved;
}

/** Sync read after resolveStarApiBaseUrl() has run; otherwise returns the fallback. */
export function getResolvedStarApiBaseUrl(): string {
  return cachedResolved ?? FALLBACK_STAR_API_URL;
}
