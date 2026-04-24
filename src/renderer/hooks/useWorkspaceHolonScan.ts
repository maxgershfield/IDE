/**
 * useWorkspaceHolonScan — Tier 2 background content scanner
 *
 * Runs once when the workspace path changes. Reads a bounded set of root-level
 * manifest files and per-directory entry points, extracts content signals
 * (language, framework, OASIS API usage, holon-like patterns), and caches the
 * result in localStorage under 'oasis-ide:holon-scan-v2'.
 *
 * The hook returns the most recent scan result (from cache or live scan).
 * It never blocks the UI — all reads are async fire-and-forget.
 *
 * Files read (all optional, short-circuit on first read error):
 *   • package.json                  → language, framework, description
 *   • Cargo.toml                    → Rust project
 *   • pyproject.toml / setup.py     → Python project
 *   • *.csproj (first found)        → C# / Unity / OASIS project
 *   • README.md                     → project description (first 600 chars)
 *   • <dir>/index.ts|js|cs|py       → per-domain-dir entry point signals
 */

import { useEffect, useState } from 'react';
import {
  extractSignals,
  loadCachedScan,
  saveScanToCache,
  type WorkspaceHolonScanResult,
  type ContentSignal,
} from '../utils/holonWorkspaceAnnotation';
import type { TreeNode } from '../contexts/WorkspaceContext';

/* ─── Constants ─────────────────────────────────────────────────────────── */

/** Root manifest files to probe, in priority order */
const ROOT_MANIFESTS = [
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
];

/** Possible entry-point file names inside each directory (tried in order) */
const DIR_ENTRY_FILES = [
  'index.ts', 'index.tsx', 'index.js', 'index.jsx',
  'mod.rs', 'lib.rs',
  '__init__.py',
  'Program.cs', 'Startup.cs',
];

/** Max chars read from any single file (avoids flooding the main process) */
const MAX_FILE_CHARS = 6_000;

/** Infra/utility dirs — skip content scan for these */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.git', '.github', 'coverage',
  '__pycache__', 'target', 'bin', 'obj', '.next', '.nuxt', '.vite',
  'public', 'assets', 'static', 'media', 'docs', 'documentation',
]);

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function getReadFile(): ((path: string) => Promise<string | null>) | null {
  return (window as any).electronAPI?.readFile ?? null;
}

async function safeRead(readFile: (p: string) => Promise<string | null>, path: string): Promise<string | null> {
  try {
    const content = await readFile(path);
    if (!content) return null;
    return content.slice(0, MAX_FILE_CHARS);
  } catch {
    return null;
  }
}

/** Detect language, framework, and description from package.json content. */
function parsePackageJson(raw: string): {
  language: string;
  framework?: string;
  description?: string;
  usesOasis: boolean;
} {
  try {
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    };
    const depNames = Object.keys(deps).map((k) => k.toLowerCase());

    let framework: string | undefined;
    if (depNames.some((d) => d === 'react' || d === 'react-dom')) framework = 'React';
    if (depNames.some((d) => d === 'vue')) framework = 'Vue';
    if (depNames.some((d) => d === 'svelte')) framework = 'Svelte';
    if (depNames.some((d) => d === 'next')) framework = 'Next.js';
    if (depNames.some((d) => d === 'nuxt')) framework = 'Nuxt';
    if (depNames.some((d) => d === '@hyperfy/core' || d.includes('hyperfy'))) framework = 'Hyperfy';
    if (depNames.some((d) => d === 'three' || d === 'three.js')) framework = framework ?? 'Three.js';
    if (depNames.some((d) => d === 'babylonjs' || d === '@babylonjs/core')) framework = 'Babylon.js';
    if (depNames.some((d) => d === 'electron')) framework = framework ? `${framework} + Electron` : 'Electron';

    const usesOasis = depNames.some((d) => d.startsWith('@oasis') || d.includes('oasis-api'));
    const description = typeof pkg.description === 'string' && pkg.description.trim()
      ? pkg.description.trim().slice(0, 200)
      : undefined;

    return { language: 'TypeScript/JavaScript', framework, description, usesOasis };
  } catch {
    return { language: 'TypeScript/JavaScript', usesOasis: false };
  }
}

