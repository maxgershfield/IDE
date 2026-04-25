import { describe, expect, it } from 'vitest';
import {
  extractLastOasisBuildPlan,
  stripOasisBuildPlanFences
} from './parseOasisBuildPlan';
import { parseOappIdFromStarCreateMcpResult } from './parseStarMcpOappCreate';

describe('OASIS build plan parser', () => {
  it('strips build-plan fences from chat markdown', () => {
    const markdown = [
      'Before',
      '```oasis-build-plan',
      '{"templateRecommendation":{"label":"Expo","framework":"expo"}}',
      '```',
      'After'
    ].join('\n');

    expect(stripOasisBuildPlanFences(markdown)).toBe('Before\n\nAfter');
  });

  it('extracts the last valid build-plan payload', () => {
    const markdown = [
      '```oasis-build-plan',
      '{"templateRecommendation":{"label":"Old","framework":"vite"}}',
      '```',
      '```oasis-build-plan',
      '{"templateRecommendation":{"label":"New","framework":"expo"},"holonFeatures":[{"id":"geo","feature":"Check in"}]}',
      '```'
    ].join('\n');

    const plan = extractLastOasisBuildPlan(markdown);

    expect(plan?.templateRecommendation?.label).toBe('New');
    expect(plan?.holonFeatures?.[0]?.id).toBe('geo');
  });

  it('ignores invalid build-plan JSON fences', () => {
    expect(extractLastOasisBuildPlan('```oasis-build-plan\nnot-json\n```')).toBeNull();
  });
});

describe('STAR create OAPP MCP result parser', () => {
  it('extracts an OAPP id from common MCP text content wrappers', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            result: { id: '2c7bb6a9-7f71-497c-94a4-8afc64f08daa' }
          })
        }
      ]
    };

    expect(parseOappIdFromStarCreateMcpResult(result)).toEqual({
      oappId: '2c7bb6a9-7f71-497c-94a4-8afc64f08daa'
    });
  });

  it('returns STAR error messages instead of inventing ids', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ IsError: true, Message: 'STAR rejected create request' })
        }
      ]
    };

    expect(parseOappIdFromStarCreateMcpResult(result)).toEqual({
      error: 'STAR rejected create request'
    });
  });

  it('reports unparseable MCP text', () => {
    const result = { content: [{ type: 'text', text: 'plain text, no JSON' }] };

    expect(parseOappIdFromStarCreateMcpResult(result).error).toContain('Unparseable MCP text');
  });
});
