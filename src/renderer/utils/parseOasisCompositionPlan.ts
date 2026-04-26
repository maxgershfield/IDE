import type { OappCompositionPlan } from '../../shared/oappCompositionPlanTypes';

export function stripOasisCompositionPlanFences(text: string): string {
  if (!text.includes('oasis-composition-plan')) return text;
  return text.replace(/```oasis-composition-plan\s*\n[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function tryParseCompositionPlan(raw: string): OappCompositionPlan | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as Partial<OappCompositionPlan>;
    if (!obj || typeof obj !== 'object') return null;
    if (obj.version !== 1) return null;
    if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) return null;
    return {
      version: 1,
      intent: typeof obj.intent === 'string' ? obj.intent : 'OAPP composition',
      appType: typeof obj.appType === 'string' ? obj.appType : 'custom',
      nodes: obj.nodes,
      edges: obj.edges,
      capabilityLanes: Array.isArray(obj.capabilityLanes) ? obj.capabilityLanes : [],
      surfaces: Array.isArray(obj.surfaces) ? obj.surfaces : [],
      gaps: Array.isArray(obj.gaps) ? obj.gaps : [],
      buildSteps: Array.isArray(obj.buildSteps) ? obj.buildSteps : [],
      verification: Array.isArray(obj.verification) ? obj.verification : [],
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
    } as OappCompositionPlan;
  } catch {
    return null;
  }
}

export function extractLastOasisCompositionPlan(text: string): OappCompositionPlan | null {
  if (!text || !text.includes('oasis-composition-plan')) return null;
  const re = /```oasis-composition-plan\s*\n([\s\S]*?)```/gi;
  let last: OappCompositionPlan | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const parsed = tryParseCompositionPlan(m[1] ?? '');
    if (parsed) last = parsed;
  }
  return last;
}
