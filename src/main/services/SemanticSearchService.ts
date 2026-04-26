import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

/** Persisted index format; bump INDEX_VERSION when layout changes. */
const INDEX_VERSION = 1;
const DEFAULT_MODEL = 'text-embedding-3-small';
const MAX_FILES_INDEXED = 4000;
const MAX_CHUNKS = 6000;
const MAX_CHUNKS_PER_FILE = 80;
const CHUNK_CHARS = 1400;
const CHUNK_OVERLAP = 200;
const MAX_FILE_BYTES = 512 * 1024;
const STALE_MS = 45 * 60 * 1000;
const EMBED_BATCH = 64;
const EMBED_TIMEOUT_MS = 120_000;

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'release',
  'build',
  'Build',
  'Builds',
  'out',
  'coverage',
  'TestResults',
  '.next',
  '.nuxt',
  'target',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  '.venv',
  'venv',
  '.turbo',
  '.cache',
  '.vite',
  '.pnpm-store',
  '.nuget',
  'Pods',
  'DerivedData',
  'Library',
  'Temp',
  'UserSettings',
  'Archived',
  'holochain-client-csharp.backup',
  'OASIS Omniverse'
]);

const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdx',
  '.css',
  '.scss',
  '.html',
  '.vue',
  '.svelte',
  '.cs',
  '.fs',
  '.rs',
  '.go',
  '.py',
  '.rb',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.toml',
  '.yaml',
  '.yml',
  '.xml',
  '.sh',
  '.zsh',
  '.bash',
  '.env',
  '.svg'
]);

export interface SemanticSearchChunk {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  embedding: number[];
}

export interface SemanticIndexFile {
  version: number;
  workspaceRoot: string;
  model: string;
  builtAt: number;
  manifest: Record<string, number>;
  chunks: SemanticSearchChunk[];
}

function workspaceId(root: string): string {
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 32);
}

function indexDir(): string {
  return path.join(app.getPath('userData'), 'oasis-ide-semantic');
}

function indexPath(root: string): string {
  return path.join(indexDir(), `${workspaceId(root)}.json`);
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (out.length >= MAX_FILES_INDEXED) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES_INDEXED) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIR_NAMES.has(e.name)) continue;
        await walk(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (e.name.startsWith('.') && ext !== '.env' && e.name !== '.gitignore') continue;
        if (!TEXT_EXT.has(ext) && ext !== '') continue;
        if (ext === '' && !/^(Dockerfile|Makefile|LICENSE|README)/i.test(e.name)) continue;
        out.push(full);
      }
    }
  }

  await walk(root);
  return out;
}

