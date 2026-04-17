/**
 * Small unified-style diff preview for the Composer activity feed (no external deps).
 * Uses a single middle hunk between common prefix/suffix (good for full-file replaces).
 */

const DEFAULT_MAX_LINES = 48;
const MAX_INPUT_LINES = 400;

export function buildSimpleDiffPreview(
  oldText: string,
  newText: string,
  options?: { maxOutputLines?: number }
): string {
  const maxOut = options?.maxOutputLines ?? DEFAULT_MAX_LINES;
  const a = oldText.split('\n');
  const b = newText.split('\n');
  if (a.length > MAX_INPUT_LINES || b.length > MAX_INPUT_LINES) {
    return '… (file too large for inline preview)';
  }
  let i = 0;
  const minLen = Math.min(a.length, b.length);
  while (i < minLen && a[i] === b[i]) i += 1;
  let j = 0;
  while (
    j < a.length - i &&
    j < b.length - i &&
    a[a.length - 1 - j] === b[b.length - 1 - j]
  ) {
    j += 1;
  }
  const oldMid = a.slice(i, Math.max(i, a.length - j));
  const newMid = b.slice(i, Math.max(i, b.length - j));
  if (oldMid.length === 0 && newMid.length === 0) {
    return '(no line changes)';
  }
  const lines: string[] = ['--- previous', '+++ current'];
  for (const l of oldMid) {
    lines.push(`- ${l}`);
    if (lines.length >= maxOut) {
      return `${lines.join('\n')}\n… (truncated)`;
    }
  }
  for (const l of newMid) {
    lines.push(`+ ${l}`);
    if (lines.length >= maxOut) {
      return `${lines.join('\n')}\n… (truncated)`;
    }
  }
  return lines.join('\n');
}
