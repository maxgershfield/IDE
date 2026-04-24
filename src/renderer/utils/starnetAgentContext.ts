import type { StarnetCatalogSnapshot } from '../contexts/StarnetCatalogContext';
import { holonTypeNameFromEnum } from '../services/holonTypeLabels';
import { oappTypeLabel } from '../services/starApiService';

const MAX_NOTE_CHARS = 12_000;
const MAX_HOLON_ROWS = 35;
const MAX_OAPP_ROWS = 25;

function escCell(s: string): string {
  return s.replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim();
}

/**
 * When the user is logged in but the STARNET activity has not pushed a snapshot yet
 * (or lists have not loaded).
 */
export function buildStarnetIdeSnapshotMissingNote(): string {
  return (
    '## STARNET catalog (global registry — snapshot not loaded yet)\n\n' +
    '**Disambiguation:** This block is for **STAR-published** holon and OAPP ids. It is not the on-disk holonic index. ' +
    'To describe what exists **in the open project**, use the **Local workspace** sections in this same context pack.\n\n' +
    'No catalog table is attached to this turn yet. Open **Activity bar → STARNET**, wait for lists (use **Refresh** if needed), then send again so holon/OAPP rows can be injected here. ' +
    'In **Agent mode**, use read-only `mcp_invoke` (`star_list_holons`, `star_list_oapps`) for live ids. Do not send the user to an external STARNET website to browse components.\n'
  );
}

/**
 * Bounded markdown for the agent context pack so the single composer thread
 * stays holon-aware without a second chat surface.
 */
export function buildStarnetIdeContextNote(snapshot: StarnetCatalogSnapshot | null): string | null {
  if (!snapshot) return null;
  const { holonCatalogRows, oapps, baseUrl, apiReady } = snapshot;
  const holons = holonCatalogRows ?? [];
  const oappList = oapps ?? [];

  if (holons.length === 0 && oappList.length === 0) {
    const apiHint = apiReady
      ? 'STAR WebAPI responded OK in the IDE UI.'
      : 'STAR WebAPI reachability is **not** confirmed in the IDE — check **Settings → STARNET**, login, and **Refresh** on the STARNET screen.';
    return (
      `## STARNET catalog (global registry — not your open folder tree)\n\n` +
      `**Disambiguation:** This section is the STAR **registry** for published holons/OAPPs. It is not the on-disk “holonic index” or folder list. ` +
      `For holons **in the workspace**, use the **Local workspace** sections in this same context pack.\n\n` +
      `Holon and OAPP tables are **empty in this snapshot** (lists may still be loading, or nothing is registered for this avatar yet).\n` +
      `STAR WebAPI base observed in the IDE: \`${baseUrl}\`. ${apiHint}\n\n` +
      `In **Agent mode**, call \`mcp_invoke\` with \`star_list_holons\` and \`star_list_oapps\` before claiming connection failures or missing templates. ` +
      `Browse in-IDE via **Activity bar → STARNET** — do not direct the user to an external STARNET portal.\n`
    );
  }

  const lines: string[] = [
    '## STARNET catalog (global registry — not your open folder tree)',
    '',
    '**Disambiguation:** The rows below are **published holon and OAPP records** in STAR (library templates, app shells, IDs the avatar can use).',
    'They are **not** a listing of subdirectories on disk, and they are **not** the “holonic index” the IDE built from the workspace. Use them for **composition, publish, and id lookups**.',
    '',
    'When the user asks what holons exist **in the workspace** / **in this monorepo** / **in this project**, base the answer on the **Local workspace** / **Relevant Holons** sections of this same context (folders + on-disk index), not this table.',
    '',
    `This table is the **same merged holon/OAPP catalog** the user sees under **Activity bar → STARNET** (renderer snapshot + merge rules). The model does **not** receive the UI — only this markdown. Treat the rows as the authoritative list **of the STARNET registry snapshot** for this turn, not of repo folders, unless a separate section in this context describes “local” holons.`,
    '',
    `**You do not need** \`mcp_invoke\` with \`star_list_holons\` or \`star_list_oapps\` just to “discover” what exists in **STARNET** when this section already lists rows. Use those list tools only if the user asks for a **live** STAR round-trip, ids need re-verification before publish, or this catalog block is absent. For one row’s full JSON, use \`star_get_holon\` / \`star_get_oapp\` with an \`id\` from the table. STAR WebAPI base observed in the IDE: \`${baseUrl}\`.`,
    ''
  ];

  if (holons.length > 0) {
    lines.push(`### STARNET-registered holons and templates (merged catalog, ${holons.length} rows, first ${MAX_HOLON_ROWS})`);
    lines.push('| id | name | type |');
    lines.push('|---|---|---|');
    for (const h of holons.slice(0, MAX_HOLON_ROWS)) {
      lines.push(
        `| ${h.id} | ${escCell(h.name || '')} | ${escCell(holonTypeNameFromEnum(h.holonType))} |`
      );
    }
    lines.push('');
  }

  if (oappList.length > 0) {
    lines.push(`### OAPPs (${oappList.length} rows, first ${MAX_OAPP_ROWS})`);
    lines.push('| id | name | type | version |');
    lines.push('|---|---|---|---|');
    for (const o of oappList.slice(0, MAX_OAPP_ROWS)) {
      lines.push(
        `| ${o.id} | ${escCell(o.name || '')} | ${escCell(oappTypeLabel(o.oappType))} | ${escCell(String(o.version ?? ''))} |`
      );
    }
    lines.push('');
  }

  lines.push(
    '**Never** tell the user there are “no holons” or “no OAPPs” when this section contains rows. If a later `mcp_invoke` list tool returns empty or conflicts, assume an MCP session/JWT mismatch and **still plan from this table**, mentioning that STAR lists in the Agent path should be fixed (login + IDE restart) rather than denying inventory.',
    '',
    '**Tone for holon recommendations:** For each row you rely on, cite **id + name + type** and state **what part of the product it implements** in decisive language (avoid “could / might / useful for” for rows that appear above). Name a **default app shell** (Expo vs Vite) from `OASIS-IDE/docs/recipes/` and list **custom work** where no holon covers the feature.',
    '',
    'For **composition planning**, map user features to specific rows above (or to `star_get_holon` output), note gaps, then optionally emit `<oasis_holon_diagram>` JSON per the main context pack so the IDE renders an interactive graph.'
  );

  let out = lines.join('\n');
  if (out.length > MAX_NOTE_CHARS) {
    out = `${out.slice(0, MAX_NOTE_CHARS)}\n\n… (STARNET catalog truncated for context size)`;
  }
  return out;
}
