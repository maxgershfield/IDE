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
import { makeIdeThreadKey } from '../utils/ideThreadKey';

/** Max paths attached to a single composer send (matches ONODE cap). */
export const IDE_CHAT_MAX_REF_PATHS = 32;

const REGISTRY_PREFIX = 'oasis-ide-registry-v1-';

export interface IdeChatSession {
  id: string;
  title: string;
}

interface SessionRegistry {
  sessions: IdeChatSession[];
  activeId: string;
}

export interface IdeChatContextValue {
  /** Absolute paths attached for the **active** session. */
  referencedPaths: string[];
  addReference: (path: string) => void;
  removeReference: (path: string) => void;
  clearReferences: () => void;
  /** New session + paths (Explorer “new chat here”). */
  requestNewChatWithPaths: (paths: string[]) => void;
  /** Bumped when a new session is created (legacy consumers). */
  newChatCounter: number;

  sessions: IdeChatSession[];
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  createEmptySession: () => string;
  closeSession: (id: string) => void;
  setSessionTitle: (id: string, title: string) => void;
  /** Attachment paths for a specific session (active session is still the default for Explorer add). */
  getReferencedPathsForSession: (sessionId: string) => string[];
}

const IdeChatContext = createContext<IdeChatContextValue | null>(null);

function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function loadRegistry(baseKey: string): SessionRegistry | null {
  try {
    const raw = localStorage.getItem(`${REGISTRY_PREFIX}${baseKey}`);
    if (!raw) return null;
    const o = JSON.parse(raw) as SessionRegistry;
    if (!Array.isArray(o.sessions) || o.sessions.length === 0) return null;
    const sessions = o.sessions.filter((s) => s && typeof s.id === 'string' && s.id.length > 0);
    if (sessions.length === 0) return null;
    const hasMain = sessions.some((s) => s.id === 'main');
    const normalized = hasMain
      ? sessions
      : [{ id: 'main', title: 'Main' }, ...sessions];
    const activeId =
      typeof o.activeId === 'string' && normalized.some((s) => s.id === o.activeId)
        ? o.activeId
        : normalized[0].id;
    return { sessions: normalized, activeId };
  } catch {
    return null;
  }
}

function saveRegistry(baseKey: string, registry: SessionRegistry): void {
  try {
    localStorage.setItem(`${REGISTRY_PREFIX}${baseKey}`, JSON.stringify(registry));
  } catch {
    /* ignore */
  }
}

