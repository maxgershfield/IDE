import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMCP } from '../../contexts/MCPContext';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useIdeChat, type IdeChatSession } from '../../contexts/IdeChatContext';
import { AIAssistant } from '../../services/AIAssistant';
import {
  IDE_CHAT_DEFAULT_MODEL_ID,
  IDE_CHAT_MODELS,
  IDE_CHAT_MODEL_STORAGE_KEY,
  IDE_COMPOSER_MODE_STORAGE_KEY,
  getIdeChatModelById,
  type ComposerModeId
} from '../../constants/ideChatModels';
import { getAgentContextPack } from '../../../shared/agentContextPack';
import { getGameDevContextPack } from '../../constants/gameDevPrompt';
import { useGameDev } from '../../contexts/GameDevContext';
import {
  buildAgentPriorMessagesFromThread,
  runIdeAgentLoop
} from '../../services/ideAgentLoop';
import { countWorkspaceFiles } from '../../utils/countWorkspaceFiles';
import { wantsBrowserPreviewAction, resolvePreviewFolderPath } from '../../utils/previewIntent';
import { wantsWorkspaceExecutionIntent } from '../../utils/workspaceExecutionIntent';
import {
  ASSISTANT_STREAM_MIN_LENGTH,
  nextRevealIncrement
} from '../../utils/assistantStreamReveal';
import { makeIdeThreadKey } from '../../utils/ideThreadKey';
import { ComposerMarkdownBody } from './ComposerMarkdownBody';
import { GameToolPalette } from './GameToolPalette';
import { useEditorTab } from '../../contexts/EditorTabContext';
import './ChatInterface.css';

const CHAT_STORAGE_V2_PREFIX = 'oasis-ide-chat-v2-';
const CHAT_ROOT_HOLON_PREFIX = 'oasis-ide-chat-rootid-';
/** Legacy key (avatar only — no workspace); migrated when v2 is empty */
const CHAT_STORAGE_LEGACY_PREFIX = 'oasis-ide-chat-';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: Array<{ tool: string; result: any }>;
  error?: boolean;
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

