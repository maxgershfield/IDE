import { joinWorkspacePath } from './joinWorkspacePath';

/** Total cap for the combined auto-loaded block (AGENTS.md + .cursor/rules). */
export const IDE_AGENT_INSTRUCTIONS_MAX_CHARS = 14_000;
const MAX_AGENTS_SECTION = 9_000;
const MAX_CURSOR_RULE_FILES = 16;
const MAX_CURSOR_RULE_FILE_CHARS = 2_400;

/** Matches main `FileSystemService` tree nodes (renderer-local type). */
export interface IdeListTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: IdeListTreeNode[];
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function pathsEqual(a: string, b: string): boolean {
  return toPosix(a).toLowerCase() === toPosix(b).toLowerCase();
}

function dirnamePath(p: string): string {
  const s = p.replace(/[/\\]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (i <= 0) return s;
  return s.slice(0, i);
}

/** True if `candidate` is `root` or a subdirectory of `root` (case-insensitive on letter drive paths). */
function isSameOrUnderRoot(root: string, candidate: string): boolean {
  const r = toPosix(root.replace(/[/\\]+$/, ''));
  const c = toPosix(candidate);
  return c === r || c.startsWith(`${r}/`);
}

function relativeDirFromWorkspace(workspacePath: string, dir: string): string {
  const w = toPosix(workspacePath.replace(/[/\\]+$/, ''));
  const d = toPosix(dir);
  if (d.toLowerCase() === w.toLowerCase()) return '.';
  const prefix = `${w}/`;
  if (!d.toLowerCase().startsWith(prefix.toLowerCase())) return dir;
  return d.slice(prefix.length) || '.';
}

/**
 * Workspace root first, then each directory from shallow to deep along the path to the active file.
 * Used to load nested AGENTS.md (nearer files override root when instructions conflict).
 */
export function workspaceDirsForNestedAgents(
  workspacePath: string,
  activeFilePath: string | null | undefined
): string[] {
  const root = workspacePath.replace(/[/\\]+$/, '');
  const dirs: string[] = [root];
  if (!activeFilePath?.trim()) return dirs;

  let d = dirnamePath(activeFilePath.trim());
  const chain: string[] = [];
  const seen = new Set<string>([toPosix(root).toLowerCase()]);

  while (d && d.length > 0) {
    if (!isSameOrUnderRoot(root, d)) break;
    const key = toPosix(d).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      chain.push(d);
    }
    const parent = dirnamePath(d);
    if (pathsEqual(parent, d)) break;
    d = parent;
  }
  chain.reverse();
  for (const p of chain) {
    const k = toPosix(p).toLowerCase();
    const dup = dirs.some((x) => toPosix(x).toLowerCase() === k);
    if (!dup) dirs.push(p);
  }
  return dirs;
}

function stripSimpleYamlFrontmatter(body: string): string {
  const t = body.replace(/^\uFEFF/, '').trimStart();
  if (!t.startsWith('---')) return body;
  const nl = t.indexOf('\n');
  if (nl === -1) return body;
  const afterFirst = t.slice(nl + 1);
  const close = afterFirst.search(/\n---(?:\s*(?:\r?\n|$))/);
  if (close === -1) return body;
  return afterFirst.slice(close).replace(/^\s*---\s*/, '').replace(/^\r?\n/, '').trimStart();
}

function truncateBlock(s: string, max: number): string {
  const x = s.trim();
  if (x.length <= max) return x;
  return `${x.slice(0, max)}\n\n…(truncated)`;
}

function flattenTreeFiles(nodes: IdeListTreeNode[] | undefined): IdeListTreeNode[] {
  if (!nodes?.length) return [];
  const out: IdeListTreeNode[] = [];
  for (const n of nodes) {
    if (!n.isDirectory) out.push(n);
    else if (n.children?.length) out.push(...flattenTreeFiles(n.children));
  }
  return out;
}

export interface LoadIdeAgentInstructionsOptions {
  workspacePath: string;
  activeFilePath?: string | null;
  readFile: (absPath: string) => Promise<string | null>;
  listTree: (absPath: string) => Promise<IdeListTreeNode[]>;
}

/**
 * Loads AGENTS.md (root + nested along active file) and Cursor-style `.cursor/rules` markdown files.
 * Returns a single markdown section for the IDE context pack, or null if nothing found.
 */
export async function loadIdeAgentInstructions(
  opts: LoadIdeAgentInstructionsOptions
): Promise<string | null> {
  const { workspacePath, activeFilePath, readFile, listTree } = opts;
  const dirs = workspaceDirsForNestedAgents(workspacePath, activeFilePath);
  const parts: string[] = [];
  let budget = IDE_AGENT_INSTRUCTIONS_MAX_CHARS;

  const agentsChunks: string[] = [];
  let agentsUsed = 0;
  for (const dir of dirs) {
    const p = joinWorkspacePath(dir, 'AGENTS.md');
    try {
      const raw = await readFile(p);
      if (!raw?.trim()) continue;
      const rel = relativeDirFromWorkspace(workspacePath, dir);
      const body = truncateBlock(raw, Math.min(6000, MAX_AGENTS_SECTION - agentsUsed));
      agentsChunks.push(`### AGENTS.md (${rel === '.' ? 'workspace root' : rel})\n\n${body}`);
      agentsUsed += body.length + 32;
      if (agentsUsed >= MAX_AGENTS_SECTION) break;
    } catch {
      /* missing file */
    }
  }

  if (agentsChunks.length > 0) {
    parts.push(
      '## AGENTS.md (auto-loaded)\n\n' +
        'When instructions below conflict, the section for the path **closest to the active editor file** wins.\n\n' +
        agentsChunks.join('\n\n')
    );
  }

  const rulesDir = joinWorkspacePath(joinWorkspacePath(workspacePath, '.cursor'), 'rules');
  let ruleBodies: Array<{ rel: string; text: string }> = [];
  try {
    const tree = await listTree(rulesDir);
    const files = flattenTreeFiles(tree)
      .filter((n) => /\.(md|mdc)$/i.test(n.name))
      .sort((a, b) => a.path.localeCompare(b.path));
    for (const f of files.slice(0, MAX_CURSOR_RULE_FILES)) {
      try {
        const raw = await readFile(f.path);
        if (!raw?.trim()) continue;
        const rulesDirPosix = toPosix(rulesDir);
        const fp = toPosix(f.path);
        const rel =
          fp.toLowerCase().startsWith(rulesDirPosix.toLowerCase() + '/')
            ? fp.slice(rulesDirPosix.length + 1)
            : f.name;
        let text = f.name.toLowerCase().endsWith('.mdc') ? stripSimpleYamlFrontmatter(raw) : raw;
        text = truncateBlock(text, MAX_CURSOR_RULE_FILE_CHARS);
        ruleBodies.push({ rel, text });
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no .cursor/rules */
  }

  if (ruleBodies.length > 0) {
    const chunk =
      '## Cursor-style project rules (.cursor/rules, auto-loaded)\n\n' +
      ruleBodies.map((r) => `### ${r.rel}\n\n${r.text}`).join('\n\n');
    parts.push(chunk);
  }

  if (parts.length === 0) return null;

  let joined = parts.join('\n\n---\n\n');
  if (joined.length > budget) {
    joined = `${joined.slice(0, budget)}\n\n…(auto-loaded instructions truncated to byte budget)`;
  }
  return joined;
}
