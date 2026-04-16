/**
 * Resolve a markdown <a href> target to an absolute filesystem path when it refers
 * to a file under (or relative to) the current workspace. Returns null for http(s),
 * mailto, anchors-only, or unresolvable links.
 */
export function fileUrlToFsPath(fileUrl: string): string | null {
  try {
    const u = new URL(fileUrl);
    if (u.protocol !== 'file:') return null;
    let p = decodeURIComponent(u.pathname);
    // Windows: file:///C:/Users/... → pathname is /C:/Users/...
    if (/^\/[a-zA-Z]:\//.test(p)) {
      return p.slice(1).replace(/\//g, '\\');
    }
    return p;
  } catch {
    return null;
  }
}

function workspacePathToFileUrlBase(workspacePath: string): string {
  const norm = workspacePath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(norm)) {
    return `file:///${norm.endsWith('/') ? norm : `${norm}/`}`;
  }
  const withSlash = norm.endsWith('/') ? norm : `${norm}/`;
  return `file://${withSlash}`;
}

export function resolveMarkdownLinkToWorkspacePath(
  workspacePath: string | null,
  href: string
): string | null {
  const t = href.trim();
  if (!t || t.startsWith('#')) return null;
  if (/^https?:\/\//i.test(t)) return null;
  if (t.startsWith('mailto:')) return null;
  if (t.startsWith('file://')) {
    return fileUrlToFsPath(t);
  }
  if (!workspacePath) return null;
  if (t.startsWith('/')) return t;
  if (/^[a-zA-Z]:[\\/]/.test(t)) return t;
  try {
    const base = workspacePathToFileUrlBase(workspacePath);
    const resolved = new URL(t.replace(/\\/g, '/'), base);
    return fileUrlToFsPath(resolved.href);
  } catch {
    return null;
  }
}
