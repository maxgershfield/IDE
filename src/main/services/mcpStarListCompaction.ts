/**
 * STAR list MCP tools can return hundreds of holons/OAPPs as huge JSON, blowing past LLM context
 * limits when two list calls land in one turn. Shrink to a bounded markdown table + counts.
 */

const COMPACT_LIST_TOOLS = new Set(['star_list_holons', 'star_list_oapps', 'star_search_oapps']);

const MAX_ROWS = 55;
/** Hard cap on characters returned to the model for list tools (after table build). */
const MAX_LIST_TOOL_CHARS = 28_000;

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function pickStr(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.charAt(0).toUpperCase() + k.slice(1)];
    if (v === undefined || v === null) continue;
    const s = String(v).replace(/\r?\n/g, ' ').trim();
    if (s) return s;
  }
  return '';
}

/**
 * STAR WebAPI + MCP often return `OASISResult` JSON: `{ result: { result: [ ... ] } }`.
 * The renderer unwraps this in `starApiService.unwrapHolonListPayload`; MCP compaction must do the same
 * or the agent sees "zero holons" while the STARNET tab is full.
 */
function unwrapToUnknownArray(data: unknown): unknown[] {
  let cur: unknown = data;
  for (let depth = 0; depth < 16; depth++) {
    if (Array.isArray(cur)) return cur;
    if (cur === null || cur === undefined) return [];
    if (typeof cur !== 'object') return [];
    const o = cur as Record<string, unknown>;
    if (Array.isArray(o.$values)) {
      return o.$values as unknown[];
    }
    const branch = o.result ?? o.Result ?? o.data ?? o.Data;
    if (branch !== undefined && branch !== null) {
      cur = branch;
      continue;
    }
    for (const k of ['holons', 'Holons', 'oapps', 'OAPPs', 'items', 'Items']) {
      const v = o[k];
      if (Array.isArray(v)) return v;
    }
    return [];
  }
  return [];
}

function recordsFromParsed(parsed: unknown): Record<string, unknown>[] {
  const flat = unwrapToUnknownArray(parsed);
  return flat.filter(isRecord);
}

/** `null` = JSON parse failed; `[]` = parsed but no holon/OAPP-shaped rows. */
function parseListRows(raw: string): Record<string, unknown>[] | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return recordsFromParsed(parsed);
  } catch {
    const i = s.indexOf('[');
    const j = s.lastIndexOf(']');
    if (i === -1 || j <= i) return null;
    try {
      const parsed = JSON.parse(s.slice(i, j + 1));
      return recordsFromParsed(parsed);
    } catch {
      return null;
    }
  }
}

function escCell(s: string): string {
  return s.replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim();
}

function buildHolonTable(rows: Record<string, unknown>[]): string {
  const lines: string[] = [
    '### Holons (compact catalog)',
    '',
    `Total in this response: **${rows.length}** (showing first **${Math.min(MAX_ROWS, rows.length)}**).`,
    'For full JSON for one item call `mcp_invoke` with `star_get_holon` and `{ "id": "<uuid>" }`.',
    '',
    '| id | name | type |',
    '|---|---|---|'
  ];
  for (const row of rows.slice(0, MAX_ROWS)) {
    const id = escCell(pickStr(row, ['id', 'Id', 'holonId', 'HolonId']));
    const name = escCell(pickStr(row, ['name', 'Name']).slice(0, 120));
    const typ = escCell(pickStr(row, ['holonType', 'HolonType', 'type', 'Type']).slice(0, 80));
    lines.push(`| ${id} | ${name} | ${typ} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildOappTable(rows: Record<string, unknown>[]): string {
  const lines: string[] = [
    '### OAPPs (compact catalog)',
    '',
    `Total in this response: **${rows.length}** (showing first **${Math.min(MAX_ROWS, rows.length)}**).`,
    'For full JSON for one item call `mcp_invoke` with `star_get_oapp` and `{ "id": "<uuid>" }`.',
    '',
    '| id | name | type | version |',
    '|---|---|---|---|'
  ];
  for (const row of rows.slice(0, MAX_ROWS)) {
    const id = escCell(pickStr(row, ['id', 'Id', 'oappId', 'OAPPId']));
    const name = escCell(pickStr(row, ['name', 'Name']).slice(0, 120));
    const typ = escCell(pickStr(row, ['oappType', 'OappType', 'type', 'Type']).slice(0, 40));
    const ver = escCell(pickStr(row, ['version', 'Version']).slice(0, 32));
    lines.push(`| ${id} | ${name} | ${typ} | ${ver} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * After `formatMcpToolResult`, shrink STAR catalog list payloads so the agent thread stays
 * within model limits.
 */
export function compactAgentMcpToolResult(tool: string, formattedText: string): string {
  if (!COMPACT_LIST_TOOLS.has(tool)) return formattedText;

  const rows = parseListRows(formattedText);
  if (rows === null) {
    return (
      `[${tool}] Could not parse MCP output as JSON; returning truncated raw text.\n\n` +
      formattedText.slice(0, 12_000) +
      (formattedText.length > 12_000 ? '\n… (truncated)' : '')
    );
  }
  if (rows.length === 0) {
    const rawLen = formattedText.trim().length;
    if (rawLen > 400) {
      return (
        `[${tool}] Parsed JSON but found **no object rows** after unwrapping (STAR may use a new payload shape). ` +
        `The **STARNET** tab in this IDE still shows the live catalog for the logged-in avatar. Truncated raw (first 14k chars):\n\n` +
        formattedText.slice(0, 14_000) +
        (rawLen > 14_000 ? '\n…' : '')
      );
    }
    return (
      `### ${tool}\n\n` +
      `STAR returned an **empty list** for this MCP call (no holon/OAPP rows after unwrap).\n\n` +
      `If **Activity bar → STARNET** shows holons/OAPPs but this is empty, the MCP child often lacks the same JWT as the UI: **log in**, then **restart the IDE** (or restart MCP) so \`OASIS_JWT_TOKEN\` is passed to \`star_list_*\` tools.`
    );
  }

  const table =
    tool === 'star_list_oapps' || tool === 'star_search_oapps'
      ? buildOappTable(rows)
      : buildHolonTable(rows);

  if (table.length <= MAX_LIST_TOOL_CHARS) return table;
  return `${table.slice(0, MAX_LIST_TOOL_CHARS)}\n\n… (STARNET list table truncated further for size)`;
}
