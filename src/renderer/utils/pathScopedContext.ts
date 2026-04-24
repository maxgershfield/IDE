/**
 * When the user’s message is about a specific path inside the open workspace, pre-read
 * a small “project bundle” (README, package.json, one-level file list) so the agent
 * can answer from content instead of guessing from folder names.
 */

import type { TreeNode } from '../contexts/WorkspaceContext';

const MAX_README = 4_200;
const MAX_PACKAGE = 2_200;
const MAX_EXTRAS = 1_400;
const MAX_DIR_NAMES = 64;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isUnderWorkspace(workspaceRoot: string, candidate: string): boolean {
  const root = workspaceRoot.replace(/\/+$/, '');
  const c = candidate.replace(/\/+$/, '') || '/';
  return c === root || c.startsWith(root + '/');
}

function trimTrailingJunk(s: string): string {
  return s.replace(/[\s`.,;:!?'"）]+$/, '').trim();
}

/**
 * Resolve a folder path the user is asking about: absolute under workspace, or
 * a root-level directory name present in the shallow tree.
 */
export function tryResolveWorkspacePathFocus(
  workspacePath: string,
  userMessage: string,
  knownRootDirNames: string[]
): string | null {
  const root = workspacePath.replace(/\/+$/, '');

  /* 1) Line containing an absolute subpath of the workspace (handles spaces, e.g. "Hyde End Vineyard") */
  if (userMessage.includes(root + '/')) {
    const line =
      userMessage
        .split('\n')
        .find((l) => l.includes(root + '/'))?.trim() ?? userMessage;
    const start = line.indexOf(root);
    if (start >= 0) {
      let after = line.slice(start).trim();
      const stopConj = after.search(
        /\s+—\s+|\s+-\s+(?:other|the rest|more)\b|,\s+(?:which|where|is there)\b|;\s+/i
      );
      if (stopConj > root.length) after = after.slice(0, stopConj).trim();
      if (after.endsWith('?')) {
        if (!after.slice(root.length + 1).includes('?')) {
          after = after.slice(0, -1).trim();
        }
      }
      const andIdx = after.toLowerCase().lastIndexOf(' and ');
      if (andIdx > root.length + 3) {
        const tail = after.slice(andIdx + 5).trim();
        if (
          /^(the |a |an |if |any |anyone |I |it |is |as |in |on |at )/i.test(tail) ||
          tail.length < 30
        ) {
          after = after.slice(0, andIdx).trim();
        }
      }
      if (isUnderWorkspace(root, after) && after.length > root.length) {
        return trimTrailingJunk(after);
      }
    }
  }

  /* 2) Backticked subpath (relative or absolute) */
  const ticked = userMessage.match(/`([^`]{2,500})`/);
  if (ticked) {
    const inner = ticked[1]!.trim();
    if (inner.startsWith('/')) {
      if (isUnderWorkspace(root, inner)) {
        return trimTrailingJunk(inner);
      }
    } else {
      // relative to workspace, e.g. `Hyde End Vineyard`
      const joined = `${root}/${inner}`.replace(/\/+/g, '/');
      return trimTrailingJunk(joined);
    }
  }

  /* 3) First matching root dir name (longest first) when user does not paste a full path */
  if (knownRootDirNames.length > 0) {
    const byLen = [...knownRootDirNames].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
    const low = userMessage.toLowerCase();
    for (const name of byLen) {
      if (low.includes(name.toLowerCase())) {
        return `${root}/${name}`;
      }
    }
  }

  return null;
}

async function tryRead(
  readFile: (p: string) => Promise<string | null>,
  p: string
): Promise<string | null> {
  try {
    return await readFile(p);
  } catch {
    return null;
  }
}

export interface PathScopedContextDeps {
  readFile: (p: string) => Promise<string | null>;
  listDirShallow?: (p: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
}

/**
 * Pre-reads concrete files and a one-level directory listing. Returns null if
 * the folder is missing or nothing could be read.
 */
export async function buildPathScopedContextNote(
  resolvedDir: string,
  deps: PathScopedContextDeps
): Promise<string | null> {
  const { readFile, listDirShallow } = deps;
  const base = resolvedDir.replace(/\/+$/, '');

  const readmePath = `${base}/README.md`;
  const readme = (await tryRead(readFile, readmePath)) ?? (await tryRead(readFile, `${base}/README`));
  const packageJson = await tryRead(readFile, `${base}/package.json`);
  const star = await tryRead(readFile, `${base}/.star-workspace.json`);
  const vercel = await tryRead(readFile, `${base}/vercel.json`);

  let listNote = '';
  if (listDirShallow) {
    try {
      const entries = await listDirShallow(base);
      const top = (entries || [])
        .map((e) => (e.isDirectory ? `${e.name}/` : e.name))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, MAX_DIR_NAMES);
      if (top.length) {
        listNote = `### Top-level entries in this folder (${top.length} shown, depth 1)\n\`\`\`\n${top.join('\n')}\n\`\`\`\n\n`;
      }
    } catch {
      /* list optional */
    }
  }

  const hasAny = readme || packageJson || listNote;
  if (!hasAny) return null;

  const name = base.split('/').filter(Boolean).pop() ?? base;

  const parts: string[] = [
    `## Path focus: \`${name}/\` (pre-read for this user message)`,
    '',
    '_**Answer from the excerpts below and attached paths. Do not infer architecture only from directory names** — the IDE has not yet run a full repo walk._',
    '',
  ];

  if (readme) {
    parts.push(`### README (excerpt)\n\`README.md\` — first ${MAX_README} chars\n\n\`\`\`\n${readme.slice(0, MAX_README).trim()}\n\`\`\``);
  }
  if (packageJson) {
    parts.push(
      `### package.json (excerpt)\n\`\`\`json\n${packageJson.slice(0, MAX_PACKAGE).trim()}\n\`\`\``,
    );
  }
  if (vercel) {
    parts.push(`### vercel.json (excerpt)\n\`\`\`json\n${vercel.slice(0, MAX_EXTRAS).trim()}\n\`\`\``);
  }
  if (star) {
    parts.push(`### .star-workspace.json (excerpt)\n\`\`\`json\n${star.slice(0, MAX_EXTRAS).trim()}\n\`\`\``);
  }
  if (listNote) parts.push(listNote);

  return parts.join('\n\n');
}

/** @internal — pull root names from the shallow root tree */
export function rootDirNamesFromTree(rootLevelTree: TreeNode[]): string[] {
  return rootLevelTree.filter((n) => n.isDirectory).map((n) => n.name);
}
