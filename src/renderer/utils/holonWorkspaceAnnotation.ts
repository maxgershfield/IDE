/**
 * Holonic workspace annotation — three-tier semantic overlay
 *
 * Holons are not a finite list. They are an architectural pattern: any bounded,
 * named concept in a software system — a quest, a wallet, a patient record, a
 * trading strategy, a billing cycle — is a holon. The OASIS HOLON_TYPE_ENUM_NAMES
 * list is the current codified library of well-known implementations, not a
 * ceiling on what holons can be.
 *
 * This utility applies that understanding across three progressive tiers, each
 * adding more precision when more data is available:
 *
 *   Tier 1 — Universal local inference (always runs, zero cost, no login required)
 *     Every directory is classified as infrastructure, utility, or a domain holon.
 *     Domain directories are annotated with the closest known OASIS type (when
 *     recognised) or labelled as a custom holon (when not). Works for any codebase.
 *
 *   Tier 2 — File content signals (async, cached in localStorage)
 *     Background scan of root-level manifest files (package.json, *.csproj,
 *     Cargo.toml, pyproject.toml, README.md) and key entry points per domain
 *     directory. Upgrades "inferred" annotations to "confirmed" and detects the
 *     project language, framework, and direct OASIS API usage.
 *
 *   Tier 3 — STARNET cross-reference (requires catalog snapshot from login)
 *     For each domain holon (recognised or custom), searches the STARNET catalog
 *     for matching holons or OAPPs. Surfaces "X installs" social proof for
 *     catalogue matches, and "potential STARNET publish candidate" for custom
 *     holons that have no current catalog entry — inviting contribution.
 *
 * No API calls are made in the synchronous path. Every piece of data is either
 * already in memory or read from localStorage.
 */

import type { TreeNode } from '../contexts/WorkspaceContext';
import type { StarHolonRecord, OAPPRecord } from '../services/starApiService';
import type { StarWorkspaceConfig } from '../../shared/starWorkspaceTypes';
import { HOLON_TYPE_ENUM_NAMES, holonTypeNameFromEnum } from '../services/holonTypeLabels';

/* ─── Constants ─────────────────────────────────────────────────────────── */

const TREE_BUDGET = 80;
const MAX_DOMAIN_ROWS = 80;
const MAX_STARNET_MATCH_ROWS = 5;
/** When workspace has more dirs than this, switch to grouped/summary mode */
const LARGE_WORKSPACE_THRESHOLD = 30;

/* ─── Tier 1: Directory classification ──────────────────────────────────── */

/**
 * Directories that are build/tooling infrastructure and carry no domain meaning.
 * Stored normalised (lower-case, no separators) to match the classifyDir lookup.
 */
const INFRA_DIRS = new Set([
  'nodemodules', 'dist', 'build', 'out', 'git', 'github', 'svn',
  'coverage', 'pycache', 'target', 'bin', 'obj', 'next', 'nuxt',
  'vite', 'turbo', 'parcelcache', 'cache', 'tmp', 'temp',
  'cursor', 'vscode', 'idea', 'vs',
]);

/**
 * Structural / plumbing directories that organise code rather than
 * representing domain concepts. Includes the common top-level "src" convention.
 * Normalised (lower-case, no separators).
 */
const UTILITY_DIRS = new Set([
  // Source roots — structural, not domain
  'src', 'source', 'sources', 'app', 'apps',
  // Pure utilities
  'utils', 'util', 'helpers', 'helper', 'types', 'interfaces', 'constants',
  'config', 'configs', 'shared', 'common', 'lib', 'libs', 'core', 'base',
  'internal', 'generated', 'gen', 'mocks', 'fixtures', 'stubs',
  'tests', 'spec', 'e2e', 'test',
  // Build / ops
  'scripts', 'tools', 'tooling', 'ci', 'deploy', 'deployment', 'infra',
  'infrastructure', 'terraform', 'k8s', 'kubernetes', 'docker', 'nginx',
  // Static assets
  'assets', 'static', 'public', 'media', 'images', 'icons', 'fonts',
  'styles', 'css', 'scss', 'less', 'i18n', 'locales', 'translations',
  // Docs / schema
  'docs', 'documentation', 'examples', 'demo', 'demos', 'storybook',
  'migrations', 'seeds', 'schema', 'schemas', 'proto', 'protos',
]);

/**
 * Structural source-root directories whose children should be inspected for
 * domain holons. When a root dir is in this set, we recurse one level deeper.
 */
const SOURCE_ROOT_DIRS = new Set(['src', 'source', 'sources', 'app', 'apps']);

