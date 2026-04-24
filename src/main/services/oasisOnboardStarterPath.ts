import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shipped Vite+TS app under `OASIS-IDE/docs/templates/oasis-onboard-starter`.
 * Resolved from `dist/main/services/` → repo `docs/…`.
 */
export function getOasisOnboardStarterSourceDir(): string {
  return path.join(__dirname, '../../../docs/templates/oasis-onboard-starter');
}

export async function oasisOnboardStarterSourceExists(): Promise<boolean> {
  try {
    const st = await fs.stat(getOasisOnboardStarterSourceDir());
    return st.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Sanitize a single path segment (folder name) under the workspace.
 */
export function sanitizeOasisStarterFolderName(raw: string): string {
  const t = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '');
  return t.length > 0 ? t : 'oasis-onboard-starter';
}

/**
 * Picks a non-existing directory name: `oasis-onboard-starter`, then
 * `oasis-onboard-starter-2`, `oasis-onboard-starter-3`, …
 */
export async function allocateOasisOnboardStarterDest(
  parentDir: string
): Promise<{ fullPath: string; folderName: string }> {
  const normParent = path.resolve(parentDir.trim());
  for (let i = 0; i < 50; i++) {
    const folderName =
      i === 0 ? 'oasis-onboard-starter' : `oasis-onboard-starter-${i + 1}`;
    const fullPath = path.join(normParent, folderName);
    const rel = path.relative(normParent, fullPath);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Invalid destination path');
    }
    try {
      await fs.access(fullPath);
    } catch {
      return { fullPath, folderName };
    }
  }
  throw new Error('Too many oasis-onboard-starter projects in this folder');
}
