import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface EditorTabContextValue {
  /** null = file/editor view is active; a string = that builder tab is active */
  activeBuilderTab: string | null;
  openBuilderTab: (builderId: string) => void;
  closeBuilderTab: () => void;
  /** Called by GameBuilderPane when the user submits a form */
  submitBuilderMessage: (message: string) => void;
  /** Called by ComposerSessionPanel to register the send handler */
  registerSubmitHandler: (fn: (message: string) => void) => void;
}

const EditorTabContext = createContext<EditorTabContextValue>({
  activeBuilderTab: null,
  openBuilderTab: () => {},
  closeBuilderTab: () => {},
  submitBuilderMessage: () => {},
  registerSubmitHandler: () => {}
});

export const EditorTabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeBuilderTab, setActiveBuilderTab] = useState<string | null>(null);
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
    // Auto-close the builder tab after submitting
    setActiveBuilderTab(null);
  }, []);

  return (
    <EditorTabContext.Provider
      value={{ activeBuilderTab, openBuilderTab, closeBuilderTab, submitBuilderMessage, registerSubmitHandler }}
    >
      {children}
    </EditorTabContext.Provider>
  );
};

export function useEditorTab(): EditorTabContextValue {
  return useContext(EditorTabContext);
}
