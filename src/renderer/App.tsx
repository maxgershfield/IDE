import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { RightPanelShell } from './components/Layout/RightPanelShell';
import { StatusBar } from './components/Layout/StatusBar';
import { ChatInterface } from './components/Chat/ChatInterface';
import { FileExplorer } from './components/FileExplorer/FileExplorer';
import { Editor } from './components/Editor/Editor';
import { OASISToolsPanel } from './components/OASISTools/OASISToolsPanel';
import { NPCVoicePanel } from './components/NPC/NPCVoicePanel';
import { MetaverseTemplatePanel } from './components/Templates/MetaverseTemplatePanel';
import { AgentPanel } from './components/Agents/AgentPanel';
import { BottomPanel } from './components/BottomPanel/BottomPanel';
import { InboxPanel } from './components/Inbox/InboxPanel';
import { ThemeProvider } from './contexts/ThemeContext';
import { MCPProvider } from './contexts/MCPContext';
import { AgentProvider } from './contexts/AgentContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { IdeChatProvider } from './contexts/IdeChatContext';
import { AuthProvider } from './contexts/AuthContext';
import { NonElectronBanner } from './components/Layout/NonElectronBanner';
import { GameDevProvider } from './contexts/GameDevContext';
import { EditorTabProvider } from './contexts/EditorTabContext';
import { ActivityBar, ActivityView } from './components/Layout/ActivityBar';
import { TitleBar } from './components/Layout/TitleBar';
import { SearchPanel } from './components/FileExplorer/SearchPanel';
import { StarnetDashboard } from './components/Starnet/StarnetDashboard';
import { SettingsProvider } from './contexts/SettingsContext';
import { SettingsModal } from './components/Settings/SettingsModal';
import { A2AProvider } from './contexts/A2AContext';
import type { ElevenLabsVoice, ElevenLabsAgentParams } from '../shared/elevenLabsTypes';
import type { ContentTemplateMeta } from '../shared/templateTypes';

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
      setWorkspacePath: (dir: string) => Promise<any[]>;
      listTree: (dir?: string) => Promise<any[]>;
      readFile: (path: string) => Promise<string | null>;
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
          executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
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
      authGetToken: () => Promise<string | null>;
      a2aGetPending: () => Promise<{ ok: boolean; messages: unknown[]; error?: string }>;
      a2aMarkProcessed: (messageId: string) => Promise<void>;
      a2aSendReply: (toAgentId: string, content: string, params?: Record<string, unknown>) => Promise<any>;
      a2aSend: (toAgentId: string, method: string, content: string) => Promise<{ ok: boolean; error?: string }>;
      telegramGetTasks: () => Promise<unknown[]>;
      telegramTaskDone: (taskId: string) => Promise<void>;
      onTelegramTask: (callback: (task: unknown) => void) => (() => void) | undefined;
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
      listTemplateMeta: () => Promise<{ ok: boolean; templates: ContentTemplateMeta[] }>;
      applyContentTemplate: (
        templateId: string,
        destDir: string,
        variables: Record<string, string>
      ) => Promise<{ ok: boolean; filesCreated?: string[]; projectPath?: string; error?: string }>;
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
      // Settings
      getSettings?: () => Promise<Record<string, unknown>>;
      setSettings?: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  }
}

function AppInner() {
  const [mcpReady, setMcpReady] = useState(false);
  const [oasisReady, setOasisReady] = useState(false);
  const [activeView, setActiveView] = useState<ActivityView>('files');

  useEffect(() => {
    const p = window.electronAPI?.platform;
    if (p) {
      document.documentElement.dataset.platform = p;
    }
  }, []);

  useEffect(() => {
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
                      <TitleBar />
                      <div className="workspace-main">
                        <Layout
                          activityBar={
                            <ActivityBar
                              active={activeView}
                              onChange={setActiveView}
                            />
                          }
                          centerSlot={
                            activeView === 'starnet' ? <StarnetDashboard /> : undefined
                          }
                        >
                          {activeView === 'search' ? (
                            <SearchPanel />
                          ) : activeView === 'templates' ? (
                            <MetaverseTemplatePanel inline />
                          ) : (
                            <FileExplorer />
                          )}
                          <Editor />
                          <RightPanelShell
                            composer={<ChatInterface />}
                            inbox={<InboxPanel embedded />}
                            tools={<OASISToolsPanel embedded />}
                            npcVoice={<NPCVoicePanel />}
                            agents={<AgentPanel />}
                          />
                          <BottomPanel />
                        </Layout>
                      </div>
                      <StatusBar />
                      {/* Settings overlay sits inside app-shell-workspace so TitleBar stays visible */}
                      <SettingsModal />
                    </div>
                  </IdeChatProvider>
                </WorkspaceProvider>
              </AuthProvider>
            </AgentProvider>
          </MCPProvider>
        </EditorTabProvider>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <GameDevProvider>
        <SettingsProvider>
          <A2AProvider>
            <AppInner />
          </A2AProvider>
        </SettingsProvider>
      </GameDevProvider>
    </ThemeProvider>
  );
}

export default App;