/** Long assistant reply: reveal text progressively (Cursor-like). Key = messageIndex:totalChars. */
interface AssistantRevealState {
  messageIndex: number;
  visible: number;
  total: number;
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    'Hi — I\'m the OASIS IDE assistant.\n\n' +
    '**Chat** / **Agent** / **Game Dev** (mode selector below):\n' +
    '- **Agent**: OpenAI or Grok + a workspace folder open. The model can call **tools** (`read_file`, `list_directory`, `workspace_grep`, `write_file`, `run_workspace_command`, MCP). Step-by-step activity while it works.\n' +
    '- **Game Dev**: Same tool loop as Agent, but with metaverse game developer context pre-loaded — OASIS quests, NPCs, GeoNFTs, ElevenLabs voice, Three.js/Hyperfy/Babylon/Unity/Roblox templates.\n' +
    '- **Chat**: One-shot text through ONODE or a local API key. No workspace tools.\n\n' +
    'Tip: switch to **Game Dev** when building metaverse worlds. **+** opens another tab with its own history.',
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
    out.push({
      role,
      content,
      timestamp: typeof o.timestamp === 'number' ? o.timestamp : Number(o.timestamp) || Date.now(),
      toolCalls: Array.isArray(o.toolCalls) ? (o.toolCalls as Message['toolCalls']) : undefined,
      error: Boolean(o.error)
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
 * When the user opens a folder after chatting with no workspace, `threadKey` switches from * `workspaceKey(null)` ("nows") to a path-specific key. Without this, the composer loads an empty
 * thread even though history exists under the no-workspace key.
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
  return cur;
}

function savePersistedMessages(threadKey: string, messages: Message[]): void {
  try {
    localStorage.setItem(storageKeyV2(threadKey), JSON.stringify(messages));
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
  referencedPaths: string[]
): string {
  const lines: string[] = [
    'Local chat path: no disk or shell from the model—use only the lines below. For read_file / list_dir / run_workspace_command, use Composer Agent (OpenAI or Grok) with a workspace folder open.'
  ];
  if (workspacePath) lines.push(`Workspace root: ${workspacePath}`);
  if (referencedPaths.length > 0) {
    lines.push(`Attached paths: ${referencedPaths.join('; ')}`);
  }
  return `[IDE context]\n${lines.join('\n')}\n\n`;
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

export interface ComposerSessionPanelProps {
  sessionId: string;
  visible: boolean;
  sessions: IdeChatSession[];
  workspaceFileCount: number;
}

export const ComposerSessionPanel: React.FC<ComposerSessionPanelProps> = ({
  sessionId,
  visible,
  sessions,
  workspaceFileCount
}) => {
  const { isGameDevMode } = useGameDev();
  const { tools, executeTool, loading: mcpLoading } = useMCP();
  const { avatarId, loggedIn } = useAuth();
  const { workspacePath, tree, refreshTree } = useWorkspace();
  const { removeReference, setSessionTitle, getReferencedPathsForSession } = useIdeChat();
  const referencedPaths = getReferencedPathsForSession(sessionId);
  const threadKey = useMemo(
    () => makeIdeThreadKey(avatarId, workspacePath, sessionId),
    [avatarId, workspacePath, sessionId]
  );
  /** One user send: all agent/turn rounds share this id for IPC cancel. */
  const ideRunIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [rootHolonId, setRootHolonId] = useState<string | null>(null);
  const rootHolonIdRef = useRef<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  /** Steps shown while the OpenAI/Grok agent loop runs (reads, commands, turns). */
  const [agentActivityLines, setAgentActivityLines] = useState<string[]>([]);
  /** Collapsible log after the last agent request finishes. */
  const [lastAgentActivity, setLastAgentActivity] = useState<string[] | null>(null);
  /** Progressive display for the latest long assistant message. */
  const [assistantReveal, setAssistantReveal] = useState<AssistantRevealState | null>(null);
  /** Index in `messages` where the current turn starts; earlier messages fold into a summary (Cursor-style). */
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
  const [composerMode, setComposerMode] = useState<ComposerModeId>(() => {
    try {
      const s = localStorage.getItem(IDE_COMPOSER_MODE_STORAGE_KEY);
      if (s === 'agent' || s === 'chat') return s;
    } catch {
      /* ignore */
    }
    return 'agent';
  });
  const { registerSubmitHandler } = useEditorTab();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
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
    try {
      localStorage.setItem(IDE_CHAT_MODEL_STORAGE_KEY, selectedModelId);
    } catch {
      /* ignore */
    }
  }, [selectedModelId]);

  useEffect(() => {
    try {
      localStorage.setItem(IDE_COMPOSER_MODE_STORAGE_KEY, composerMode);
    } catch {
      /* ignore */
    }
  }, [composerMode]);

  useEffect(() => {
    rootHolonIdRef.current = rootHolonId;
  }, [rootHolonId]);

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
    setRootHolonId(loadRootHolonId(threadKey));
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
          messagesJson: JSON.stringify(messages)
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
  }, [messages, loading, agentActivityLines.length, assistantReveal?.visible, visible]);

  const modelMeta = getIdeChatModelById(selectedModelId);
  const electronApi = getElectronAPI();
  const agentToolLoopReady =
    composerMode === 'agent' &&
    !!workspacePath &&
    (modelMeta?.provider === 'openai' || modelMeta?.provider === 'xai') &&
    !!electronApi?.agentTurn &&
    !!electronApi?.agentExecuteTool;
  const canSend = !!(defaultAgentId || hasLLM || aiAssistant || agentToolLoopReady);
  const conversationId = threadKey;
  const MAX_HISTORY = 20;

  const handleSendMessage = async (messageText: string) => {
    if (!messageText.trim() || loading || !canSend) return;
    setInput('');
    await handleSendCore(messageText);
  };

  // Register this session's send handler so the editor-tab builder pane can submit into it
  useEffect(() => {
    registerSubmitHandler((msg) => void handleSendMessage(msg));
  }, [registerSubmitHandler, loading, canSend]);

  const handleSend = async () => {
    if (!input.trim() || loading || !canSend) return;
    const text = input;
    setInput('');
    await handleSendCore(text);
  };

  const handleSendCore = async (currentInput: string) => {

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
      timestamp: Date.now()
    };

    const foldAt = messages.length;
    scrollComposerToFoldTopRef.current = true;
    setEarlierFoldStartIndex(foldAt);
    setMessages(prev => [...prev, userMessage]);
    const sess = sessions.find((s) => s.id === sessionId);
    if (sess && /^Chat \d+$/.test(sess.title)) {
      const hint = currentInput.trim().slice(0, 48);
      if (hint) setSessionTitle(sessionId, hint);
    }
    setAgentActivityLines([]);
    setLastAgentActivity(null);
    setAssistantReveal(null);
    setLoading(true);

