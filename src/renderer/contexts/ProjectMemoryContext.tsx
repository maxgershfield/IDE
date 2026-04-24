import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useAuth } from './AuthContext';
import { useWorkspace } from './WorkspaceContext';
import { makeIdeProjectMemoryKey } from '../utils/ideThreadKey';
import { loadWorkspaceRulesText } from '../utils/workspaceRules';
import type { ProjectMemoryPayload } from '../../shared/projectMemoryTypes';
import { PROJECT_MEMORY_TEXT_MAX } from '../../shared/projectMemoryTypes';
import { isNothingToAddSummary } from '../../shared/projectMemorySummarize';

const LOCAL_TEXT_PREFIX = 'oasis-ide-project-memory-text-';
const LOCAL_ROOT_PREFIX = 'oasis-ide-project-memory-rootid-';
const AUTO_LOG_KEY = 'oasis-ide-project-memory-auto-log';

function loadLocalText(memoryKey: string): string {
  try {
    const raw = localStorage.getItem(`${LOCAL_TEXT_PREFIX}${memoryKey}`);
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
}

function saveLocalText(memoryKey: string, text: string): void {
  try {
    localStorage.setItem(`${LOCAL_TEXT_PREFIX}${memoryKey}`, text);
  } catch {
    /* ignore */
  }
}

function loadRootHolonId(memoryKey: string): string | null {
  try {
    return localStorage.getItem(`${LOCAL_ROOT_PREFIX}${memoryKey}`);
  } catch {
    return null;
  }
}

function saveRootHolonId(memoryKey: string, id: string): void {
  try {
    localStorage.setItem(`${LOCAL_ROOT_PREFIX}${memoryKey}`, id);
  } catch {
    /* ignore */
  }
}

function loadAutoLogTurnsDefaultOn(): boolean {
  try {
    const v = localStorage.getItem(AUTO_LOG_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
    return true;
  } catch {
    return true;
  }
}

function parseMemoryJson(raw: string): string {
  try {
    const o = JSON.parse(raw) as unknown;
    if (o && typeof o === 'object' && 'text' in o) {
      const t = (o as ProjectMemoryPayload).text;
      if (typeof t === 'string') {
        return t.length > PROJECT_MEMORY_TEXT_MAX ? t.slice(0, PROJECT_MEMORY_TEXT_MAX) : t;
      }
    }
  } catch {
    /* ignore */
  }
  return '';
}

function serializeMemoryJson(text: string): string {
  const t = text.length > PROJECT_MEMORY_TEXT_MAX ? text.slice(0, PROJECT_MEMORY_TEXT_MAX) : text;
  const payload: ProjectMemoryPayload = {
    updatedAt: new Date().toISOString(),
    text: t
  };
  return JSON.stringify(payload);
}

export interface ProjectMemoryContextValue {
  memoryKey: string;
  text: string;
  setText: (v: string) => void;
  memoryModalOpen: boolean;
  setMemoryModalOpen: (v: boolean) => void;
  syncState: 'idle' | 'synced' | 'error';
  loggedIn: boolean;
  /** True when `.oasiside/rules.md` or `.OASIS_IDE/rules.md` exists and has content. */
  workspaceRulesHint: boolean;
  /** Append compact line after agent reply (default on). */
  autoLogTurns: boolean;
  setAutoLogTurns: (v: boolean) => void;
  /** Called after a successful Agent-mode turn when `autoLogTurns` is true. */
  appendAutoTurnLine: (userPreview: string, assistantPreview: string) => void;
  /** Append LLM-produced markdown bullets from "Summarize chat" (dedupes "(nothing to add)"). */
  appendChatSummaryBlock: (markdown: string) => void;
}

const ProjectMemoryContext = createContext<ProjectMemoryContextValue | null>(null);

export function ProjectMemoryProvider({ children }: { children: React.ReactNode }) {
  const { avatarId, loggedIn } = useAuth();
  const { workspacePath } = useWorkspace();

  const memoryKey = useMemo(
    () => makeIdeProjectMemoryKey(avatarId, workspacePath),
    [avatarId, workspacePath]
  );

  const [text, setTextState] = useState('');
  const [syncState, setSyncState] = useState<'idle' | 'synced' | 'error'>('idle');
  const [remoteLoadDone, setRemoteLoadDone] = useState(false);
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [workspaceRulesHint, setWorkspaceRulesHint] = useState(false);
  const [autoLogTurns, setAutoLogTurnsState] = useState(loadAutoLogTurnsDefaultOn);

  const rootHolonIdRef = useRef<string | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const autoLogTurnsRef = useRef(autoLogTurns);
  autoLogTurnsRef.current = autoLogTurns;

  const setAutoLogTurns = useCallback((v: boolean) => {
    setAutoLogTurnsState(v);
    try {
      localStorage.setItem(AUTO_LOG_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const setText = useCallback((v: string) => {
    const next = v.length > PROJECT_MEMORY_TEXT_MAX ? v.slice(0, PROJECT_MEMORY_TEXT_MAX) : v;
    setTextState(next);
  }, []);

  const appendAutoTurnLine = useCallback((userPreview: string, assistantPreview: string) => {
    if (!autoLogTurnsRef.current) return;
    const u = userPreview.trim().replace(/\s+/g, ' ');
    const a = assistantPreview.trim().replace(/\s+/g, ' ');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const line = `[${stamp}] ${u.slice(0, 100)}${u.length > 100 ? '…' : ''}\n  → ${a.slice(0, 180)}${a.length > 180 ? '…' : ''}\n\n`;
    setTextState((prev) => {
      const merged = (prev.trim() ? prev + '\n\n' : '') + line;
      if (merged.length <= PROJECT_MEMORY_TEXT_MAX) return merged;
      return merged.slice(-PROJECT_MEMORY_TEXT_MAX);
    });
  }, []);

  const appendChatSummaryBlock = useCallback((markdown: string) => {
    const block = markdown.trim();
    if (!block || isNothingToAddSummary(block)) return;
    const header = `\n\n---\n\n## Summarized from Composer chat (${new Date().toISOString().slice(0, 19).replace('T', ' ')})\n\n`;
    setTextState((prev) => {
      const merged = (prev.trim() ? prev : '') + header + block;
      if (merged.length <= PROJECT_MEMORY_TEXT_MAX) return merged;
      return merged.slice(-PROJECT_MEMORY_TEXT_MAX);
    });
  }, []);

  useEffect(() => {
    if (!workspacePath) {
      setWorkspaceRulesHint(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const rules = await loadWorkspaceRulesText(workspacePath);
      if (!cancelled) setWorkspaceRulesHint(!!rules && rules.length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspacePath]);

  useEffect(() => {
    const local = loadLocalText(memoryKey);
    setTextState(local);
    rootHolonIdRef.current = loadRootHolonId(memoryKey);
    setSyncState('idle');
    setRemoteLoadDone(false);
  }, [memoryKey]);

  useEffect(() => {
    if (!loggedIn) {
      setSyncState('idle');
      setRemoteLoadDone(true);
      return;
    }
    const api = (window as any).electronAPI;
    if (!api?.projectMemoryHolonLoad) {
      setRemoteLoadDone(true);
      return;
    }

    let cancelled = false;
    setRemoteLoadDone(false);
    (async () => {
      const res = await api.projectMemoryHolonLoad(memoryKey);
      if (cancelled) return;
      if (res.error) {
        setSyncState('error');
        setRemoteLoadDone(true);
        return;
      }
      if (res.memoryJson) {
        const parsed = parseMemoryJson(res.memoryJson);
        if (parsed.length > 0) {
          setTextState(parsed);
          saveLocalText(memoryKey, parsed);
        }
      }
      if (res.rootHolonId) {
        rootHolonIdRef.current = res.rootHolonId;
        saveRootHolonId(memoryKey, res.rootHolonId);
      }
      setSyncState('synced');
      setRemoteLoadDone(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [loggedIn, memoryKey]);

  useEffect(() => {
    saveLocalText(memoryKey, text);
  }, [memoryKey, text]);

  useEffect(() => {
    if (!loggedIn || !remoteLoadDone) return;
    const api = (window as any).electronAPI;
    if (!api?.projectMemoryHolonSave) return;

    const timer = window.setTimeout(() => {
      const memoryJson = serializeMemoryJson(textRef.current);
      api
        .projectMemoryHolonSave({
          memoryKey,
          workspaceRoot: workspacePath,
          rootHolonId: rootHolonIdRef.current,
          memoryJson
        })
        .then((res: { rootHolonId?: string; error?: string }) => {
          if (res.rootHolonId) {
            rootHolonIdRef.current = res.rootHolonId;
            saveRootHolonId(memoryKey, res.rootHolonId);
          }
          if (res.error) {
            setSyncState('error');
            console.warn('[Project memory] holon save:', res.error);
          } else {
            setSyncState('synced');
          }
        })
        .catch((e: unknown) => {
          setSyncState('error');
          console.warn('[Project memory] holon save failed:', e);
        });
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [loggedIn, remoteLoadDone, memoryKey, workspacePath, text]);

  const value = useMemo<ProjectMemoryContextValue>(
    () => ({
      memoryKey,
      text,
      setText,
      memoryModalOpen,
      setMemoryModalOpen,
      syncState,
      loggedIn,
      workspaceRulesHint,
      autoLogTurns,
      setAutoLogTurns,
      appendAutoTurnLine,
      appendChatSummaryBlock
    }),
    [
      memoryKey,
      text,
      setText,
      memoryModalOpen,
      syncState,
      loggedIn,
      workspaceRulesHint,
      autoLogTurns,
      setAutoLogTurns,
      appendAutoTurnLine,
      appendChatSummaryBlock
    ]
  );

  return (
    <ProjectMemoryContext.Provider value={value}>{children}</ProjectMemoryContext.Provider>
  );
}

export function useProjectMemory(): ProjectMemoryContextValue {
  const ctx = useContext(ProjectMemoryContext);
  if (!ctx) {
    throw new Error('useProjectMemory must be used within ProjectMemoryProvider');
  }
  return ctx;
}
