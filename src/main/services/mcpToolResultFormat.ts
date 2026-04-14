/** Max UTF-8 length returned to the LLM from one MCP tool call. */
const MCP_TOOL_RESULT_MAX_CHARS = 256 * 1024;

/**
 * Normalise MCP \`callTool\` result to a single string for the agent tool loop.
 */
export function formatMcpToolResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return truncate(result);

  const r = result as {
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };

  if (Array.isArray(r.content)) {
    const parts = r.content.map((c) => {
      if (c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string') {
        return c.text;
      }
      try {
        return JSON.stringify(c);
      } catch {
        return String(c);
      }
    });
    const prefix = r.isError ? '[MCP error] ' : '';
    return truncate(prefix + parts.join('\n'));
  }

  try {
    return truncate(JSON.stringify(result, null, 2));
  } catch {
    return truncate(String(result));
  }
}

function truncate(s: string): string {
  if (s.length <= MCP_TOOL_RESULT_MAX_CHARS) return s;
  return `${s.slice(0, MCP_TOOL_RESULT_MAX_CHARS)}\n… (truncated)`;
}
