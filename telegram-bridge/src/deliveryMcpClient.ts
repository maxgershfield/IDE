export interface McpToolResult {
  ok?: boolean;
  error?: boolean;
  message?: string;
  [key: string]: unknown;
}

function extractJsonRpcPayload(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const dataLine = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .at(-1);

  if (!dataLine) {
    throw new Error(`MCP returned non-JSON response: ${trimmed.slice(0, 120)}`);
  }

  return JSON.parse(dataLine.slice('data:'.length).trim());
}

function parseToolText(raw: unknown): McpToolResult {
  if (typeof raw !== 'string') {
    return { ok: true, result: raw };
  }
  try {
    return JSON.parse(raw) as McpToolResult;
  } catch {
    return { ok: true, text: raw };
  }
}

export async function callMcpTool(
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>,
  token?: string
): Promise<McpToolResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `tg-delivery-${Date.now()}`,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const payload = extractJsonRpcPayload(text) as {
    result?: { content?: Array<{ type: string; text?: string }> };
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? 'MCP tool call failed');
  }

  const textContent = payload.result?.content?.find((item) => item.type === 'text')?.text;
  return parseToolText(textContent);
}
