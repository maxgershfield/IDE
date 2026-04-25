import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAgentMcpToolAllowed, isAgentMcpToolPlanReadOnly } from './agentMcpAllowlist.js';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: () => ({
      defaults: { headers: { common: {} } },
      get: mockGet,
      post: mockPost
    })
  },
  isAxiosError: () => false
}));

const { OASISAPIClient } = await import('./OASISAPIClient.js');

describe('A2A MCP allowlist', () => {
  it('allows A2A tools in execute mode', () => {
    expect(isAgentMcpToolAllowed('oasis_discover_agents_via_serv')).toBe(true);
    expect(isAgentMcpToolAllowed('oasis_send_a2a_jsonrpc_request')).toBe(true);
    expect(isAgentMcpToolAllowed('oasis_execute_ai_workflow')).toBe(true);
  });

  it('keeps mutating A2A tools out of plan mode', () => {
    expect(isAgentMcpToolPlanReadOnly('oasis_get_agent_card')).toBe(true);
    expect(isAgentMcpToolPlanReadOnly('oasis_discover_agents_via_serv')).toBe(true);
    expect(isAgentMcpToolPlanReadOnly('oasis_send_a2a_jsonrpc_request')).toBe(false);
    expect(isAgentMcpToolPlanReadOnly('oasis_register_agent_capabilities')).toBe(false);
  });
});

describe('OASISAPIClient A2A requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: [] });
    mockPost.mockResolvedValue({ data: { result: { ok: true } } });
  });

  it('discovers agents through the ONET endpoint', async () => {
    const client = new OASISAPIClient('http://localhost:5003');
    await client.discoverAgents('phenotyping');

    expect(mockGet).toHaveBeenCalledWith('/api/a2a/agents/discover-onet?service=phenotyping');
  });

  it('sends JSON-RPC with to_agent_id and no camelCase recipient', async () => {
    const client = new OASISAPIClient('http://localhost:5003');
    await client.sendA2AJsonRpc('00000000-0000-0000-0000-000000000002', 'service_request', {
      content: 'score this trial',
      toAgentId: 'ignored'
    });

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/api/a2a/jsonrpc');
    expect(body.method).toBe('service_request');
    expect(body.params.to_agent_id).toBe('00000000-0000-0000-0000-000000000002');
    expect(body.params.toAgentId).toBeUndefined();
    expect(body.params.content).toBe('score this trial');
  });

  it('registers capabilities on the backend capability endpoint', async () => {
    const client = new OASISAPIClient('http://localhost:5003');
    await client.registerAgentCapabilities('agent-1', ['trait-scoring']);

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/api/a2a/agent/capabilities');
    expect(body.services).toEqual(['trait-scoring']);
  });
});
