/** Join a workspace root with a relative path using the host OS separator. */
export function joinWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const root = workspaceRoot.replace(/[/\\]+$/, '');
  const rel = relativePath.replace(/^[/\\]+/, '');
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root}${sep}${rel}`;
}