/** Find the first .csproj file name among root tree nodes */
function findCsproj(nodes: TreeNode[]): string | null {
  for (const node of nodes) {
    if (!node.isDirectory && node.name.endsWith('.csproj')) return node.name;
  }
  return null;
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */

/**
 * Returns the latest workspace holon scan result (tier 2 file content signals).
 * Updates asynchronously — starts as null or cached value, then updates.
 */
export function useWorkspaceHolonScan(
  workspacePath: string | null,
  tree: TreeNode[]
): WorkspaceHolonScanResult | null {
  const [result, setResult] = useState<WorkspaceHolonScanResult | null>(() => {
    if (!workspacePath) return null;
    return loadCachedScan(workspacePath);
  });

  useEffect(() => {
    if (!workspacePath || !tree || tree.length === 0) {
      setResult(null);
      return;
    }

    // Immediately serve from cache if fresh
    const cached = loadCachedScan(workspacePath);
    if (cached) {
      setResult(cached);
      return;
    }

    const readFile = getReadFile();
    if (!readFile) return;

    let cancelled = false;

    const run = async () => {
      const base = workspacePath.replace(/[/\\]+$/, '');

      const scan: WorkspaceHolonScanResult = {
        workspacePath,
        scannedAt: Date.now(),
        usesOasisApi: false,
        dirSignals: {},
      };

      /* ── Read root manifests ── */

      // package.json
      const pkgRaw = await safeRead(readFile, `${base}/package.json`);
      if (pkgRaw) {
        const parsed = parsePackageJson(pkgRaw);
        scan.projectLanguage = parsed.language;
        scan.projectFramework = parsed.framework;
        scan.projectDescription = parsed.description;
        scan.usesOasisApi = scan.usesOasisApi || parsed.usesOasis;
        // Also extract signals from package.json body
        const pkgSignals = extractSignals(pkgRaw);
        if (pkgSignals.includes('oasis-import')) scan.usesOasisApi = true;
      }

      if (cancelled) return;

      // Cargo.toml → Rust
      const cargoRaw = await safeRead(readFile, `${base}/Cargo.toml`);
      if (cargoRaw) {
        scan.projectLanguage = 'Rust';
        const sigs = extractSignals(cargoRaw);
        if (sigs.includes('oasis-import')) scan.usesOasisApi = true;
      }

      if (cancelled) return;

      // pyproject.toml / setup.py → Python
      const pyRaw =
        await safeRead(readFile, `${base}/pyproject.toml`) ??
        await safeRead(readFile, `${base}/setup.py`);
      if (pyRaw) {
        scan.projectLanguage = 'Python';
        const sigs = extractSignals(pyRaw);
        if (sigs.includes('oasis-import')) scan.usesOasisApi = true;
      }

      if (cancelled) return;

      // *.csproj → C# (may be Unity or OASIS .NET)
      const csprojName = findCsproj(tree);
      if (csprojName) {
        const csprojRaw = await safeRead(readFile, `${base}/${csprojName}`);
        scan.projectLanguage = 'C#';
        if (csprojRaw) {
          const sigs = extractSignals(csprojRaw);
          if (sigs.includes('oasis-import') || sigs.includes('oasis-attribute')) scan.usesOasisApi = true;
          if (csprojRaw.includes('UnityEngine')) scan.projectFramework = 'Unity';
        }
      }

      if (cancelled) return;

      // README.md — grab description from first non-heading paragraph
      if (!scan.projectDescription) {
        const readmeRaw = await safeRead(readFile, `${base}/README.md`);
        if (readmeRaw) {
          const firstPara = readmeRaw
            .split('\n')
            .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('!'))
            .slice(0, 2)
            .join(' ')
            .slice(0, 200);
          if (firstPara) scan.projectDescription = firstPara;
        }
      }

      if (cancelled) return;

      /* ── Per-domain-directory entry point scan ── */

      const domainDirs = tree.filter(
        (n) => n.isDirectory && !SKIP_DIRS.has(n.name.toLowerCase()) && !n.name.startsWith('.')
      );

      for (const dir of domainDirs) {
        if (cancelled) return;
        const allSignals: ContentSignal[] = [];

        for (const entry of DIR_ENTRY_FILES) {
          const content = await safeRead(readFile, `${base}/${dir.name}/${entry}`);
          if (!content) continue;
          const sigs = extractSignals(content);
          for (const s of sigs) {
            if (!allSignals.includes(s)) allSignals.push(s);
          }
          if (sigs.includes('oasis-import') || sigs.includes('iholon-impl')) {
            scan.usesOasisApi = true;
          }
          break; // only scan the first entry file found per directory
        }

        if (allSignals.length > 0) {
          scan.dirSignals[dir.name.toLowerCase()] = allSignals;
        }
      }

      if (cancelled) return;

      saveScanToCache(scan);
      setResult(scan);
    };

    void run();
    return () => { cancelled = true; };
  }, [workspacePath, tree]);

  return result;
}
