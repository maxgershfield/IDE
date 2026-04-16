import React from 'react';
import { useMCP } from '../../contexts/MCPContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { countWorkspaceFiles } from '../../utils/countWorkspaceFiles';
import { ComposerSessionPanel } from './ComposerSessionPanel';
import { TelegramTaskBanner } from './TelegramTaskBanner';
import './ChatInterface.css';

/**
 * Composer shell: multi-session tabs + one {@link ComposerSessionPanel} per session so each tab can run
 * its own agent loop concurrently (scoped ONODE abort via runId in the main process).
 */
export const ChatInterface: React.FC = () => {
  const { loading: mcpLoading, tools } = useMCP();
  const { workspacePath, tree } = useWorkspace();
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
