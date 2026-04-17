/**
 * Resolves STAR WebAPI base URL for the IDE and MCP child process.
 *
 * Precedence:
 *   1. STAR_API_URL environment variable (explicit)
 *   2. First reachable candidate: URL from STAR WebAPI launchSettings.json (repo-relative), then common dev ports
 *   3. Fallback http://127.0.0.1:50564
 */
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

export const FALLBACK_STAR_API_URL = 'http://127.0.0.1:50564';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedResolved: string | null = null;

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
 * Call once during app startup (before MCP starts). Caches the result for sync readers.
 */
export async function resolveStarApiBaseUrl(): Promise<string> {
  if (cachedResolved) {
    return cachedResolved;
  }
  const envUrl = process.env.STAR_API_URL?.trim();
  if (envUrl) {
    cachedResolved = envUrl.replace(/\/$/, '');
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
    if (await probeHealth(base, 1200)) {
      cachedResolved = base;
      return cachedResolved;
    }
  }

  cachedResolved = fromLaunch ?? FALLBACK_STAR_API_URL;
  return cachedResolved;
}

/** Sync read after resolveStarApiBaseUrl() has run; otherwise returns the fallback. */
export function getResolvedStarApiBaseUrl(): string {
  return cachedResolved ?? FALLBACK_STAR_API_URL;
}
