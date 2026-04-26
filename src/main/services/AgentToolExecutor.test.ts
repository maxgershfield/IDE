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

  it('rejects writing IDE-owned build plan artifacts as files', async () => {
    const result = await executeTool(makeExecutor(), 'write_file', {
      path: 'oasis-build-plan.json',
      content: JSON.stringify({ holonRows: [{ id: 'AvatarAuthHolon', selected: true }] })
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Do not write IDE-owned planning artifacts');
    expect(result.content).toContain('```oasis-build-plan');
    await expect(fs.stat(path.join(workspaceRoot, 'oasis-build-plan.json'))).rejects.toMatchObject({
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

  it('refuses npm commands when cwd has no local package.json', async () => {
    await fs.mkdir(path.join(workspaceRoot, 'FoodDeliveryApp'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, 'package.json'),
      JSON.stringify({ scripts: { dev: 'vite' } }),
      'utf-8'
    );

    const result = await executeTool(makeExecutor(), 'run_workspace_command', {
      argv: ['npm', 'run', 'dev'],
      cwd: 'FoodDeliveryApp'
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('has no package.json');
    expect(result.content).toContain('prevents npm from walking up');
  });

  it('validates the FoodDeliveryApp failure shape as an incomplete scaffold', async () => {
    const appRoot = path.join(workspaceRoot, 'FoodDeliveryApp');
    await fs.mkdir(path.join(appRoot, 'src/api'), { recursive: true });
    await fs.mkdir(path.join(appRoot, 'src/lib'), { recursive: true });
    await fs.writeFile(path.join(appRoot, 'README.md'), '# Food Delivery App\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'src/index.js'), 'console.log("app");\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'src/api/starnetApi.js'), 'export {};\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'src/lib/holonMap.js'), 'export const holonMap = {};\n', 'utf-8');

    const result = await executeTool(makeExecutor(), 'validate_holonic_app_scaffold', {
      projectPath: 'FoodDeliveryApp',
      stack: 'vite'
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Holonic app scaffold validation: FAIL');
    expect(result.content).toContain('Required file package.json');
    expect(result.content).toContain('Required file index.html');
  });

  it('validates a minimal Vite holonic app scaffold', async () => {
    const appRoot = path.join(workspaceRoot, 'FoodDeliveryApp');
    await fs.mkdir(path.join(appRoot, 'src/api'), { recursive: true });
    await fs.mkdir(path.join(appRoot, 'src/holons'), { recursive: true });
    await fs.writeFile(
      path.join(appRoot, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build' },
        devDependencies: { vite: '^5.0.0' }
      }),
      'utf-8'
    );
    await fs.writeFile(path.join(appRoot, 'vite.config.js'), 'export default { server: { port: 5174 } };\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.js"></script>\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'src/main.js'), 'import "./styles.css";\n', 'utf-8');
    await fs.writeFile(
      path.join(appRoot, 'src/App.jsx'),
      [
        'import { useState } from "react";',
        'export function App() {',
        '  const [role, setRole] = useState("customer");',
        '  const avatarId = "avatar-demo";',
        '  return <main>',
        '    <p>OASIS Avatar {avatarId}</p>',
        '    <button type="button" onClick={() => setRole("customer")}>Customer</button>',
        '    <button type="button" onClick={() => setRole("provider")}>Provider</button>',
        '    <button type="button" onClick={() => setRole("admin")}>Admin</button>',
        '    <button type="button" onClick={() => setRole("live")}>Enable live mode</button>',
        '    <section>{role} fixture live runtime</section>',
        '  </main>;',
        '}',
      ].join('\n'),
      'utf-8'
    );
    await fs.writeFile(path.join(appRoot, 'src/styles.css'), 'body { margin: 0; }\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'src/api/starnetApi.js'), 'export const starBaseUrl = "";\n', 'utf-8');
    await fs.writeFile(
      path.join(appRoot, 'src/api/holonRuntimeAdapter.js'),
      'export async function createHolon() { return starRequest("/api/Holons", { method: "POST" }); }\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(appRoot, 'src/holons/manifest.js'),
      [
        'export const reusableHolonSpecs = [{',
        '  id: "abc-holon",',
        '  name: "AvatarAuthHolon",',
        '  kind: "identity",',
        '  version: 1,',
        '  description: "Auth",',
        '  capability: { summary: "Auth" },',
        '  state: { shape: "Session", lifecycle: ["authenticated"] },',
        '  ports: [{ id: "login", direction: "input", label: "Login", dataShape: "Avatar" }],',
        '  dependencies: [],',
        '  adapters: [{ id: "oasis-avatar", kind: "oasis", label: "OASIS Avatar", notes: "auth", path: "src/api/holonRuntimeAdapter.js" }],',
        '  fixtures: [{ id: "demo", label: "Demo", path: "src/fixtures.js", scenario: "fixture" }],',
        '  verification: [{ id: "verify", label: "Verify", expected: "passes" }],',
        '  uiSurfaces: [{ id: "chip", kind: "component", label: "Chip", description: "Auth chip" }],',
        '},',
        '{ id: "def-holon", name: "CartHolon", kind: "order", version: 1, description: "Cart", capability: { summary: "Cart" }, state: { shape: "Cart", lifecycle: ["draft"] }, ports: [{ id: "add", direction: "input", label: "Add", dataShape: "Item" }], dependencies: [{ holonId: "abc-holon", kind: "required", reason: "owner" }], adapters: [{ id: "star", kind: "star", label: "STAR", notes: "live", path: "src/api/holonRuntimeAdapter.js" }], fixtures: [{ id: "cart", label: "Cart", path: "src/fixtures.js", scenario: "fixture" }], verification: [{ id: "cart-v", label: "Verify", expected: "passes" }], uiSurfaces: [{ id: "basket", kind: "screen", label: "Basket", description: "Basket" }] },',
        '{ id: "ghi-holon", name: "AdminOpsHolon", kind: "admin", version: 1, description: "Admin", capability: { summary: "Admin" }, state: { shape: "Ops", lifecycle: ["open"] }, ports: [{ id: "monitor", direction: "input", label: "Monitor", dataShape: "Order" }], dependencies: [], adapters: [{ id: "ops", kind: "internal", label: "Ops", notes: "ops" }], fixtures: [{ id: "ops-f", label: "Ops", path: "src/fixtures.js", scenario: "fixture" }], verification: [{ id: "ops-v", label: "Verify", expected: "passes" }], uiSurfaces: [{ id: "ops", kind: "admin", label: "Ops", description: "Ops" }] }];',
        'export const holons = ["abc-123"];',
      ].join('\n'),
      'utf-8'
    );
    await fs.writeFile(
      path.join(appRoot, 'README.md'),
      '# Food Delivery App\n\nRun with `npm install` and `npm run dev`.\n\nFixture mode is deterministic. Live mode is opt-in and writes STAR holons.\n',
      'utf-8'
    );

    const result = await executeTool(makeExecutor(), 'validate_holonic_app_scaffold', {
      projectPath: 'FoodDeliveryApp',
      stack: 'vite',
      holonCatalogIds: ['abc-123']
    });

    expect(result.isError).not.toBe(true);
    expect(result.content).toContain('Holonic app scaffold validation: PASS');
  });

  it('fails validation when reusable holon specs are missing', async () => {
    const appRoot = path.join(workspaceRoot, 'MissingSpecApp');
    await fs.mkdir(path.join(appRoot, 'src/api'), { recursive: true });
    await fs.writeFile(
      path.join(appRoot, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build' },
        devDependencies: { vite: '^5.0.0' }
      }),
      'utf-8'
    );
    await fs.writeFile(path.join(appRoot, 'vite.config.js'), 'export default { server: { port: 5174 } };\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.js"></script>\n', 'utf-8');
    await fs.mkdir(path.join(appRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(appRoot, 'src/main.js'), 'console.log("app");\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'src/api/starnetApi.js'), 'export const starBaseUrl = "";\n', 'utf-8');
    await fs.writeFile(path.join(appRoot, 'README.md'), '# Missing Spec App\n', 'utf-8');

    const result = await executeTool(makeExecutor(), 'validate_holonic_app_scaffold', {
      projectPath: 'MissingSpecApp',
      stack: 'vite',
      requiredFiles: [
        'package.json',
        'vite.config.js',
        'index.html',
        'src/main.js',
        'src/api/starnetApi.js',
        'README.md'
      ]
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Reusable holon specs');
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
