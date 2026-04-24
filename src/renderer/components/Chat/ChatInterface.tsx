import React from 'react';
import { useMCP } from '../../contexts/MCPContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { countWorkspaceFiles } from '../../utils/countWorkspaceFiles';
import { Bookmark } from 'lucide-react';
import { ComposerSessionPanel } from './ComposerSessionPanel';
import { ProjectMemoryModal } from './ProjectMemoryModal';
import { useProjectMemory } from '../../contexts/ProjectMemoryContext';
import { TelegramTaskBanner } from './TelegramTaskBanner';
import { IndexingStatusBar, IndexingReadyPill } from './IndexingStatusBar';
import './ChatInterface.css';

export const ChatInterface: React.FC = () => {
  const { loading: mcpLoading, tools } = useMCP();
  const { openSettings } = useSettings();
  const { tree } = useWorkspace();
  const { setMemoryModalOpen, text: memoryText } = useProjectMemory();
  const workspaceFileCount = countWorkspaceFiles(tree);

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createEmptySession,
    closeSession,
  } = useIdeChat();

  return (
    <div className="chat-interface chat-interface--composer">
      <TelegramTaskBanner />
      {!mcpLoading && tools.length === 0 ? (
        <div className="composer-mcp-missing-banner" role="status">
          <span>
            No MCP tools loaded. The IDE uses hosted MCP by default (see README). Check the main process
            log for <code>[MCP]</code> errors, network access to <code>mcp.oasisweb4.one</code>, or set{' '}
            <code>OASIS_MCP_TRANSPORT=stdio</code> and <code>OASIS_MCP_SERVER_PATH</code> for a local
            build. Then restart the IDE.
          </span>
          <button
            type="button"
            className="composer-mcp-missing-banner__btn"
            onClick={() => openSettings('mcp')}
          >
            Tools &amp; MCPs
          </button>
        </div>
      ) : null}
      <ProjectMemoryModal />
      <IndexingStatusBar />

      {/* ── Session tab bar ── */}
      <div className="composer-session-bar" aria-label="Chat sessions">
        <div className="composer-session-tabs" role="tablist">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const canClose = sessions.length > 1;
            return (
              <div
                key={session.id}
                className={`composer-session-tab${isActive ? ' is-active' : ''}`}
                role="tab"
                aria-selected={isActive}
              >
                <button
                  type="button"
                  className="composer-session-tab-main"
                  onClick={() => setActiveSessionId(session.id)}
                  title={session.title}
                >
                  {session.title}
                </button>
                {canClose && (
                  <button
                    type="button"
                    className="composer-session-tab-close"
                    onClick={(e) => { e.stopPropagation(); closeSession(session.id); }}
                    title="Close chat"
                    aria-label={`Close ${session.title}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="composer-session-new"
          onClick={() => createEmptySession()}
          title="New chat"
          aria-label="New chat"
        >
          <span aria-hidden>+</span>
          <span className="visually-hidden">New chat</span>
        </button>

        <IndexingReadyPill />

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

      {/* ── One panel per session; CSS visibility-switches via visible prop ── */}
      <div className="composer-session-panels">
        {sessions.map((session) => (
          <ComposerSessionPanel
            key={session.id}
            sessionId={session.id}
            visible={session.id === activeSessionId}
            workspaceFileCount={workspaceFileCount}
          />
        ))}
      </div>
    </div>
  );
};