    const modelForSend = getIdeChatModelById(selectedModelId);
    if (
      composerMode === 'chat' &&
      workspacePath &&
      wantsWorkspaceExecutionIntent(currentInput) &&
      modelForSend?.provider !== 'openai' &&
      modelForSend?.provider !== 'xai'
    ) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'That looks like a **run / install / build** request. **Agent** mode with **OpenAI** or **Grok** can execute workspace tools; the current model is text-only here. Switch model + Composer to **Agent**, then send again.',
          timestamp: Date.now(),
          error: true
        }
      ]);
      setLoading(false);
      ideRunIdRef.current = null;
      return;
    }

    let effectiveComposerMode: ComposerModeId = composerMode;
    if (
      composerMode === 'chat' &&
      workspacePath &&
      wantsWorkspaceExecutionIntent(currentInput) &&
      (modelForSend?.provider === 'openai' || modelForSend?.provider === 'xai')
    ) {
      effectiveComposerMode = 'agent';
      setComposerMode('agent');
    }
    const isGameMode = isGameDevMode;

    const historyForApi = [...messages, userMessage].slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content
    }));

    const pushAssistantMessage = (
      content: string,
      toolCalls?: Array<{ tool: string; result: any }>,
      error?: boolean,
      stream: boolean = true
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
            error
          }
        ];
      });
    };

    try {
      const api = getElectronAPI();

      // 0) Cursor-like: serve attached / resolved folder and open browser (local IPC, not LLM-only steps)
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
        effectiveComposerMode === 'agent' &&
        (modelMeta?.provider === 'openai' || modelMeta?.provider === 'xai') &&
        !workspacePath
      ) {
        pushAssistantMessage(
          'Agent mode needs a workspace folder open so local tools can read files. Use Open folder in the Explorer, then try again.',
          undefined,
          true
        );
        return;
      }

      const useAgentToolLoop =
        effectiveComposerMode === 'agent' &&
        !!workspacePath &&
        (modelMeta?.provider === 'openai' || modelMeta?.provider === 'xai') &&
        !!api?.agentTurn &&
        !!api?.agentExecuteTool;

      if (useAgentToolLoop) {
        const priorForAgent = buildAgentPriorMessagesFromThread(
          messages.slice(-(MAX_HISTORY - 1))
        );
        const contextPack = isGameMode ? getGameDevContextPack() : getAgentContextPack();
        const out = await runIdeAgentLoop(
          {
            agentTurn: (b, runId) => api.agentTurn(b, runId),
            agentExecuteTool: (p) => api.agentExecuteTool(p),
            isCancelled: () => cancelAgentRunRef.current
          },
          {
            userText: currentInput,
            model: selectedModelId,
            workspacePath,
            referencedPaths,
            fromAvatarId: avatarId ?? undefined,
            contextPack,
            priorMessages: priorForAgent,
            onActivityLine: (line) => {
              setAgentActivityLines((prev) => [...prev, line]);
            },
            runId: sendRunId
          }
        );
        setLastAgentActivity(out.activityLog.length > 0 ? [...out.activityLog] : null);
        setAgentActivityLines([]);
        if (out.error) {
          const stopped =
            out.cancelled === true ||
            out.error === 'Stopped.' ||
            out.error === 'Stopped';
          pushAssistantMessage(
            stopped
              ? '**Stopped.** Generation was cancelled (no further tool or model steps will run for this request).'
              : `❌ ${out.error}`,
            undefined,
            !stopped
          );
        } else {
          pushAssistantMessage(
            out.finalText,
            mapRecordedToolOutputsToMessageToolCalls(out.recordedToolOutputs),
            false
          );
        }
        return;
      }

      // 1) Try OASIS agent first when default agent ID is set
      if (defaultAgentId && api?.chatWithAgent) {
        const result = await api.chatWithAgent(
          defaultAgentId,
          currentInput,
          conversationId,
          historyForApi,
          avatarId ?? undefined,
          selectedModelId,
          workspacePath ?? undefined,
          referencedPaths,
          getAgentContextPack()
        );
        if (!result.error && (result.content || (result.toolCalls && result.toolCalls.length > 0))) {
          pushAssistantMessage(result.content || '', result.toolCalls, false);
          return;
        }
        // Agent failed (error or empty) — fall through to fallback
      }

      // 2) Fallback: local LLM when available
      if (hasLLM && api?.chatComplete) {
        const localUser =
          buildLocalIdeContextPrefix(workspacePath, referencedPaths) + currentInput;
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
        const response = await aiAssistant.processMessage(
          buildLocalIdeContextPrefix(workspacePath, referencedPaths) + currentInput
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

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (loading && !input.trim()) {
        handleStopGeneration();
        return;
      }
      if (input.trim()) {
        void handleSendMessage(input);
      }
    }
  };

  const backendLabel = agentToolLoopReady
    ? isGameDevMode
      ? 'Game Dev (tools on)'
      : 'ONODE agent (tools)'
    : composerMode === 'agent' &&
        (modelMeta?.provider === 'openai' || modelMeta?.provider === 'xai') &&
        !workspacePath
      ? 'Agent: open workspace folder'
      : composerMode === 'agent' &&
          modelMeta &&
          modelMeta.provider !== 'openai' &&
          modelMeta.provider !== 'xai'
        ? 'Agent: use OpenAI or Grok'
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
    return (
      <div key={index} className={`composer-message ${msg.role} ${msg.error ? 'error' : ''}`}>
        <div className="composer-message-label">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
        <div
          className={`composer-message-body composer-message-body--markdown${
            streamingAssistant ? ' composer-message-body--streaming' : ''
          }`}
        >
          <ComposerMarkdownBody text={displayText} />
          {streamingAssistant ? <span className="composer-stream-caret" aria-hidden /> : null}
        </div>
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

      <div className="composer-messages" ref={messagesScrollRef}>
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
              {agentActivityLines.length > 0 ? (
                <details open className="composer-activity-live">
                  <summary className="composer-activity-live-summary">
                    <span className="typing-indicator">Working</span>
                    <span className="composer-activity-count">
                      {agentActivityLines.length}{' '}
                      {agentActivityLines.length === 1 ? 'step' : 'steps'}
                    </span>
                  </summary>
                  <ol className="composer-activity-list">
                    {agentActivityLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </details>
              ) : (
                <span className="typing-indicator">Thinking</span>
              )}
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
        <div ref={messagesEndRef} />
      </div>

      {lastAgentActivity && lastAgentActivity.length > 0 && (
        <details className="composer-activity-summary">
          <summary className="composer-activity-summary-title">
            Last request — {lastAgentActivity.length}{' '}
            {lastAgentActivity.length === 1 ? 'step' : 'steps'}
          </summary>
          <ol className="composer-activity-list">
            {lastAgentActivity.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
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

      <div className="composer-review-row composer-review-row--stub" aria-label="Suggested edits (preview)">
        <button type="button" className="composer-review-btn" disabled title="Coming when inline patch apply ships">
          Review
        </button>
        <button type="button" className="composer-review-btn" disabled title="Keep all AI edits">
          Keep All
        </button>
        <button type="button" className="composer-review-btn" disabled title="Undo AI edits in this turn">
          Undo All
        </button>
      </div>

      {isGameDevMode && <GameToolPalette />}

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

      <div className="composer-input-shell">
        <textarea
          className="composer-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={
            !canSend
              ? 'Connect OASIS or set local API keys…'
              : loading
                ? 'Cancel: press Enter with empty input, or use Stop — Shift+Enter for newline'
                : 'Plan, ask for edits…   / for commands   ·   @ for context'
          }
          disabled={!canSend}
          rows={3}
          spellCheck={false}
        />
        <div className="composer-input-footer">
          <label className="composer-footer-model">
            <span className="visually-hidden">Mode</span>
            <select
              value={composerMode}
              onChange={(e) => setComposerMode(e.target.value as ComposerModeId)}
              title="Chat: text-only via ONODE or local LLM (no read_file / terminal). Agent: OpenAI or Grok with workspace tools and live step list."
            >
              <option value="chat">Chat</option>
              <option value="agent">Agent</option>
            </select>
          </label>
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
            className={`composer-mode-pill composer-mode-pill--${composerMode}`}
            title={
              composerMode === 'agent'
                ? 'Tools on: file read, list dir, commands, MCP (needs OpenAI or Grok + workspace).'
                : 'Tools off: faster text-only replies; no automatic repo inspection.'
            }
          >
            {composerMode === 'agent' ? 'Tools on' : 'Tools off'}
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
            disabled={!canSend || (!loading && !input.trim())}
          >
            {loading ? 'Stop' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};