type DirClass = 'infra' | 'utility' | 'domain' | 'source-root';

function normaliseDirName(name: string): string {
  return name.toLowerCase().replace(/[-_.]/g, '');
}

function classifyDir(name: string): DirClass {
  const lc = normaliseDirName(name);
  if (INFRA_DIRS.has(lc) || name.startsWith('.')) return 'infra';
  if (SOURCE_ROOT_DIRS.has(lc)) return 'source-root';
  if (UTILITY_DIRS.has(lc)) return 'utility';
  return 'domain';
}

/* ─── Tier 1: OASIS keyword index ───────────────────────────────────────── */

/**
 * Build a reverse map from normalised keywords → known OASIS type name.
 *
 * We derive keywords from each enum entry by:
 *   1. Splitting on camelCase boundaries and known prefixes (STAR, Web4, Web5…)
 *   2. Lowercasing and deduplicating
 *   3. Skipping noise tokens shorter than 3 chars or from a stoplist
 *
 * Examples:
 *   QuestHolon     → "quest"
 *   Web4NFT        → "nft", "web4", "web4nft"
 *   InventoryItem  → "inventory", "item"
 *   MarketplaceListing → "marketplace", "listing"
 */
const KEYWORD_STOPLIST = new Set([
  'star', 'oasis', 'holon', 'the', 'and', 'all', 'web', 'none',
  'default', 'base', 'meta', 'data', 'dna', 'type', 'item',
]);

function tokenise(s: string): string[] {
  const base = s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d+)/g, ' $1 ')
    .toLowerCase()
    .split(/[\s_\-]+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length >= 3 && !KEYWORD_STOPLIST.has(t));
  // Also include singular forms of common English plurals so "quests" → "quest"
  const withSingulars: string[] = [];
  for (const t of base) {
    withSingulars.push(t);
    if (t.endsWith('ies') && t.length > 4) withSingulars.push(t.slice(0, -3) + 'y');   // categories → category
    else if (t.endsWith('ses') && t.length > 4) withSingulars.push(t.slice(0, -2));      // processes → process
    else if (t.endsWith('s') && t.length > 4)  withSingulars.push(t.slice(0, -1));       // quests → quest
  }
  return [...new Set(withSingulars)];
}

/**
 * Build the OASIS keyword index, preferring higher-specificity enum entries.
 * We iterate in reverse so that more specific types overwrite generic ones
 * (e.g. Web4NFT wins over Web3NFT for the "nft" keyword because it is later
 * in the enum and therefore more relevant to the current OASIS feature set).
 */

/** Map: keyword → known OASIS enum type name (later/more-specific enum entries win) */
const OASIS_KEYWORD_INDEX: Map<string, string> = (() => {
  const map = new Map<string, string>();
  // Iterate in reverse so that higher-specificity types (Web4NFT, Web5NFT) overwrite
  // earlier generic ones (Web3NFT) for shared keywords like "nft".
  for (const typeName of [...HOLON_TYPE_ENUM_NAMES].reverse()) {
    for (const kw of tokenise(typeName)) {
      map.set(kw, typeName);
    }
  }
  return map;
})();

/* ─── Tier 1: Local holon candidate ─────────────────────────────────────── */

type HolonConfidence =
  | 'recognised'   // directory name matches a known OASIS enum type
  | 'inferred'     // file-content scan found OASIS-like patterns (tier 2)
  | 'custom';      // novel domain concept — no match in OASIS enum

export interface LocalHolonCandidate {
  dirName: string;
  /** Human-readable holon name derived from the directory name */
  holonName: string;
  /** OASIS type label (e.g. "Quest", "Web4NFT") or the derived name for custom holons */
  holonType: string;
  confidence: HolonConfidence;
  /** Matching STARNET holon ids (tier 3) */
  starnetMatchIds: string[];
  /** True when this is a custom holon with no STARNET match — worth publishing */
  publishCandidate: boolean;
  /** Signals detected in file content (tier 2) */
  contentSignals?: ContentSignal[];
}

/**
 * Infer the holonic identity of a directory from its name alone (tier 1).
 *
 * If the normalised name matches a known OASIS keyword → "recognised".
 * Otherwise → "custom" with a pascal-cased holon name derived from the dir name.
 */
