/**
 * Stable keys for IDE composer storage + OASIS holon `oasis.ide.threadKey` metadata.
 * Session `main` keeps the legacy key shape (no suffix) so existing localStorage + holons match.
 */

export function workspaceKey(workspacePath: string | null): string {
  if (!workspacePath) return 'nows';
  let h = 0;
  for (let i = 0; i < workspacePath.length; i++) {
    h = (h * 31 + workspacePath.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * @param sessionId Use `main` for the primary thread (legacy storage path). Any other id is a separate chat + holon.
 */
export function makeIdeThreadKey(
  avatarId: string | undefined,
  workspacePath: string | null,
  sessionId: string = 'main'
): string {
  const base = `ide-${avatarId || 'default'}-${workspaceKey(workspacePath)}`;
  if (!sessionId || sessionId === 'main') return base;
  return `${base}-${sessionId}`;
}

/**
 * Stable key for `oasis.ide.memoryKey` on the project-memory holon (one holon per avatar + workspace).
 * Matches the primary composer thread key (`sessionId` `main`).
 */
export function makeIdeProjectMemoryKey(
  avatarId: string | undefined,
  workspacePath: string | null
): string {
  return makeIdeThreadKey(avatarId, workspacePath, 'main');
}
