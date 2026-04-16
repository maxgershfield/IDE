import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { RightPanelTabId } from '../components/Layout/RightPanelShell';

interface A2AContextValue {
  /** Agent ID to pre-fill in the compose pane, or null when not composing. */
  composeTarget: string | null;
  setComposeTarget: (agentId: string | null) => void;
  /** Active right-panel tab — lifted here so AgentPanel can switch to Inbox. */
  activeTab: RightPanelTabId;
  setActiveTab: (tab: RightPanelTabId) => void;
  /** Convenience: set compose target and switch to inbox in one call. */
  openComposeToAgent: (agentId: string) => void;
}

const A2AContext = createContext<A2AContextValue | undefined>(undefined);

export const A2AProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [composeTarget, setComposeTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RightPanelTabId>('composer');

  const openComposeToAgent = useCallback((agentId: string) => {
    setComposeTarget(agentId);
    setActiveTab('inbox');
  }, []);

  return (
    <A2AContext.Provider value={{ composeTarget, setComposeTarget, activeTab, setActiveTab, openComposeToAgent }}>
      {children}
    </A2AContext.Provider>
  );
};

export function useA2A(): A2AContextValue {
  const ctx = useContext(A2AContext);
  if (!ctx) throw new Error('useA2A must be used inside <A2AProvider>');
  return ctx;
}
