/**
 * Extract the new OAPP id from an MCP `callTool` result for `star_create_oapp`.
 * Handles OASIS-style wrappers (`result.id`, `Result.Id`) and plain `id`.
 */
export function parseOappIdFromStarCreateMcpResult(result: unknown): { oappId?: string; error?: string } {
  if (result == null) return { error: 'Empty MCP result' };
  if (typeof result !== 'object') return { error: 'Unexpected MCP result type' };

  const top = result as {
    error?: boolean;
    message?: string;
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };

  if (top.error === true && typeof top.message === 'string') {
    return { error: top.message };
  }
  if (top.isError === true) {
    return { error: 'MCP tool returned isError' };
  }

  const textBlock = Array.isArray(top.content)
    ? top.content.find((c) => c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string')
    : undefined;
  const text = textBlock?.text;
  if (!text || typeof text !== 'string') {
    return { error: 'MCP result had no text content to parse' };
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return digIdFromParsed(parsed);
  } catch {
    return { error: `Unparseable MCP text: ${text.slice(0, 280)}` };
  }
}

function digIdFromParsed(data: unknown): { oappId?: string; error?: string } {
  if (!data || typeof data !== 'object') return { error: 'Could not parse OAPP create response' };
  const d = data as Record<string, unknown>;
  if (d.isError === true || d.IsError === true) {
    return { error: String(d.message ?? d.Message ?? 'STAR returned an error') };
  }
  const inner = (d.result ?? d.Result) as Record<string, unknown> | undefined;
  const id =
    (typeof d.id === 'string' && d.id) ||
    (typeof d.Id === 'string' && d.Id) ||
    (inner && typeof inner.id === 'string' && inner.id) ||
    (inner && typeof inner.Id === 'string' && inner.Id) ||
    (typeof d.data === 'object' &&
      d.data &&
      typeof (d.data as { id?: string }).id === 'string' &&
      (d.data as { id: string }).id);

  if (id && /^[0-9a-f-]{36}$/i.test(id)) return { oappId: id };
  if (typeof id === 'string' && id.length > 8) return { oappId: id };

  try {
    return { error: `No OAPP id in response: ${JSON.stringify(data).slice(0, 400)}` };
  } catch {
    return { error: 'No OAPP id in response (unserializable)' };
  }
}
