import type {
  AgentActivityMeta,
  AgentChatMessage,
  AgentContentPart,
  AgentToolCall
} from '../../shared/agentTurnTypes';
import type { AgentActivityFeedItem, ToolKind } from '../../shared/agentActivityFeed';
import { extractGatherDigest } from '../utils/planReplyParser';

function basenamePath(p: string): string {
  const s = p.replace(/[/\\]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(i + 1) : s;
}

export function emitActivityMetaAsFeed(
  meta: AgentActivityMeta,
  pushFeed: (item: AgentActivityFeedItem) => void
): void {
  if (meta.kind === 'file_write') {
    pushFeed({
      kind: 'file_edit',
      displayPath: basenamePath(meta.path),
      fullPath: meta.path,
      addedLines: meta.addedLines,
      removedLines: meta.removedLines,
      isNewFile: meta.isNewFile,
      source: 'write',
      diffPreview: meta.diffPreview ?? null
    });
  } else if (meta.kind === 'file_writes') {
    for (const f of meta.files) {
      pushFeed({
        kind: 'file_edit',
        displayPath: basenamePath(f.path),
        fullPath: f.path,
        addedLines: f.addedLines,
        removedLines: f.removedLines,
        isNewFile: f.isNewFile,
        source: 'write',
        diffPreview: f.diffPreview ?? null
      });
    }
  } else if (meta.kind === 'search_replace') {
    pushFeed({
      kind: 'file_edit',
      displayPath: basenamePath(meta.path),
      fullPath: meta.path,
      addedLines: 0,
      removedLines: 0,
      isNewFile: false,
      source: 'search_replace',
      replacementCount: meta.replacementCount,
      diffPreview: meta.diffPreview ?? null
    });
  }
}

/** Composer thread bubble (subset of fields) for rebuilding agent context. */
export type ThreadBubbleForAgent = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; result: unknown }>;
  /** data:image/...;base64,... URLs from pasted images (user turns only). */
  imageDataUrls?: string[];
};

const PRIOR_USER_MAX = 12000;
const PRIOR_ASSISTANT_MAX = 28000;

