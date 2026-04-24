import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useMCP } from '../../contexts/MCPContext';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace, type TreeNode } from '../../contexts/WorkspaceContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { AIAssistant } from '../../services/AIAssistant';
import {
  IDE_CHAT_DEFAULT_MODEL_ID,
  IDE_CHAT_MODELS,
  IDE_CHAT_MODEL_STORAGE_KEY,
  getIdeChatModelById,
  type AgentExecutionModeId
} from '../../constants/ideChatModels';
import { getAgentContextPack } from '../../../shared/agentContextPack';
import { getGameDevContextPack } from '../../constants/gameDevPrompt';
import { useGameDev } from '../../contexts/GameDevContext';
import { useSettings } from '../../contexts/SettingsContext';
import {
  buildAgentPriorMessagesFromThread,
  emitActivityMetaAsFeed,
  runIdeAgentGatherPresentSequence,
  runIdeAgentLoop,
  shouldUsePlanModeFirst
} from '../../services/ideAgentLoop';
import { countWorkspaceFiles } from '../../utils/countWorkspaceFiles';
import { wantsBrowserPreviewAction, resolvePreviewFolderPath } from '../../utils/previewIntent';
import {
  ASSISTANT_STREAM_MIN_LENGTH,
  nextRevealIncrement
} from '../../utils/assistantStreamReveal';
import { makeIdeThreadKey } from '../../utils/ideThreadKey';
import { extractPlanReplyChoices } from '../../utils/planReplyParser';
import type { AgentActivityFeedItem } from '../../../shared/agentActivityFeed';
import { ComposerActivityFeedRow } from './ComposerActivityFeedRow';
import { ComposerMarkdownBody } from './ComposerMarkdownBody';
import { GameToolPalette } from './GameToolPalette';
import { useStarnetCatalog } from '../../contexts/StarnetCatalogContext';
import {
  buildStarnetIdeContextNote,
  buildStarnetIdeSnapshotMissingNote
} from '../../utils/starnetAgentContext';
import { OnChainQuickPalette } from './OnChainQuickPalette';
import {
  ComposerInlineOnChainWorkflow,
  type OnChainWorkflowMode
} from '../OnChain/ComposerInlineOnChainWorkflow';
import { ComposerInlineGameWorkflow } from './ComposerInlineGameWorkflow';
import { ComposerInlineOasisOnboardGuide } from './ComposerInlineOasisOnboardGuide';
import { ComposerInlineBuildPlanGuide } from './ComposerInlineBuildPlanGuide';
import { OASIS_OPEN_ONBOARD_GUIDE } from '../../utils/activityViewBridge';
import type { GameQuickActionId } from '../../constants/gameQuickActions';
import { useEditorTab } from '../../contexts/EditorTabContext';
import { useProjectMemory } from '../../contexts/ProjectMemoryContext';
import { loadWorkspaceRulesText } from '../../utils/workspaceRules';
import { loadIdeAgentInstructions } from '../../utils/ideAgentInstructions';
import { extractLastOasisBuildPlan, stripOasisBuildPlanFences } from '../../utils/parseOasisBuildPlan';
import { buildPlanningDocContextNote } from '../../utils/buildPlanningDocContextNote';
import { buildHolonAnnotatedWorkspaceNote } from '../../utils/holonWorkspaceAnnotation';
import { useWorkspaceHolonScan } from '../../hooks/useWorkspaceHolonScan';
import { useWorkspaceIndex } from '../../contexts/WorkspaceIndexContext';
import { useOappBuildPlan } from '../../contexts/OappBuildPlanContext';
import { buildOnChainAgentContextNote } from '../../constants/onChainQuickPrompts';
import {
  buildPathScopedContextNote,
  rootDirNamesFromTree,
  tryResolveWorkspacePathFocus,
} from '../../utils/pathScopedContext';
import {
  PROJECT_MEMORY_SUMMARIZE_SYSTEM,
  buildComposerTranscriptForSummary,
  isNothingToAddSummary
} from '../../../shared/projectMemorySummarize';
import './ChatInterface.css';

/** Composer textarea auto-grow: min visible area, cap before inner scroll */
const COMPOSER_TEXTAREA_MIN_PX = 72;
const COMPOSER_TEXTAREA_MAX_PX = 220;

const CHAT_STORAGE_V2_PREFIX = 'oasis-ide-chat-v2-';
const CHAT_ROOT_HOLON_PREFIX = 'oasis-ide-chat-rootid-';
/** Two-step Plan (gather repo, then user-facing plan). Default on; user can turn off. */
const IDE_DEEP_PLAN_TWO_STEP_KEY = 'oasis-ide-deep-plan-two-step';
/** Legacy key (avatar only — no workspace); migrated when v2 is empty */
const CHAT_STORAGE_LEGACY_PREFIX = 'oasis-ide-chat-';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: Array<{ tool: string; result: any }>;
  error?: boolean;
  /** Plan mode: quick-reply labels (stripped from raw model output). */
  planChoices?: string[];
  /** Pasted images for this user turn (session only; stripped before localStorage / holon save). */
  imageDataUrls?: string[];
}

const MAX_PASTE_IMAGES = 4;
const MAX_IMAGE_FILE_BYTES = 4 * 1024 * 1024;

/** When ONODE returns a missing-LLM-key error, append actionable context (Agent mode uses ONODE, not IDE .env alone). */
function augmentOnodeAgentConfigurationError(error: string): string {
  const t = error.trim();
  if (!t.includes('OASIS_DNA.json')) return t;
  if (t.includes('OpenAI API key not configured') || t.includes('OASIS.AI.OpenAI')) {
    return (
      `${t}\n\n` +
      '**What this means:** Agent mode calls your **ONODE** at `/api/ide/agent/turn`. ONODE runs the LLM there, so it needs `OASIS.AI.OpenAI.ApiKey` (for OpenAI) or `OASIS.AI.OpenAI.BaseUrl` pointing at a local OpenAI-compatible server (for example Ollama `http://127.0.0.1:11434/v1`, where a placeholder key is fine). Setting keys only in the IDE is not enough for this path.\n\n' +
      '**Fix:** Edit the `OASIS_DNA.json` file that ONODE loads, add or fix those fields, **restart ONODE**, then try again.'
    );
  }
  if (t.includes('xAI API key')) {
    return (
      `${t}\n\n` +
      '**Fix:** Set `OASIS.AI.XAI.ApiKey` in ONODE `OASIS_DNA.json`, restart ONODE, then try again.'
    );
  }
  return t;
}

function messagesForPersistence(messages: Message[]): Message[] {
  return messages.map((m) => {
    if (m.role === 'user' && m.imageDataUrls && m.imageDataUrls.length > 0) {
      const { imageDataUrls: _, ...rest } = m;
      return rest;
    }
    return m;
  });
}

function mapRecordedToolOutputsToMessageToolCalls(
  rows?: Array<{ tool: string; content: string }>
): Array<{ tool: string; result: unknown }> | undefined {
  if (!rows?.length) return undefined;
  return rows.map((r) => {
    try {
      return { tool: r.tool, result: JSON.parse(r.content) as unknown };
    } catch {
      return { tool: r.tool, result: r.content };
    }
  });
}

/** Latest assistant turn in the thread offered plan chips (user may be answering). */
function lastAssistantHasPlanChoices(thread: Message[]): boolean {
  for (let i = thread.length - 1; i >= 0; i--) {
    if (thread[i].role === 'assistant') {
      return (thread[i].planChoices?.length ?? 0) > 0;
    }
  }
  return false;
}

/** Long assistant reply: reveal text progressively (OASIS_IDE-style). Key = messageIndex:totalChars. */
interface AssistantRevealState {
  messageIndex: number;
  visible: number;
  total: number;
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    'Hi, I\'m the OASIS IDE assistant.\n\n' +
    '**Agent** and **Game Dev** (Activity bar or Game Dev toggle in the right panel):\n' +
    '- **Agent**: OpenAI or Grok with a **workspace folder** open. Use **Plan** for read-only exploration and a chip handoff, or **Execute** for writes, STAR, npm, and MCP.\n' +
    '- **Game Dev**: Same tool loop as Agent, with metaverse game context pre-loaded (quests, NPCs, GeoNFTs, ElevenLabs voice, engine templates).\n\n' +
    'With a folder open, the model auto-includes **AGENTS.md** (root and nested toward the open file), **`.cursor/rules`**, and **`.oasiside` / `.OASIS_IDE` rules** in the context pack sent to the model.\n\n' +
    '**Paste images** (Ctrl/Cmd+V) into the composer to ask about screenshots, diagrams, or logos. Use vision-capable models (for example GPT-4o) via ONODE when available.\n\n' +
    '**+** opens another tab with its own history.',
  timestamp: Date.now()
};

function storageKeyV2(threadKey: string): string {
  return `${CHAT_STORAGE_V2_PREFIX}${threadKey}`;
}

function rootHolonStorageKey(threadKey: string): string {
  return `${CHAT_ROOT_HOLON_PREFIX}${threadKey}`;
}

function storageKeyLegacy(avatarId?: string): string {
  return `${CHAT_STORAGE_LEGACY_PREFIX}${avatarId || 'default'}`;
}

