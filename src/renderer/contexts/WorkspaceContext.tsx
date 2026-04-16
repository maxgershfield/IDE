import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { StarWorkspaceConfig } from '../../shared/starWorkspaceTypes';

const LAST_WORKSPACE_KEY = 'oasis:last-workspace';

export interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
  isDirectory: boolean;
}

interface WorkspaceContextValue {
  workspacePath: string | null;
  tree: TreeNode[];
  openFilePath: string | null;
  fileContent: string;
  dirty: boolean;
  /** Parsed .star-workspace.json for the current workspace, or null if absent. */
  starWorkspaceConfig: StarWorkspaceConfig | null;
  pickWorkspace: () => Promise<void>;
  refreshTree: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  setFileContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  save: () => Promise<void>;
  /** Re-reads .star-workspace.json from the current workspace root. */
  reloadStarWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [fileContent, setFileContentState] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [starWorkspaceConfig, setStarWorkspaceConfig] = useState<StarWorkspaceConfig | null>(null);

  const reloadStarWorkspace = useCallback(async () => {
    const raw = await window.electronAPI?.readStarWorkspace?.();
    setStarWorkspaceConfig((raw as StarWorkspaceConfig | null) ?? null);
  }, []);

  /** Internal: open a workspace by absolute path, no dialog. */
  const openWorkspaceByPath = useCallback(async (path: string) => {
    const list = await window.electronAPI?.setWorkspacePath?.(path) ?? [];
    setWorkspacePath(path);
    setTree(list as TreeNode[]);
    setOpenFilePath(null);
    setFileContentState('');
    setDirty(false);
    const raw = await window.electronAPI?.readStarWorkspace?.();
    setStarWorkspaceConfig((raw as StarWorkspaceConfig | null) ?? null);
    localStorage.setItem(LAST_WORKSPACE_KEY, path);
  }, []);

  // Restore the last workspace on first mount so the user never has to re-pick it.
  useEffect(() => {
    const saved = localStorage.getItem(LAST_WORKSPACE_KEY);
    if (saved && typeof window.electronAPI?.setWorkspacePath === 'function') {
      openWorkspaceByPath(saved).catch(() => {
        // Saved path no longer exists — clear it
        localStorage.removeItem(LAST_WORKSPACE_KEY);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickWorkspace = useCallback(async () => {
    if (!window.electronAPI?.pickWorkspace) return;
    const path = await window.electronAPI.pickWorkspace();
    if (path) {
      await openWorkspaceByPath(path);
    }
  }, [openWorkspaceByPath]);

  const refreshTree = useCallback(async () => {
    if (!workspacePath || !window.electronAPI?.listTree) return;
    const list = await window.electronAPI.listTree();
    setTree(list ?? []);
  }, [workspacePath]);

  const openFile = useCallback(async (path: string) => {
    if (!window.electronAPI?.readFile) return;
    try {
      const content = await window.electronAPI.readFile(path);
      setOpenFilePath(path);
      setFileContentState(content);
      setDirty(false);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, []);

  const setFileContent = useCallback((content: string) => {
    setFileContentState(content);
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!openFilePath || !window.electronAPI?.writeFile) return;
    try {
      await window.electronAPI.writeFile(openFilePath, fileContent);
      setDirty(false);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [openFilePath, fileContent]);

  const value: WorkspaceContextValue = {
    workspacePath,
    tree,
    openFilePath,
    fileContent,
    dirty,
    starWorkspaceConfig,
    pickWorkspace,
    refreshTree,
    openFile,
    setFileContent,
    setDirty,
    save,
    reloadStarWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
