import { describe, expect, it } from 'vitest';
import { extractLastOasisCompositionPlan } from './parseOasisCompositionPlan';

describe('extractLastOasisCompositionPlan', () => {
  it('normalizes optional arrays missing from model-emitted plans', () => {
    const parsed = extractLastOasisCompositionPlan(`
\`\`\`oasis-composition-plan
{
  "version": 1,
  "intent": "Build a services marketplace",
  "appType": "marketplace",
  "nodes": [],
  "edges": []
}
\`\`\`
`);

    expect(parsed).not.toBeNull();
    expect(parsed?.capabilityLanes).toEqual([]);
    expect(parsed?.surfaces).toEqual([]);
    expect(parsed?.gaps).toEqual([]);
    expect(parsed?.buildSteps).toEqual([]);
    expect(parsed?.verification).toEqual([]);
  });
});
