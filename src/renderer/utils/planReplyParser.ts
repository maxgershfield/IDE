/**
 * Plan mode: model appends clickable reply labels in a machine-readable block.
 * Strip the block from markdown display; render labels as chips in the composer.
 */
const PLAN_RE_GLOBAL = /<oasis_plan_replies>\s*(\[[\s\S]*?\])\s*<\/oasis_plan_replies>/gi;

const GATHER_DIGEST_RE = /<oasis_gather_digest>\s*([\s\S]*?)\s*<\/oasis_gather_digest>/gi;

/** Two-step plan: strip gather digest from display; return inner JSON or full block text. */
export function extractGatherDigest(content: string): string | null {
  const matches = [...content.matchAll(GATHER_DIGEST_RE)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const inner = (last[1] ?? '').trim();
  return inner.length > 0 ? inner : null;
}

export function stripGatherDigestForDisplay(content: string): string {
  return content.replace(GATHER_DIGEST_RE, '').trimEnd();
}

export function extractPlanReplyChoices(content: string): { displayText: string; choices: string[] } {
  let choices: string[] = [];
  const matches = [...content.matchAll(PLAN_RE_GLOBAL)];
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1]) as unknown;
      if (Array.isArray(parsed)) {
        choices = parsed
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((s) => s.trim());
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  const displayText = content.replace(PLAN_RE_GLOBAL, '').trimEnd();
  return { displayText, choices: choices.slice(0, 8) };
}
