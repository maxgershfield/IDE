import React from 'react';
import { useMCP } from '../../contexts/MCPContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { countWorkspaceFiles } from '../../utils/countWorkspaceFiles';
import { Bookmark } from 'lucide-react';
import { ComposerSessionPanel } from './ComposerSessionPanel';
import { ProjectMemoryModal } from './ProjectMemoryModal';
import { useProjectMemory } from '../../contexts/ProjectMemoryContext';
import { TelegramTaskBanner } from './TelegramTaskBanner';
import './ChatInterface.css';

/**
 * Composer shell: multi-session tabs + one {@link ComposerSessionPanel} per session so each tab can run
 * its own agent loop concurrently (scoped ONODE abort via runId in the main process).
 */
export const ChatInterface: React.FC = () => {
  const { loading: mcpLoading, tools } = useMCP();
  const { workspacePath, tree } = useWorkspace();
  const { setMemoryModalOpen, text: memoryText } = useProjectMemory();
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createEmptySession,
    closeSession
  } = useIdeChat();
  const workspaceFileCount = countWorkspaceFiles(tree);

  return (
    <div className="chat-interface chat-interface--composer">
      <TelegramTaskBanner />
      <ProjectMemoryModal />
      <div className="composer-session-bar" role="tablist" aria-label="Chat sessions">
        <div className="composer-session-tabs">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`composer-session-tab${s.id === activeSessionId ? ' is-active' : ''}`}
              role="tab"
              aria-selected={s.id === activeSessionId}
            >
              <button
                type="button"
                className="composer-session-tab-main"
                onClick={() => {
                  if (s.id !== activeSessionId) {
                    setActiveSessionId(s.id);
                  }
                }}
              >
                {s.title}
              </button>
              {s.id !== 'main' && (
                <button
                  type="button"
                  className="composer-session-tab-close"
                  aria-label={`Close ${s.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(s.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="composer-session-new"
          title="New chat session"
          aria-label="New chat session"
          onClick={() => createEmptySession()}
        >
          +
        </button>
        <button
          type="button"
          className="composer-session-memory-btn"
          title="Project memory: extra notes for this workspace (included in agent requests automatically)"
          aria-label="Open project memory"
          onClick={() => setMemoryModalOpen(true)}
        >
          <Bookmark size={14} strokeWidth={2} aria-hidden />
          <span className="composer-session-memory-label">Memory</span>
          {memoryText.trim().length > 0 ? (
            <span className="composer-session-memory-badge" title="Has notes">
              ●
            </span>
          ) : null}
        </button>
        <span className="composer-session-mcp-hint" title="MCP tool count">
          {mcpLoading ? 'MCP …' : `${tools.length} tools`}
        </span>
      </div>

      <div className="composer-session-panels">
        {sessions.map((s) => (
          <ComposerSessionPanel
            key={s.id}
            sessionId={s.id}
            visible={s.id === activeSessionId}
            sessions={sessions}
            workspaceFileCount={workspaceFileCount}
          />
        ))}
      </div>
    </div>
  );
};
