import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface EditorTabContextValue {
  /** null = file/editor view is active; a string = that builder tab is active */
  activeBuilderTab: string | null;
  openBuilderTab: (builderId: string) => void;
  closeBuilderTab: () => void;
  /**
   * Called by form-based builders (NPC, Quest, MissionArc, etc.) to submit a
   * structured message directly into the active chat session via the registered
   * send handler. Closes the builder tab automatically.
   */
  submitBuilderMessage: (message: string) => void;
  /** Called by ComposerSessionPanel to register the send handler */
  registerSubmitHandler: (fn: (message: string) => void) => void;
  /**
   * Set a text block that the composer should populate into its input field.
   * Use this instead of submitBuilderMessage when you want the user to review /
   * edit the text before sending (e.g. AI Generate prompts).
   * The composer clears it after consuming.
   */
  pendingComposerText: string | null;
  setPendingComposerText: (text: string) => void;
  clearPendingComposerText: () => void;
}

const EditorTabContext = createContext<EditorTabContextValue>({
  activeBuilderTab: null,
  openBuilderTab: () => {},
  closeBuilderTab: () => {},
  submitBuilderMessage: () => {},
  registerSubmitHandler: () => {},
  pendingComposerText: null,
  setPendingComposerText: () => {},
  clearPendingComposerText: () => {},
});

export const EditorTabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeBuilderTab, setActiveBuilderTab] = useState<string | null>(null);
  const [pendingComposerText, setPendingComposerTextState] = useState<string | null>(null);
  const submitHandlerRef = useRef<((message: string) => void) | null>(null);

  const openBuilderTab = useCallback((builderId: string) => {
    setActiveBuilderTab(builderId);
  }, []);

  const closeBuilderTab = useCallback(() => {
    setActiveBuilderTab(null);
  }, []);

  const registerSubmitHandler = useCallback((fn: (message: string) => void) => {
    submitHandlerRef.current = fn;
  }, []);

  const submitBuilderMessage = useCallback((message: string) => {
    submitHandlerRef.current?.(message);
    setActiveBuilderTab(null);
  }, []);

  const setPendingComposerText = useCallback((text: string) => {
    setPendingComposerTextState(text);
    // Close the builder tab so the composer is visible
    setActiveBuilderTab(null);
  }, []);

  const clearPendingComposerText = useCallback(() => {
    setPendingComposerTextState(null);
  }, []);

  return (
    <EditorTabContext.Provider
      value={{
        activeBuilderTab,
        openBuilderTab,
        closeBuilderTab,
        submitBuilderMessage,
        registerSubmitHandler,
        pendingComposerText,
        setPendingComposerText,
        clearPendingComposerText,
      }}
    >
      {children}
    </EditorTabContext.Provider>
  );
};

export function useEditorTab(): EditorTabContextValue {
  return useContext(EditorTabContext);
}
