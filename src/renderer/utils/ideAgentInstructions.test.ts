import { describe, expect, it } from 'vitest';
import {
  IDE_AGENT_INSTRUCTIONS_MAX_CHARS,
  loadIdeAgentInstructions,
  workspaceDirsForNestedAgents,
  type IdeListTreeNode
} from './ideAgentInstructions';

describe('workspaceDirsForNestedAgents', () => {
  it('returns workspace root through nearest active-file directory in order', () => {
    expect(
      workspaceDirsForNestedAgents('/repo', '/repo/apps/demo/src/App.tsx')
    ).toEqual(['/repo', '/repo/apps', '/repo/apps/demo', '/repo/apps/demo/src']);
  });

  it('ignores active files outside the workspace', () => {
    expect(workspaceDirsForNestedAgents('/repo', '/elsewhere/App.tsx')).toEqual(['/repo']);
  });
});

describe('loadIdeAgentInstructions', () => {
  it('loads nested AGENTS.md and cursor rules with mdc frontmatter stripped', async () => {
    const files = new Map<string, string>([
      ['/repo/AGENTS.md', 'Root rule'],
      ['/repo/apps/AGENTS.md', 'Apps rule'],
      ['/repo/apps/demo/AGENTS.md', 'Demo rule'],
      [
        '/repo/.cursor/rules/always.mdc',
        '---\ndescription: Always applies\nalwaysApply: true\n---\nUse real APIs.'
      ],
      ['/repo/.cursor/rules/ui.md', 'Prefer accessible labels.']
    ]);
    const rulesTree: IdeListTreeNode[] = [
      { name: 'always.mdc', path: '/repo/.cursor/rules/always.mdc', isDirectory: false },
      { name: 'ui.md', path: '/repo/.cursor/rules/ui.md', isDirectory: false }
    ];

    const block = await loadIdeAgentInstructions({
      workspacePath: '/repo',
      activeFilePath: '/repo/apps/demo/src/App.tsx',
      readFile: async (p) => files.get(p) ?? null,
      listTree: async (p) => (p === '/repo/.cursor/rules' ? rulesTree : [])
    });

    expect(block).toContain('AGENTS.md (workspace root)');
    expect(block).toContain('Root rule');
    expect(block).toContain('AGENTS.md (apps)');
    expect(block).toContain('Apps rule');
    expect(block).toContain('AGENTS.md (apps/demo)');
    expect(block).toContain('Demo rule');
    expect(block).toContain('### always.mdc');
    expect(block).toContain('Use real APIs.');
    expect(block).not.toContain('alwaysApply');
    expect(block).toContain('### ui.md');
    expect(block).toContain('Prefer accessible labels.');
  });

  it('returns null when no instruction files exist', async () => {
    const block = await loadIdeAgentInstructions({
      workspacePath: '/repo',
      activeFilePath: '/repo/src/index.ts',
      readFile: async () => null,
      listTree: async () => []
    });

    expect(block).toBeNull();
  });

  it('keeps the combined instruction block bounded', async () => {
    const huge = 'x'.repeat(30_000);
    const block = await loadIdeAgentInstructions({
      workspacePath: '/repo',
      activeFilePath: '/repo/src/index.ts',
      readFile: async (p) => (p.endsWith('AGENTS.md') ? huge : null),
      listTree: async () => []
    });

    expect(block).not.toBeNull();
    expect(block!.length).toBeLessThanOrEqual(IDE_AGENT_INSTRUCTIONS_MAX_CHARS + 80);
    expect(block).toContain('truncated');
  });
});
