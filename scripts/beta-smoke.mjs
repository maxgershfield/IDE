#!/usr/bin/env node
/**
 * Beta readiness smoke gate for OASIS IDE.
 *
 * Default checks are local and non-mutating:
 * - unit/regression tests
 * - production build
 * - expected Electron/Vite build artifacts
 *
 * Optional network check:
 * - pass --remote-mcp to connect to hosted MCP and call oasis_health_check
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));

const skipTests = args.has('--skip-tests');
const skipBuild = args.has('--skip-build');
const remoteMcp = args.has('--remote-mcp');

function logStep(message) {
  console.log(`\n==> ${message}`);
}

function run(command, argv, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
      env: process.env,
      ...options
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${argv.join(' ')} failed with ${signal ? `signal ${signal}` : `exit ${code}`}`));
    });
  });
}

function assertFile(relPath) {
  const full = path.join(projectRoot, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing expected build artifact: ${relPath}`);
  }
  console.log(`OK: ${relPath}`);
}

async function runRemoteMcpCheck() {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const remoteUrl = process.env.OASIS_MCP_REMOTE_URL?.trim() || 'https://mcp.oasisweb4.one/mcp';
  const jwt = process.env.OASIS_JWT_TOKEN?.trim();
  const headers = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const client = new Client({ name: 'oasis-ide-beta-smoke', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(remoteUrl), {
    requestInit: Object.keys(headers).length ? { headers } : undefined
  });

  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const count = tools?.length ?? 0;
    console.log(`OK: connected to ${remoteUrl}`);
    console.log(`OK: listTools count = ${count}`);
    if (count === 0) throw new Error('Hosted MCP returned zero tools');
    const hasHealth = tools?.some((t) => t.name === 'oasis_health_check');
    if (!hasHealth) throw new Error('Hosted MCP is missing oasis_health_check');
    const health = await client.callTool({ name: 'oasis_health_check', arguments: {} });
    console.log(`OK: oasis_health_check returned ${JSON.stringify(health).slice(0, 240)}`);
  } finally {
    await transport.close();
  }
}

try {
  console.log('OASIS IDE beta smoke gate');
  console.log(`Project: ${projectRoot}`);

  if (!skipTests) {
    logStep('Running regression tests');
    await run('npm', ['test']);
  }

  if (!skipBuild) {
    logStep('Building production Electron/Vite app');
    await run('npm', ['run', 'build']);
  }

  logStep('Checking build artifacts');
  assertFile('dist/main/index.js');
  assertFile('dist/main/preload.js');
  assertFile('dist/renderer/index.html');

  if (remoteMcp) {
    logStep('Checking hosted MCP');
    await runRemoteMcpCheck();
  } else {
    console.log('\nSkipped hosted MCP check. Run `npm run smoke:beta -- --remote-mcp` to include it.');
  }

  console.log('\nBeta smoke gate passed.');
  console.log('Manual golden flows: see docs/EXTERNAL_TESTERS.md and docs/recipes/demo-flows.md.');
} catch (error) {
  console.error('\nBeta smoke gate failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