function inferLocalHolon(dirName: string): LocalHolonCandidate {
  const tokens = tokenise(dirName);

  // Try each token against the OASIS keyword index (longest first for specificity)
  for (const token of [...tokens].sort((a, b) => b.length - a.length)) {
    const oasisType = OASIS_KEYWORD_INDEX.get(token);
    if (oasisType) {
      return {
        dirName,
        holonName: `${oasisType}`,
        holonType: oasisType,
        confidence: 'recognised',
        starnetMatchIds: [],
        publishCandidate: false,
      };
    }
  }

  // No OASIS match — derive a pascal-cased custom holon name
  const pascalName =
    dirName
      .replace(/[-_.]/g, ' ')
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('') + 'Holon';

  return {
    dirName,
    holonName: pascalName,
    holonType: 'custom',
    confidence: 'custom',
    starnetMatchIds: [],
    publishCandidate: true, // custom holons with no catalog match are candidates
  };
}

/* ─── Tier 2: File content signals ──────────────────────────────────────── */

export type ContentSignal =
  | 'oasis-import'       // file imports from an OASIS package
  | 'iholon-impl'        // class/interface that extends/implements IHolon
  | 'holon-field-shape'  // object with id+name+holonType+metaData shape
  | 'oasis-attribute'    // C# [OASISProviderType] or similar attribute
  | 'framework-react'
  | 'framework-unity'
  | 'framework-hyperfy'
  | 'lang-csharp'
  | 'lang-python'
  | 'lang-rust';

export interface WorkspaceHolonScanResult {
  workspacePath: string;
  scannedAt: number;
  projectLanguage?: string;
  projectFramework?: string;
  usesOasisApi: boolean;
  /** Per-directory signals keyed by lowercased directory name */
  dirSignals: Record<string, ContentSignal[]>;
  /** Free-text project description extracted from package.json / README */
  projectDescription?: string;
}

const SCAN_CACHE_KEY = 'oasis-ide:holon-scan-v3';