function clampChars(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…(truncated)`;
}

/**
 * Map saved Composer messages to OpenAI-style user/assistant turns for ONODE agent/turn.
 * Tool results from a prior turn are inlined under the assistant message so follow-ups
 * (e.g. Solana signatures) stay addressable without re-running tools.
 */
export function buildAgentPriorMessagesFromThread(past: ThreadBubbleForAgent[]): AgentChatMessage[] {
  const out: AgentChatMessage[] = [];
  for (const m of past) {
    if (m.role === 'user') {
      const text = clampChars(m.content ?? '', PRIOR_USER_MAX);
      const urls = (m.imageDataUrls ?? []).filter(
        (u) => typeof u === 'string' && u.startsWith('data:') && u.includes(';base64,')
      );
      if (urls.length > 0) {
        const parts: AgentContentPart[] = [{ type: 'text', text }];
        for (const url of urls.slice(0, 4)) {
          parts.push({ type: 'image_url', imageUrl: url });
        }
        out.push({ role: 'user', contentParts: parts });
      } else {
        out.push({ role: 'user', content: text });
      }
      continue;
    }
    let body = m.content ?? '';
    if (m.toolCalls?.length) {
      const parts: string[] = [];
      for (const tc of m.toolCalls) {
        let snippet = '';
        try {
          snippet = typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result);
        } catch {
          snippet = String(tc.result);
        }
        if (snippet.length > 8000) snippet = `${snippet.slice(0, 8000)}…`;
        parts.push(`- ${tc.tool}: ${snippet}`);
      }
      body = `${body}\n\n[Tool results from this assistant turn]\n${parts.join('\n')}`;
    }
    out.push({ role: 'assistant', content: clampChars(body, PRIOR_ASSISTANT_MAX) });
  }
  return out;
}

function buildInitialUserAgentMessage(options: {
  userText: string;
  workspacePath: string;
  gameDevMode?: boolean;
  executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
  activeFilePath?: string;
  userImageDataUrls?: string[];
}): AgentChatMessage {
  const augmented = augmentIdeAgentUserMessage(
    options.userText,
    options.workspacePath,
    options.gameDevMode,
    skipClientPlanAppendix(options.executionMode),
    options.activeFilePath
  );
  const urls = (options.userImageDataUrls ?? []).filter(
    (u) => typeof u === 'string' && u.startsWith('data:') && u.includes(';base64,')
  );
  if (urls.length === 0) {
    return { role: 'user', content: augmented };
  }
  const parts: AgentContentPart[] = [{ type: 'text', text: augmented }];
  for (const url of urls.slice(0, 4)) {
    parts.push({ type: 'image_url', imageUrl: url });
  }
  return { role: 'user', contentParts: parts };
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Sparse "create OAPP / game" prompts: plan and gather context first (OASIS_IDE-style plan mode),
 * instead of immediately running STAR, npm, or write_*.
 */
/** User is starting an in-IDE STARNET / holon / OAPP build — show a Cursor-style kickoff line. */
export function userMessageLooksLikeStarnetOappBuild(userText: string): boolean {
  const t = userText.toLowerCase();
  if (/\bstarnet\b/.test(t)) {
    return /\b(oapp|holon|component|build|create|make|app|compose|using|from|catalog)\b/.test(t);
  }
  if (/\bholon(s)?\b/.test(t) && /\b(oapp|build|app|starnet|compose)\b/.test(t)) return true;
  if (/\boapp\b/.test(t) && /\b(build|create|make|holon|starnet|using)\b/.test(t)) return true;
  return false;
}

function starnetWorkflowKickoffLine(userText: string): string | null {
  if (!userMessageLooksLikeStarnetOappBuild(userText)) return null;
  return (
    '**STARNET** — Lining up OAPP and holon details from the IDE. ' +
    'The catalog in context is size-limited; the reply will use STAR lookups for the right ids when needed.'
  );
}

/**
 * One friendly line for the user — no raw tool API names (Cursor-style).
 * Technical detail is still in the final reply if needed; this is “progress vibe” only.
 */
function toolCallBatchIntro(
  toolCalls: Array<{ name: string; argumentsJson?: string | null }>
): string {
  const allMcp = toolCalls.length > 0 && toolCalls.every((tc) => tc.name === 'mcp_invoke');
  const innerStarCount = toolCalls.filter((tc) => {
    if (tc.name !== 'mcp_invoke') return false;
    try {
      const a = JSON.parse(tc.argumentsJson ?? '{}') as { tool?: string };
      return typeof a.tool === 'string' && a.tool.startsWith('star_');
    } catch {
      return false;
    }
  }).length;
  if (allMcp && innerStarCount === toolCalls.length) {
    return 'Checking STAR / STARNET from the workspace… (catalog and ids may appear in the reply.)';
  }

  const kind = (n: string) => {
    if (n === 'read_file' || n === 'fetch_url') return 'read';
    if (n === 'list_directory') return 'list';
    if (n === 'write_file' || n === 'write_files' || n === 'search_replace') return 'write';
    if (n === 'run_workspace_command' || n === 'run_star_cli') return 'command';
    if (n === 'mcp_invoke') return 'mcp';
    if (n === 'web_search' || n === 'open_browser_url') return 'web';
    if (
      n === 'workspace_grep' ||
      n === 'codebase_search' ||
      n === 'semantic_search'
    ) {
      return 'search';
    }
    return 'other';
  };
  const kinds = new Set(toolCalls.map((tc) => kind(tc.name)));
  const n = toolCalls.length;
  if (n === 1) {
    const a = toolCalls[0]!.name;
    if (a === 'read_file' || a === 'list_directory') {
      return 'Skimming a folder in the project…';
    }
    if (a === 'workspace_grep' || a === 'codebase_search' || a === 'semantic_search') {
      return 'Searching the codebase…';
    }
    if (a === 'write_file' || a === 'write_files' || a === 'search_replace') {
      return 'Applying a change in the project…';
    }
    if (a === 'run_workspace_command' || a === 'run_star_cli') {
      return 'Running a command in the project…';
    }
    if (a === 'mcp_invoke') return 'Using an integrated OASIS / external tool…';
    if (a === 'web_search') return 'Checking the web…';
    return 'One more project step…';
  }

  const hasRead = kinds.has('read');
  const hasList = kinds.has('list');
  const hasSearch = kinds.has('search');
  if (hasRead && hasList && (hasSearch || n <= 3)) {
    return 'Scanning a few project paths (files and folders) — almost there…';
  }
  if (hasRead && hasList) {
    return 'Reading and listing a few project paths…';
  }
  if (kinds.has('write') || kinds.has('command')) {
    return 'Updating the project — following up in a moment…';
  }
  return 'Working through a few project checks in parallel — hang tight…';
}

export function shouldUsePlanModeFirst(userText: string): boolean {
  const t = userText.trim();
  if (t.length > 4000) return false;
  const createIntent = /\b(create|new|make|build|start|scaffold|launch)\b/i.test(t);
  const oappOrGame =
    /\boapp\b/i.test(t) ||
    /\bstarnet\b.*\b(app|oapp)\b/i.test(t) ||
    /\b(from|using|with)\s+starnet\b/i.test(t) ||
    /\bstarnet\s+components?\b/i.test(t) ||
    /\bnew\s+(world|game)\b/i.test(t) ||
    /\bgame\s+called\b/i.test(t) ||
    /\b(community|social|consumer)\s+app\b/i.test(t) ||
    /\b(build|create|make)\s+(a\s+|an\s+|the\s+)?(community\s+|social\s+)?app\b/i.test(t) ||
    /\bapp\s+(idea|concept|similar|like)\b/i.test(t);
  if (!createIntent || !oappOrGame) return false;
  const detailed =
    /\b(engine|unity|three\.?js|babylon|hyperfy|roblox|genre|quest|npc|multiplayer|template|vite|tailwind|monorepo|screenshot|prototype|chapter|level\s+design|assets?|GDD|design\s+doc)\b/i.test(
      t
    );
  return !detailed;
}

/** Reinforces ONODE ground-truth prompt; kept short so older servers still benefit. */
function groundTruthUserAppendix(): string {
  return (
    `[IDE: Ground-truth rules]\n` +
    `Treat as **fact** what **tools**, \`[Tool results from this assistant turn]\`, or the appended **\`## STARNET catalog (IDE — auto-attached …)\`** table (id + name + type rows) in this request show. ` +
    `Label other ideas **Proposed** or **Assumption**. ` +
    `Do not assert files, imports, or symbols exist without \`read_file\`, \`list_directory\`, or \`workspace_grep\`. ` +
    `Do not claim integration, auth, or a green build without matching tool output.`
  );
}

