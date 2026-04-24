/**
 * HolonicIndexService
 *
 * Cursor-style codebase indexing, but with holons as the indexing unit.
 *
 * Rather than chunking every file into 1400-char slices (Cursor's approach),
 * this service treats each top-level workspace directory as a *holon* — a
 * meaningful, self-describing architectural component. Each holon gets a single
 * rich document built from its README, manifest, and entry-point file, which is
 * then optionally embedded via OpenAI.
 *
 * Benefits over file-chunk indexing:
 *   - 177 holons vs 46k file chunks → much cheaper to embed + faster to search
 *   - Architecturally meaningful units the agent can reason about
 *   - Natural parent/child relationships preserved
 *   - Works immediately (keyword search) even without an OpenAI API key
 */

import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { createHash } from 'crypto';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const INDEX_VERSION = 1;
const MAX_HOLONS = 600;
const MAX_ENTRY_CHARS = 2800;
const MAX_README_CHARS = 600;
const MAX_MANIFEST_CHARS = 400;
const DEFAULT_MODEL = 'text-embedding-3-small';
const EMBED_BATCH = 20;
const EMBED_TIMEOUT_MS = 60_000;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', 'target',
  '__pycache__', '.venv', 'venv', 'release', '.turbo', '.cache', 'Pods',
  'DerivedData', '.idea', '.vscode', 'bin', 'obj', 'packages', 'vendor',
  'tmp', 'temp', 'logs', 'Archived', 'Images', 'Logos',
]);

const ENTRY_FILES = [
  'index.ts', 'index.tsx', 'index.js', 'index.jsx',
  'mod.rs', 'lib.rs', '__init__.py',
  'Program.cs', 'Startup.cs', 'Main.cs', 'main.cs',
  'main.go', 'main.py', 'app.ts', 'app.js',
];

const MANIFEST_FILES = [
  'package.json', 'Cargo.toml', 'pyproject.toml',
  'setup.py', 'go.mod', 'build.gradle',
];

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type IndexPhase =
  | 'idle'
  | 'scanning'
  | 'reading'
  | 'embedding'
  | 'saving'
  | 'ready'
  | 'error';

export interface HolonIndexEntry {
  /** Directory name (the holon's local identifier) */
  dirName: string;
  /** Path relative to workspace root */
  dirPath: string;
  /** Combined document used for embedding / keyword search */
  holonDocument: string;
  /** OpenAI embedding vector — null when running in keyword-only mode */
  embedding: number[] | null;
  /** Shallow file count in directory */
  fileCount: number;
  hasEntryPoint: boolean;
  /** 'typescript' | 'csharp' | 'rust' | 'python' | 'go' | null */
  projectType: string | null;
}

export interface HolonicIndexFile {
  version: number;
  workspaceRoot: string;
  model: string | null;
  builtAt: number;
  holonCount: number;
  hasEmbeddings: boolean;
  entries: HolonIndexEntry[];
}

export interface HolonicIndexStatus {
  phase: IndexPhase;
  holonsIndexed: number;
  holonsTotal: number;
  lastBuiltAt: number | null;
  hasEmbeddings: boolean;
  error: string | null;
}

export type IndexProgressCallback = (status: HolonicIndexStatus) => void;

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function workspaceId(root: string): string {
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 32);
}

function indexDir(): string {
  return path.join(app.getPath('userData'), 'oasis-ide-holonic');
}

function indexPath(root: string): string {
  return path.join(indexDir(), `${workspaceId(root)}.json`);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

function keywordScore(query: string, doc: string): number {
  const tokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const lower = doc.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    let pos = 0;
    while ((pos = lower.indexOf(t, pos)) !== -1) {
      score++;
      pos += t.length;
    }
  }
  return score;
}

function openAiBase(): string {
  return (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
}

async function fetchEmbeddings(apiKey: string, model: string, inputs: string[]): Promise<number[][]> {
  const res = await fetch(`${openAiBase()}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: inputs.map((t) => t.slice(0, 8000)) }),
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings HTTP ${res.status}`);
  const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
  return data.data.sort((a, b) => a.index - b.index).map((r) => r.embedding);
}

async function safeRead(p: string, maxChars: number): Promise<string | null> {
  try {
    const buf = await fs.readFile(p);
    if (buf.length === 0 || buf.length > 256 * 1024) return null;
    const text = buf.toString('utf-8');
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text.slice(0, 512))) return null;
    return text.slice(0, maxChars);
  } catch {
    return null;
  }
}