function parseStoredMessages(raw: unknown): Message[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Message[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    const role = o.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const content = String(o.content ?? '');
    const planChoices = Array.isArray(o.planChoices)
      ? (o.planChoices as string[]).filter((s) => typeof s === 'string' && s.trim().length > 0)
      : undefined;
    const imageDataUrls = Array.isArray(o.imageDataUrls)
      ? (o.imageDataUrls as string[]).filter((u) => typeof u === 'string' && u.startsWith('data:'))
      : undefined;
    out.push({
      role,
      content,
      timestamp: typeof o.timestamp === 'number' ? o.timestamp : Number(o.timestamp) || Date.now(),
      toolCalls: Array.isArray(o.toolCalls) ? (o.toolCalls as Message['toolCalls']) : undefined,
      error: Boolean(o.error),
      planChoices: planChoices?.length ? planChoices : undefined,
      imageDataUrls: imageDataUrls?.length ? imageDataUrls : undefined
    });
  }
  return out.length > 0 ? out : null;
}

function loadPersistedMessages(
  threadKey: string,
  avatarId?: string,
  allowLegacyAvatarFallback?: boolean
): Message[] | null {
  try {
    const v2 = localStorage.getItem(storageKeyV2(threadKey));
    if (v2) {
      const parsed = parseStoredMessages(JSON.parse(v2));
      if (parsed) return parsed;
    }
    if (allowLegacyAvatarFallback && avatarId) {
      const legacy = localStorage.getItem(storageKeyLegacy(avatarId));
      if (legacy) {
        const parsed = parseStoredMessages(JSON.parse(legacy));
        if (parsed) return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function threadHasUserMessages(messages: Message[] | null | undefined): boolean {
  return Boolean(messages?.some((m) => m.role === 'user'));
}

/**
 * When the user opens a folder after chatting with no workspace, `threadKey` switches from
 * `workspaceKey(null)` ("nows") to a path-specific key. Without this, the composer loads an empty
 * thread even though history exists under the no-workspace key.
 *
 * When the user logs in after chatting while logged out, `threadKey` switches from
 * `ide-default-{workspace}` to `ide-{avatarId}-{workspace}`. Without a fallback, chat and holon
 * keys no longer match pre-login localStorage and the thread looks empty.
 */
function loadPersistedMessagesWithNoWorkspaceHandoff(
  threadKey: string,
  avatarId: string | undefined,
  sessionId: string,
  workspacePath: string | null,
  applyNoWorkspaceFallback: boolean
): Message[] | null {
  const cur = loadPersistedMessages(threadKey, avatarId, sessionId === 'main');
  if (threadHasUserMessages(cur)) return cur;

  if (applyNoWorkspaceFallback && workspacePath) {
    const noWsKey = makeIdeThreadKey(avatarId, null, sessionId);
    if (noWsKey !== threadKey) {
      const fromNoWs = loadPersistedMessages(noWsKey, avatarId, sessionId === 'main');
      if (threadHasUserMessages(fromNoWs)) return fromNoWs;
    }
  }

  if (avatarId) {
    const preLoginKey = makeIdeThreadKey(undefined, workspacePath, sessionId);
    if (preLoginKey !== threadKey) {
      const fromPreLogin = loadPersistedMessages(preLoginKey, undefined, sessionId === 'main');
      if (threadHasUserMessages(fromPreLogin)) return fromPreLogin;
    }
  }

  return cur;
}

function savePersistedMessages(threadKey: string, messages: Message[]): void {
  try {
    localStorage.setItem(storageKeyV2(threadKey), JSON.stringify(messagesForPersistence(messages)));
  } catch {
    // ignore quota or parse errors
  }
}

function loadRootHolonId(threadKey: string): string | null {
  try {
    return localStorage.getItem(rootHolonStorageKey(threadKey));
  } catch {
    return null;
  }
}

function saveRootHolonId(threadKey: string, id: string): void {
  try {
    localStorage.setItem(rootHolonStorageKey(threadKey), id);
  } catch {
    // ignore
  }
}

/** Prefix for local LLM / rule-based assistant when ONODE is unavailable (no structured API fields). */
function buildLocalIdeContextPrefix(
  workspacePath: string | null,
  referencedPaths: string[],
  projectMemory?: string | null,
  starnetNote?: string | null,
  extras?: {
    workspaceRules?: string | null;
    autoLoadedProjectInstructions?: string | null;
  }
): string {
  const lines: string[] = [
    'Local chat path: no disk or shell from the model—use only the lines below. For read_file / list_dir / run_workspace_command, use Composer Agent (OpenAI or Grok) with a workspace folder open.'
  ];
  if (workspacePath) lines.push(`Workspace root: ${workspacePath}`);
  if (referencedPaths.length > 0) {
    lines.push(`Attached paths: ${referencedPaths.join('; ')}`);
  }
  let block = `[IDE context]\n${lines.join('\n')}\n\n`;
  if (extras?.workspaceRules?.trim()) {
    const wr = extras.workspaceRules.trim();
    block += `## Workspace rules (.oasiside or .OASIS_IDE)\n${wr.slice(0, 6000)}${
      wr.length > 6000 ? '\n…(truncated)' : ''
    }\n\n`;
  }
  if (extras?.autoLoadedProjectInstructions?.trim()) {
    const al = extras.autoLoadedProjectInstructions.trim();
    block += `${al.slice(0, 8000)}${al.length > 8000 ? '\n\n…(truncated)' : ''}\n\n`;
  }
  if (projectMemory?.trim()) {
    block += `[Project memory]\n${projectMemory.trim()}\n\n`;
  }
  if (starnetNote?.trim()) {
    block += `${starnetNote.trim()}\n\n`;
  }
  return block;
}


/** Inserted when both local holon context and a STARNET block are present — prevents the model from answering “what’s in the repo?” from the global catalog. */
const LOCAL_VS_STARNET_ROUTING_NOTE =
  '## How to answer “holons in this workspace / this repo”\n\n' +
  '• **This project (on disk)** — The **Local workspace (on disk)** and **Relevant local holons** sections describe **folders and the holonic index** for the open path.\n' +
  '• **STARNET (global registry)** — The next section lists **published** holon and OAPP **ids** in STAR. Use that for **composition, publish, and id lookup**, *not* as a substitute for listing repo directories.\n' +
  'If the user’s question is about the **open workspace**, lead with the local sections; cite STARNET rows only if they also ask about published components or installable templates.';

function buildIdeComposerContextPack(opts: {
  workspaceRules: string | null;
  /** Root + nested AGENTS.md and `.cursor/rules` (bounded); see `docs/IDE_INTELLIGENCE_HOLONIC_AND_CURSOR_PARITY_BRIEFING.md` */
  autoLoadedProjectInstructions?: string | null;
  projectMemoryText: string;
  basePack: string;
  onChainNote?: string | null;
  starnetNote?: string | null;
  /** Full planning index markdown (Build plan tab); injected every agent turn */
  planningDocNote?: string | null;
  /** Pre-read workspace tree (from WorkspaceContext) — injected once to reduce list_directory round-trips */
  workspaceTreeNote?: string | null;
  /** Top holons from the semantic index, matched to the current user query */
  relevantHolonsNote?: string | null;
  /** Pre-read README / package / listing for a path the user asked about */
  pathFocusNote?: string | null;
}): string {
  const hasLocalHolonContext =
    Boolean(opts.workspaceTreeNote?.trim()) ||
    Boolean(opts.relevantHolonsNote?.trim()) ||
    Boolean(opts.pathFocusNote?.trim());
  const parts: string[] = [];
  if (opts.workspaceRules?.trim()) {
    parts.push(`## Workspace rules (.oasiside or .OASIS_IDE)\n${opts.workspaceRules.trim()}`);
  }
  if (opts.autoLoadedProjectInstructions?.trim()) {
    parts.push(opts.autoLoadedProjectInstructions.trim());
  }
  if (opts.projectMemoryText.trim()) {
    parts.push(`## Project memory (workspace notes)\n${opts.projectMemoryText.trim()}`);
  }
  if (opts.pathFocusNote?.trim()) {
    parts.push(opts.pathFocusNote.trim());
  }
  if (opts.workspaceTreeNote?.trim()) {
    parts.push(opts.workspaceTreeNote.trim());
  }
  if (opts.relevantHolonsNote?.trim()) {
    parts.push(opts.relevantHolonsNote.trim());
  }
  if (opts.planningDocNote?.trim()) {
    parts.push(opts.planningDocNote.trim());
  }
  if (opts.starnetNote?.trim()) {
    if (hasLocalHolonContext) {
      parts.push(LOCAL_VS_STARNET_ROUTING_NOTE);
    }
    parts.push(opts.starnetNote.trim());
  }
  if (opts.onChainNote?.trim()) {
    parts.push(`## On-chain defaults (IDE)\n${opts.onChainNote.trim()}`);
  }
  parts.push(opts.basePack);
  return parts.join('\n\n---\n\n');
}

const getElectronAPI = () => (window as any).electronAPI;

/** Explorer tree can be huge at repo root — cap label so the composer stays readable. */
function formatWorkspaceFileCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 files';
  if (n >= 200_000) return '200k+ files (very large workspace)';
  if (n >= 100_000) return `${Math.round(n / 1000)}k+ files (very large workspace)`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k files`;
  return `${n.toLocaleString()} files`;
}

interface PendingWriteFile {
  path: string;
  newContent: string;
  oldContent: string | null;
}

interface PendingWrite {
  files: PendingWriteFile[];
  resolve: (accepted: boolean) => void;
}

function WriteFilePreview({ file }: { file: PendingWriteFile }) {
  const [tab, setTab] = useState<'new' | 'old'>('new');
  const displayName = file.path.split('/').filter(Boolean).pop() ?? file.path;
  const content = tab === 'old' ? (file.oldContent ?? '') : file.newContent;
  const lines = content.split('\n');
  const MAX_LINES = 35;
  const truncated = lines.length > MAX_LINES;
  const displayLines = truncated ? lines.slice(0, MAX_LINES) : lines;
  return (
    <div className="composer-write-file">
      <div className="composer-write-file-header">
        <span className="composer-write-file-name" title={file.path}>{displayName}</span>
        {file.oldContent !== null ? (
          <div className="composer-write-file-tabs" role="tablist">
            <button
              type="button"
              className={`composer-write-tab${tab === 'new' ? ' is-active' : ''}`}
              onClick={() => setTab('new')}
            >
              New
            </button>
            <button
              type="button"
              className={`composer-write-tab${tab === 'old' ? ' is-active' : ''}`}
              onClick={() => setTab('old')}
            >
              Current
            </button>
          </div>
        ) : (
          <span className="composer-write-file-badge">new file</span>
        )}
      </div>
      <pre className="composer-write-file-content">
        <code>{displayLines.join('\n')}</code>
        {truncated && (
          <div className="composer-write-truncated">…{lines.length - MAX_LINES} more lines</div>
        )}
      </pre>
    </div>
  );
}

export interface ComposerSessionPanelProps {
  sessionId: string;
  visible: boolean;
  workspaceFileCount: number;
}

export const ComposerSessionPanel: React.FC<ComposerSessionPanelProps> = ({
  sessionId,
  visible,
  workspaceFileCount
}) => {
  const { isGameDevMode } = useGameDev();
  const { settings } = useSettings();
  const { tools, executeTool, loading: mcpLoading } = useMCP();
  const { avatarId, loggedIn } = useAuth();
  const onChainContextNote = buildOnChainAgentContextNote(
    settings.onChainDefaultChain,
    settings.onChainSolanaCluster
  );
  const { workspacePath, tree, refreshTree, starWorkspaceConfig, openFilePath } = useWorkspace();

  /**
   * Shallow (depth-2) root listing used exclusively for holonic annotation.
   * This is fetched via a dedicated IPC call that does NOT recursively scan
   * the entire workspace, making it safe for huge monorepos (174k+ files).
   */
  const [rootLevelTree, setRootLevelTree] = useState<TreeNode[]>([]);
  useEffect(() => {
    if (!workspacePath || !window.electronAPI?.listRootLevel) return;
    window.electronAPI.listRootLevel().then((nodes: TreeNode[]) => {
      setRootLevelTree(nodes ?? []);
    }).catch(() => setRootLevelTree([]));
  }, [workspacePath]);

  const {
    sessions,
    removeReference,
    setSessionTitle,
    getReferencedPathsForSession,
    composerDraftInjection,
    acknowledgeComposerDraftInjection
  } = useIdeChat();
  const { snapshot: starnetCatalogSnapshot } = useStarnetCatalog();
  const starnetContextNote = useMemo(() => {
    const fromSnapshot = buildStarnetIdeContextNote(starnetCatalogSnapshot);
    if (fromSnapshot) return fromSnapshot;
    if (loggedIn) return buildStarnetIdeSnapshotMissingNote();
    return null;
  }, [starnetCatalogSnapshot, loggedIn]);
  const { text: projectMemoryText, appendAutoTurnLine, appendChatSummaryBlock } = useProjectMemory();
  const referencedPaths = getReferencedPathsForSession(sessionId);
  const threadKey = useMemo(
    () => makeIdeThreadKey(avatarId, workspacePath, sessionId),
    [avatarId, workspacePath, sessionId]
  );
  /** One user send: all agent/turn rounds share this id for IPC cancel. */
  const ideRunIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const messagesRef = useRef<Message[]>(messages);
  const [rootHolonId, setRootHolonId] = useState<string | null>(null);
  const rootHolonIdRef = useRef<string | null>(null);
  const [input, setInput] = useState('');
  /** data:image/...;base64,... for the next send (Agent vision); not persisted. */
  const [pendingImageDataUrls, setPendingImageDataUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!composerDraftInjection || composerDraftInjection.sessionId !== sessionId) return;
    const { id, text } = composerDraftInjection;
    setInput(text);
    acknowledgeComposerDraftInjection(id);
  }, [composerDraftInjection, sessionId, acknowledgeComposerDraftInjection]);
  const [loading, setLoading] = useState(false);
  /** Live progress: text lines + structured file-edit rows (matches agent loop + pending writes). */
  const [agentActivityFeed, setAgentActivityFeed] = useState<AgentActivityFeedItem[]>([]);
  const appendFeedText = useCallback((line: string) => {
    setAgentActivityFeed((prev) => [...prev, { kind: 'text', text: line }]);
  }, []);
  /** Collapsible log after the last agent request finishes. */
  const [lastAgentActivity, setLastAgentActivity] = useState<AgentActivityFeedItem[] | null>(null);
  /** Progressive display for the latest long assistant message. */
  const [assistantReveal, setAssistantReveal] = useState<AssistantRevealState | null>(null);
  /** Index in `messages` where the current turn starts; earlier messages fold into a summary (OASIS_IDE-style). */
  const [earlierFoldStartIndex, setEarlierFoldStartIndex] = useState<number | null>(null);
  const [hasLLM, setHasLLM] = useState<boolean | null>(null);
  /** Match main `DEFAULT_IDE_ASSISTANT_AGENT_ID` so the first send can use the agent tool loop before IPC returns. */
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>('oasis-ide-assistant');
  const [aiAssistant, setAiAssistant] = useState<AIAssistant | null>(null);
  const [holonSyncState, setHolonSyncState] = useState<'idle' | 'synced' | 'error'>('idle');
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(IDE_CHAT_MODEL_STORAGE_KEY);
      if (stored && getIdeChatModelById(stored)) return stored;
    } catch {
      /* ignore */
    }
    return IDE_CHAT_DEFAULT_MODEL_ID;
  });
  const [onChainWorkflow, setOnChainWorkflow] = useState<OnChainWorkflowMode | null>(null);
  const [gameQuickWorkflow, setGameQuickWorkflow] = useState<GameQuickActionId | null>(null);
  const [oasisOnboardGuide, setOasisOnboardGuide] = useState<{ open: boolean; key: number }>({
    open: false,
    key: 0
  });
  const [buildPlanGuide, setBuildPlanGuide] = useState<{ open: boolean; key: number }>({
    open: false,
    key: 0
  });
  const [agentExecutionMode, setAgentExecutionMode] = useState<AgentExecutionModeId>('execute');
  const [deepPlanTwoStep, setDeepPlanTwoStep] = useState(() => {
    try {
      const v = localStorage.getItem(IDE_DEEP_PLAN_TWO_STEP_KEY);
      if (v === '0') return false;
    } catch {
      /* ignore */
    }
    return true;
  });
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  const pendingWriteResolveRef = useRef<((accepted: boolean) => void) | null>(null);
  /** Text from `.oasiside/rules.md` or `.OASIS_IDE/rules.md`, if present. */
  const [workspaceRules, setWorkspaceRules] = useState<string | null>(null);
  /** AGENTS.md (nested) + `.cursor/rules`; refreshed with workspace and active editor file. */
  const [agentAutoloadInstructions, setAgentAutoloadInstructions] = useState<string | null>(null);
  const {
    registerSubmitHandler,
    pendingComposerText,
    clearPendingComposerText,
    openBuilderTab,
    openBuildPlanPane
  } = useEditorTab();
  const { applyPayload, planningDocPath, planningDocContent } = useOappBuildPlan();
  const { status: indexStatus, searchHolons } = useWorkspaceIndex();

  const planningContextNote = useMemo(() => {
    if (!planningDocContent?.trim()) return null;
    return buildPlanningDocContextNote(planningDocPath ?? null, planningDocContent);
  }, [planningDocPath, planningDocContent]);

  /**
   * Tier 2: background file-content scan.
   * Uses rootLevelTree (depth-2 shallow listing) — safe for huge monorepos.
   */
  const holonScanResult = useWorkspaceHolonScan(workspacePath, rootLevelTree);

  /**
   * Holonically-annotated workspace context note.
   * Uses the shallow rootLevelTree so the annotation always covers every
   * top-level directory — even in a 174k-file monorepo where the full
   * recursive tree load would time out or be truncated.
   */
  const workspaceTreeNote = useMemo<string | null>(() => {
    if (!workspacePath || rootLevelTree.length === 0) return null;
    return buildHolonAnnotatedWorkspaceNote({
      tree: rootLevelTree,
      workspacePath,
      starWorkspaceConfig: starWorkspaceConfig ?? null,
      holonCatalogRows: starnetCatalogSnapshot?.holonCatalogRows ?? [],
      oapps: starnetCatalogSnapshot?.oapps ?? [],
      scanResult: holonScanResult,
    });
  }, [workspacePath, rootLevelTree, starWorkspaceConfig, starnetCatalogSnapshot, holonScanResult]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  /** Scroll live agent step list to bottom as new lines arrive. */
  const agentActivityFeedRef = useRef<HTMLUListElement>(null);
  /** After a new user send, scroll the thread pane to the top of the current turn instead of the bottom. */
  const scrollComposerToFoldTopRef = useRef(false);
  /** User pressed Stop / Enter-to-cancel; agent loop checks between ONODE rounds and tools. */
  const cancelAgentRunRef = useRef(false);
  /** After first composer persistence effect for this mount, enables no-workspace → folder handoff. */
  const workspacePersistenceInitRef = useRef(false);
  /** Last workspace path after persistence effect (null = no folder open). */
  const prevWorkspaceForPersistenceRef = useRef<string | null>(null);

  const handleStopGeneration = useCallback(() => {
    cancelAgentRunRef.current = true;
    // Resolve any pending write confirmation so the loop can exit cleanly.
    if (pendingWriteResolveRef.current) {
      pendingWriteResolveRef.current(false);
      pendingWriteResolveRef.current = null;
      setPendingWrite(null);
    }
    const api = getElectronAPI();
    const rid = ideRunIdRef.current;
    if (api?.agentTurnCancel && rid) {
      void api.agentTurnCancel(rid);
    }
    ideRunIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cancelAgentRunRef.current = true;
      const api = getElectronAPI();
      const rid = ideRunIdRef.current;
      if (api?.agentTurnCancel && rid) {
        void api.agentTurnCancel(rid);
      }
      ideRunIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!isGameDevMode) {
      setGameQuickWorkflow(null);
    }
  }, [isGameDevMode]);

  useEffect(() => {
    const onOpenOasisOnboard = () => {
      setOnChainWorkflow(null);
      setGameQuickWorkflow(null);
      setBuildPlanGuide((o) => ({ ...o, open: false }));
      setOasisOnboardGuide((o) => ({ open: true, key: o.key + 1 }));
    };
    window.addEventListener(OASIS_OPEN_ONBOARD_GUIDE, onOpenOasisOnboard);
    return () => window.removeEventListener(OASIS_OPEN_ONBOARD_GUIDE, onOpenOasisOnboard);
  }, []);

  const syncComposerTextareaHeight = useCallback(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    const scrollH = el.scrollHeight;
    const next = Math.min(Math.max(scrollH, COMPOSER_TEXTAREA_MIN_PX), COMPOSER_TEXTAREA_MAX_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = scrollH > COMPOSER_TEXTAREA_MAX_PX ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    syncComposerTextareaHeight();
  }, [input, syncComposerTextareaHeight, visible]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{
        sessionId: string;
        resolve: (r: { ok: boolean; error?: string; skipped?: boolean }) => void;
      }>;
      const detail = ce.detail;
      if (!detail?.resolve || typeof detail.resolve !== 'function') return;
      if (detail.sessionId !== sessionId || !visible) return;

      void (async () => {
        const resolve = detail.resolve;
        try {
          const api = getElectronAPI();
          if (!api?.chatComplete) {
            resolve({ ok: false, error: 'Composer API not available.' });
            return;
          }
          const llmOk = await api.chatHasLLM().catch(() => false);
          if (!llmOk) {
            resolve({
              ok: false,
              error:
                'No LLM configured for local chat. Set OPENAI_API_KEY (or Anthropic, Google, or xAI keys) in the environment used by the IDE main process.'
            });
            return;
          }

          const thread = messagesRef.current.filter(
            (m): m is Message & { role: 'user' | 'assistant' } =>
              m.role === 'user' || m.role === 'assistant'
          );
          if (!thread.some((m) => m.role === 'user')) {
            resolve({
              ok: false,
              error: 'Nothing to summarize yet. Send at least one message in this chat session.'
            });
            return;
          }

          const transcript = buildComposerTranscriptForSummary(
            thread.map((m) => ({ role: m.role, content: m.content }))
          );
          if (transcript.trim().length < 24) {
            resolve({ ok: false, error: 'Not enough chat content to summarize.' });
            return;
          }

          const userPayload = `Here is the Composer transcript:\n\n${transcript}`;

          const result = await api.chatComplete(
            [
              { role: 'system', content: PROJECT_MEMORY_SUMMARIZE_SYSTEM },
              { role: 'user', content: userPayload }
            ],
            selectedModelId
          );

          if (result.error) {
            resolve({ ok: false, error: result.error });
            return;
          }
          const out = (result.content || '').trim();
          if (!out || isNothingToAddSummary(out)) {
            resolve({ ok: true, skipped: true });
            return;
          }
          appendChatSummaryBlock(out);
          resolve({ ok: true });
        } catch (e: unknown) {
          resolve({
            ok: false,
            error: e instanceof Error ? e.message : String(e)
          });
        }
      })();
    };

    window.addEventListener('oasis-ide-project-memory-summarize-request', handler as EventListener);
    return () =>
      window.removeEventListener('oasis-ide-project-memory-summarize-request', handler as EventListener);
  }, [sessionId, visible, selectedModelId, appendChatSummaryBlock]);

  useEffect(() => {
    try {
      localStorage.setItem(IDE_CHAT_MODEL_STORAGE_KEY, selectedModelId);
    } catch {
      /* ignore */
    }
  }, [selectedModelId]);

  useEffect(() => {
    try {
      localStorage.setItem(IDE_DEEP_PLAN_TWO_STEP_KEY, deepPlanTwoStep ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [deepPlanTwoStep]);

  useEffect(() => {
    rootHolonIdRef.current = rootHolonId;
  }, [rootHolonId]);

  // Load workspace rules when the workspace changes
  useEffect(() => {
    if (!workspacePath) {
      setWorkspaceRules(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const text = await loadWorkspaceRulesText(workspacePath);
      if (!cancelled) setWorkspaceRules(text);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath) {
      setAgentAutoloadInstructions(null);
      return;
    }
    const api = getElectronAPI();
    if (!api?.readFile || !api?.listTree) {
      setAgentAutoloadInstructions(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const text = await loadIdeAgentInstructions({
        workspacePath,
        activeFilePath: openFilePath,
        readFile: async (p) => {
          try {
            return await api.readFile(p);
          } catch {
            return null;
          }
        },
        listTree: async (dir) => {
          try {
            return await api.listTree(dir);
          } catch {
            return [];
          }
        }
      });
      if (!cancelled) setAgentAutoloadInstructions(text);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspacePath, openFilePath]);

  useEffect(() => {
    workspacePersistenceInitRef.current = false;
    prevWorkspaceForPersistenceRef.current = null;
  }, [avatarId]);

  // Load persisted history when workspace, avatar, or this session id changes
  useEffect(() => {
    const applyNoWorkspaceHandoff =
      workspacePersistenceInitRef.current &&
      workspacePath != null &&
      prevWorkspaceForPersistenceRef.current === null;

    const saved = loadPersistedMessagesWithNoWorkspaceHandoff(
      threadKey,
      avatarId,
      sessionId,
      workspacePath,
      applyNoWorkspaceHandoff
    );
    setMessages(saved ?? [INITIAL_MESSAGE]);
    let holonId = loadRootHolonId(threadKey);
    if (!holonId && avatarId) {
      const preLoginKey = makeIdeThreadKey(undefined, workspacePath, sessionId);
      if (preLoginKey !== threadKey) {
        const fromPreLogin = loadRootHolonId(preLoginKey);
        if (fromPreLogin) {
          holonId = fromPreLogin;
          saveRootHolonId(threadKey, fromPreLogin);
        }
      }
    }
    setRootHolonId(holonId);
    setAssistantReveal(null);
    setEarlierFoldStartIndex(null);

    workspacePersistenceInitRef.current = true;
    prevWorkspaceForPersistenceRef.current = workspacePath ?? null;
  }, [avatarId, workspacePath, threadKey, sessionId]);

  const assistantRevealStreamKey = assistantReveal
    ? `${assistantReveal.messageIndex}:${assistantReveal.total}`
    : '';

  useEffect(() => {
    if (!assistantReveal) return undefined;
    const { messageIndex, total } = assistantReveal;
    if (assistantReveal.visible >= total) {
      setAssistantReveal(null);
      return undefined;
    }

    let stopped = false;
    let raf = 0;

    const loop = () => {
      if (stopped) return;
      setAssistantReveal((r) => {
        if (!r || r.messageIndex !== messageIndex || r.total !== total) return r;
        if (r.visible >= r.total) return null;
        const add = nextRevealIncrement(r.visible, r.total);
        const next = Math.min(r.total, r.visible + add);
        if (next >= r.total) return null;
        return { ...r, visible: next };
      });
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [assistantRevealStreamKey]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length === 0) return;
    savePersistedMessages(threadKey, messages);
  }, [messages, threadKey]);

  // When logged in, load conversation holon from OASIS (server wins when it has data)
  useEffect(() => {
    if (!loggedIn) {
      setHolonSyncState('idle');
      return;
    }
    const api = getElectronAPI();
    if (!api?.chatHolonLoad) return;

    let cancelled = false;
    setHolonSyncState('idle');
    (async () => {
      const res = await api.chatHolonLoad(threadKey);
      if (cancelled) return;
      if (res.error) {
        setHolonSyncState('error');
        return;
      }
      if (res.messagesJson) {
        try {
          const parsed = parseStoredMessages(JSON.parse(res.messagesJson));
          if (parsed && parsed.length > 0) {
            setMessages(parsed);
            setAssistantReveal(null);
            setEarlierFoldStartIndex(null);
            savePersistedMessages(threadKey, parsed);
          }
        } catch {
          setHolonSyncState('error');
          return;
        }
      }
      if (res.rootHolonId) {
        setRootHolonId(res.rootHolonId);
        saveRootHolonId(threadKey, res.rootHolonId);
      }
      setHolonSyncState('synced');
    })();

    return () => {
      cancelled = true;
    };
  }, [loggedIn, threadKey]);

  // Debounced save to OASIS holon (requires JWT)
  useEffect(() => {
    if (!loggedIn) return;
    if (messages.length === 0) return;
    if (!messages.some((m) => m.role === 'user')) return;

    const api = getElectronAPI();
    if (!api?.chatHolonSave) return;

    const timer = window.setTimeout(() => {
      api
        .chatHolonSave({
          threadKey,
          workspaceRoot: workspacePath,
          rootHolonId: rootHolonIdRef.current,
          messagesJson: JSON.stringify(messagesForPersistence(messages))
        })
        .then((res: { rootHolonId?: string; error?: string }) => {
          if (res.rootHolonId) {
            setRootHolonId(res.rootHolonId);
            saveRootHolonId(threadKey, res.rootHolonId);
          }
          if (res.error) {
            setHolonSyncState('error');
            console.warn('[Chat] OASIS holon save:', res.error);
          } else {
            setHolonSyncState('synced');
          }
        })
        .catch((e: unknown) => {
          setHolonSyncState('error');
          console.warn('[Chat] OASIS holon save failed:', e);
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [messages, loggedIn, threadKey, workspacePath]);

  // Check if main process has LLM (OpenAI) available
  useEffect(() => {
    const api = getElectronAPI();
    if (api?.chatHasLLM) {
      api.chatHasLLM().then((ok: boolean) => setHasLLM(ok)).catch(() => setHasLLM(false));
    } else {
      setHasLLM(false);
    }
  }, []);

  // Default OASIS IDE Assistant agent ID (from env / constant in main)
  useEffect(() => {
    const api = getElectronAPI();
    if (api?.chatGetDefaultAssistantAgentId) {
      api.chatGetDefaultAssistantAgentId().then((id: string) => setDefaultAgentId(id || null)).catch(() => setDefaultAgentId(null));
    }
  }, []);

  // Initialize AI Assistant when tools are loaded (fallback when no LLM)
  useEffect(() => {
    if (tools.length > 0 && !aiAssistant) {
      const assistant = new AIAssistant(tools, executeTool);
      setAiAssistant(assistant);
    }
  }, [tools, executeTool, aiAssistant]);

  // Auto-scroll: after a new send with fold, show the current turn from the top; otherwise follow the end.
  useEffect(() => {
    if (!visible) return;
    if (scrollComposerToFoldTopRef.current) {
      scrollComposerToFoldTopRef.current = false;
      messagesScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, agentActivityFeed.length, assistantReveal?.visible, visible]);

  // Activity feed is in the main composer scroller (no inner scroll) — nudge the latest row into view.
  useEffect(() => {
    if (!loading) return;
    const el = agentActivityFeedRef.current;
    if (!el) return;
    const last = el.lastElementChild;
    if (last instanceof HTMLElement) {
      last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [agentActivityFeed, loading]);

  const modelMeta = getIdeChatModelById(selectedModelId);
  const electronApi = getElectronAPI();
  const agentToolLoopReady =
    !!workspacePath &&
    (modelMeta?.provider === 'openai' || modelMeta?.provider === 'xai') &&
    !!electronApi?.agentTurn &&
    !!electronApi?.agentExecuteTool;
  const canSend = !!(defaultAgentId || hasLLM || aiAssistant || agentToolLoopReady);
  const conversationId = threadKey;
  const MAX_HISTORY = 20;

  /** Whenever OpenAI/Grok + workspace agent tools are available, user can choose Plan (read-only) vs Execute. */
  const showPlanExecuteToggle = agentToolLoopReady;

  /**
   * Wraps agentExecuteTool for write_file / write_files: pauses the loop, shows a diff
   * panel in the Composer, and waits for Accept or Discard before writing to disk.
   */
  const agentExecuteToolWithConfirm = useCallback(
    async (payload: {
      toolCallId: string;
      name: string;
      argumentsJson: string;
      executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
    }) => {
      const api = getElectronAPI();
      if (payload.name !== 'write_file' && payload.name !== 'write_files') {
        return api.agentExecuteTool(payload);
      }
      // Parse intended writes
      let filesToConfirm: Array<{ path: string; newContent: string }> = [];
      try {
        const args = JSON.parse(payload.argumentsJson) as Record<string, unknown>;
        if (payload.name === 'write_file') {
          const p = typeof args.path === 'string' ? args.path : '';
          const c = typeof args.content === 'string' ? args.content : '';
          if (p) filesToConfirm = [{ path: p, newContent: c }];
        } else {
          const files = Array.isArray(args.files) ? args.files : [];
          filesToConfirm = files
            .filter((f) => f && typeof f === 'object')
            .map((f) => ({
              path: String((f as Record<string, unknown>).path ?? ''),
              newContent: String((f as Record<string, unknown>).content ?? '')
            }))
            .filter((f) => f.path);
        }
      } catch { /* malformed args — let executor surface the error */ }

      if (filesToConfirm.length === 0) return api.agentExecuteTool(payload);

      // Read current on-disk content (null = new file)
      const filesWithOld: PendingWriteFile[] = await Promise.all(
        filesToConfirm.map(async ({ path, newContent }) => {
          let oldContent: string | null = null;
          if (api?.readFile) {
            try {
              const abs = path.startsWith('/') ? path : `${workspacePath ?? ''}/${path}`;
              oldContent = await api.readFile(abs);
            } catch { /* new file or unreadable */ }
          }
          return { path, newContent, oldContent };
        })
      );

      appendFeedText(
        `Proposed write: ${filesWithOld.length} file(s) — review diff below, then Accept or Discard.`
      );

      // Pause loop and wait for user decision
      const accepted = await new Promise<boolean>((resolve) => {
        pendingWriteResolveRef.current = resolve;
        setPendingWrite({ files: filesWithOld, resolve });
      });
      pendingWriteResolveRef.current = null;
      setPendingWrite(null);

      if (!accepted) {
        appendFeedText('← discarded, nothing written.');
        return {
          ok: true as const,
          result: {
            toolCallId: payload.toolCallId,
            content: `Write discarded by user: ${filesToConfirm.map((f) => f.path).join(', ')}`,
            isError: false
          }
        };
      }
      appendFeedText('Writing accepted changes to disk…');
      const written = await api.agentExecuteTool(payload);
      if (written.ok && written.result.activityMeta) {
        emitActivityMetaAsFeed(written.result.activityMeta, (item) => {
          setAgentActivityFeed((prev) => [...prev, item]);
        });
        appendFeedText('Continuing…');
      } else {
        appendFeedText('← written. Continuing…');
      }
      return written;
    },
    [workspacePath, appendFeedText]
  );

  const handleSendMessage = async (messageText: string) => {
    if ((!messageText.trim() && pendingImageDataUrls.length === 0) || loading || !canSend) return;
    setInput('');
    const imgs = [...pendingImageDataUrls];
    setPendingImageDataUrls([]);
    await handleSendCore(messageText, imgs);
  };

  // Register this session's send handler so the editor-tab builder pane can submit into it
  useEffect(() => {
    registerSubmitHandler((msg) => void handleSendMessage(msg));
  }, [registerSubmitHandler, loading, canSend, agentExecutionMode, deepPlanTwoStep, messages.length]);

  // Consume pendingComposerText (set by AI Generate builders) — auto-send directly into the agent.
  // handleSendCore is captured fresh from this render (after pendingComposerText state change),
  // so no stale-closure issue. We bypass the loading/canSend guards in handleSendMessage
  // intentionally — handleSendCore will surface any errors through the normal error flow.
  useEffect(() => {
    if (!pendingComposerText) return;
    const msg = pendingComposerText;
    clearPendingComposerText();
    setInput('');
    void handleSendCore(msg);
  }, [pendingComposerText, clearPendingComposerText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    await handleSendMessage(input);
  };

  const handleSendCore = async (currentInput: string, sendImageDataUrls: string[] = []) => {
    const threadBefore = messagesRef.current;

    cancelAgentRunRef.current = false;
    const sendRunId = (() => {
      try {
        return crypto.randomUUID();
      } catch {
        return `run-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      }
    })();
    ideRunIdRef.current = sendRunId;

    const userMessage: Message = {
      role: 'user',
      content: currentInput,
      timestamp: Date.now(),
      imageDataUrls: sendImageDataUrls.length > 0 ? [...sendImageDataUrls] : undefined
    };

    const foldAt = threadBefore.length;
    scrollComposerToFoldTopRef.current = true;
    setEarlierFoldStartIndex(foldAt);
    setMessages(prev => [...prev, userMessage]);
    const sess = sessions.find((s) => s.id === sessionId);
    if (sess && /^Chat \d+$/.test(sess.title)) {
      const hint = currentInput.trim().slice(0, 48);
      if (hint) setSessionTitle(sessionId, hint);
    }
    setAgentActivityFeed([]);
    setLastAgentActivity(null);
    setAssistantReveal(null);
    setLoading(true);

    const modelForSend = getIdeChatModelById(selectedModelId);
    const isGameMode = isGameDevMode;

    const planFirstThisSend = shouldUsePlanModeFirst(currentInput);
    const apiForMode = getElectronAPI();
    const agentLoopWillUseOpenAiTools =
      !!workspacePath &&
      (modelForSend?.provider === 'openai' || modelForSend?.provider === 'xai') &&
      !!apiForMode?.agentTurn &&
      !!apiForMode?.agentExecuteTool;
    const effectiveExecutionMode: AgentExecutionModeId =
      agentLoopWillUseOpenAiTools && agentExecutionMode === 'plan' ? 'plan' : 'execute';

    const historyForApi = [...threadBefore, userMessage].slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content
    }));

    const pushAssistantMessage = (
      content: string,
      toolCalls?: Array<{ tool: string; result: any }>,
      error?: boolean,
      stream: boolean = true,
      planChoices?: string[]
    ) => {
      const shouldStream =
        stream &&
        !error &&
        content.length >= ASSISTANT_STREAM_MIN_LENGTH;

      setMessages((prev) => {
        const newIndex = prev.length;
        if (shouldStream) {
          queueMicrotask(() =>
            setAssistantReveal({
              messageIndex: newIndex,
              visible: 0,
              total: content.length
            })
          );
        }
        return [
          ...prev,
          {
            role: 'assistant',
            content,
            timestamp: Date.now(),
            toolCalls,
            error,
            planChoices: planChoices?.length ? planChoices : undefined
          }
        ];
      });
      if (!error && content.trim().length > 0) {
        const payload = extractLastOasisBuildPlan(content);
        if (payload) {
          const tr = payload.templateRecommendation;
          const hasTemplate =
            tr &&
            typeof tr === 'object' &&
            String(tr.label ?? '').trim().length > 0 &&
            String(tr.framework ?? '').trim().length > 0;
          const holons = payload.holonFeatures;
          const hasHolons = Array.isArray(holons) && holons.length > 0;
          if (hasTemplate || hasHolons) {
            applyPayload(payload);
            openBuildPlanPane();
          }
        }
      }
    };

    try {
      const api = getElectronAPI();

      // 0) OASIS_IDE-style: serve attached / resolved folder and open browser (local IPC, not LLM-only steps)
      if (api?.previewStaticFolder && wantsBrowserPreviewAction(currentInput)) {
        const folder = resolvePreviewFolderPath(currentInput, workspacePath, referencedPaths);
        if (folder) {
          const pres = await api.previewStaticFolder(folder, true);
          if (pres.ok) {
            pushAssistantMessage(
              `Started a local static server and opened your browser.\n\n` +
                `Folder: ${pres.root}\n` +
                `URL: ${pres.url}\n` +
                `(port ${pres.port}, Python http.server). Starting another preview stops the previous one.`
            );
            return;
          }
          pushAssistantMessage(`Could not start preview: ${pres.error}`, undefined, true);
          return;
        }
        // No path resolved — fall through so the model can explain attaching a folder / full path
      }

      const modelMeta = getIdeChatModelById(selectedModelId);
      if (
        (modelMeta?.provider === 'openai' || modelMeta?.provider === 'xai') &&
        !workspacePath
      ) {
        pushAssistantMessage(
          'A workspace folder must be open so local tools can read files. Use Open folder in the Explorer, then try again.',
          undefined,
          true
        );
        return;
      }

      const useAgentToolLoop =
        !!workspacePath &&
        (modelMeta?.provider === 'openai' || modelMeta?.provider === 'xai') &&
        !!api?.agentTurn &&
        !!api?.agentExecuteTool;

      if (sendImageDataUrls.length > 0 && !useAgentToolLoop) {
        pushAssistantMessage(
          '**Images** are only sent to the model with **OpenAI** or **Grok** and a workspace folder open. Pick GPT-4o or Grok, use Open folder in the Explorer, then send again.',
          undefined,
          true
        );
        setLoading(false);
        ideRunIdRef.current = null;
        return;
      }

      /* Pre-read a named subfolder (README, package.json, one-level list) so answers are not guesswork */
      let pathFocusNote: string | null = null;
      let refPathsForTurn = referencedPaths;
      let resolvedPathForIndex: string | null = null;
      if (workspacePath?.trim() && api.readFile) {
        const known = rootDirNamesFromTree(rootLevelTree);
        resolvedPathForIndex = tryResolveWorkspacePathFocus(
          workspacePath,
          currentInput,
          known
        );
        if (resolvedPathForIndex) {
          try {
            pathFocusNote = await buildPathScopedContextNote(resolvedPathForIndex, {
              readFile: (p) => api.readFile(p).catch(() => null),
              listDirShallow: api.listDirShallow
                ? async (p: string) => {
                    const nodes = await api.listDirShallow(p);
                    return (nodes ?? []).map(
                      (n: { name: string; isDirectory: boolean; path: string }) => ({
                      name: n.name,
                      isDirectory: n.isDirectory,
                      path: n.path,
                    })
                    );
                  }
                : undefined,
            });
          } catch {
            /* path bundle is optional */
          }
          if (!refPathsForTurn.includes(resolvedPathForIndex)) {
            refPathsForTurn = [...refPathsForTurn, resolvedPathForIndex];
          }
        }
      }

      if (useAgentToolLoop) {
        const priorForAgent = buildAgentPriorMessagesFromThread(
          threadBefore.slice(-(MAX_HISTORY - 1)).map((m) => ({
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls,
            imageDataUrls: m.role === 'user' ? m.imageDataUrls : undefined
          }))
        );
        const basePack = isGameMode
          ? getGameDevContextPack(starWorkspaceConfig?.gameEngine)
          : getAgentContextPack();

        /* Search the holonic index for holons relevant to this specific message */
        let relevantHolonsNote: string | null = null;
        if (indexStatus.phase === 'ready' && currentInput.trim()) {
          try {
            const lastSeg =
              resolvedPathForIndex
                ?.split('/')
                .filter(Boolean)
                .pop() ?? '';
            const indexQuery = lastSeg
              ? `${currentInput}\n${lastSeg}`
              : currentInput;
            const hits = await searchHolons(indexQuery, 8);
            const scored = hits.filter((h) => h.score > 0).slice(0, 6);
            if (scored.length > 0) {
              const lines = scored.map((h, i) => {
                const excerpt = h.excerpt
                  .replace(/^Holon:\s*\S+\s*/i, '')
                  .replace(/\n+/g, ' ')
                  .trim()
                  .slice(0, 240);
                return `${i + 1}. **${h.dirName}** — ${excerpt}`;
              });
              relevantHolonsNote =
                `## Relevant local holons (on-disk holonic index — matched to your message)\n` +
                `Each row is a **root-level project folder** in the open workspace, not a STARNET library id. Explore these before broad list_directory calls.\n\n` +
                lines.join('\n');
            }
          } catch {
            /* index search failure is non-blocking */
          }
        }

        const contextPack = buildIdeComposerContextPack({
          workspaceRules,
          autoLoadedProjectInstructions: agentAutoloadInstructions,
          projectMemoryText,
          basePack,
          onChainNote: onChainContextNote,
          starnetNote: starnetContextNote,
          planningDocNote: planningContextNote,
          pathFocusNote,
          workspaceTreeNote,
          relevantHolonsNote,
        });
        const agentLoopBase = {
          userText: currentInput,
          model: selectedModelId,
          workspacePath,
          referencedPaths: refPathsForTurn,
          fromAvatarId: avatarId ?? undefined,
          contextPack,
          priorMessages: priorForAgent,
          onActivityFeedItem: (item: AgentActivityFeedItem) => {
            setAgentActivityFeed((prev) => [...prev, item]);
          },
          runId: sendRunId,
          gameDevMode: isGameMode,
          executionMode: effectiveExecutionMode,
          activeFilePath: openFilePath ?? undefined,
          userImageDataUrls: sendImageDataUrls.length > 0 ? sendImageDataUrls : undefined
        };
        const useDeepGatherPresent =
          effectiveExecutionMode === 'plan' && planFirstThisSend && deepPlanTwoStep;
        const out = useDeepGatherPresent
          ? await runIdeAgentGatherPresentSequence(
              {
                agentTurn: (b, runId) => api.agentTurn(b, runId),
                agentExecuteTool: agentExecuteToolWithConfirm,
                isCancelled: () => cancelAgentRunRef.current
              },
              agentLoopBase
            )
          : await runIdeAgentLoop(
              {
                agentTurn: (b, runId) => api.agentTurn(b, runId),
                agentExecuteTool: agentExecuteToolWithConfirm,
                isCancelled: () => cancelAgentRunRef.current
              },
              agentLoopBase
            );
        setLastAgentActivity(out.activityLog.length > 0 ? [...out.activityLog] : null);
        setAgentActivityFeed([]);
        if (out.error) {
          const stopped =
            out.cancelled === true ||
            out.error === 'Stopped.' ||
            out.error === 'Stopped';
          pushAssistantMessage(
            stopped
              ? '**Stopped.** Generation was cancelled (no further tool or model steps will run for this request).'
              : `❌ ${augmentOnodeAgentConfigurationError(out.error)}`,
            undefined,
            !stopped
          );
        } else {
          const { displayText, choices } = extractPlanReplyChoices(out.finalText);
          appendAutoTurnLine(currentInput, displayText);
          pushAssistantMessage(
            displayText,
            mapRecordedToolOutputsToMessageToolCalls(out.recordedToolOutputs),
            false,
            true,
            choices
          );
        }
        return;
      }

      // 1) Try OASIS agent first when default agent ID is set
      if (defaultAgentId && api?.chatWithAgent) {
        /* Search holonic index for OASIS agent path too */
        let agentHolonsNote: string | null = null;
        if (indexStatus.phase === 'ready' && currentInput.trim()) {
          try {
            const lastSeg = resolvedPathForIndex?.split('/').filter(Boolean).pop() ?? '';
            const indexQuery = lastSeg ? `${currentInput}\n${lastSeg}` : currentInput;
            const hits = await searchHolons(indexQuery, 6);
            const scored = hits.filter((h) => h.score > 0).slice(0, 5);
            if (scored.length > 0) {
              const lines = scored.map((h, i) => {
                const excerpt = h.excerpt
                  .replace(/^Holon:\s*\S+\s*/i, '')
                  .replace(/\n+/g, ' ')
                  .trim()
                  .slice(0, 200);
                return `${i + 1}. **${h.dirName}** — ${excerpt}`;
              });
              agentHolonsNote =
                `## Relevant local holons (on-disk holonic index)\n` +
                lines.join('\n');
            }
          } catch { /* non-blocking */ }
        }
        const result = await api.chatWithAgent(
          defaultAgentId,
          currentInput,
          conversationId,
          historyForApi,
          avatarId ?? undefined,
          selectedModelId,
          workspacePath ?? undefined,
          refPathsForTurn,
          buildIdeComposerContextPack({
            workspaceRules,
            autoLoadedProjectInstructions: agentAutoloadInstructions,
            projectMemoryText,
            basePack: getAgentContextPack(),
            onChainNote: onChainContextNote,
            starnetNote: starnetContextNote,
            planningDocNote: planningContextNote,
            pathFocusNote,
            workspaceTreeNote,
            relevantHolonsNote: agentHolonsNote,
          })
        );
        if (!result.error && (result.content || (result.toolCalls && result.toolCalls.length > 0))) {
          pushAssistantMessage(result.content || '', result.toolCalls, false);
          return;
        }
        // Agent failed (error or empty) — fall through to fallback
      }

      // 2) Fallback: local LLM when available
      if (hasLLM && api?.chatComplete) {
        const localPrefix = buildLocalIdeContextPrefix(
          workspacePath,
          refPathsForTurn,
          projectMemoryText,
          starnetContextNote,
          {
            workspaceRules,
            autoLoadedProjectInstructions: agentAutoloadInstructions
          }
        );
        const localUser =
          (pathFocusNote ? `${pathFocusNote}\n\n` : '') + localPrefix + currentInput;
        const messagesForApi = [...historyForApi, { role: 'user' as const, content: localUser }];
        const result = await api.chatComplete(messagesForApi, selectedModelId);
        pushAssistantMessage(
          result.error ? `❌ ${result.error}` : (result.content || 'No response.'),
          undefined,
          !!result.error
        );
        return;
      }

      // 3) Fallback: rule-based AI Assistant + MCP tools
      if (aiAssistant) {
        const assistPrefix = buildLocalIdeContextPrefix(
          workspacePath,
          refPathsForTurn,
          projectMemoryText,
          starnetContextNote,
          {
            workspaceRules,
            autoLoadedProjectInstructions: agentAutoloadInstructions
          }
        );
        const response = await aiAssistant.processMessage(
          (pathFocusNote ? `${pathFocusNote}\n\n` : '') + assistPrefix + currentInput
        );
        pushAssistantMessage(response.response, response.toolCalls, response.error);
      } else {
        pushAssistantMessage('Assistant not ready. Try again in a moment.', undefined, true);
      }
    } catch (error: any) {
      pushAssistantMessage(`❌ Error: ${error.message || 'Something went wrong'}`, undefined, true);
    } finally {
      ideRunIdRef.current = null;
      setLoading(false);
    }
  };

  const handleComposerPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    void (async () => {
      const urls: string[] = [];
      for (const file of files) {
        if (urls.length >= MAX_PASTE_IMAGES) break;
        if (file.size > MAX_IMAGE_FILE_BYTES) continue;
        const dataUrl = await new Promise<string | null>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
          r.onerror = () => resolve(null);
          r.readAsDataURL(file);
        });
        if (dataUrl) urls.push(dataUrl);
      }
      if (!urls.length) return;
      setPendingImageDataUrls((prev) => [...prev, ...urls].slice(0, MAX_PASTE_IMAGES));
    })();
  }, []);

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (loading && !input.trim() && pendingImageDataUrls.length === 0) {
        handleStopGeneration();
        return;
      }
      if (input.trim() || pendingImageDataUrls.length) {
        void handleSendMessage(input);
      }
    }
  };

  const backendLabel = agentToolLoopReady
    ? isGameDevMode
      ? showPlanExecuteToggle && agentExecutionMode === 'plan'
        ? 'Game Dev (plan)'
        : showPlanExecuteToggle
          ? 'Game Dev (execute)'
          : 'Game Dev'
      : showPlanExecuteToggle && agentExecutionMode === 'plan'
        ? 'ONODE agent (plan)'
        : showPlanExecuteToggle
          ? 'ONODE agent (execute)'
          : 'ONODE agent'
    : (modelMeta?.provider === 'openai' || modelMeta?.provider === 'xai') && !workspacePath
      ? 'Open workspace folder'
      : modelMeta && modelMeta.provider !== 'openai' && modelMeta.provider !== 'xai'
        ? 'Use OpenAI or Grok for full tools'
        : defaultAgentId
          ? 'ONODE assistant'
          : hasLLM
            ? 'Local LLM'
            : aiAssistant
              ? 'Offline rules'
              : '—';

  const currentTurnStart = earlierFoldStartIndex ?? 0;

  const renderMessageBubble = (msg: Message, index: number) => {
    const streamingAssistant =
      msg.role === 'assistant' &&
      assistantReveal !== null &&
      assistantReveal.messageIndex === index &&
      assistantReveal.visible < assistantReveal.total;
    const displayText = streamingAssistant
      ? msg.content.slice(0, assistantReveal.visible)
      : msg.content;
    const strippedForDisplay =
      msg.role === 'assistant' && !msg.error ? stripOasisBuildPlanFences(displayText) : displayText;
    const bodyMarkdown =
      strippedForDisplay.trim().length > 0
        ? strippedForDisplay
        : msg.role === 'user' && (msg.imageDataUrls?.length ?? 0) > 0
          ? '_(Image attached)_'
          : strippedForDisplay;
    const planChoices = msg.planChoices ?? [];
    const showPlanChips =
      msg.role === 'assistant' &&
      planChoices.length > 0 &&
      !streamingAssistant &&
      !msg.error;
    return (
      <div key={index} className={`composer-message ${msg.role} ${msg.error ? 'error' : ''}`}>
        <div className="composer-message-label">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
        {msg.role === 'user' && msg.imageDataUrls && msg.imageDataUrls.length > 0 ? (
          <div className="composer-message-images" aria-label="Attached images">
            {msg.imageDataUrls.map((url, i) => (
              <img key={i} src={url} alt="" className="composer-message-image-thumb" />
            ))}
          </div>
        ) : null}
        <div
          className={`composer-message-body composer-message-body--markdown${
            streamingAssistant ? ' composer-message-body--streaming' : ''
          }`}
        >
          <ComposerMarkdownBody text={bodyMarkdown} />
          {streamingAssistant ? <span className="composer-stream-caret" aria-hidden /> : null}
        </div>
        {showPlanChips ? (
          <div className="composer-plan-chips" role="group" aria-label="Quick replies">
            {planChoices.map((c) => (
              <button
                key={`${index}-${c}`}
                type="button"
                className="composer-plan-chip"
                disabled={loading || !canSend}
                title="Send as your next message"
                onClick={() => void handleSendMessage(c)}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="composer-tool-calls">Tool: {msg.toolCalls[0].tool}</div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`composer-session-panel${visible ? ' composer-session-panel--active' : ''}`}
      aria-hidden={!visible}
    >
      <div className="composer-toolbar" aria-label="Composer status">
        <span className="composer-toolbar-badge">{mcpLoading ? 'MCP …' : `${tools.length} tools`}</span>
        <span className="composer-toolbar-sep" aria-hidden />
        <span className="composer-toolbar-quiet" title="Reply routing">
          {backendLabel}
        </span>
        {loggedIn && holonSyncState === 'synced' && (
          <>
            <span className="composer-toolbar-sep" aria-hidden />
            <span className="composer-toolbar-ok">Synced</span>
          </>
        )}
        {loggedIn && holonSyncState === 'error' && (
          <>
            <span className="composer-toolbar-sep" aria-hidden />
            <span className="composer-toolbar-err" title="Holon sync failed; local history kept">
              Sync failed
            </span>
          </>
        )}
        {!canSend && !mcpLoading && (
          <>
            <span className="composer-toolbar-sep" aria-hidden />
            <span className="composer-toolbar-warn">Configure API keys or ONODE</span>
          </>
        )}
      </div>

      <div className="composer-body-scroll" ref={messagesScrollRef}>
        <div className="composer-messages">
        {earlierFoldStartIndex !== null && earlierFoldStartIndex > 0 && (
          <details className="composer-earlier-fold">
            <summary className="composer-earlier-fold-summary">
              Earlier
              <span className="composer-earlier-fold-count">
                {earlierFoldStartIndex} {earlierFoldStartIndex === 1 ? 'message' : 'messages'}
              </span>
            </summary>
            <div className="composer-earlier-fold-body">
              {messages.slice(0, earlierFoldStartIndex).map((msg, index) => renderMessageBubble(msg, index))}
            </div>
            <div className="composer-earlier-fold-actions">
              <button
                type="button"
                className="composer-earlier-fold-link"
                onClick={() => setEarlierFoldStartIndex(null)}
              >
                Show full thread inline
              </button>
            </div>
          </details>
        )}
        {messages.slice(currentTurnStart).map((msg, index) =>
          renderMessageBubble(msg, currentTurnStart + index)
        )}
        {loading && (
          <div className="composer-message assistant composer-message--working">
            <div className="composer-message-label">Assistant</div>
            <div className="composer-message-body">
              <div className="composer-activity-panel" aria-live="polite" aria-busy="true">
                <div className="composer-activity-panel-header" title="The assistant is using your workspace without stopping the chat — status only, not the final answer.">
                  In progress
                </div>
                {agentActivityFeed.length > 0 ? (
                  <ul ref={agentActivityFeedRef} className="composer-activity-feed">
                    {agentActivityFeed.map((item, i) => (
                      <ComposerActivityFeedRow key={i} item={item} />
                    ))}
                  </ul>
                ) : (
                  <span className="typing-indicator composer-activity-idle">
                    Connecting to the model…
                  </span>
                )}
              </div>
              <details className="composer-stop-details">
                <summary className="composer-stop-details-summary">Cancel and timeouts</summary>
                <span className="composer-stop-hint">
                  Press <strong>Stop</strong> or <strong>Enter</strong> with an empty message to cancel. Each model
                  step times out after 2 minutes if ONODE does not respond.
                </span>
              </details>
            </div>
          </div>
        )}
        {buildPlanGuide.open ? (
          <ComposerInlineBuildPlanGuide
            key={buildPlanGuide.key}
            onDismiss={() => setBuildPlanGuide((o) => ({ ...o, open: false }))}
            scrollParentRef={messagesScrollRef}
            agentLoading={loading}
            latestAssistantReply={
              [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? null
            }
            onSendToComposer={(text, mode) => {
              setAgentExecutionMode(mode === 'plan' ? 'plan' : 'execute');
              void handleSendMessage(text);
            }}
          />
        ) : oasisOnboardGuide.open ? (
          <ComposerInlineOasisOnboardGuide
            key={oasisOnboardGuide.key}
            onDismiss={() => setOasisOnboardGuide((o) => ({ ...o, open: false }))}
            scrollParentRef={messagesScrollRef}
            onInsertComposer={(text) => setInput(text)}
            onSendToComposer={(text) => void handleSendMessage(text)}
          />
        ) : onChainWorkflow ? (
          <ComposerInlineOnChainWorkflow
            mode={onChainWorkflow}
            onDismiss={() => setOnChainWorkflow(null)}
            scrollParentRef={messagesScrollRef}
          />
        ) : isGameDevMode && gameQuickWorkflow ? (
          <ComposerInlineGameWorkflow
            actionId={gameQuickWorkflow}
            onDismiss={() => setGameQuickWorkflow(null)}
            scrollParentRef={messagesScrollRef}
            onOpenBuilder={(id) => openBuilderTab(id)}
            onInsertComposer={(text) => setInput(text)}
          />
        ) : null}
        <div ref={messagesEndRef} />
        </div>

      {lastAgentActivity && lastAgentActivity.length > 0 && (
        <details className="composer-activity-summary">
          <summary className="composer-activity-summary-title">
            Last run: {lastAgentActivity.length}{' '}
            {lastAgentActivity.length === 1 ? 'step' : 'steps'} (full trace)
          </summary>
          <ul className="composer-activity-list composer-activity-feed">
            {lastAgentActivity.map((item, i) => (
              <ComposerActivityFeedRow key={i} item={item} />
            ))}
          </ul>
        </details>
      )}

      <details className="composer-context">
        <summary className="composer-context-summary">
          Context
          <span className="composer-context-chips">
            <span>{formatWorkspaceFileCount(workspaceFileCount)}</span>
            <span>·</span>
            <span>1 terminal</span>
            {workspacePath && (
              <>
                <span>·</span>
                <span className="composer-context-folder" title={workspacePath}>
                  {workspacePath.split('/').filter(Boolean).pop() ?? 'workspace'}
                </span>
              </>
            )}
          </span>
        </summary>
        <div className="composer-context-body">
          Right-click a file or folder in the Explorer to add it to this chat or start a new chat. Attached
          paths are sent to ONODE with each message. @-mentions and full workspace indexing can extend this
          later.
        </div>
      </details>

      {pendingWrite && (
        <div className="composer-write-confirm" role="dialog" aria-label="Review file write">
          <div className="composer-write-confirm-header">
            <span className="composer-write-confirm-title">
              Agent wants to write{' '}
              {pendingWrite.files.length === 1
                ? '1 file'
                : `${pendingWrite.files.length} files`}
            </span>
            <div className="composer-write-confirm-actions">
              <button
                type="button"
                className="composer-write-accept"
                onClick={() => pendingWrite.resolve(true)}
              >
                Accept
              </button>
              <button
                type="button"
                className="composer-write-discard"
                onClick={() => pendingWrite.resolve(false)}
              >
                Discard
              </button>
            </div>
          </div>
          <div className="composer-write-files">
            {pendingWrite.files.map((f) => (
              <WriteFilePreview key={f.path} file={f} />
            ))}
          </div>
        </div>
      )}

      {isGameDevMode && (
        <GameToolPalette
          onStartWorkflow={(id) => {
            setOasisOnboardGuide((o) => ({ ...o, open: false }));
            setOnChainWorkflow(null);
            if (id === 'newOapp') {
              setGameQuickWorkflow(null);
              setBuildPlanGuide((o) => ({ open: true, key: o.key + 1 }));
            } else {
              setBuildPlanGuide((o) => ({ ...o, open: false }));
              setGameQuickWorkflow(id);
            }
          }}
        />
      )}

      {!loggedIn ? (
        <div className="composer-onchain-login-hint" role="note">
          Log in with your OASIS avatar for mint and wallet MCP flows that need your session.
        </div>
      ) : null}

      <OnChainQuickPalette
        onStartWorkflow={(mode) => {
          setOasisOnboardGuide((o) => ({ ...o, open: false }));
          setBuildPlanGuide((o) => ({ ...o, open: false }));
          setGameQuickWorkflow(null);
          setOnChainWorkflow(mode);
        }}
      />
      {referencedPaths.length > 0 && (
        <div className="composer-ref-chips" aria-label="Paths attached to the next message">
          {referencedPaths.map((p) => (
            <span key={p} className="composer-ref-chip" title={p}>
              <span className="composer-ref-chip-label">{p.split('/').filter(Boolean).pop() ?? p}</span>
              <button
                type="button"
                className="composer-ref-chip-remove"
                onClick={() => removeReference(p)}
                aria-label={`Remove ${p}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      </div>

      <div className="composer-input-shell">
        {pendingImageDataUrls.length > 0 ? (
          <div className="composer-pending-images" aria-label="Images to send">
            {pendingImageDataUrls.map((url, i) => (
              <div key={`${url.slice(0, 48)}-${i}`} className="composer-pending-image-wrap">
                <img src={url} alt="" className="composer-pending-image-thumb" />
                <button
                  type="button"
                  className="composer-pending-image-remove"
                  aria-label="Remove image"
                  onClick={() =>
                    setPendingImageDataUrls((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          ref={composerTextareaRef}
          className="composer-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          onPaste={handleComposerPaste}
          placeholder={
            !canSend
              ? 'Connect OASIS or set local API keys…'
              : loading
                ? 'Cancel: press Enter with empty input, or use Stop — Shift+Enter for newline'
                : 'Plan, ask for edits… Paste images (Ctrl/Cmd+V) with OpenAI or Grok + workspace'
          }
          disabled={!canSend}
          rows={1}
          spellCheck={false}
        />
        <div className="composer-input-footer">
          {showPlanExecuteToggle ? (
            <>
              <div
                className="composer-execution-toggle"
                role="group"
                aria-label="Agent: plan or execute"
                title="Plan: one question at a time, read-only tools, clickable replies. Execute: full tools (write, STAR, npm, MCP)."
              >
                <button
                  type="button"
                  className={
                    agentExecutionMode === 'plan' ? 'composer-exec-btn is-active' : 'composer-exec-btn'
                  }
                  onClick={() => setAgentExecutionMode('plan')}
                >
                  Plan
                </button>
                <button
                  type="button"
                  className={
                    agentExecutionMode === 'execute'
                      ? 'composer-exec-btn is-active'
                      : 'composer-exec-btn'
                  }
                  onClick={() => setAgentExecutionMode('execute')}
                >
                  Execute
                </button>
              </div>
              {agentExecutionMode === 'plan' ? (
                <label
                  className="composer-deep-plan-label"
                  title="When on, the first Plan send for a short create-style prompt runs a gather pass on the repo, then a second pass writes the visible plan and chips."
                >
                  <input
                    type="checkbox"
                    checked={deepPlanTwoStep}
                    onChange={(e) => setDeepPlanTwoStep(e.target.checked)}
                  />
                  <span>Deep plan</span>
                </label>
              ) : null}
            </>
          ) : null}
          <label className="composer-footer-model">
            <span className="visually-hidden">Model</span>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              title="Model"
            >
              {IDE_CHAT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.provider})
                </option>
              ))}
            </select>
          </label>
          <span
            className="composer-mode-pill composer-mode-pill--agent"
            title={
              showPlanExecuteToggle
                ? agentExecutionMode === 'plan'
                  ? 'Plan: read-only tools + guided questions.'
                  : 'Execute: full tools (OpenAI or Grok + workspace).'
                : 'OpenAI or Grok with a workspace: full tool loop.'
            }
          >
            {showPlanExecuteToggle
              ? agentExecutionMode === 'plan'
                ? 'Plan'
                : 'Execute'
              : 'Agent'}
          </span>
          <span className="composer-footer-spacer" />
          <button
            type="button"
            className="composer-icon-btn"
            title="@ for context (coming soon)"
            disabled
          >
            @
          </button>
          <button
            type="button"
            className="composer-icon-btn"
            title="Refresh workspace file list"
            onClick={() => void refreshTree()}
          >
            ↻
          </button>
          <button
            type="button"
            className={`composer-send-btn${loading ? ' composer-send-btn--stop' : ''}`}
            onClick={() => (loading ? handleStopGeneration() : void handleSendMessage(input))}
            disabled={
              !canSend ||
              (!loading && !input.trim() && pendingImageDataUrls.length === 0)
            }
          >
            {loading ? 'Stop' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};