/** Rich product + STARNET / holon questions deserve a template-first, non-hedged answer. */
function userMessageWantsConcreteStarnetProductPlan(userText: string): boolean {
  const t = userText.toLowerCase();
  if (t.length < 48) return false;
  const domain =
    /\b(holon|holons|oapp|starnet|component|template|catalog)\b/.test(t) ||
    /\b(community|social|geo|geolocation|mission|nft|timelock|location|coordinate|park|outdoor|thursday)\b/.test(
      t
    );
  const intent =
    /\b(identify|which|map|recommend|pick|choose|select|build|design|plan|architecture|description|similar|like)\b/.test(
      t
    );
  return domain && intent;
}

function concreteStarnetProductPlanAppendix(): string {
  return (
    `[IDE: Concrete OAPP / STARNET answer — required for this message]\n` +
    `1. **Holon picks:** Use **only** rows from the appended **\`## STARNET catalog (IDE — auto-attached …)\`** table (exact **name + id + type**). For each chosen row, write one decisive sentence: **what user-visible behavior it owns** in *this* app (banned vague phrases for those rows: "could", "might", "useful for", "consider", "may help").\n` +
    `2. **Template / shell:** State the **default starter** you will customize: **Expo** mobile app → follow \`OASIS-IDE/docs/recipes/community-social-app.md\` when geo + social + missions; **web-only** → \`OASIS-IDE/docs/recipes/minimal-vite-browser-oapp.md\`. Name **3 concrete screens** (title + primary user action each).\n` +
    `3. **Structure the reply** with headings: **A. MVP one-liner** · **B. Holon map** (markdown table: Job-to-be-done / feature | Holon name | Catalog id | Role in app) · **C. Custom / gap work** (timelocks, push on off-days, park polygons, moderation — each bullet explicit) · **D. Build order** (numbered 5–8 steps; last step says what **Execute** mode will do next).\n` +
    `4. **Do not** invent holon names that are **not** in the catalog table unless clearly tagged **Proposed (not in catalog — custom code)** with why.\n`
  );
}

function planningModeUserAppendix(gameDevMode: boolean, mentionsStarnet: boolean): string {
  const quick = gameDevMode
    ? 'If Game Dev mode is on, mention the **Quick actions** strip (New World, New Quest, NPCs, Lore, etc.) where it saves time.'
    : '';
  const starnetUx = mentionsStarnet
    ? `\n**STARNET is inside this IDE:** Point the user to **Activity bar → STARNET** to see lists; **do not** send them to an external STARNET “portal” or website to browse holons/OAPPs. For live ids after browsing, use read-only \`mcp_invoke\` (\`star_list_holons\`, \`star_list_oapps\`, \`star_get_holon\`) in **Agent mode** — never claim STAR connection or list failures without pasting actual tool output.\n` +
      `**Catalog list tools return compact tables** in this IDE (bounded rows). After the first list, use \`star_get_holon\` / \`star_get_oapp\` for full JSON on specific ids — do not repeat full \`star_list_*\` calls unless the user changed scope.\n`
    : '';
  return (
    `[IDE: Plan-first for this user message]\n` +
    `This looks like a **high-level** create-OAPP / new-game request with little product context.\n` +
    `**Do not** call \`write_file\`, \`write_files\`, \`run_workspace_command\`, or \`run_star_cli\` in **this** turn.\n` +
    `**STARNET inventory:** If the context pack already includes **\`## STARNET catalog (IDE — auto-attached …)\`** with holon/OAPP **rows**, use that as the catalog — **do not** call \`star_list_holons\` / \`star_list_oapps\` just to rediscover the same list (wastes context and may disagree with JWT). Use \`oasis_health_check\` if useful, then \`star_get_holon\` / \`star_get_oapp\` on **ids from that table** when you need full fields. Only use list tools if the catalog section is missing/empty or the user asks for a live refresh. Do **not** call create/publish/mint/save MCP tools until the user confirms (Execute mode).\n` +
    `**Do** use **read-only** tools first (\`list_directory\`, \`read_file\`, \`workspace_grep\`) to ground the answer in this repo (recipes, docs), then reply with a **numbered plan**, explicit **defaults**, and **at most one** blocking question only if you truly cannot proceed. ` +
    `Do not describe **verified progress** or file contents you did not read; distinguish **Verified (tools)** from **Plan**.\n` +
    `End with **clickable reply chips**: append **only** this block at the **very end** (no text after it). The **first** label should be **Proceed with this plan** when you have a sensible default; add 2–4 concrete alternatives (scope, engine, template), not vague "what next?" prompts.\n` +
    `<oasis_plan_replies>\n` +
    `["Proceed with this plan","Narrow scope to MVP","Swap default stack","Not sure — pick best default"]\n` +
    `</oasis_plan_replies>\n` +
    `${quick}\n` +
    `If the user message is actually a long detailed spec (many requirements, paths, tech choices), **ignore** this block and proceed with execution as usual.` +
    starnetUx
  );
}

/** When ONODE already applies plan / plan_gather / plan_present system prompts, skip client duplicate instructions. */
function skipClientPlanAppendix(executionMode?: string): boolean {
  const m = (executionMode ?? 'execute').toLowerCase();
  return m === 'plan' || m === 'plan_gather' || m === 'plan_present';
}

/**
 * When the Explorer workspace root does not match paths in the question, the model often
 * mis-reads tools and claims files are "missing". Nudge with explicit workspace metadata.
 */
