import type { StarnetCatalogSnapshot } from '../contexts/StarnetCatalogContext';
import { holonTypeNameFromEnum } from '../services/holonTypeLabels';
import { oappTypeLabel } from '../services/starApiService';
import { suggestHolonsForIdea } from '../services/starnetHolonSuggest';
import { matchAppArchetype } from '../../shared/appArchetypeHints';

/** Generous for “scan every useful holon” — composer may still cap; see `inputBudget`. */
const MAX_NOTE_CHARS = 20_000;
const MAX_HOLON_ROWS = 100;
const MAX_OAPP_ROWS = 45;

function escCell(s: string): string {
  return s.replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim();
}

/**
 * Per-turn, deterministic shortlist built **inside the IDE** from the already-loaded STARNET snapshot.
 * This prevents the model from skipping useful rows or falling back to slow `star_list_*` calls.
 */
export function buildStarnetShortlistForUserRequest(
  userText: string,
  snapshot: StarnetCatalogSnapshot | null
): string | null {
  const holons = snapshot?.holonCatalogRows ?? [];
  if (holons.length === 0) return null;

  const archetype = matchAppArchetype(userText);
  const enrichedQuery = [
    userText,
    archetype?.label ?? '',
    ...(archetype?.subsystems ?? []),
  ].join('\n');
  const picks = suggestHolonsForIdea(enrichedQuery, holons, { max: 18 });
  if (picks.length === 0) return null;

  const rows = picks.map(({ holon, score, matchedTerms }) => {
    const terms = matchedTerms.length > 0 ? matchedTerms.join(', ') : 'fallback';
    return `| ${holon.id} | ${escCell(holon.name || '')} | ${escCell(holonTypeNameFromEnum(holon.holonType))} | ${score} | ${escCell(terms)} |`;
  });

  const archetypeLine = archetype
    ? `Detected app archetype: **${archetype.label}** (\`${archetype.id}\`). The shortlist query includes these implied subsystems: ${archetype.subsystems.map((s) => `\`${s.split(':')[0]}\``).join(', ')}.`
    : 'Detected app archetype: generic STARNET/OAPP product request.';

  return [
    '## IDE-selected STARNET shortlist for this user request (deterministic, no network)',
    '',
    archetypeLine,
    '',
    'These rows were selected locally from the same in-memory/disk-cache catalog as Activity bar → STARNET. **Use these concrete rows first** in the answer, then add other matching rows from the full `## STARNET catalog` table if relevant.',
    '',
    '| id | name | type | score | matched terms |',
    '|---|---|---|---:|---|',
    ...rows,
    '',
    '**Answer rule:** In `B. Holon map`, prefer these exact `id` values. Do not write “Not listed” for any subsystem covered by this shortlist. If a subsystem still has no matching row after checking the shortlist and catalog table, put it under **Proposed (not in attached catalog)**.'
  ].join('\n');
}

/**
 * When the user is logged in but the STARNET activity has not pushed a snapshot yet
 * (or lists have not loaded).
 */
