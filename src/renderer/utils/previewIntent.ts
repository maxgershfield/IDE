/**
 * Detect when the user wants the IDE to serve a folder and open it in the browser (OASIS_IDE-style),
 * and resolve which absolute path to serve.
 */

const ABS_PATH_MAC = /(\/Users\/[^\s'"]+)/g;

/** User wants an action, not only a tutorial ("how do I…"). */
export function wantsBrowserPreviewAction(input: string): boolean {
  const t = input.trim();
  if (t.length < 8) return false;
  if (/^how\s+(do|can|to|would)\b/i.test(t)) return false;
  if (/^what('s| is)\s+(the )?(command|way)\b/i.test(t)) return false;

  const lower = t.toLowerCase();
  const action =
    /\b(run|serve|open|preview|start|launch)\b/.test(lower) &&
    /\b(browser|localhost|http|local\s+server|dev\s+server|in\s+the\s+browser)\b/.test(lower);
  const short =
    /\b(run|serve|preview)\s+(this|it|that|the\s+folder|the\s+project)\b/i.test(t) ||
    /\b(open|run)\s+(this|it)\s+in\s+the\s+browser\b/i.test(t);

  return action || short;
}

export function resolvePreviewFolderPath(
  input: string,
  workspacePath: string | null,
  referencedPaths: string[]
): string | null {
  if (referencedPaths.length >= 1) {
    return referencedPaths[0];
  }
  const abs = input.match(ABS_PATH_MAC);
  if (abs && abs[0]) {
    return abs[0].replace(/['")\],.:;]+$/, '');
  }
  if (workspacePath && /\bcelestial[\s_-]*cyberspace\b/i.test(input)) {
    return `${workspacePath.replace(/\/+$/, '')}/celestial-cyberspace`;
  }
  if (workspacePath && /\b(in|under|from)\s+(my\s+)?workspace\b/i.test(input)) {
    return workspacePath;
  }
  return null;
}