function augmentIdeAgentUserMessage(
  userText: string,
  workspacePath: string,
  gameDevMode?: boolean,
  /** When true, skip the sparse [IDE: Plan-first] inject (ONODE plan* modes or two-step gather). */
  skipSparsePlanInject?: boolean,
  /** Currently open file in the editor (Monaco). Helps the model target the right file. */
  activeFilePath?: string
): string {
  const ws = workspacePath.replace(/[/\\]+$/, '');
  const t = userText.trim();
  const asksCreUnderOasisClean =
    /\bOASIS_CLEAN[/\\]CRE\b/i.test(t) ||
    (/\bOASIS_CLEAN\b/i.test(t) && /\b[/\\]CRE\b/i.test(t));

  const wsEndsWithOasisClean = /[/\\]OASIS_CLEAN$/i.test(ws);
  const wsEndsWithCre = /[/\\]CRE$/i.test(ws);

  const parts = [t];

  if (activeFilePath) {
    parts.push(`[IDE] Active editor file: ${activeFilePath}`);
  }

  parts.push(groundTruthUserAppendix());

  if (wsEndsWithCre && /\bCRE\b/i.test(t)) {
    parts.push(
      `[IDE] Workspace root is the **CRE** folder (${workspacePath}). Use tool paths without a leading **CRE/** (for example \`Docs/OASIS_CRE_PLAN.md\`, \`quest-designer/README.md\`).`
    );
  } else if (asksCreUnderOasisClean && !wsEndsWithOasisClean) {
    parts.push(
      `[IDE] Explorer workspace root: ${workspacePath}\n` +
        `You referenced **OASIS_CLEAN/CRE**, but tools only read under the folder above. Ask the user to use **Open folder** on the **OASIS_CLEAN** repository directory, then retry. ` +
        `Do not claim documentation is missing unless read_file returned an error for a path under this workspace.`
    );
  } else if (wsEndsWithOasisClean && /\bCRE\b/i.test(t)) {
    parts.push(
      `[IDE] Repo root is open. After \`list_directory\` on \`CRE\`, read \`CRE/Docs/OASIS_CRE_PLAN.md\` (plans live under **Docs/**) or run \`workspace_grep\` with path \`CRE\`.`
    );
  }

  const planFirst = shouldUsePlanModeFirst(userText) && !skipSparsePlanInject;
  if (planFirst) {
    parts.push(planningModeUserAppendix(Boolean(gameDevMode), /\bstarnet\b/i.test(t)));
  } else if (/\bstarnet\b/i.test(t)) {
    parts.push(
      `[IDE: STARNET UX]\n` +
        `Browse holons and OAPPs in **Activity bar → STARNET** (built into this IDE). Do not send the user to an external STARNET “portal” or website for catalog exploration.\n` +
        `\`star_list_holons\` / \`star_list_oapps\` tool output is a **compact table** in this IDE — use \`star_get_holon\` / \`star_get_oapp\` for full JSON on chosen ids.`
    );
  }

  if (userMessageWantsConcreteStarnetProductPlan(t)) {
    parts.push(concreteStarnetProductPlanAppendix());
  }

  return parts.join('\n\n');
}

/** One-line description for the activity log (paths and argv when present). */
export function formatToolProgressLine(name: string, argumentsJson: string): string {
  try {
    const args = JSON.parse(argumentsJson || '{}') as Record<string, unknown>;
    if (name === 'read_file' && typeof args.path === 'string') return `Reading ${args.path}`;
    if (name === 'list_directory' && typeof args.path === 'string') return `Exploring ${args.path}`;
    if (name === 'workspace_grep') {
      const pat =
        typeof args.pattern === 'string' ? truncate(args.pattern.replace(/\s+/g, ' ').trim(), 72) : '';
      const p = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : 'workspace';
      return pat ? `Searching for "${pat}" in ${p}` : 'Searching workspace';
    }
    if (name === 'write_file' && typeof args.path === 'string') return `Writing ${args.path}`;
    if (name === 'write_files') {
      const files = Array.isArray(args.files) ? args.files : [];
      return files.length > 0
        ? `Writing ${files.length} file${files.length === 1 ? '' : 's'}`
        : 'Writing files';
    }
    if (name === 'run_workspace_command' && Array.isArray(args.argv)) {
      return `Running ${(args.argv as unknown[]).map(String).join(' ')}`;
    }
    if (name === 'run_star_cli' && Array.isArray(args.argv)) {
      const starArgs = (args.argv as unknown[]).map(String).slice(1);
      return starArgs.length > 0 ? `STAR ${starArgs.join(' ')}` : 'Running STAR CLI';
    }
    if (name === 'mcp_invoke' && typeof args.tool === 'string') {
      return args.tool;
    }
    if (name === 'web_search' && typeof args.query === 'string') {
      return `Web search: ${truncate(args.query.replace(/\s+/g, ' ').trim(), 72)}`;
    }
    if (name === 'fetch_url' && typeof args.url === 'string') {
      return `Fetch ${truncate(args.url, 96)}`;
    }
    if (name === 'codebase_search' && typeof args.query === 'string') {
      return `Code search: ${truncate(args.query.replace(/\s+/g, ' ').trim(), 72)}`;
    }
    if (name === 'open_browser_url' && typeof args.url === 'string') {
      return `Open browser ${truncate(args.url, 80)}`;
    }
    if (name === 'search_replace' && typeof args.path === 'string') {
      return `Edit ${args.path}`;
    }
    if (name === 'semantic_search' && typeof args.query === 'string') {
      return `Semantic search: ${truncate(args.query.replace(/\s+/g, ' ').trim(), 72)}`;
    }
  } catch {
    /* ignore */
  }
  const raw = truncate(argumentsJson || '', 80);
  return raw ? `${name} (${raw})` : name;
}

