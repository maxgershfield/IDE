import type { AgentChatMessage, AgentToolCall } from '../../shared/agentTurnTypes';
import { extractGatherDigest } from '../utils/planReplyParser';

/** Composer thread bubble (subset of fields) for rebuilding agent context. */
export type ThreadBubbleForAgent = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; result: unknown }>;
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
      out.push({ role: 'user', content: clampChars(m.content ?? '', PRIOR_USER_MAX) });
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

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Sparse "create OAPP / game" prompts: plan and gather context first (Cursor-style plan mode),
 * instead of immediately running STAR, npm, or write_*.
 */
export function shouldUsePlanModeFirst(userText: string): boolean {
  const t = userText.trim();
  if (t.length > 4000) return false;
  const createIntent = /\b(create|new|make|build|start|scaffold|launch)\b/i.test(t);
  const oappOrGame =
    /\boapp\b/i.test(t) ||
    /\bstarnet\b.*\b(app|oapp)\b/i.test(t) ||
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

function planningModeUserAppendix(gameDevMode: boolean): string {
  const quick = gameDevMode
    ? 'If Game Dev mode is on, mention the **Quick actions** strip (New World, New Quest, NPCs, Lore, etc.) where it saves time.'
    : '';
  return (
    `[IDE: Plan-first for this user message]\n` +
    `This looks like a **high-level** create-OAPP / new-game request with little product context.\n` +
    `**Do not** call \`write_file\`, \`write_files\`, \`run_workspace_command\`, or \`run_star_cli\` in **this** turn. Avoid \`mcp_invoke\` for creating OAPPs, quests, NPCs, mints, or publish flows until the user confirms the plan (read-only checks such as \`oasis_health_check\` are fine).\n` +
    `**Do** use **read-only** tools first (\`list_directory\`, \`read_file\`, \`workspace_grep\`) to ground the answer in this repo (recipes, docs), then reply with a **numbered plan**, explicit **defaults**, and **at most one** blocking question only if you truly cannot proceed.\n` +
    `End with **clickable reply chips**: append **only** this block at the **very end** (no text after it). The **first** label should be **Proceed with this plan** when you have a sensible default; add 2–4 concrete alternatives (scope, engine, template), not vague "what next?" prompts.\n` +
    `<oasis_plan_replies>\n` +
    `["Proceed with this plan","Narrow scope to MVP","Swap default stack","Not sure — pick best default"]\n` +
    `</oasis_plan_replies>\n` +
    `${quick}\n` +
    `If the user message is actually a long detailed spec (many requirements, paths, tech choices), **ignore** this block and proceed with execution as usual.`
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

  if (shouldUsePlanModeFirst(userText) && !skipSparsePlanInject) {
    parts.push(planningModeUserAppendix(Boolean(gameDevMode)));
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
      const inner =
        args.arguments != null ? truncate(JSON.stringify(args.arguments), 80) : '';
      return inner ? `${args.tool} (${inner})` : args.tool;
    }
  } catch {
    /* ignore */
  }
  const raw = truncate(argumentsJson || '', 80);
  return raw ? `${name} (${raw})` : name;
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

/** Cursor-style inner-monologue before a tool runs. Terse, technical. */
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
        const inner = args.arguments != null
          ? truncate(JSON.stringify(args.arguments).replace(/[{}"]/g, '').slice(0, 80), 80)
          : '';
        return inner ? `→ ${tool}(${inner})` : `→ ${tool}()`;
      }
      default:
        break;
    }
  } catch { /* fall through */ }
  return `${name}…`;
}

/** Cursor-style result annotation after a tool finishes. Includes a meaningful snippet. */
export function narrateAfterTool(name: string, ok: boolean, detail: string): string {
  if (ok && (name === 'write_file' || name === 'write_files') && /discarded/i.test(detail)) {
    return `← discarded (no files written)`;
  }
  if (!ok) {
    const msg = truncate(detail.replace(/\s+/g, ' ').trim(), 160);
    return msg ? `← error: ${msg}` : `← failed`;
  }
  if (name === 'read_file') {
    const firstLine = detail.split('\n').find((l) => l.trim().length > 20) ?? '';
    const snip = firstLine ? truncate(firstLine.trim(), 110) : `${detail.length} chars`;
    return `← ${snip}`;
  }
  if (name === 'workspace_grep') {
    const lines = detail.split('\n').filter((l) => l.trim().length > 0);
    return lines.length === 0 ? '← no matches' : `← ${lines.length} match${lines.length === 1 ? '' : 'es'}`;
  }
  if (name === 'write_file' || name === 'write_files') {
    return `← written`;
  }
  if (name === 'run_workspace_command' || name === 'run_star_cli') {
    const codeMatch = detail.match(/exit_code:\s*(\d+)/);
    const code = codeMatch ? `exit ${codeMatch[1]}` : '';
    const lastLine = detail.split('\n').filter((l) => l.trim().length > 5).pop() ?? '';
    const snip = truncate(lastLine.trim(), 120);
    return code && snip ? `← ${snip} (${code})` : code ? `← ${code}` : snip ? `← ${snip}` : '← done';
  }
  if (name === 'mcp_invoke') {
    const compact = detail.replace(/\s+/g, ' ').trim();
    if (compact.length > 300) return `← ${compact.length} chars`;
    return compact ? `← ${truncate(compact, 220)}` : '← ok';
  }
  const snip = truncate(detail.replace(/\s+/g, ' ').trim(), 180);
  return snip ? `← ${snip}` : '← done';
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
  }) => Promise<
    | { ok: true; result: { toolCallId: string; content: string; isError?: boolean } }
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
    /** Each significant step (Cursor-style activity list). */
    onActivityLine?: (line: string) => void;
    /** Same id for every turn in this loop; passed to IPC for scoped cancel. */
    runId: string;
    /** Game Dev context pack active; enables plan-first hint to reference Quick actions. */
    gameDevMode?: boolean;
    /** plan | plan_gather | plan_present = read-only; execute = full tools. */
    executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
    /** Currently open file in Monaco editor — injected as [IDE] context line. */
    activeFilePath?: string;
  }
): Promise<{
  finalText: string;
  toolCallsLog: Array<{ tool: string; ok: boolean }>;
  /** Same lines as emitted to onActivityLine, in order. */
  activityLog: string[];
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
    {
      role: 'user',
      content: augmentIdeAgentUserMessage(
        options.userText,
        options.workspacePath,
        options.gameDevMode,
        skipClientPlanAppendix(options.executionMode),
        options.activeFilePath
      )
    }
  ];
  const toolCallsLog: Array<{ tool: string; ok: boolean }> = [];
  const recordedToolOutputsForUi: Array<{ tool: string; content: string }> = [];
  const activityLog: string[] = [];
  const emit = (line: string) => {
    activityLog.push(line);
    options.onActivityLine?.(line);
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

    emit(
      `Thinking… (step ${round + 1}/${maxRounds}, ${chain.length} messages in context)`
    );

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
      emit('Model is done with tool calls — writing final response.');
      const text = res.content ?? '';
      if (text.trim().length > 40) {
        emit(`→ ${truncate(text, 200)}`);
      } else if (text.trim().length > 0) {
        emit(`→ ${truncate(text.trim(), 120)}`);
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

      const names = res.toolCalls.map((tc) => tc.name).join(', ');
      emit(
        res.toolCalls.length === 1
          ? `The model wants to run one action next (${names}). Each step appears below as it runs.`
          : `The model wants to run ${res.toolCalls.length} actions in order: ${names}. They run one after another so you can follow along.`
      );

      const sideText = (res.content ?? '').trim();
      if (sideText.length > 40) {
        emit(`Short note from the model before those actions: ${truncate(sideText, 180)}`);
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
        emit(narrateBeforeTool(tc.name, argsJson));
        const ex = await deps.agentExecuteTool({
          toolCallId: tc.id,
          name: tc.name,
          argumentsJson: argsJson
        });
        if (!ex.ok) {
          emit(narrateAfterTool(tc.name, false, ex.error));
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
        emit(narrateAfterTool(tc.name, toolSucceeded, ex.result.content));
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

  emit(
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

  rest.onActivityLine?.(
    '[Deep plan] Pass 1: scanning repo with read-only searches to ground the plan in real files…'
  );

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

  rest.onActivityLine?.(
    '[Deep plan] Pass 2: composing plan from gathered evidence…'
  );

  const present = await runIdeAgentLoop(deps, {
    ...rest,
    userText: presentUser,
    executionMode: 'plan_present'
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
      '── Between passes: building the visible plan from what we gathered ──',
      ...present.activityLog
    ],
    recordedToolOutputs: mergedRecorded.length > 0 ? mergedRecorded : undefined,
    error: present.error,
    cancelled: present.cancelled
  };
}
