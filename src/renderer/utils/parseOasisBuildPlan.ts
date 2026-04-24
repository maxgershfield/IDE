import type { OappBuildPlanPayload } from '../../shared/oappBuildPlanTypes';

/**
 * Remove all ```oasis-build-plan ... ``` blocks from markdown (for chat display).
 */
export function stripOasisBuildPlanFences(text: string): string {
  if (!text.includes('oasis-build-plan')) return text;
  return text.replace(/```oasis-build-plan\s*\n[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function tryParsePayload(raw: string): OappBuildPlanPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as unknown;
    if (!obj || typeof obj !== 'object') return null;
    return obj as OappBuildPlanPayload;
  } catch {
    return null;
  }
}

/**
 * Extract the last valid JSON payload from ```oasis-build-plan fences (assistant may retry).
 */
export function extractLastOasisBuildPlan(text: string): OappBuildPlanPayload | null {
  if (!text || !text.includes('oasis-build-plan')) return null;
  const re = /```oasis-build-plan\s*\n([\s\S]*?)```/gi;
  let last: OappBuildPlanPayload | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const parsed = tryParsePayload(m[1] ?? '');
    if (parsed) last = parsed;
  }
  return last;
}