/** Format optional main-process stats for the live activity feed (Cursor-style). */
export function formatActivityMetaLine(meta: AgentActivityMeta): string {
  if (meta.kind === 'file_write') {
    const base = meta.path.split(/[/\\]/).pop() ?? meta.path;
    if (meta.isNewFile) return `${base}  +${meta.addedLines} lines (new file)`;
    return `${base}  +${meta.addedLines} −${meta.removedLines}`;
  }
  if (meta.kind === 'file_writes') {
    const parts = meta.files.slice(0, 4).map((f) => {
      const base = f.path.split(/[/\\]/).pop() ?? f.path;
      if (f.isNewFile) return `${base} +${f.addedLines} (new)`;
      return `${base} +${f.addedLines} −${f.removedLines}`;
    });
    const more =
      meta.files.length > 4 ? ` … +${meta.files.length - 4} more file(s)` : '';
    return `Wrote ${meta.files.length} file(s): ${parts.join('; ')}${more}`;
  }
  if (meta.kind === 'search_replace') {
    const base = meta.path.split(/[/\\]/).pop() ?? meta.path;
    return `${base}  edited (${meta.replacementCount} replacement(s))`;
  }
  return '';
}

/** One-line summary after a tool finishes (for the live activity feed). */
export function formatToolResultLine(name: string, ok: boolean, detail: string): string {
  const sym = ok ? 'Done:' : 'Failed:';
  if (ok && name === 'read_file' && detail.length > 600) {
    return `${sym} ${name} (${detail.length} characters)`;
  }
  if (ok && name === 'workspace_grep') {
    const lines = detail.split('\n').filter((l) => l.trim().length > 0).length;
    return `${sym} ${name} (${lines} lines, ${detail.length} chars)`;
  }
  if (ok && (name === 'write_file' || name === 'write_files')) {
    const one = detail.replace(/\s+/g, ' ').trim();
    return one.length > 140 ? `${sym} ${name} (${one.slice(0, 140)}…)` : `${sym} ${name} (${one})`;
  }
  const oneLine = detail.replace(/\s+/g, ' ').trim();
  const max = 220;
  const snip = oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
  return snip ? `${sym} ${name} — ${snip}` : `${sym} ${name}`;
}

/** OASIS_IDE-style inner-monologue before a tool runs. Terse, technical. */
export function narrateBeforeTool(name: string, argumentsJson: string): string {
  try {
    const args = JSON.parse(argumentsJson || '{}') as Record<string, unknown>;
    switch (name) {
      case 'read_file': {
        const p = typeof args.path === 'string' ? args.path : '';
        return p ? `Reading ${p}…` : 'Reading file…';
      }
      case 'list_directory': {
        const p = typeof args.path === 'string' && args.path.trim() ? args.path : '.';
        return `Listing ${p}…`;
      }
      case 'workspace_grep': {
        const pat = typeof args.pattern === 'string' ? args.pattern.replace(/\s+/g, ' ').trim() : '';
        const scope = typeof args.path === 'string' && args.path.trim() ? args.path : 'workspace';
        return pat ? `Searching ${scope} for "${truncate(pat, 72)}"…` : `Searching ${scope}…`;
      }
      case 'write_file': {
        const p = typeof args.path === 'string' ? args.path : '';
        return p ? `Writing ${p}…` : 'Writing file…';
      }
      case 'write_files': {
        const files = Array.isArray(args.files) ? args.files : [];
        const names = (files as Array<Record<string, unknown>>)
          .slice(0, 3)
          .map((f) => (f.path as string | undefined)?.split('/').pop() ?? '')
          .filter(Boolean)
          .join(', ');
        const label = files.length > 3 ? `${names} +${files.length - 3} more` : names;
        return label ? `Writing ${files.length} files (${label})…` : `Writing ${files.length} files…`;
      }
      case 'run_workspace_command': {
        const argv = Array.isArray(args.argv) ? args.argv.map(String) : [];
        return argv.length > 0 ? `$ ${truncate(argv.slice(0, 6).join(' '), 120)}` : 'Running workspace command…';
      }
      case 'run_star_cli': {
        const argv = Array.isArray(args.argv) ? args.argv.map(String) : [];
        const sub = argv.slice(1, 6).join(' ');
        return sub ? `star ${truncate(sub, 110)}…` : 'Running star CLI…';
      }
      case 'mcp_invoke': {
        const tool = typeof args.tool === 'string' ? args.tool : 'unknown';
        return `→ ${tool}()`;
      }
      case 'web_search': {
        const q = typeof args.query === 'string' ? args.query.replace(/\s+/g, ' ').trim() : '';
        return q ? `Searching the web for "${truncate(q, 72)}"…` : 'Web search…';
      }
      case 'fetch_url': {
        const u = typeof args.url === 'string' ? args.url.trim() : '';
        return u ? `Fetching ${truncate(u, 100)}…` : 'Fetching URL…';
      }
      case 'codebase_search': {
        const q = typeof args.query === 'string' ? args.query.replace(/\s+/g, ' ').trim() : '';
        return q ? `Searching repo for "${truncate(q, 72)}"…` : 'Searching repository…';
      }
      case 'open_browser_url': {
        const u = typeof args.url === 'string' ? args.url.trim() : '';
        return u ? `Opening ${truncate(u, 100)}…` : 'Opening browser…';
      }
      case 'search_replace': {
        const p = typeof args.path === 'string' ? args.path : '';
        return p ? `Replacing in ${p}…` : 'search_replace…';
      }
      case 'semantic_search': {
        const q = typeof args.query === 'string' ? args.query.replace(/\s+/g, ' ').trim() : '';
        return q ? `Semantic search: "${truncate(q, 72)}"…` : 'Semantic search…';
      }
      default:
        break;
    }
  } catch { /* fall through */ }
  return `${name}…`;
}

