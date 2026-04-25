import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentToolExecutor } from './AgentToolExecutor.js';

type WorkspaceStub = {
  getWorkspacePath: () => string | null;
};

let sandboxRoot = '';
let workspaceRoot = '';
let outsideRoot = '';

function makeExecutor(
  workspacePath = workspaceRoot,
  deps: ConstructorParameters<typeof AgentToolExecutor>[1] = {}
): AgentToolExecutor {
  const fileSystem: WorkspaceStub = {
    getWorkspacePath: () => workspacePath
  };
  return new AgentToolExecutor(
    fileSystem as unknown as ConstructorParameters<typeof AgentToolExecutor>[0],
    deps
  );
}

async function executeTool(
  executor: AgentToolExecutor,
  name: string,
  args: Record<string, unknown>,
  executionMode: 'plan' | 'plan_gather' | 'plan_present' | 'execute' = 'execute'
) {
  return executor.execute('tool-1', name, JSON.stringify(args), { executionMode });
}

beforeEach(async () => {
  sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'oasis-ide-agent-tools-'));
  workspaceRoot = path.join(sandboxRoot, 'workspace');
  outsideRoot = path.join(sandboxRoot, 'workspace-sibling');
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(outsideRoot, { recursive: true });
});

afterEach(async () => {
  if (sandboxRoot) {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  }
});

describe('AgentToolExecutor safety boundaries', () => {
  it('allows reads inside the open workspace', async () => {
    await fs.writeFile(path.join(workspaceRoot, 'README.md'), '# Hello\n', 'utf-8');
    const result = await executeTool(makeExecutor(), 'read_file', { path: 'README.md' });

    expect(result.isError).not.toBe(true);
    expect(result.content).toContain('# Hello');
  });

  it('blocks absolute reads outside the open workspace', async () => {
    const outsideFile = path.join(outsideRoot, 'secret.txt');
    await fs.writeFile(outsideFile, 'do not read\n', 'utf-8');

    const result = await executeTool(makeExecutor(), 'read_file', { path: outsideFile });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('outside the open workspace');
  });

  it('blocks relative parent traversal outside the open workspace', async () => {
    const result = await executeTool(makeExecutor(), 'write_file', {
      path: '../workspace-sibling/outside.txt',
      content: 'escaped'
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('outside the open workspace');
    await expect(fs.stat(path.join(outsideRoot, 'outside.txt'))).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('blocks mutating local tools in plan mode', async () => {
    const result = await executeTool(
      makeExecutor(),
      'write_file',
      { path: 'planned.txt', content: 'should not be written' },
      'plan'
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Plan mode is read-only');
    await expect(fs.stat(path.join(workspaceRoot, 'planned.txt'))).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('does not create missing command working directories', async () => {
    const result = await executeTool(makeExecutor(), 'run_workspace_command', {
      argv: ['node', '--version'],
      cwd: 'missing-dir'
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('cwd is not a directory');
    await expect(fs.stat(path.join(workspaceRoot, 'missing-dir'))).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });
});

describe('AgentToolExecutor MCP plan-mode safety', () => {
  it('allows read-only MCP tools in plan mode', async () => {
    const executor = makeExecutor(workspaceRoot, {
      mcpExecuteTool: async (toolName) => ({ ok: true, toolName })
    });

    const result = await executeTool(
      executor,
      'mcp_invoke',
      { tool: 'oasis_health_check', arguments: {} },
      'plan'
    );

    expect(result.isError).not.toBe(true);
    expect(result.content).toContain('oasis_health_check');
  });

  it('blocks mutating MCP tools in plan mode', async () => {
    const executor = makeExecutor(workspaceRoot, {
      mcpExecuteTool: async () => {
        throw new Error('should not be called');
      }
    });

    const result = await executeTool(
      executor,
      'mcp_invoke',
      { tool: 'oasis_save_holon', arguments: {} },
      'plan'
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Plan mode allows only read-only MCP discovery');
  });
});
