/** Max chars of planning file embedded in the IDE context pack (ONODE caps total pack size). */
export const PLANNING_DOC_CONTEXT_MAX_CHARS = 28_000;
/** Tighter default when `agentInputBudget` is "low" (tokens per request). */
export const PLANNING_DOC_CONTEXT_MAX_CHARS_LOW = 8_000;

/** Resolve one line from `.oasiside/planning-doc.path` against the workspace root. */
export function resolveWorkspaceRelativePath(workspaceRoot: string, line: string): string {
  const t = line.trim().replace(/^\.\/+/, '').replace(/\\/g, '/');
  const root = workspaceRoot.replace(/\\/g, '/').replace(/\/$/, '');
  if (t.startsWith('/')) return t;
  return `${root}/${t.replace(/^\/+/, '')}`;
}

/** MIME for drags from the IDE File Explorer (Build plan drop target accepts this). */
export const OASIS_IDE_EXPLORER_FILE_PATH_MIME = 'application/x-oasis-ide-file-path';

/**
 * Resolve a path the user typed or dropped: absolute, `file:` URL, or workspace-relative.
 */
export function resolveUserFilePathInput(workspaceRoot: string | null, input: string): string | null {
  let t = input.trim().replace(/^["']+|["']+$/g, '');
  if (!t) return null;
  if (/^file:/i.test(t)) {
    try {
      const u = new URL(t);
      if (u.protocol === 'file:') {
        let p = decodeURIComponent(u.pathname.replace(/\+/g, '%20'));
        if (/^\/[A-Za-z]:\//.test(p)) {
          p = p.slice(1).replace(/\//g, '\\');
        }
        t = p;
      }
    } catch {
      return null;
    }
  }
  t = t.split(/\r?\n/)[0].trim();
  if (!t) return null;
  const winAbs = /^[A-Za-z]:[\\/]/.test(t);
  const unixAbs = t.startsWith('/');
  if (winAbs || unixAbs) return t;
  if (!workspaceRoot) return null;
  return resolveWorkspaceRelativePath(workspaceRoot, t);
}

/**
 * Markdown block appended to the Composer context pack so ONODE sees the planning doc
 * without the user pasting it into chat.
 * @param maxBodyChars - optional cap; defaults to {@link PLANNING_DOC_CONTEXT_MAX_CHARS} (or low-budget value from caller)
 */
export function buildPlanningDocContextNote(
  sourcePath: string | null,
  content: string,
  maxBodyChars: number = PLANNING_DOC_CONTEXT_MAX_CHARS
): string {
  const trimmed = content.trim();
  let body = trimmed;
  const cap = maxBodyChars > 0 ? maxBodyChars : PLANNING_DOC_CONTEXT_MAX_CHARS;
  if (body.length > cap) {
    body =
      body.slice(0, cap) + '\n\n[IDE: planning document truncated for context size]';
  }
  const meta = sourcePath
    ? `**Path:** \`${sourcePath}\``
    : `**Source:** Text from the IDE **Build plan** panel (describe your app).`;
  return (
    `## Planning document (IDE — user-set)\n` +
    `${meta}\n\n` +
    `Treat this as the product and repo index: follow any **read order** and **paths** it mentions. ` +
    `Open linked paths with **read_file** when implementing.\n\n` +
    `### Contents\n\n` +
    body
  );
}
