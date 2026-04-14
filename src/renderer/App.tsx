import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { RightPanelShell } from './components/Layout/RightPanelShell';
import { StatusBar } from './components/Layout/StatusBar';
import { ChatInterface } from './components/Chat/ChatInterface';
import { FileExplorer } from './components/FileExplorer/FileExplorer';
import { Editor } from './components/Editor/Editor';
import { OASISToolsPanel } from './components/OASISTools/OASISToolsPanel';
import { AgentPanel } from './components/Agents/AgentPanel';
import { BottomPanel } from './components/BottomPanel/BottomPanel';
import { InboxPanel } from './components/Inbox/InboxPanel';
import { ThemeProvider } from './contexts/ThemeContext';
import { MCPProvider } from './contexts/MCPContext';
import { AgentProvider } from './contexts/AgentContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { IdeChatProvider } from './contexts/IdeChatContext';
import { AuthProvider } from './contexts/AuthContext';
import { LoginModal } from './components/Auth/LoginModal';
import { NonElectronBanner } from './components/Layout/NonElectronBanner';
import { GameDevProvider } from './contexts/GameDevContext';
import { EditorTabProvider } from './contexts/EditorTabContext';
import { ActivityBar, ActivityView } from './components/Layout/ActivityBar';
import { SearchPanel } from './components/FileExplorer/SearchPanel';
import type { ElevenLabsVoice, ElevenLabsAgentParams } from '../../shared/elevenLabsTypes';

declare global {
  interface Window {
    electronAPI: {
      /** Present in Electron; absent in Vite/browser-only dev. */
      platform?: string;
      listTools: () => Promise<any[]>;
      executeTool: (toolName: string, args: any) => Promise<any>;
      healthCheck: () => Promise<any>;
      discoverAgents: (serviceName?: string) => Promise<any[]>;
      invokeAgent: (agentId: string, task: string, context: any) => Promise<any>;
      pickWorkspace: () => Promise<string | null>;
      getWorkspacePath: () => Promise<string | null>;
      listTree: (dir?: string) => Promise<any[]>;
      readFile: (path: string) => Promise<string>;
      writeFile: (path: string, content: string) => Promise<void>;
      revealInFinder: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
      previewStaticFolder: (
        targetPath: string,
        openBrowser?: boolean
      ) => Promise<
        | { ok: true; url: string; port: number; root: string }
        | { ok: false; error: string }
      >;
      stopStaticPreview: () => Promise<{ ok: boolean; error?: string }>;
      agentExecuteTool: (payload: {
        toolCallId: string;
        name: string;
        argumentsJson: string;
      }) => Promise<
        | { ok: true; result: { toolCallId: string; content: string; isError?: boolean } }
        | { ok: false; error: string }
      >;
      agentTurn: (
        body: {
          model: string;
          messages: Array<{
            role: string;
            content?: string;
            toolCallId?: string;
            toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
          }>;
          workspaceRoot?: string | null;
          referencedPaths?: string[];
          fromAvatarId?: string;
          contextPack?: string | null;
        },
        runId: string
      ) => Promise<
        | {
            ok: true;
            kind: 'message' | 'tool_calls';
            content?: string;
            toolCalls?: Array<{ id: string; name: string; argumentsJson: string }>;
            finishReason?: string;
          }
        | { ok: false; error: string }
      >;
      agentTurnCancel: (runId: string) => Promise<{ ok: true }>;
      terminalCreate: (cwd?: string) => Promise<string>;
      terminalWrite: (sessionId: string, data: string) => Promise<void>;
      terminalResize: (sessionId: string, cols: number, rows: number) => Promise<void>;
      terminalDestroy: (sessionId: string) => Promise<void>;
      onTerminalData: (callback: (sessionId: string, data: string) => void) => () => void;
      authLogin: (username: string, password: string) => Promise<{ success: boolean; username?: string; avatarId?: string; error?: string }>;
      authLogout: () => Promise<void>;
      authGetStatus: () => Promise<{ loggedIn: boolean; username?: string; avatarId?: string }>;
      a2aGetPending: () => Promise<any[]>;
      a2aMarkProcessed: (messageId: string) => Promise<void>;
      a2aSendReply: (toAgentId: string, content: string, params?: Record<string, unknown>) => Promise<any>;
      chatHasLLM: () => Promise<boolean>;
      chatComplete: (
        messages: Array<{ role: string; content: string }>,
        model?: string
      ) => Promise<{ content: string; error?: string }>;
      chatGetDefaultAssistantAgentId: () => Promise<string>;
      chatWithAgent: (
        agentId: string,
        message: string,
        conversationId?: string,
        history?: Array<{ role: string; content: string }>,
        fromAvatarId?: string,
        model?: string,
        workspaceRoot?: string | null,
        referencedPaths?: string[],
        contextPack?: string
      ) => Promise<{ content: string; toolCalls?: any[]; error?: string }>;
      chatHolonSave: (payload: {
        threadKey: string;
        workspaceRoot?: string | null;
        rootHolonId?: string | null;
        messagesJson: string;
      }) => Promise<{ rootHolonId?: string; error?: string }>;
      chatHolonLoad: (threadKey: string) => Promise<{
        rootHolonId?: string;
        messagesJson?: string;
        error?: string;
      }>;
      readStarWorkspace: (workspacePath?: string) => Promise<Record<string, unknown> | null>;
      scaffoldTemplate: (
        engine: string,
        destDir: string,
        projectName: string
      ) => Promise<{ ok: boolean; files?: string[]; projectPath?: string; error?: string }>;
      openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
      checkPort: (port: number) => Promise<boolean>;
      // ElevenLabs NPC Voice Studio
      elevenlabsListVoices: () => Promise<
        { ok: true; voices: ElevenLabsVoice[] } | { ok: false; error: string }
      >;
      elevenlabsTts: (voiceId: string, text: string) => Promise<
        { ok: true; audioBase64: string } | { ok: false; error: string }
      >;
      elevenlabsCreateAgent: (params: ElevenLabsAgentParams) => Promise<
        { ok: true; agentId: string } | { ok: false; error: string }
      >;
    };
  }
}

