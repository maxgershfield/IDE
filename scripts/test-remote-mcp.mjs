#!/usr/bin/env node
/**
 * Smoke test: same transport as MCPServerManager (Streamable HTTP to hosted MCP).
 * Usage (from OASIS-IDE): node scripts/test-remote-mcp.mjs
 * Optional: OASIS_MCP_REMOTE_URL=... OASIS_JWT_TOKEN=... node scripts/test-remote-mcp.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const remoteUrl = process.env.OASIS_MCP_REMOTE_URL?.trim() || 'https://mcp.oasisweb4.one/mcp';
const jwt = process.env.OASIS_JWT_TOKEN?.trim();

const headers = {};
if (jwt) {
  headers.Authorization = `Bearer ${jwt}`;
}

const client = new Client({ name: 'oasis-ide-remote-test', version: '1.0.0' }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(new URL(remoteUrl), {
  requestInit: Object.keys(headers).length ? { headers } : undefined
});

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(`OK: connected to ${remoteUrl}`);
  console.log(`OK: listTools count = ${tools?.length ?? 0}`);
  if (tools?.length) {
    const names = tools.slice(0, 8).map((t) => t.name);
    console.log(`Sample tool names: ${names.join(', ')}${tools.length > 8 ? ', …' : ''}`);
  }

  const health = await client.callTool({ name: 'oasis_health_check', arguments: {} });
  console.log('oasis_health_check:', JSON.stringify(health, null, 2).slice(0, 500));

  await transport.close();
  process.exit(0);
} catch (e) {
  console.error('FAIL:', e?.message || e);
  process.exit(1);
}