/** For read-only tools, skip “before” so the feed is one line per action (less noise). */
function shouldEmitBeforeToolNarration(name: string): boolean {
  if (
    name === 'read_file' ||
    name === 'list_directory' ||
    name === 'workspace_grep' ||
    name === 'codebase_search' ||
    name === 'semantic_search' ||
    name === 'fetch_url' ||
    name === 'mcp_invoke'
  ) {
    return false;
  }
  return true;
}

/** OASIS_IDE-style result annotation after a tool finishes. Includes a meaningful snippet. */
export function narrateAfterTool(
  name: string,
  ok: boolean,
  detail: string,
  activityMeta?: AgentActivityMeta | null
): string {
  if (ok && name === 'list_directory') {
    const n = detail.split('\n').filter((l) => l.trim().length > 0).length;
    if (n === 0) return '✓ That folder is empty (or we could not list it).';
    return `✓ Listed ${n} file${n === 1 ? '' : 's'} and folders.`;
  }
  if (ok && activityMeta) {
    const stats = formatActivityMetaLine(activityMeta);
    if (stats) return `✓ ${stats}`;
  }
  if (ok && (name === 'write_file' || name === 'write_files') && /discarded/i.test(detail)) {
    return `← discarded (no files written)`;
  }
  if (!ok) {
    const msg = truncate(detail.replace(/\s+/g, ' ').trim(), 160);
    return msg ? `✗ ${msg}` : '✗ Stopped on this step';
  }
  if (name === 'read_file') {
    const firstLine = detail.split('\n').find((l) => l.trim().length > 8) ?? '';
    const snip = firstLine
      ? truncate(
          firstLine
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^[#*>\s-]+/g, '')
            .replace(/\*\*/g, '')
            .trim(),
          88
        )
      : '';
    if (snip) {
      return `✓ File read — preview: “${snip}”${detail.length > 4000 ? ' …' : ''}`;
    }
    return `✓ Read file (${Math.min(detail.length, 999_999)} characters in memory)`;
  }
  if (name === 'workspace_grep') {
    const lines = detail.split('\n').filter((l) => l.trim().length > 0);
    return lines.length === 0 ? '✓ No matches' : `✓ ${lines.length} match${lines.length === 1 ? '' : 'es'}`;
  }
  if (name === 'web_search') {
    const head = detail.split('\n').find((l) => l.trim().length > 0) ?? '';
    return head ? `✓ ${truncate(head.trim(), 100)}` : '✓ Done';
  }
  if (name === 'fetch_url') {
    return `✓ Fetched page (${detail.length} characters)`;
  }
  if (name === 'codebase_search') {
    const lines = detail.split('\n').filter((l) => l.trim().length > 0);
    return lines.length === 0 ? '✓ No hits' : `✓ ${lines.length} reference${lines.length === 1 ? '' : 's'}`;
  }
  if (name === 'open_browser_url') {
    return '✓ Opened in browser';
  }
  if (name === 'search_replace') {
    return `✓ ${truncate(detail.replace(/\s+/g, ' ').trim(), 100)}`;
  }
  if (name === 'semantic_search') {
    return `✓ Index results received (${detail.length} characters)`;
  }
  if (name === 'write_file' || name === 'write_files') {
    return '✓ File write finished';
  }
  if (name === 'run_workspace_command' || name === 'run_star_cli') {
    const codeMatch = detail.match(/exit_code:\s*(\d+)/);
    const code = codeMatch ? `exit ${codeMatch[1]}` : '';
    const lastLine = detail.split('\n').filter((l) => l.trim().length > 5).pop() ?? '';
    const snip = truncate(lastLine.trim(), 100);
    return code && snip ? `✓ ${snip} · ${code}` : code ? `✓ ${code}` : snip ? `✓ ${snip}` : '✓ Command finished';
  }
  if (name === 'mcp_invoke') {
    const compact = detail.replace(/\s+/g, ' ').trim();
    if (compact.length > 280) return '✓ Tool returned (output ready for the final answer)';
    return compact ? `✓ ${truncate(compact, 180)}` : '✓ Ok';
  }
  const snip = truncate(detail.replace(/\s+/g, ' ').trim(), 150);
  return snip ? `✓ ${snip}` : '✓ Done';
}


/** Map a tool name to its visual category for the activity feed. */
function toolKindForName(name: string): ToolKind {
  if (name === 'read_file' || name === 'list_directory' || name === 'fetch_url') return 'read';
  if (name === 'write_file' || name === 'write_files' || name === 'search_replace') return 'write';
  if (name === 'workspace_grep' || name === 'codebase_search' || name === 'semantic_search') return 'search';
  if (name === 'run_workspace_command' || name === 'run_star_cli') return 'command';
  if (name === 'mcp_invoke') return 'mcp';
  if (name === 'web_search' || name === 'open_browser_url') return 'web';
  return 'other';
}

export interface AgentTurnApiResult {
  ok: true;
  kind: 'message' | 'tool_calls';
  content?: string;
  toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
  finishReason?: string;
}

export interface AgentTurnApiError {
  ok: false;
  error: string;
}

export type AgentTurnApiResponse = AgentTurnApiResult | AgentTurnApiError;

export interface IdeAgentLoopDeps {
  /** runId scopes ONODE fetch abort so multiple sessions can call agent/turn concurrently. */
  agentTurn: (
    body: {
      model: string;
      messages: AgentChatMessage[];
      workspaceRoot?: string | null;
      referencedPaths?: string[];
      fromAvatarId?: string;
      contextPack?: string | null;
      executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
    },
    runId: string
  ) => Promise<AgentTurnApiResponse>;
  agentExecuteTool: (payload: {
    toolCallId: string;
    name: string;
    argumentsJson: string;
    executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
  }) => Promise<
    | {
        ok: true;
        result: {
          toolCallId: string;
          content: string;
          isError?: boolean;
          activityMeta?: AgentActivityMeta;
        };
      }
    | { ok: false; error: string }
  >;
  /** When true, the loop stops before the next ONODE turn or between tool results (user pressed Stop). */
  isCancelled?: () => boolean;
}

/**
 * Multi-step agent loop: model may request tools; IDE executes via IPC until final assistant message.
 */
export async function runIdeAgentLoop(
  deps: IdeAgentLoopDeps,
  options: {
    userText: string;
    model: string;
    workspacePath: string;
    referencedPaths: string[];
    fromAvatarId?: string;
    /** OASIS/STAR reference text appended on every agent turn (bounded). */
    contextPack?: string | null;
    /** Prior user/assistant turns from the Composer thread (same tab). */
    priorMessages?: AgentChatMessage[];
    maxRounds?: number;
    /** Structured live progress rows (text lines + file edit cards). */
    onActivityFeedItem?: (item: AgentActivityFeedItem) => void;
    /** Same id for every turn in this loop; passed to IPC for scoped cancel. */
    runId: string;
    /** Game Dev context pack active; enables plan-first hint to reference Quick actions. */
    gameDevMode?: boolean;
    /** plan | plan_gather | plan_present = read-only; execute = full tools. */
    executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
    /** Currently open file in Monaco editor — injected as [IDE] context line. */
    activeFilePath?: string;
    /** Pasted images (data URLs) for the current send; OpenAI/xAI vision via ONODE. */
    userImageDataUrls?: string[];
  }
): Promise<{
  finalText: string;
  toolCallsLog: Array<{ tool: string; ok: boolean }>;
  /** Same items as emitted to onActivityFeedItem, in order. */
  activityLog: AgentActivityFeedItem[];
  /** Raw tool result bodies from this send (for holon ids, mint JSON, etc.). */
  recordedToolOutputs?: Array<{ tool: string; content: string }>;
  error?: string;
  cancelled?: boolean;
}> {
  const maxRounds = options.maxRounds ?? 25;
  const prior = (options.priorMessages ?? []).filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );
  const chain: AgentChatMessage[] = [
    ...prior,
    buildInitialUserAgentMessage({
      userText: options.userText,
      workspacePath: options.workspacePath,
      gameDevMode: options.gameDevMode,
      executionMode: options.executionMode,
      activeFilePath: options.activeFilePath,
      userImageDataUrls: options.userImageDataUrls
    })
  ];
  const toolCallsLog: Array<{ tool: string; ok: boolean }> = [];
  const recordedToolOutputsForUi: Array<{ tool: string; content: string }> = [];
  const activityLog: AgentActivityFeedItem[] = [];
  const pushFeed = (item: AgentActivityFeedItem) => {
    activityLog.push(item);
    options.onActivityFeedItem?.(item);
  };
  const emitText = (line: string, toolKind?: ToolKind) => {
    pushFeed(toolKind ? { kind: 'text', text: line, toolKind } : { kind: 'text', text: line });
  };

  const emptyOutcome = (extra: {
    finalText?: string;
    error?: string;
    cancelled?: boolean;
  }) => ({
    finalText: extra.finalText ?? '',
    toolCallsLog,
    activityLog,
    recordedToolOutputs:
      recordedToolOutputsForUi.length > 0 ? [...recordedToolOutputsForUi] : undefined,
    error: extra.error,
    cancelled: extra.cancelled
  });

  for (let round = 0; round < maxRounds; round++) {
    if (deps.isCancelled?.()) {
      return emptyOutcome({ error: 'Stopped.', cancelled: true });
    }

    if (round === 0) {
      const kick = starnetWorkflowKickoffLine(options.userText);
      if (kick) emitText(kick);
    } else if (round === 6) {
      emitText('This workspace is big — still gathering context, thanks for your patience…');
    }

    const res = await deps.agentTurn(
      {
        model: options.model,
        messages: chain,
        workspaceRoot: options.workspacePath,
        referencedPaths: options.referencedPaths,
        fromAvatarId: options.fromAvatarId,
        contextPack: options.contextPack ?? undefined,
        executionMode: options.executionMode ?? 'execute'
      },
      options.runId
    );

    if (!res.ok) {
      const cancelled = res.error === 'Stopped.' || res.error === 'Stopped';
      return emptyOutcome({ error: res.error, cancelled });
    }

    if (deps.isCancelled?.()) {
      return emptyOutcome({ error: 'Stopped.', cancelled: true });
    }

    if (res.kind === 'message') {
      emitText('Composing the reply for you…');
      const text = res.content ?? '';
      if (text.trim().length > 40) {
        emitText(`(Draft) ${truncate(text, 200)}…`);
      } else if (text.trim().length > 0) {
        emitText(`(Draft) ${truncate(text.trim(), 120)}`);
      }
      return {
        finalText: text,
        toolCallsLog,
        activityLog,
        recordedToolOutputs:
          recordedToolOutputsForUi.length > 0 ? [...recordedToolOutputsForUi] : undefined
      };
    }

    if (res.kind === 'tool_calls' && res.toolCalls && res.toolCalls.length > 0) {
      const assistantToolCalls: AgentToolCall[] = res.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        argumentsJson: tc.argumentsJson ?? '{}'
      }));

      emitText(toolCallBatchIntro(res.toolCalls));

      const sideText = (res.content ?? '').trim();
      if (sideText.length > 50) {
        emitText(`(Planning note) ${truncate(sideText, 140)}`);
      }

      chain.push({
        role: 'assistant',
        content: res.content ?? '',
        toolCalls: assistantToolCalls
      });

      for (const tc of res.toolCalls) {
        if (deps.isCancelled?.()) {
          return emptyOutcome({ error: 'Stopped.', cancelled: true });
        }
        const argsJson = tc.argumentsJson ?? '{}';
        if (shouldEmitBeforeToolNarration(tc.name)) {
          emitText(narrateBeforeTool(tc.name, argsJson), toolKindForName(tc.name));
        }
        const ex = await deps.agentExecuteTool({
          toolCallId: tc.id,
          name: tc.name,
          argumentsJson: argsJson,
          executionMode: options.executionMode ?? 'execute'
        });
        if (!ex.ok) {
          emitText(narrateAfterTool(tc.name, false, ex.error), toolKindForName(tc.name));
          toolCallsLog.push({ tool: tc.name, ok: false });
          recordedToolOutputsForUi.push({ tool: tc.name, content: `Error: ${ex.error}` });
          chain.push({
            role: 'tool',
            content: `Error: ${ex.error}`,
            toolCallId: tc.id
          });
          continue;
        }
        const toolSucceeded = !ex.result.isError;
        const meta = ex.result.activityMeta;
        if (
          toolSucceeded &&
          meta &&
          (meta.kind === 'file_write' || meta.kind === 'file_writes' || meta.kind === 'search_replace')
        ) {
          emitActivityMetaAsFeed(meta, pushFeed);
        } else {
          emitText(
            narrateAfterTool(
              tc.name,
              toolSucceeded,
              ex.result.content,
              toolSucceeded ? meta : undefined
            ),
            toolKindForName(tc.name)
          );
        }
        toolCallsLog.push({ tool: tc.name, ok: toolSucceeded });
        const toolBody = ex.result.content;
        recordedToolOutputsForUi.push({ tool: tc.name, content: toolBody });
        chain.push({
          role: 'tool',
          content: toolBody,
          toolCallId: tc.id
        });
      }
      continue;
    }

    return {
      finalText: res.content ?? 'No response.',
      toolCallsLog,
      activityLog,
      recordedToolOutputs:
        recordedToolOutputsForUi.length > 0 ? [...recordedToolOutputsForUi] : undefined
    };
  }

  emitText(
    `Stopped after ${maxRounds} model steps (safety limit). Try a smaller ask, or break the work into parts.`
  );
  return {
    finalText: 'Agent stopped after the maximum number of tool rounds. Ask a narrower question.',
    toolCallsLog,
    activityLog,
    recordedToolOutputs:
      recordedToolOutputsForUi.length > 0 ? [...recordedToolOutputsForUi] : undefined,
    error: undefined
  };
}