function detectProjectType(entry: string, manifest: string): string | null {
  if (entry) {
    if (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.js')) return 'typescript';
    if (entry.endsWith('.cs')) return 'csharp';
    if (entry.endsWith('.rs')) return 'rust';
    if (entry.endsWith('.py')) return 'python';
    if (entry.endsWith('.go')) return 'go';
  }
  if (manifest) {
    if (manifest.includes('package.json') || manifest.includes('"scripts"')) return 'typescript';
    if (manifest.includes('[package]') && manifest.includes('edition')) return 'rust';
    if (manifest.includes('[tool.poetry]') || manifest.includes('python_requires')) return 'python';
  }
  return null;
}

/* ─── Service ────────────────────────────────────────────────────────────── */

export class HolonicIndexService {
  private status: HolonicIndexStatus = {
    phase: 'idle',
    holonsIndexed: 0,
    holonsTotal: 0,
    lastBuiltAt: null,
    hasEmbeddings: false,
    error: null,
  };
  private cancelRequested = false;
  private onProgress: IndexProgressCallback | null = null;
  private buildPromise: Promise<void> | null = null;

  setProgressCallback(cb: IndexProgressCallback): void {
    this.onProgress = cb;
  }

  private emit(patch: Partial<HolonicIndexStatus>): void {
    this.status = { ...this.status, ...patch };
    this.onProgress?.(this.status);
  }

  getStatus(): HolonicIndexStatus {
    return { ...this.status };
  }

  cancel(): void {
    this.cancelRequested = true;
  }

  /**
   * Load a previously saved index status from disk (called when workspace opens).
   * Updates the status so the renderer immediately knows if holons were indexed.
   */
  async loadStoredStatus(workspaceRoot: string): Promise<HolonicIndexStatus> {
    try {
      const raw = await fs.readFile(indexPath(workspaceRoot), 'utf-8');
      const idx = JSON.parse(raw) as HolonicIndexFile;
      if (idx.version === INDEX_VERSION && idx.workspaceRoot === path.resolve(workspaceRoot)) {
        this.status = {
          phase: 'ready',
          holonsIndexed: idx.holonCount,
          holonsTotal: idx.holonCount,
          lastBuiltAt: idx.builtAt,
          hasEmbeddings: idx.hasEmbeddings,
          error: null,
        };
        this.onProgress?.(this.status);
      }
    } catch {
      /* no cached index yet — stay idle */
    }
    return this.getStatus();
  }

  /**
   * Build (or rebuild) the holonic index for the given workspace root.
   * Returns immediately — progress is emitted via the registered callback.
   * Subsequent calls while a build is running are ignored.
   */
  buildIndex(workspaceRoot: string): void {
    if (this.buildPromise) return;
    this.buildPromise = this._buildIndex(workspaceRoot).finally(() => {
      this.buildPromise = null;
    });
  }

  private async _buildIndex(workspaceRoot: string): Promise<void> {
    this.cancelRequested = false;
    const absRoot = path.resolve(workspaceRoot);
    const apiKey = process.env.OPENAI_API_KEY?.trim() || null;
    const model = apiKey
      ? process.env.OASIS_IDE_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL
      : null;

    /* ── 1. Scan root dirs ── */
    this.emit({ phase: 'scanning', holonsIndexed: 0, holonsTotal: 0, error: null });

    let dirNames: string[];
    try {
      const dirents = await fs.readdir(absRoot, { withFileTypes: true });
      dirNames = dirents
        .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name) && !d.name.startsWith('.'))
        .map((d) => d.name)
        .slice(0, MAX_HOLONS);
    } catch (e) {
      this.emit({ phase: 'error', error: `Cannot read workspace: ${e}` });
      return;
    }

    this.emit({ phase: 'reading', holonsTotal: dirNames.length });

    /* ── 2. Read entry points for each holon ── */
    const entries: HolonIndexEntry[] = [];

    for (let i = 0; i < dirNames.length; i++) {
      if (this.cancelRequested) {
        this.emit({ phase: 'idle' });
        return;
      }

      const dirName = dirNames[i]!;
      const dirAbs = path.join(absRoot, dirName);

      let fileCount = 0;
      let hasEntryPoint = false;
      let entryFoundName = '';
      let entryContent = '';
      let readmeContent = '';
      let manifestName = '';
      let manifestContent = '';

      try {
        const children = await fs.readdir(dirAbs, { withFileTypes: true });
        fileCount = children.filter((c) => c.isFile()).length;

        /* Entry point */
        for (const name of ENTRY_FILES) {
          const text = await safeRead(path.join(dirAbs, name), MAX_ENTRY_CHARS);
          if (text !== null) {
            entryContent = text;
            entryFoundName = name;
            hasEntryPoint = true;
            break;
          }
        }

        /* README */
        for (const name of ['README.md', 'README.MD', 'README']) {
          const text = await safeRead(path.join(dirAbs, name), MAX_README_CHARS);
          if (text !== null) { readmeContent = text; break; }
        }

        /* Manifest */
        for (const name of MANIFEST_FILES) {
          const text = await safeRead(path.join(dirAbs, name), MAX_MANIFEST_CHARS);
          if (text !== null) { manifestName = name; manifestContent = text; break; }
        }

        /* *.csproj fallback for C# projects */
        if (!manifestContent) {
          const csproj = children.find((c) => c.isFile() && c.name.endsWith('.csproj'));
          if (csproj) {
            const text = await safeRead(path.join(dirAbs, csproj.name), MAX_MANIFEST_CHARS);
            if (text) { manifestName = csproj.name; manifestContent = text; }
          }
        }
      } catch {
        /* directory unreadable — still add a stub entry */
      }

      /* Build holonic document */
      const docParts: string[] = [`Holon: ${dirName}`];
      if (readmeContent) docParts.push(`Description:\n${readmeContent.trim()}`);
      if (manifestContent) docParts.push(`Manifest (${manifestName}):\n${manifestContent.trim()}`);
      if (entryContent) docParts.push(`Entry point (${entryFoundName}):\n${entryContent.trim()}`);

      entries.push({
        dirName,
        dirPath: dirName,
        holonDocument: docParts.join('\n\n'),
        embedding: null,
        fileCount,
        hasEntryPoint,
        projectType: detectProjectType(entryFoundName, manifestName),
      });

      this.emit({ holonsIndexed: i + 1 });
    }

    if (this.cancelRequested) { this.emit({ phase: 'idle' }); return; }

    /* ── 3. Embed with OpenAI (optional) ── */
    let hasEmbeddings = false;
    if (apiKey && model && entries.length > 0) {
      this.emit({ phase: 'embedding' });
      try {
        for (let i = 0; i < entries.length; i += EMBED_BATCH) {
          if (this.cancelRequested) { this.emit({ phase: 'idle' }); return; }
          const batch = entries.slice(i, i + EMBED_BATCH);
          const vecs = await fetchEmbeddings(apiKey, model, batch.map((e) => e.holonDocument));
          for (let j = 0; j < batch.length; j++) {
            batch[j]!.embedding = vecs[j] ?? null;
          }
          this.emit({ holonsIndexed: Math.min(i + EMBED_BATCH, entries.length) });
          if (i + EMBED_BATCH < entries.length) await new Promise((r) => setTimeout(r, 100));
        }
        hasEmbeddings = true;
      } catch (e) {
        console.warn('[HolonicIndex] Embedding failed — falling back to keyword search:', e);
      }
    }

    /* ── 4. Save ── */
    this.emit({ phase: 'saving' });
    const idx: HolonicIndexFile = {
      version: INDEX_VERSION,
      workspaceRoot: absRoot,
      model: model ?? null,
      builtAt: Date.now(),
      holonCount: entries.length,
      hasEmbeddings,
      entries,
    };

    try {
      await fs.mkdir(indexDir(), { recursive: true });
      await fs.writeFile(indexPath(absRoot), JSON.stringify(idx), 'utf-8');
    } catch (e) {
      this.emit({ phase: 'error', error: `Index save failed: ${e}` });
      return;
    }

    this.emit({
      phase: 'ready',
      holonsIndexed: entries.length,
      holonsTotal: entries.length,
      lastBuiltAt: Date.now(),
      hasEmbeddings,
      error: null,
    });
  }

  /** Delete the stored index for a workspace. */
  async deleteIndex(workspaceRoot: string): Promise<void> {
    try {
      await fs.unlink(indexPath(workspaceRoot));
    } catch { /* already gone */ }
    this.status = {
      phase: 'idle',
      holonsIndexed: 0,
      holonsTotal: 0,
      lastBuiltAt: null,
      hasEmbeddings: false,
      error: null,
    };
    this.onProgress?.(this.status);
  }

  /**
   * Search the holonic index.
   * Uses cosine similarity when embeddings are available, BM25-style keyword
   * scoring otherwise. Always returns holons (not file chunks).
   */
  async search(
    workspaceRoot: string,
    query: string,
    limit = 8
  ): Promise<Array<{ dirName: string; excerpt: string; score: number }>> {
    let idx: HolonicIndexFile;
    try {
      const raw = await fs.readFile(indexPath(workspaceRoot), 'utf-8');
      idx = JSON.parse(raw) as HolonicIndexFile;
    } catch {
      return [];
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim() || null;

    if (idx.hasEmbeddings && apiKey && idx.model) {
      try {
        const [qVec] = await fetchEmbeddings(apiKey, idx.model, [query]);
        if (qVec) {
          return idx.entries
            .filter((e) => e.embedding !== null)
            .map((e) => ({
              dirName: e.dirName,
              excerpt: e.holonDocument.slice(0, 320),
              score: cosineSimilarity(qVec, e.embedding!),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        }
      } catch { /* fall through */ }
    }

    /* Keyword fallback */
    return idx.entries
      .map((e) => ({
        dirName: e.dirName,
        excerpt: e.holonDocument.slice(0, 320),
        score: keywordScore(query, e.holonDocument),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
