/**
 * WorkspaceIndexContext
 *
 * Renderer-side state for the holonic codebase index.
 * Subscribes to push events from the main process and exposes index
 * status, start/cancel/delete actions, and a search helper.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useWorkspace } from './WorkspaceContext';

export type IndexPhase =
  | 'idle'
  | 'scanning'
  | 'reading'
  | 'embedding'
  | 'saving'
  | 'ready'
  | 'error';

export interface HolonicIndexStatus {
  phase: IndexPhase;
  holonsIndexed: number;
  holonsTotal: number;
  lastBuiltAt: number | null;
  hasEmbeddings: boolean;
  error: string | null;
}

const IDLE_STATUS: HolonicIndexStatus = {
  phase: 'idle',
  holonsIndexed: 0,
  holonsTotal: 0,
  lastBuiltAt: null,
  hasEmbeddings: false,
  error: null,
};

export interface WorkspaceIndexContextValue {
  status: HolonicIndexStatus;
  startIndexing: () => Promise<void>;
  cancelIndexing: () => Promise<void>;
  deleteIndex: () => Promise<void>;
  searchHolons: (
    query: string,
    limit?: number
  ) => Promise<Array<{ dirName: string; excerpt: string; score: number }>>;
}

const WorkspaceIndexContext = createContext<WorkspaceIndexContextValue | null>(null);

export function WorkspaceIndexProvider({ children }: { children: React.ReactNode }) {
  const { workspacePath } = useWorkspace();
  const [status, setStatus] = useState<HolonicIndexStatus>(IDLE_STATUS);

  /* Load stored index status whenever workspace changes */
  useEffect(() => {
    if (!workspacePath) {
      setStatus(IDLE_STATUS);
      return;
    }
    const api = window.electronAPI;
    if (!api?.holonicIndexLoadStatus) return;
    api
      .holonicIndexLoadStatus(workspacePath)
      .then((s: HolonicIndexStatus) => setStatus(s))
      .catch(() => setStatus(IDLE_STATUS));
  }, [workspacePath]);

  /* Subscribe to live progress events from main process */
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onHolonicIndexProgress) return;
    const unsub = api.onHolonicIndexProgress((s: unknown) => {
      setStatus(s as HolonicIndexStatus);
    });
    return unsub;
  }, []);

  const startIndexing = useCallback(async () => {
    if (!workspacePath || !window.electronAPI?.holonicIndexBuild) return;
    await window.electronAPI.holonicIndexBuild(workspacePath);
  }, [workspacePath]);

  const cancelIndexing = useCallback(async () => {
    if (!window.electronAPI?.holonicIndexCancel) return;
    await window.electronAPI.holonicIndexCancel();
  }, []);

  const deleteIndex = useCallback(async () => {
    if (!workspacePath || !window.electronAPI?.holonicIndexDelete) return;
    await window.electronAPI.holonicIndexDelete(workspacePath);
    setStatus(IDLE_STATUS);
  }, [workspacePath]);

  const searchHolons = useCallback(
    async (query: string, limit?: number) => {
      if (!workspacePath || !window.electronAPI?.holonicIndexSearch) return [];
      return window.electronAPI.holonicIndexSearch(workspacePath, query, limit);
    },
    [workspacePath]
  );

  return (
    <WorkspaceIndexContext.Provider
      value={{ status, startIndexing, cancelIndexing, deleteIndex, searchHolons }}
    >
      {children}
    </WorkspaceIndexContext.Provider>
  );
}

export function useWorkspaceIndex(): WorkspaceIndexContextValue {
  const ctx = useContext(WorkspaceIndexContext);
  if (!ctx) throw new Error('useWorkspaceIndex must be used within WorkspaceIndexProvider');
  return ctx;
}