export function loadCachedScan(workspacePath: string): WorkspaceHolonScanResult | null {
  try {
    const raw = localStorage.getItem(SCAN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceHolonScanResult;
    if (parsed.workspacePath !== workspacePath) return null;
    // Cache valid for 10 minutes
    if (Date.now() - parsed.scannedAt > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveScanToCache(result: WorkspaceHolonScanResult): void {
  try {
    localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(result));
  } catch {
    /* quota exceeded — ignore */
  }
}

/** Pattern tests for file content signals */
const SIGNAL_PATTERNS: Array<{ signal: ContentSignal; re: RegExp }> = [
  { signal: 'oasis-import',      re: /NextGenSoftware\.OASIS|@oasis-|from ['"].*oasis.*['"]/i },
  { signal: 'iholon-impl',       re: /IHolon|ISemanticHolon|IHolonBase|extends\s+Holon\b|:\s*IHolon/i },
  { signal: 'holon-field-shape', re: /holonType|HolonType|ParentHolonId|metaData.*dictionary/i },
  { signal: 'oasis-attribute',   re: /\[OASISProvider|OASISResult|OASISPrimary/i },
  { signal: 'framework-react',   re: /from ['"]react['"]/i },
  { signal: 'framework-unity',   re: /using UnityEngine|UnityEngine\.MonoBehaviour/i },
  { signal: 'framework-hyperfy', re: /from ['"]@hyperfy|hyperfy\.io/i },
  { signal: 'lang-csharp',       re: /namespace\s+\w|using System;/ },
  { signal: 'lang-python',       re: /import\s+\w|from\s+\w+\s+import/i },
  { signal: 'lang-rust',         re: /fn\s+main\(\)|use\s+std::/i },
];

export function extractSignals(content: string): ContentSignal[] {
  const found = new Set<ContentSignal>();
  for (const { signal, re } of SIGNAL_PATTERNS) {
    if (re.test(content)) found.add(signal);
  }
  return [...found];
}

/* ─── Tier 3: STARNET cross-reference ───────────────────────────────────── */

interface ResolvedStarnetHolon {
  id: string;
  name?: string;
  holonType?: number | string;
  starnetPublished?: boolean;
  installCount?: number;
  isOapp?: boolean;
}

function resolveFromCatalog(
  id: string,
  holonRows: StarHolonRecord[],
  oapps: OAPPRecord[]
): ResolvedStarnetHolon {
  const h = holonRows.find((r) => r.id === id);
  if (h) return { id: h.id, name: h.name, holonType: h.holonType, starnetPublished: false };
  const o = oapps.find((r) => r.id === id);
  if (o) {
    return {
      id: o.id, name: o.name, holonType: 'OAPP',
      starnetPublished: o.sourcePublishedOnSTARNET ?? o.sourcePublicOnSTARNET ?? false,
      installCount: (o.totalSourceInstalls ?? 0) + (o.totalSelfContainedInstalls ?? 0) + (o.totalSelfContainedFullInstalls ?? 0),
      isOapp: true,
    };
  }
  return { id };
}

/**
 * For a domain holon candidate, find matching entries in the STARNET catalog.
 *
 * Matching strategy (OR of):
 *   1. holonType enum name matches the candidate's recognised OASIS type
 *   2. Holon/OAPP name tokens overlap significantly with candidate tokens
 *   3. Direct id match via selectedStarnetHolonIds
 */
function findStarnetMatches(
  candidate: LocalHolonCandidate,
  holonRows: StarHolonRecord[],
  oapps: OAPPRecord[],
  selectedIds: string[]
): ResolvedStarnetHolon[] {
  const matches: ResolvedStarnetHolon[] = [];
  const seen = new Set<string>();

  const candidateTokens = new Set(tokenise(candidate.holonName).concat(tokenise(candidate.dirName)));

  const tryAdd = (r: ResolvedStarnetHolon) => {
    if (!seen.has(r.id)) { seen.add(r.id); matches.push(r); }
  };

  // 1. Selected id direct match
  for (const id of selectedIds) {
    const r = resolveFromCatalog(id, holonRows, oapps);
    const nameTokens = new Set(tokenise(r.name ?? ''));
    if ([...candidateTokens].some((t) => nameTokens.has(t))) tryAdd(r);
  }

  // 2. Known OASIS type — scan catalog rows by holonType
  if (candidate.confidence === 'recognised') {
    for (const h of holonRows) {
      if (matches.length >= MAX_STARNET_MATCH_ROWS) break;
      const typeName = holonTypeNameFromEnum(h.holonType);
      if (tokenise(typeName).some((t) => candidateTokens.has(t))) {
        tryAdd({ id: h.id, name: h.name, holonType: h.holonType, starnetPublished: false });
      }
    }
    for (const o of oapps) {
      if (matches.length >= MAX_STARNET_MATCH_ROWS) break;
      const oTokens = new Set(tokenise(o.name ?? ''));
      if ([...candidateTokens].some((t) => oTokens.has(t))) {
        tryAdd({ id: o.id, name: o.name, holonType: 'OAPP', starnetPublished: o.sourcePublishedOnSTARNET ?? false, isOapp: true });
      }
    }
  }

  // 3. Custom holon — fuzzy name match only
  if (candidate.confidence === 'custom' || candidate.confidence === 'inferred') {
    for (const o of oapps) {
      if (matches.length >= MAX_STARNET_MATCH_ROWS) break;
      const oTokens = new Set(tokenise(o.name ?? ''));
      if ([...candidateTokens].filter((t) => t.length >= 4).some((t) => oTokens.has(t))) {
        tryAdd({ id: o.id, name: o.name, holonType: 'OAPP', starnetPublished: o.sourcePublishedOnSTARNET ?? false, isOapp: true });
      }
    }
  }

  return matches.slice(0, MAX_STARNET_MATCH_ROWS);
}

/* ─── Rendering helpers ──────────────────────────────────────────────────── */

function escMd(s: string): string {
  return s.replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim();
}

function starnetBadge(h: ResolvedStarnetHolon): string {
  if (h.starnetPublished) {
    const installs = h.installCount ? `, ${h.installCount} installs` : '';
    return `✓ STARNET${installs}`;
  }
  if (h.starnetPublished === false && h.id) return 'local';
  return '—';
}

function confidenceBadge(c: HolonConfidence, signals?: ContentSignal[]): string {
  if (c === 'recognised') return 'recognised OASIS type';
  if (c === 'inferred') {
    const hasOasis = signals?.includes('oasis-import') || signals?.includes('iholon-impl');
    return hasOasis ? 'inferred (OASIS patterns found)' : 'inferred';
  }
  return 'custom';
}

function buildInlineHint(candidate: LocalHolonCandidate): string {
  if (candidate.confidence === 'recognised') return `${candidate.holonType}`;
  if (candidate.publishCandidate) return `${candidate.holonName} (custom)`;
  return candidate.holonName;
}

/** Annotated file tree, with inline holon hints on domain directories. */
function renderAnnotatedTree(
  nodes: TreeNode[],
  depth: number,
  budget: { left: number },
  candidateMap: Map<string, LocalHolonCandidate>
): string {
  if (budget.left <= 0) return '';
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  for (const node of nodes) {
    if (budget.left <= 0) { lines.push(`${indent}…`); break; }
    const candidate = node.isDirectory ? candidateMap.get(node.name.toLowerCase()) : undefined;
    const hint = candidate ? `  ← ${buildInlineHint(candidate)}` : '';
    lines.push(`${indent}${node.isDirectory ? node.name + '/' : node.name}${hint}`);
    budget.left -= 1;
    if (node.isDirectory && node.children && node.children.length > 0) {
      const sub = renderAnnotatedTree(node.children, depth + 1, budget, candidateMap);
      if (sub) lines.push(sub);
    }
  }
  return lines.filter(Boolean).join('\n');
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

export interface HolonAnnotationInputs {
  tree: TreeNode[];
  workspacePath: string;
  starWorkspaceConfig: StarWorkspaceConfig | null;
  holonCatalogRows: StarHolonRecord[];
  oapps: OAPPRecord[];
  /** Tier 2: background file-content scan result (null if not yet available) */
  scanResult?: WorkspaceHolonScanResult | null;
}

/* ─── Monorepo grouping ──────────────────────────────────────────────────── */

interface DirGroup {
  prefix: string;
  members: string[];
}

/**
 * Group directory names by common dot/dash-separated namespace prefixes.
 * Only groups with ≥3 members are returned; singletons / pairs stay ungrouped.
 */
function groupDirectoriesByPrefix(dirNames: string[]): {
  groups: DirGroup[];
  ungrouped: string[];
} {
  const prefixBuckets = new Map<string, string[]>();

  for (const name of dirNames) {
    // Split on '.' and '-' to extract prefix segments
    const segments = name.split(/[.\-]/);
    if (segments.length < 3) continue;
    // Use the first N-1 segments as candidate prefix keys, longest first
    for (let len = segments.length - 1; len >= 2; len--) {
      const prefix = segments.slice(0, len).join('.');
      if (!prefixBuckets.has(prefix)) prefixBuckets.set(prefix, []);
      prefixBuckets.get(prefix)!.push(name);
      break; // only use the longest valid prefix per dir
    }
  }

  const usedByGroup = new Set<string>();
  const groups: DirGroup[] = [];

  // Sort by bucket size descending so largest groups are picked first
  const sorted = [...prefixBuckets.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [prefix, members] of sorted) {
    if (members.length < 3) continue;
    const fresh = members.filter((m) => !usedByGroup.has(m));
    if (fresh.length < 3) continue;
    groups.push({ prefix, members: fresh });
    for (const m of fresh) usedByGroup.add(m);
  }

  const ungrouped = dirNames.filter((d) => !usedByGroup.has(d));
  return { groups, ungrouped };
}

/**
 * Build the holonically-annotated workspace note for the agent context pack.
 *
 * All three tiers run synchronously from in-memory / localStorage data.
 * Returns null only when no workspace is open.
 */
export function buildHolonAnnotatedWorkspaceNote(inputs: HolonAnnotationInputs): string | null {
  const { tree, workspacePath, starWorkspaceConfig: cfg, holonCatalogRows, oapps, scanResult } = inputs;
  if (!workspacePath || !tree || tree.length === 0) return null;

  const folderName = workspacePath.split('/').filter(Boolean).pop() ?? workspacePath;
  const selectedIds = cfg?.selectedStarnetHolonIds ?? [];

  /* ── Tier 1: classify every root directory ── */
  const rootDirs = tree.filter((n) => n.isDirectory);
  // For source-root dirs (src/, app/) recurse one level to find the real domain dirs.
  const expandedDomainNodes: TreeNode[] = [];
  const sourceRoots: string[] = [];
  for (const n of rootDirs) {
    const cls = classifyDir(n.name);
    if (cls === 'domain') { expandedDomainNodes.push(n); }
    else if (cls === 'source-root') {
      sourceRoots.push(n.name);
      for (const child of (n.children ?? [])) {
        if (child.isDirectory && classifyDir(child.name) === 'domain') {
          expandedDomainNodes.push(child);
        }
      }
    }
  }
  const domainDirs = expandedDomainNodes;
  const utilityDirs = rootDirs.filter((n) => {
    const cls = classifyDir(n.name);
    return cls === 'utility' || cls === 'source-root';
  });

  /* Infer a holon candidate for every domain directory */
  const candidates: LocalHolonCandidate[] = domainDirs.map((n) => {
    const c = inferLocalHolon(n.name);

    /* ── Tier 2: apply content signals from background scan ── */
    const signals = scanResult?.dirSignals?.[n.name.toLowerCase()];
    if (signals && signals.length > 0) {
      c.contentSignals = signals;
      if (
        c.confidence === 'custom' &&
        (signals.includes('oasis-import') || signals.includes('iholon-impl'))
      ) {
        c.confidence = 'inferred';
        c.publishCandidate = false;
      }
    }

    /* ── Tier 3: STARNET cross-reference ── */
    if (holonCatalogRows.length > 0 || oapps.length > 0) {
      const matches = findStarnetMatches(c, holonCatalogRows, oapps, selectedIds);
      c.starnetMatchIds = matches.map((m) => m.id);
      // If we found catalog matches, this is no longer just a "publish candidate"
      if (matches.length > 0 && c.publishCandidate) c.publishCandidate = false;
    }

    return c;
  });

  /* ── Also resolve the explicitly selected holons (from .star-workspace.json) ── */
  const selectedResolved = selectedIds.map((id) =>
    resolveFromCatalog(id, holonCatalogRows, oapps)
  );

  /* Map by lowercased dir name for tree rendering */
  const candidateMap = new Map(candidates.map((c) => [c.dirName.toLowerCase(), c]));

  /* ── Assemble output sections ── */
  const sections: string[] = [];

  /* Header — "local" is explicit so the model does not confuse with STARNET’s global holon table */
  const projectName = cfg?.name ?? folderName;
  const headerParts: string[] = [`## Local workspace (on disk) — ${projectName}/`];
  if (cfg?.oappId) headerParts.push(`(OAPP \`${cfg.oappId.slice(0, 8)}…\`)`);
  sections.push(headerParts.join(' '));
  sections.push(
    '**What this is:** top-level (and one-level-into-`src/`) **directories** in this repo, with inferred *domain holon* roles. **This is not** the STARNET *published* holon list — that appears under a separate **STARNET catalog** heading if the IDE loaded it.',
  );

  /* Project metadata from config */
  const metaLines: string[] = [];
  if (cfg?.description) metaLines.push(`> ${cfg.description}`);
  if (cfg?.gameEngine) metaLines.push(`Engine: **${cfg.gameEngine}**`);
  if (cfg?.projectType) metaLines.push(`Project type: **${cfg.projectType}**`);
  if (cfg?.starnetNetwork) metaLines.push(`STARNET network: **${cfg.starnetNetwork}**`);
  /* Tier 2: detected project language / framework */
  if (scanResult?.projectLanguage) metaLines.push(`Language: **${scanResult.projectLanguage}**`);
  if (scanResult?.projectFramework) metaLines.push(`Framework: **${scanResult.projectFramework}**`);
  if (scanResult?.usesOasisApi) metaLines.push(`OASIS API: **detected in source**`);
  if (scanResult?.projectDescription) metaLines.push(`> ${scanResult.projectDescription}`);
  if (metaLines.length > 0) sections.push(metaLines.join('  \n'));

  const isLargeWorkspace = rootDirs.length > LARGE_WORKSPACE_THRESHOLD;

  sections.push(
    `_Pre-read by IDE (${rootDirs.length} root director${rootDirs.length === 1 ? 'y' : 'ies'}) — ` +
    `no \`list_directory\` needed for the root. ` +
    'Use `list_directory` only to explore specific subdirectories._'
  );

  /* Workspace overview for large monorepos */
  if (isLargeWorkspace) {
    const infraCount = rootDirs.filter((n) => classifyDir(n.name) === 'infra').length;
    const utilCount = rootDirs.filter((n) => {
      const c = classifyDir(n.name);
      return c === 'utility' || c === 'source-root';
    }).length;
    const domainCount = candidates.length;
    const ignoredCount = rootDirs.length - infraCount - utilCount - domainCount;

    const { groups } = groupDirectoriesByPrefix(candidates.map((c) => c.dirName));
    const groupSummary = groups.length > 0
      ? groups.map((g) => `  - \`${g.prefix}.*\` — ${g.members.length} implementations`).join('\n')
      : '';

    sections.push(
      `### Workspace overview (large monorepo)\n` +
      `- **${rootDirs.length}** total root directories\n` +
      `- **${domainCount}** domain holons (projects/apps/libraries)\n` +
      `- **${utilCount}** utility/structural directories\n` +
      `- **${infraCount}** infrastructure directories\n` +
      (ignoredCount > 0 ? `- **${ignoredCount}** hidden/infra (skipped)\n` : '') +
      (groupSummary ? `\nNamespace groups detected:\n${groupSummary}` : '')
    );
  }

  if (isLargeWorkspace) {
    const domain = candidates.length;
    sections.push(
      `### Understanding the numbers (index vs. this view)\n` +
      `- **${rootDirs.length}** top-level director${rootDirs.length === 1 ? 'y' : 'ies'} under the open workspace (same idea as the **Settings → Indexing** count: one holonic document per such folder, after skip rules).\n` +
      `- **${domain}** of those are treated here as *domain* holon candidates (namespaced groups + table rows + root listing below). Folders classed as pure infra/utility at root are still in the **Root directories** block but may not get a “domain” row in the table.\n` +
      '- The **Holonic structure** tables are a **bounded summary** so the agent context does not list 170+ markdown rows twice. The **full** list of every root name is in **`### Root directories` at the end** of this section — use that, not a partial table, when the user wants “all”.'
    );
  }

  /* Holonic structure table (domain directories → holon identities) */
  if (candidates.length > 0) {
    const hasCatalog = holonCatalogRows.length > 0 || oapps.length > 0;

    if (isLargeWorkspace) {
      /* Large workspace: show grouped summary + ungrouped individual dirs */
      const { groups, ungrouped } = groupDirectoriesByPrefix(candidates.map((c) => c.dirName));
      const candidateByName = new Map(candidates.map((c) => [c.dirName, c]));

      const tableLines: string[] = [
        `### Holonic structure — namespace groups`,
        '| namespace group | count | representative holon type |',
        '|---|---|---|',
        ...groups.map((g) => {
          const rep = candidateByName.get(g.members[0]);
          return `| \`${escMd(g.prefix)}.*\` | ${g.members.length} | ${escMd(rep?.holonType ?? 'Custom')} |`;
        }),
      ];
      sections.push(tableLines.join('\n'));

      /* Ungrouped individual directories */
      const ungroupedCandidates = ungrouped
        .map((d) => candidateByName.get(d))
        .filter((c): c is LocalHolonCandidate => !!c)
        .slice(0, MAX_DOMAIN_ROWS);

      if (ungroupedCandidates.length > 0) {
        const indivLines: string[] = [
          `### Holonic structure — ungrouped project folders (sample)`,
          `_This table is capped: **${ungroupedCandidates.length}** of **${ungrouped.length}** ungrouped names. Remaining ungrouped names and all namespaced dirs appear under **Namespace group members**; **every** top-level folder is listed in **Root directories** at the end._`,
          hasCatalog
            ? '| directory | holon identity | type | confidence | STARNET match |'
            : '| directory | holon identity | type | confidence |',
          hasCatalog ? '|---|---|---|---|---|' : '|---|---|---|---|',
          ...ungroupedCandidates.map((c) => {
            const starnetCell = c.starnetMatchIds.length > 0
              ? `${c.starnetMatchIds.length} match${c.starnetMatchIds.length > 1 ? 'es' : ''}`
              : c.publishCandidate ? '✦ publish candidate' : '—';
            const row = [
              `\`${escMd(c.dirName)}/\``,
              escMd(c.holonName),
              escMd(c.holonType),
              confidenceBadge(c.confidence, c.contentSignals),
            ];
            if (hasCatalog) row.push(starnetCell);
            return `| ${row.join(' | ')} |`;
          }),
        ];
        sections.push(indivLines.join('\n'));
      }

      /* Within each group, show member list inline */
      if (groups.length > 0) {
        const memberLines: string[] = [`### Namespace group members`];
        for (const g of groups) {
          memberLines.push(`**${g.prefix}.*** (${g.members.length}):`);
          memberLines.push(g.members.map((m) => `\`${m}/\``).join(', '));
        }
        sections.push(memberLines.join('\n'));
      }
    } else {
      /* Small workspace: show full table as before */
      const rows = candidates.slice(0, MAX_DOMAIN_ROWS);
      const tableLines: string[] = [
        `### Holonic structure (${rows.length} domain director${rows.length === 1 ? 'y' : 'ies'} identified)`,
        hasCatalog
          ? '| directory | holon identity | type | confidence | STARNET match |'
          : '| directory | holon identity | type | confidence |',
        hasCatalog ? '|---|---|---|---|---|' : '|---|---|---|---|',
        ...rows.map((c) => {
          const starnetCell = c.starnetMatchIds.length > 0
            ? `${c.starnetMatchIds.length} match${c.starnetMatchIds.length > 1 ? 'es' : ''}`
            : c.publishCandidate ? '✦ publish candidate' : '—';
          const row = [
            `\`${escMd(c.dirName)}/\``,
            escMd(c.holonName),
            escMd(c.holonType),
            confidenceBadge(c.confidence, c.contentSignals),
          ];
          if (hasCatalog) row.push(starnetCell);
          return `| ${row.join(' | ')} |`;
        }),
      ];
      sections.push(tableLines.join('\n'));
    }
  }

  /* Tier 1+2 note when no catalog is connected */
  const noStarnet = holonCatalogRows.length === 0 && oapps.length === 0;
  if (noStarnet && candidates.length > 0) {
    const publishCount = candidates.filter((c) => c.publishCandidate).length;
    sections.push(
      `> **STARNET not connected** (no catalog snapshot). ` +
      `Holons above are inferred from directory names and file content only. ` +
      (publishCount > 0
        ? `${publishCount} director${publishCount === 1 ? 'y' : 'ies'} identified as potential STARNET publish candidate${publishCount === 1 ? '' : 's'}. `
        : '') +
      `Log in and open **Activity bar → STARNET** to cross-reference against the published catalog.`
    );
  }

  /* Explicitly selected holons table (from .star-workspace.json) */
  if (selectedResolved.length > 0) {
    const tableLines: string[] = [
      `### Declared holons (.star-workspace.json)`,
      '| id | name | type | STARNET |',
      '|---|---|---|---|',
      ...selectedResolved.slice(0, MAX_DOMAIN_ROWS).map(
        (h) =>
          `| \`${h.id.slice(0, 8)}…\` | ${escMd(h.name ?? '—')} | ${escMd(holonTypeNameFromEnum(h.holonType))} | ${starnetBadge(h)} |`
      ),
    ];
    sections.push(tableLines.join('\n'));
  }

  /* OAPP identity (when the workspace is a registered OAPP) */
  if (cfg?.oappId) {
    const oapp = oapps.find((o) => o.id === cfg.oappId);
    if (oapp) {
      const pub = oapp.sourcePublishedOnSTARNET || oapp.sourcePublicOnSTARNET;
      const installs = (oapp.totalSourceInstalls ?? 0) + (oapp.totalSelfContainedInstalls ?? 0) + (oapp.totalSelfContainedFullInstalls ?? 0);
      sections.push(
        `### OAPP identity\n` +
        `**${escMd(oapp.name)}**  ·  ` +
        `STARNET: ${pub ? '✓ published' : 'not yet published'}  ·  ${installs} install${installs === 1 ? '' : 's'}` +
        (oapp.version ? `  ·  v${oapp.version}` : '')
      );
    }
  }

  /* Publish candidates call-out (only when custom holons with no catalog match exist) */
  const publishCandidates = candidates.filter((c) => c.publishCandidate);
  if (publishCandidates.length > 0) {
    sections.push(
      `### Custom holons — potential STARNET contributions\n` +
      `These directories implement domain concepts not yet in the STARNET catalog. ` +
      `Publishing them makes them reusable by any OASIS developer.\n` +
      publishCandidates.slice(0, 8).map(
        (c) => `- \`${c.dirName}/\` → **${c.holonName}** (custom)`
      ).join('\n')
    );
  }

  /* Source root + utility directory note */
  const utilityNoteItems: string[] = [];
  if (sourceRoots.length > 0) {
    utilityNoteItems.push(`source root${sourceRoots.length > 1 ? 's' : ''}: ${sourceRoots.map((n) => `\`${n}/\``).join(', ')}`);
  }
  const utilityOnly = utilityDirs.filter((n) => classifyDir(n.name) === 'utility');
  if (utilityOnly.length > 0) {
    utilityNoteItems.push(`utilities: ${utilityOnly.map((n) => `\`${n.name}/\``).join(', ')}`);
  }
  if (utilityNoteItems.length > 0) {
    sections.push(`_Structural directories (not domain holons): ${utilityNoteItems.join(' · ')}._`);
  }

  /* Annotated file tree — for large workspaces only show root-level dirs */
  if (isLargeWorkspace) {
    const rootLines = rootDirs.map((n) => {
      const candidate = candidateMap.get(n.name.toLowerCase());
      const hint = candidate ? `  ← ${buildInlineHint(candidate)}` : '';
      return `${n.name}/${hint}`;
    });
    if (rootLines.length > 0) {
      sections.push(
        `### Root directories (${rootLines.length} total)\n\`\`\`\n${rootLines.join('\n')}\n\`\`\``
      );
    }
  } else {
    const budget = { left: TREE_BUDGET };
    const treeStr = renderAnnotatedTree(tree, 0, budget, candidateMap);
    if (treeStr.trim()) {
      sections.push(`### File tree\n\`\`\`\n${treeStr}\n\`\`\``);
    }
  }

  return sections.join('\n\n');
}
