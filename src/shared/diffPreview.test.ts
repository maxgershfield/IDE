import { describe, expect, it } from 'vitest';
import { buildSimpleDiffPreview } from './diffPreview';

describe('buildSimpleDiffPreview', () => {
  it('shows only the changed middle hunk', () => {
    const diff = buildSimpleDiffPreview('a\nold\nz', 'a\nnew\nz');

    expect(diff).toContain('--- previous');
    expect(diff).toContain('+++ current');
    expect(diff).toContain('- old');
    expect(diff).toContain('+ new');
    expect(diff).not.toContain('- a');
    expect(diff).not.toContain('+ z');
  });

  it('returns an explicit no-change marker', () => {
    expect(buildSimpleDiffPreview('same\ntext', 'same\ntext')).toBe('(no line changes)');
  });

  it('bounds very large previews', () => {
    const oldText = Array.from({ length: 401 }, (_, i) => `old ${i}`).join('\n');
    const newText = Array.from({ length: 401 }, (_, i) => `new ${i}`).join('\n');

    expect(buildSimpleDiffPreview(oldText, newText)).toBe('… (file too large for inline preview)');
  });
});