function chunkFileContent(_relPath: string, content: string): Array<{ text: string; startLine: number; endLine: number }> {
  const chunks: Array<{ text: string; startLine: number; endLine: number }> = [];
  if (content.length < 24) return chunks;

  for (let start = 0; start < content.length; start += CHUNK_CHARS - CHUNK_OVERLAP) {
    const slice = content.slice(start, start + CHUNK_CHARS);
    const prefix = content.slice(0, start);
    const startLine = prefix.split('\n').length;
    const sliceLines = slice.split('\n').length;
    const endLine = startLine + sliceLines - 1;
    chunks.push({ text: slice, startLine, endLine: Math.max(startLine, endLine) });
    if (chunks.length >= MAX_CHUNKS_PER_FILE) break;
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function openAiApiBase(): string {
  const b = process.env.OPENAI_BASE_URL?.trim();
  if (b) return b.replace(/\/$/, '');
  return 'https://api.openai.com/v1';
}

async function fetchEmbeddings(
  apiKey: string,
  model: string,
  inputs: string[]
): Promise<number[][]> {
  const res = await fetch(`${openAiApiBase()}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, input: inputs }),
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI embeddings HTTP ${res.status}: ${text.slice(0, 1500)}`);
  }
  const data = JSON.parse(text) as {
    data?: Array<{ embedding: number[]; index: number }>;
  };
  const rows = data.data;
  if (!Array.isArray(rows)) {
    throw new Error('OpenAI embeddings: invalid response shape');
  }
  rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return rows.map((r) => r.embedding);
}

async function embedInBatches(apiKey: string, model: string, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const truncated = batch.map((t) => (t.length > 12000 ? `${t.slice(0, 12000)}…` : t));
    const vectors = await fetchEmbeddings(apiKey, model, truncated);
    out.push(...vectors);
    if (i + EMBED_BATCH < texts.length) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  return out;
}

async function embedOne(apiKey: string, model: string, text: string): Promise<number[]> {
  const t = text.length > 8000 ? `${text.slice(0, 8000)}…` : text;
  const v = await fetchEmbeddings(apiKey, model, [t]);
  return v[0] ?? [];
}

export class SemanticSearchService {
  private opChain: Promise<unknown> = Promise.resolve();

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opChain.then(() => fn());
    this.opChain = next.catch(() => {});
    return next;
  }

  private async loadIndex(root: string): Promise<SemanticIndexFile | null> {
    const p = indexPath(root);
    try {
      const raw = await fs.readFile(p, 'utf-8');
      const parsed = JSON.parse(raw) as SemanticIndexFile;
      if (parsed.version !== INDEX_VERSION || parsed.workspaceRoot !== path.resolve(root)) {
        return null;
      }
      if (!Array.isArray(parsed.chunks) || !parsed.manifest) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async saveIndex(data: SemanticIndexFile): Promise<void> {
    const dir = indexDir();
    await fs.mkdir(dir, { recursive: true });
    const p = indexPath(data.workspaceRoot);
    await fs.writeFile(p, JSON.stringify(data), 'utf-8');
  }

  private async manifestStale(root: string, cached: SemanticIndexFile): Promise<boolean> {
    const absRoot = path.resolve(root);
    const currentFiles = await walkFiles(absRoot);
    const rels = currentFiles
      .map((f) => path.relative(absRoot, f).replace(/\\/g, '/'))
      .sort();
    const indexed = Object.keys(cached.manifest)
      .map((k) => k.replace(/\\/g, '/'))
      .sort();
    if (rels.join('\n') !== indexed.join('\n')) return true;
    for (const rel of indexed) {
      const full = path.join(absRoot, ...rel.split('/'));
      try {
        const st = await fs.stat(full);
        const m = cached.manifest[rel];
        if (m === undefined || st.mtimeMs !== m) return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  async buildIndex(workspaceRoot: string): Promise<{ chunks: number; ms: number; error?: string }> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return { chunks: 0, ms: 0, error: 'OPENAI_API_KEY is not set in the environment (OASIS-IDE/.env).' };
    }
    const model = process.env.OASIS_IDE_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
    const absRoot = path.resolve(workspaceRoot);
    const t0 = Date.now();

    const filePaths = await walkFiles(absRoot);
    const manifest: Record<string, number> = {};
    const pending: Array<{ rel: string; startLine: number; endLine: number; text: string }> = [];

    outer: for (const full of filePaths) {
      const rel = path.relative(absRoot, full).replace(/\\/g, '/');
      let buf: Buffer;
      try {
        buf = await fs.readFile(full);
      } catch {
        continue;
      }
      if (buf.length > MAX_FILE_BYTES || buf.length === 0) continue;
      let text: string;
      try {
        text = buf.toString('utf-8');
      } catch {
        continue;
      }
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text.slice(0, 4096))) continue;

      let st;
      try {
        st = await fs.stat(full);
      } catch {
        continue;
      }
      manifest[rel] = st.mtimeMs;

      for (const c of chunkFileContent(rel, text)) {
        pending.push({ rel, startLine: c.startLine, endLine: c.endLine, text: c.text });
        if (pending.length >= MAX_CHUNKS) break outer;
      }
    }

    if (pending.length === 0) {
      return { chunks: 0, ms: Date.now() - t0, error: 'No indexable text chunks found under the workspace.' };
    }

    const texts = pending.map((p) => p.text);
    let embeddings: number[][];
    try {
      embeddings = await embedInBatches(apiKey, model, texts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { chunks: 0, ms: Date.now() - t0, error: `Embedding request failed: ${msg}` };
    }

    if (embeddings.length !== pending.length) {
      return { chunks: 0, ms: Date.now() - t0, error: 'Embedding count mismatch from OpenAI.' };
    }

    const chunks: SemanticSearchChunk[] = pending.map((p, i) => ({
      path: p.rel,
      startLine: p.startLine,
      endLine: p.endLine,
      text: p.text,
      embedding: embeddings[i]!
    }));

    await this.saveIndex({
      version: INDEX_VERSION,
      workspaceRoot: absRoot,
      model,
      builtAt: Date.now(),
      manifest,
      chunks
    });

    return { chunks: chunks.length, ms: Date.now() - t0 };
  }

  /**
   * Run semantic search: ensures index exists and is fresh enough, embeds query, returns top matches.
   */
  async search(
    workspaceRoot: string | null,
    query: string,
    options: {
      limit?: number;
      pathPrefix?: string;
      refreshIndex?: boolean;
    } = {}
  ): Promise<{ text: string; isError: boolean }> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return {
        text:
          'semantic_search requires OPENAI_API_KEY in OASIS-IDE/.env (same key as local OpenAI chat). Restart the IDE after setting.',
        isError: true
      };
    }
    if (!workspaceRoot?.trim()) {
      return { text: 'semantic_search requires an open workspace folder.', isError: true };
    }
    const q = query.trim();
    if (!q) {
      return { text: 'semantic_search requires a non-empty query.', isError: true };
    }

    const absRoot = path.resolve(workspaceRoot);
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 25);
    const pathPrefix = options.pathPrefix?.replace(/\\/g, '/').replace(/^\/+/, '') ?? '';
    const model = process.env.OASIS_IDE_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;

    return this.runExclusive(async () => {
      let idx = await this.loadIndex(absRoot);
      const staleTime = !idx || Date.now() - idx.builtAt > STALE_MS;
      const staleManifest = idx ? await this.manifestStale(absRoot, idx) : true;
      if (options.refreshIndex || !idx || staleTime || staleManifest) {
        const built = await this.buildIndex(absRoot);
        if (built.error) {
          return { text: `semantic_search index build failed: ${built.error}`, isError: true };
        }
        idx = await this.loadIndex(absRoot);
        if (!idx || idx.chunks.length === 0) {
          return { text: 'semantic_search: index is empty after build.', isError: true };
        }
      }

      let pool = idx!.chunks;
      if (pathPrefix) {
        pool = pool.filter((c) => c.path.replace(/\\/g, '/').startsWith(pathPrefix));
        if (pool.length === 0) {
          return {
            text: `No indexed chunks under path prefix "${pathPrefix}". Try without path_prefix or set refresh_index true after adding files.`,
            isError: true
          };
        }
      }

      let qVec: number[];
      try {
        qVec = await embedOne(apiKey, model, q);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { text: `semantic_search query embedding failed: ${msg}`, isError: true };
      }

      const scored = pool
        .map((c) => ({ c, score: cosineSimilarity(qVec, c.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const lines: string[] = [];
      lines.push(`semantic_search (model ${idx!.model}, ${pool.length} chunks searched)`);
      lines.push('');
      let i = 1;
      for (const { c, score } of scored) {
        lines.push(`### ${i}. ${c.path}:${c.startLine}-${c.endLine} (score ${score.toFixed(4)})`);
        lines.push('```');
        lines.push(c.text.length > 3500 ? `${c.text.slice(0, 3500)}…` : c.text);
        lines.push('```');
        lines.push('');
        i += 1;
      }
      return { text: lines.join('\n').trim(), isError: false };
    });
  }
}