export function buildStarnetIdeSnapshotMissingNote(): string {
  return (
    '## STARNET catalog (IDE + disk cache — snapshot not loaded yet)\n\n' +
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
      `## STARNET catalog (IDE + disk cache — not your open folder tree)\n\n` +
      `**Disambiguation:** This section is the STAR **registry** for published holons/OAPPs. It is not the on-disk “holonic index” or folder list. ` +
      `For holons **in the workspace**, use the **Local workspace** sections in this same context pack.\n\n` +
      `Holon and OAPP tables are **empty in this snapshot** (the background cache may still be loading; or nothing is registered for this avatar yet; or lists have not been fetched this session). ` +
      `If the user can **see** holons in **Activity bar → STARNET** but this block is empty, tell them to wait a few seconds and send again, or click **Refresh** in STARNET — the assistant should **not** claim a STAR outage from MCP alone.\n\n` +
      `STAR WebAPI base observed in the IDE: \`${baseUrl}\`. ${apiHint}\n\n` +
      `**Discovery order:** prefer this IDE snapshot when it has rows. Only use \`mcp_invoke\` (\`star_list_holons\` / \`star_list_oapps\`) for a **live** refresh or when you need a server round-trip, not as the first step. Do not direct the user to an external STARNET portal.\n`
    );
  }

  const lines: string[] = [
    '## STARNET catalog (IDE + disk cache — in-memory and userData, same as the STARNET view)',
    '',
    '**IDE-first (required):** This list is what the OASIS IDE has already loaded (STARNET activity + optional durable cache). It is the **default inventory** for “what is available in STARNET for this user.”',
    'Do **not** say you cannot list or find STARNET holons/OAPPs if the tables below have rows, and do **not** use slow remote list tools for the same data unless the user asks for a **fresh** server read.',
    '',
    '**Disambiguation:** The rows below are **published holon and OAPP records** in STAR (library templates, app shells, IDs the avatar can use).',
    'They are **not** a listing of subdirectories on disk, and they are **not** the “holonic index” the IDE built from the workspace. Use them for **composition, publish, and id lookups**.',
    '',
    'When the user asks what holons exist **in the workspace** / **in this monorepo** / **in this project**, base the answer on the **Local workspace** / **Relevant Holons** sections of this same context (folders + on-disk index), not this table.',
    '',
    `This table is the **same merged holon/OAPP catalog** the user sees under **Activity bar → STARNET** (in-memory snapshot + on-disk list cache + merge rules). The model does **not** receive the UI — only this markdown. Treat the rows as the **authoritative STARNET registry snapshot** for this turn, not of repo folders, unless a separate section in this context describes “local” holons.`,
    '',
    `**You do not need** \`mcp_invoke\` with \`star_list_holons\` or \`star_list_oapps\` just to “discover” what exists in **STARNET** when this section already lists rows. Use list tools only if the user asks for a **live** round-trip, ids need re-verification before publish, or this block is **absent or empty** after a refresh. For one row’s full JSON, use \`star_get_holon\` / \`star_get_oapp\` with an \`id\` from the table. STAR WebAPI base observed in the IDE: \`${baseUrl}\`.`,
    ''
  ];

  if (holons.length > 0) {
    const shownH = holons.slice(0, MAX_HOLON_ROWS);
    const moreH = holons.length - shownH.length;
    lines.push(
      `### STARNET-registered holons and templates (merged catalog: ${holons.length} total rows, ${shownH.length} in this table${moreH > 0 ? ` — open Activity bar → STARNET to see the remaining ${moreH}` : ''})`
    );
    lines.push('| id | name | type |');
    lines.push('|---|---|---|');
    for (const h of shownH) {
      lines.push(
        `| ${h.id} | ${escCell(h.name || '')} | ${escCell(holonTypeNameFromEnum(h.holonType))} |`
      );
    }
    lines.push('');
  }

  if (oappList.length > 0) {
    const shownO = oappList.slice(0, MAX_OAPP_ROWS);
    const moreO = oappList.length - shownO.length;
    lines.push(
      `### OAPPs (${oappList.length} total, ${shownO.length} in this table${moreO > 0 ? ` — ${moreO} not in this table; see STARNET` : ''})`
    );
    lines.push('| id | name | type | version |');
    lines.push('|---|---|---|---|');
    for (const o of shownO) {
      lines.push(
        `| ${o.id} | ${escCell(o.name || '')} | ${escCell(oappTypeLabel(o.oappType))} | ${escCell(String(o.version ?? ''))} |`
      );
    }
    lines.push('');
  }

  lines.push(
    '**Never** tell the user there are “no holons” or “no OAPPs” when this section contains rows. If a later `mcp_invoke` list tool returns empty or conflicts, assume an MCP session/JWT mismatch and **still plan from this table**, mentioning that STAR lists in the Agent path should be fixed (login + IDE restart) rather than denying inventory.',
    '',
    '**Full table scan (when the user asks which holons help / are available for a use case):** You must first consider **every row in the holon and OAPP tables** above in this same message (or every row in this request before truncation, if a truncation notice appears). ' +
      '**Include** each row that plausibly helps the app (delivery, couriers, riders, menus, venues, orders, maps, social, karma, NFT, payments, users, admin, etc.) — not a minimal cherry-pick of 2–3. ' +
      'If more rows exist in the IDE but not in this text, say so and point the user to **Activity bar → STARNET**.',
    '',
    '**Catalog id column (B. Holon map, plans, and tables in your answer):** Must be the **id** (uuid) from the **id** column above. The literal text “Not listed”, “N/A”, or a PascalCase **type** name alone (e.g. VenueHolon) as a stand-in for id is **banned** when a matching or relevant row exists in the tables. ' +
      'To mention an abstract or recipe-only pattern that has **no** row here, add a **separate** subsection: **Proposed (not in attached catalog)**.',
    '',
    '**Tone for holon recommendations:** For each **catalog** row you cite, use **id + name + type** and state what part of the product it implements (avoid “could / might / useful for”). Name a **default app shell** (Expo vs Vite) from `OASIS-IDE/docs/recipes/` and list **custom work** where no row covers the feature.',
    '',
    'For **composition planning**, map user features to specific rows above (or to `star_get_holon` output), note gaps, then optionally emit `<oasis_holon_diagram>` JSON per the main context pack so the IDE renders an interactive graph.'
  );

  let out = lines.join('\n');
  if (out.length > MAX_NOTE_CHARS) {
    out = `${out.slice(0, MAX_NOTE_CHARS)}\n\n… (STARNET catalog truncated for context size)`;
  }
  return out;
}

