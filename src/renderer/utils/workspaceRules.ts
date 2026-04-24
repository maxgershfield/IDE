/**
 * First non-empty workspace rules file (same paths as Composer uses for context pack).
 */
export async function loadWorkspaceRulesText(
  workspacePath: string | null
): Promise<string | null> {
  if (!workspacePath) return null;
  const api = (window as { electronAPI?: { readFile?: (p: string) => Promise<string | null> } })
    .electronAPI;
  if (!api?.readFile) return null;
  const candidates = [
    `${workspacePath}/.oasiside/rules.md`,
    `${workspacePath}/.OASIS_IDE/rules.md`
  ];
  for (const p of candidates) {
    try {
      const text = await api.readFile(p);
      if (text && text.trim()) return text.trim();
    } catch {
      /* try next */
    }
  }
  return null;
}