function App() {
  const [mcpReady, setMcpReady] = useState(false);
  const [oasisReady, setOasisReady] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeView, setActiveView] = useState<ActivityView>('files');

  useEffect(() => {
    const p = window.electronAPI?.platform;
    if (p) {
      document.documentElement.dataset.platform = p;
    }
  }, []);

  useEffect(() => {
    // Check MCP and OASIS status
    const checkStatus = async () => {
      try {
        if (window.electronAPI) {
          const tools = await window.electronAPI.listTools();
          setMcpReady(tools.length > 0);
          
          const health = await window.electronAPI.healthCheck();
          setOasisReady(health.status === 'healthy');
        }
      } catch (error) {
        console.error('Status check failed:', error);
      }
    };

    checkStatus();
  }, []);

  return (
    <ThemeProvider>
      <GameDevProvider>
      <div className="app-shell">
        <NonElectronBanner />
        <div className="app-shell-body">
      <EditorTabProvider>
      <MCPProvider>
        <AgentProvider>
          <AuthProvider>
            <WorkspaceProvider>
              <IdeChatProvider>
              <div className="app-shell-workspace">
                <div className="workspace-main">
                  <Layout
                    activityBar={
                      <ActivityBar active={activeView} onChange={setActiveView} />
                    }
                  >
                    {activeView === 'search' ? (
                      <SearchPanel />
                    ) : (
                      <FileExplorer onLoginClick={() => setShowLoginModal(true)} />
                    )}
                    <Editor />
                    <RightPanelShell
                      composer={<ChatInterface />}
                      inbox={<InboxPanel embedded />}
                      tools={<OASISToolsPanel embedded />}
                    />
                    <BottomPanel />
                    <AgentPanel />
                  </Layout>
                </div>
                <StatusBar />
              </div>
              {showLoginModal && (
                <LoginModal onClose={() => setShowLoginModal(false)} />
              )}
              </IdeChatProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </AgentProvider>
      </MCPProvider>
      </EditorTabProvider>
        </div>
      </div>
      </GameDevProvider>
    </ThemeProvider>
  );
}

export default App;