/**
 * **Search-first STARNET** — tiny pointer instead of preloading the full holon/OAPP table every turn.
 * The agent fetches inventory via `mcp_invoke` (`star_list_holons`, `star_list_oapps`) or uses the
 * in-IDE STARNET activity view. Cuts several thousand input tokens per agent turn vs `buildStarnetIdeContextNote`.
 */
export function buildStarnetSearchFirstNote(baseUrl: string, apiReady: boolean, loggedIn: boolean): string | null {
  if (!loggedIn) return null;
  const apiLine = apiReady
    ? 'STAR WebAPI was reachable the last time the IDE checked (renderer path).'
    : 'Confirm **Settings → STARNET** and use **Refresh** on the STARNET screen if list tools fail.';
  return (
    '## STARNET (search-first — no holon table attached **this** turn)\n\n' +
    '**Default discovery path:** the IDE preloads a **\`## STARNET catalog (IDE + disk cache …)\` block** in **full** context mode and whenever that snapshot is non-empty in search-first — that block is the same data as **Activity bar → STARNET** and the userData cache (fast, no MCP round-trip). ' +
    'This search-first turn **skipped** the big table to save tokens; the catalog may still be **loading in the background** or empty for this session.\n\n' +
    '**Before calling `mcp_invoke` list tools:** ask the user to open **Activity bar → STARNET** and wait for lists, switch **Settings → Agents** to **Full** context, or re-send the message. Avoid slow/timeout `star_list_*` calls for basic “what is available” questions if the user can see rows in the STARNET view.\n\n' +
    '**Hosted MCP (default `OASIS_MCP_TRANSPORT=http`):** `star_list_holons` / `star_list_oapps` run on the **remote** MCP host. Prefer **local stdio MCP** for STAR parity with the IDE, or use the in-IDE list.\n\n' +
    '**Fetch (only if needed):**\n' +
    '- `mcp_invoke` with `star_list_holons` and `star_list_oapps` (local stdio MCP + login), or `star_get_holon` / `star_get_oapp` for one id’s JSON\n' +
    '- **Activity bar → STARNET** in the IDE\n\n' +
    `Observed STAR base: \`${baseUrl}\`. ${apiLine}\n` +
    'If `mcp_invoke` fails, do **not** treat that alone as a STAR outage — the IDE’s STARNET view and disk cache are separate from hosted MCP.\n' +
    'Do not send users to external “STARNET portal” marketing URLs for inventory; use the in-IDE view or the catalog block when it appears in context.\n'
  );
}
