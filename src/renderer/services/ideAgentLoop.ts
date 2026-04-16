import type { AgentChatMessage, AgentToolCall } from '../../shared/agentTurnTypes';

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
  if (t.length > 1200) return false;
  const createIntent = /\b(create|new|make|build|start|scaffold)\b/i.test(t);
  const oappOrGame =
    /\boapp\b/i.test(t) ||
    /\bstarnet\b.*\b(app|oapp)\b/i.test(t) ||
    /\bnew\s+(world|game)\b/i.test(t) ||
    /\bgame\s+called\b/i.test(t);
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
    `**Do** reply in a few short paragraphs: a brief **Plan** (goals, assumptions), then **exactly one** clear question. Do **not** dump a long questionnaire or many topics in one message.\n` +
    `End with **clickable reply chips**: append **only** this block at the **very end** (no text after it), with 3–5 short self-contained labels the user might pick next (e.g. genre, engine, or "Not sure yet").\n` +
    `<oasis_plan_replies>\n` +
    `["First choice","Second choice","Third choice"]\n` +
    `</oasis_plan_replies>\n` +
    `${quick}\n` +
    `You may use **read-only** tools (\`read_file\`, \`list_directory\`, \`workspace_grep\`) only if they clearly help (e.g. \`OASIS-IDE/docs/recipes/\`, STAR CLI docs under \`Docs/Devs/\`).\n` +
    `If the user message is actually a long detailed spec (many requirements, paths, tech choices), **ignore** this block and proceed with execution as usual.`
  );
}

/**
 * When the Explorer workspace root does not match paths in the question, the model often
 * mis-reads tools and claims files are "missing". Nudge with explicit workspace metadata.
 */
function augmentIdeAgentUserMessage(
  userText: string,
  workspacePath: string,
  gameDevMode?: boolean,
  /** When true (Plan execution mode), skip the sparse-request inject; server already restricts tools. */
  skipSparsePlanInject?: boolean
): string {
  const ws = workspacePath.replace(/[/\\]+$/, '');
  const t = userText.trim();
  const asksCreUnderOasisClean =
    /\bOASIS_CLEAN[/\\]CRE\b/i.test(t) ||
    (/\bOASIS_CLEAN\b/i.test(t) && /\b[/\\]CRE\b/i.test(t));

  const wsEndsWithOasisClean = /[/\\]OASIS_CLEAN$/i.test(ws);
  const wsEndsWithCre = /[/\\]CRE$/i.test(ws);

  const parts = [t];

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
      executionMode?: 'plan' | 'execute';
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
    /** plan = read-only tools + one-question UX; execute = full tool set. */
    executionMode?: 'plan' | 'execute';
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
        options.executionMode === 'plan'
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
      const text = res.content ?? '';
      if (text.trim().length > 40) {
        emit(truncate(text, 180));
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

      const sideText = (res.content ?? '').trim();
      if (sideText.length > 40) {
        emit(truncate(sideText, 180));
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
        emit(formatToolProgressLine(tc.name, argsJson));
        const ex = await deps.agentExecuteTool({
          toolCallId: tc.id,
          name: tc.name,
          argumentsJson: argsJson
        });
        const ok = ex.ok === true;
        if (!ok) {
          emit(`${tc.name} failed`);
        }
        toolCallsLog.push({ tool: tc.name, ok });
        const toolBody = ok ? ex.result.content : `Error: ${ex.error}`;
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

  return {
    finalText: 'Agent stopped after the maximum number of tool rounds. Ask a narrower question.',
    toolCallsLog,
    activityLog,
    recordedToolOutputs:
      recordedToolOutputsForUi.length > 0 ? [...recordedToolOutputsForUi] : undefined,
    error: undefined
  };
}