export type IdeAgentLoopOutcome = Awaited<ReturnType<typeof runIdeAgentLoop>>;

/**
 * ONODE-backed two-step plan protocol: plan_gather (repo evidence) then plan_present (user-facing plan + chips).
 * Used for sparse "create OAPP / new game" asks in Plan mode when the user enables "Deep plan".
 */
export async function runIdeAgentGatherPresentSequence(
  deps: IdeAgentLoopDeps,
  options: Parameters<typeof runIdeAgentLoop>[1] & { maxGatherRounds?: number }
): Promise<IdeAgentLoopOutcome> {
  const { maxGatherRounds, ...rest } = options;
  const maxG = maxGatherRounds ?? 14;

  rest.onActivityFeedItem?.({
    kind: 'text',
    text: 'Deep plan — first pass: scanning the repo in read-only mode to anchor the plan in real files…'
  });

  const gather = await runIdeAgentLoop(deps, {
    ...rest,
    maxRounds: maxG,
    executionMode: 'plan_gather'
  });
  if (gather.error || gather.cancelled) return gather;

  let digestBody = extractGatherDigest(gather.finalText);
  if (!digestBody) digestBody = gather.finalText.trim();

  const presentUser =
    `${rest.userText}\n\n[IDE: Gathered workspace notes — use only as grounding; do not dump raw tool logs]\n\n${digestBody}`;

  rest.onActivityFeedItem?.({
    kind: 'text',
    text: 'Deep plan — second pass: turning what we found into a clear, actionable plan…'
  });

  const present = await runIdeAgentLoop(deps, {
    ...rest,
    userText: presentUser,
    executionMode: 'plan_present',
    userImageDataUrls: undefined
  });

  const mergedRecorded = [
    ...(gather.recordedToolOutputs ?? []),
    ...(present.recordedToolOutputs ?? [])
  ];

  return {
    finalText: present.finalText,
    toolCallsLog: [...gather.toolCallsLog, ...present.toolCallsLog],
    activityLog: [
      ...gather.activityLog,
      {
        kind: 'text',
        text: 'Shifting to the final plan you’ll read in the next messages…'
      },
      ...present.activityLog
    ],
    recordedToolOutputs: mergedRecorded.length > 0 ? mergedRecorded : undefined,
    error: present.error,
    cancelled: present.cancelled
  };
}
