/**
 * True when the user is asking the IDE to actually run, install, build, or serve
 * something in the workspace (vs. a conceptual / documentation-only question).
 */
export function wantsWorkspaceExecutionIntent(text: string): boolean {
  const t = text.trim();
  if (t.length < 10 || t.length > 12_000) return false;

  if (
    /\b(get|have)\s+.+\s+to\s+run\b/i.test(t) ||
    /\b(run|start|serve|launch)\s+(this|it|the\s+project|the\s+app|locally)\b/i.test(t)
  ) {
    return true;
  }

  return /\b(run\s+locally|start\s+locally|serve\s+locally|dev\s+server|localhost|npm\s+(i|install|ci|run|start|exec)|pnpm\s+|yarn\s+|npx\s+|dotnet\s+run|cargo\s+run|docker-compose\s+up|install\s+(deps|dependencies)|\bbuild\b.*\brun\b|\brun\b.*\bbuild\b)\b/i.test(
    t
  );
}