export function IdeChatProvider({ children }: { children: React.ReactNode }) {
  const { avatarId } = useAuth();
  const { workspacePath } = useWorkspace();
  const baseKey = useMemo(
    () => makeIdeThreadKey(avatarId, workspacePath, 'main'),
    [avatarId, workspacePath]
  );

  const [sessions, setSessions] = useState<IdeChatSession[]>([{ id: 'main', title: 'Main' }]);
  const [activeSessionId, setActiveSessionId] = useState('main');
  const [sessionRefs, setSessionRefs] = useState<Record<string, string[]>>({});
  const [newChatCounter, setNewChatCounter] = useState(0);

  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const registryLoadedFor = useRef<string | null>(null);
  /** After first registry effect for this avatar mount; enables no-workspace → folder tab handoff. */
  const registryWorkspaceInitRef = useRef(false);
  const prevWorkspaceForRegistryRef = useRef<string | null>(null);

  useEffect(() => {
    registryWorkspaceInitRef.current = false;
    prevWorkspaceForRegistryRef.current = null;
  }, [avatarId]);

  useEffect(() => {
    registryLoadedFor.current = null;
    const applyNoWorkspaceHandoff =
      registryWorkspaceInitRef.current &&
      workspacePath != null &&
      prevWorkspaceForRegistryRef.current === null;

    let loaded = loadRegistry(baseKey);
    if (!loaded && applyNoWorkspaceHandoff) {
      const noWsKey = makeIdeThreadKey(avatarId, null, 'main');
      if (noWsKey !== baseKey) {
        loaded = loadRegistry(noWsKey);
      }
    }
    if (loaded) {
      setSessions(loaded.sessions);
      setActiveSessionId(loaded.activeId);
    } else {
      setSessions([{ id: 'main', title: 'Main' }]);
      setActiveSessionId('main');
    }
    setSessionRefs({});
    registryLoadedFor.current = baseKey;

    registryWorkspaceInitRef.current = true;
    prevWorkspaceForRegistryRef.current = workspacePath ?? null;
  }, [baseKey, avatarId, workspacePath]);

  useEffect(() => {
    if (registryLoadedFor.current !== baseKey) return;
    const t = window.setTimeout(() => {
      saveRegistry(baseKey, { sessions, activeId: activeSessionId });
    }, 280);
    return () => window.clearTimeout(t);
  }, [baseKey, sessions, activeSessionId]);

  useEffect(() => {
    if (sessions.length === 0) return;
    if (!sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const referencedPaths = sessionRefs[activeSessionId] ?? [];

  const addReference = useCallback((path: string) => {
    const p = path.trim();
    if (!p) return;
    const sid = activeSessionIdRef.current;
    setSessionRefs((prev) => {
      const cur = prev[sid] ?? [];
      if (cur.includes(p)) return prev;
      const next = [...cur, p];
      const capped =
        next.length <= IDE_CHAT_MAX_REF_PATHS ? next : next.slice(next.length - IDE_CHAT_MAX_REF_PATHS);
      return { ...prev, [sid]: capped };
    });
  }, []);

  const removeReference = useCallback((path: string) => {
    const sid = activeSessionIdRef.current;
    setSessionRefs((prev) => {
      const cur = prev[sid] ?? [];
      const filtered = cur.filter((x) => x !== path);
      return { ...prev, [sid]: filtered };
    });
  }, []);

  const clearReferences = useCallback(() => {
    const sid = activeSessionIdRef.current;
    setSessionRefs((prev) => ({ ...prev, [sid]: [] }));
  }, []);

  const requestNewChatWithPaths = useCallback((paths: string[]) => {
    const cleaned = [...new Set(paths.map((p) => p.trim()).filter(Boolean))].slice(
      -IDE_CHAT_MAX_REF_PATHS
    );
    const id = newSessionId();
    const label =
      cleaned.length > 0
        ? (cleaned[0].split(/[/\\]/).filter(Boolean).pop() ?? 'New chat').slice(0, 48)
        : 'New chat';
    setSessions((prev) => [...prev, { id, title: label }]);
    setActiveSessionId(id);
    setSessionRefs((prev) => ({ ...prev, [id]: cleaned }));
    setNewChatCounter((c) => c + 1);
  }, []);

  const createEmptySession = useCallback(() => {
    const id = newSessionId();
    setSessions((prev) => [...prev, { id, title: `Chat ${prev.length + 1}` }]);
    setActiveSessionId(id);
    setNewChatCounter((c) => c + 1);
    return id;
  }, []);

  const closeSession = useCallback((id: string) => {
    if (id === 'main') return;
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return next.length > 0 ? next : [{ id: 'main', title: 'Main' }];
    });
    setSessionRefs((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    setActiveSessionId((cur) => (cur === id ? 'main' : cur));
  }, []);

  const setSessionTitle = useCallback((sessionId: string, title: string) => {
    const t = title.trim().slice(0, 56);
    if (!t) return;
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: t } : s)));
  }, []);

  const getReferencedPathsForSession = useCallback(
    (sessionId: string) => sessionRefs[sessionId] ?? [],
    [sessionRefs]
  );

  const value = useMemo<IdeChatContextValue>(
    () => ({
      referencedPaths,
      addReference,
      removeReference,
      clearReferences,
      requestNewChatWithPaths,
      newChatCounter,
      sessions,
      activeSessionId,
      setActiveSessionId,
      createEmptySession,
      closeSession,
      setSessionTitle,
      getReferencedPathsForSession
    }),
    [
      referencedPaths,
      addReference,
      removeReference,
      clearReferences,
      requestNewChatWithPaths,
      newChatCounter,
      sessions,
      activeSessionId,
      createEmptySession,
      closeSession,
      setSessionTitle,
      getReferencedPathsForSession
    ]
  );

  return <IdeChatContext.Provider value={value}>{children}</IdeChatContext.Provider>;
}

export function useIdeChat(): IdeChatContextValue {
  const ctx = useContext(IdeChatContext);
  if (!ctx) throw new Error('useIdeChat must be used within IdeChatProvider');
  return ctx;
}
