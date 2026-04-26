import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { RightPanelShell } from './components/Layout/RightPanelShell';
import { StatusBar } from './components/Layout/StatusBar';
import { FileExplorer } from './components/FileExplorer/FileExplorer';
import { ThemeProvider } from './contexts/ThemeContext';
import { MCPProvider } from './contexts/MCPContext';
import { AgentProvider } from './contexts/AgentContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { WorkspaceIndexProvider } from './contexts/WorkspaceIndexContext';
import { IdeChatProvider } from './contexts/IdeChatContext';
import { StarnetCatalogProvider } from './contexts/StarnetCatalogContext';
import { ProjectMemoryProvider } from './contexts/ProjectMemoryContext';
import { AuthProvider } from './contexts/AuthContext';
import { NonElectronBanner } from './components/Layout/NonElectronBanner';
import { GameDevProvider } from './contexts/GameDevContext';
import { EditorTabProvider } from './contexts/EditorTabContext';
import { OappBuildPlanProvider } from './contexts/OappBuildPlanContext';
import { HolonicCanvasProvider } from './contexts/HolonicCanvasContext';
import { ActivityBar, ActivityView } from './components/Layout/ActivityBar';
import { TitleBar } from './components/Layout/TitleBar';
import { FirstRunWelcomeBanner } from './components/Layout/FirstRunWelcomeBanner';
import { PortalActivityBanner } from './components/Layout/PortalActivityBanner';
import { SettingsProvider } from './contexts/SettingsContext';
import { A2AProvider } from './contexts/A2AContext';
import { DomainPackProvider } from './contexts/DomainPackContext';
import type { ElevenLabsVoice, ElevenLabsAgentParams } from '../shared/elevenLabsTypes';
import type { AgentActivityMeta } from '../shared/agentTurnTypes';
import type { ContentTemplateMeta } from '../shared/templateTypes';
import { useStarnetCatalogLoader } from './hooks/useStarnetCatalogLoader';
import { OASIS_SET_ACTIVITY_VIEW } from './utils/activityViewBridge';

const ChatInterface = lazy(() =>
  import('./components/Chat/ChatInterface').then((m) => ({ default: m.ChatInterface }))
);
const Editor = lazy(() =>
  import('./components/Editor/Editor').then((m) => ({ default: m.Editor }))
);
const BottomPanel = lazy(() =>
  import('./components/BottomPanel/BottomPanel').then((m) => ({ default: m.BottomPanel }))
);
const InboxPanel = lazy(() =>
  import('./components/Inbox/InboxPanel').then((m) => ({ default: m.InboxPanel }))
);
const OASISToolsPanel = lazy(() =>
  import('./components/OASISTools/OASISToolsPanel').then((m) => ({ default: m.OASISToolsPanel }))
);
const NPCVoicePanel = lazy(() =>
  import('./components/NPC/NPCVoicePanel').then((m) => ({ default: m.NPCVoicePanel }))
);
const AgentPanel = lazy(() =>
  import('./components/Agents/AgentPanel').then((m) => ({ default: m.AgentPanel }))
);
const SearchPanel = lazy(() =>
  import('./components/FileExplorer/SearchPanel').then((m) => ({ default: m.SearchPanel }))
);
const MetaverseTemplatePanel = lazy(() =>
  import('./components/Templates/MetaverseTemplatePanel').then((m) => ({ default: m.MetaverseTemplatePanel }))
);
const StarnetDashboard = lazy(() =>
  import('./components/Starnet/StarnetDashboard').then((m) => ({ default: m.StarnetDashboard }))
);
const GuideMapEditorPanel = lazy(() =>
  import('./components/GuideMap/GuideMapEditorPanel').then((m) => ({ default: m.GuideMapEditorPanel }))
);
const HolonicSuitesDashboard = lazy(() =>
  import('./components/HolonicSuites/HolonicSuitesDashboard').then((m) => ({ default: m.HolonicSuitesDashboard }))
);
const EntitlementSlotsPanel = lazy(() =>
  import('./components/Entitlements/EntitlementSlotsPanel').then((m) => ({ default: m.EntitlementSlotsPanel }))
);
const SettingsModal = lazy(() =>
  import('./components/Settings/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);

function LoadingPane({ label }: { label: string }) {
  return (
    <div
      role="status"
      style={{
        height: '100%',
        minHeight: 120,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-secondary)',
        fontSize: 13
      }}
    >
      {label}
    </div>
  );
}

function suspense(label: string, node: React.ReactNode): React.ReactElement {
  return <Suspense fallback={<LoadingPane label={label} />}>{node}</Suspense>;
}

/** Mounts the always-on STARNET catalog loader so the snapshot is populated for the Composer
 *  even when the STARNET activity view is not visible. */
function StarnetCatalogLoaderMount() {
  useStarnetCatalogLoader();
  return null;
}

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
      listRootLevel: () => Promise<any[]>;
      listDirShallow: (absPath: string) => Promise<any[]>;
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
        executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
      }) => Promise<
        | {
            ok: true;
            result: {
              toolCallId: string;
              content: string;
              isError?: boolean;
              activityMeta?: AgentActivityMeta;
            };
          }
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
      authRegister: (payload: {
        firstName: string;
        lastName: string;
        email: string;
        username: string;
        password: string;
        confirmPassword: string;
      }) => Promise<{ success: boolean; username?: string; avatarId?: string; error?: string }>;
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
      projectMemoryHolonSave: (payload: {
        memoryKey: string;
        workspaceRoot?: string | null;
        rootHolonId?: string | null;
        memoryJson: string;
      }) => Promise<{ rootHolonId?: string; error?: string }>;
      projectMemoryHolonLoad: (memoryKey: string) => Promise<{
        rootHolonId?: string;
        memoryJson?: string;
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
      copyOasisOnboardStarter: (parentDir: string, folderName: string) => Promise<
        | { ok: true; projectPath: string; folderName: string }
        | { ok: false; error: string }
      >;
      applyOasisOnboardBranding: (projectPath: string, description: string) => Promise<
        { ok: true } | { ok: false; error: string }
      >;
      bootstrapOasisOnboardStarter: (parentDir: string) => Promise<
        | {
            ok: true;
            projectPath: string;
            folderName: string;
            npmInstallOk: boolean;
            npmInstallLog: string;
          }
        | { ok: false; error: string }
      >;
      npmInstallInProject: (projectPath: string) => Promise<
        | { ok: true; npmOk: boolean; log: string; exitCode: number | null }
        | { ok: false; error: string }
      >;
      openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
      checkPort: (port: number) => Promise<boolean>;
      holonicIndexLoadStatus: (workspaceRoot: string) => Promise<any>;
      holonicIndexStatus: () => Promise<any>;
      holonicIndexBuild: (workspaceRoot: string) => Promise<{ ok: boolean }>;
      holonicIndexCancel: () => Promise<{ ok: boolean }>;
      holonicIndexDelete: (workspaceRoot: string) => Promise<{ ok: boolean }>;
      holonicIndexSearch: (workspaceRoot: string, query: string, limit?: number) => Promise<any[]>;
      holonicIndexAllowlistGet: (workspaceRoot: string) => Promise<{ filePath: string; names: string[] }>;
      holonicIndexAllowlistSet: (
        workspaceRoot: string,
        names: string[]
      ) => Promise<{ ok: true } | { ok: false; error: string }>;
      onHolonicIndexProgress: (callback: (status: any) => void) => () => void;
      pollPortalActivity: () => Promise<
        | {
            ok: true;
            a2aMessageCount: number;
            nftCount: number | null;
            a2aError?: string;
            starError?: string;
          }
        | { ok: false; error: string }
      >;
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
      /** Durable STARNET list cache (userData JSON). */
      starnetListCacheGet?: (key: string) => Promise<{
        storedAt: number;
        kind: 'holons' | 'oapps';
        payload: unknown;
      } | null>;
      starnetListCacheSet?: (
        key: string,
        entry: { storedAt: number; kind: 'holons' | 'oapps'; payload: unknown }
      ) => Promise<void>;
      starnetListCacheClear?: () => Promise<void>;
    };
  }
}

function AppInner() {
  const [mcpReady, setMcpReady] = useState(false);
  const [oasisReady, setOasisReady] = useState(false);
  const [activeView, setActiveView] = useState<ActivityView>('files');

  useEffect(() => {
    const onSetActivity = (e: Event) => {
      const v = (e as CustomEvent<{ view?: ActivityView }>).detail?.view;
      if (v) setActiveView(v);
    };
    window.addEventListener(OASIS_SET_ACTIVITY_VIEW, onSetActivity);
    return () => window.removeEventListener(OASIS_SET_ACTIVITY_VIEW, onSetActivity);
  }, []);

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
                  <WorkspaceIndexProvider>
                  <ProjectMemoryProvider>
                  <IdeChatProvider>
                    <OappBuildPlanProvider>
                    <DomainPackProvider>
                    <HolonicCanvasProvider>
                    <StarnetCatalogProvider>
                    <StarnetCatalogLoaderMount />
                    <div className="app-shell-workspace">
                      <TitleBar />
                      <FirstRunWelcomeBanner />
                      <PortalActivityBanner />
                      <div className="workspace-main">
                        <Layout
                          activityBar={
                            <ActivityBar
                              active={activeView}
                              onChange={setActiveView}
                            />
                          }
                          omitRightPanel={activeView === 'passes'}
                          centerSlot={
                            activeView === 'starnet' ? (
                              suspense('Loading STARNET…', <StarnetDashboard />)
                            ) : activeView === 'guide' ? (
                              suspense('Loading Guide Map…', <GuideMapEditorPanel />)
                            ) : activeView === 'suites' ? (
                              suspense('Loading Holonic Suites…', <HolonicSuitesDashboard />)
                            ) : activeView === 'passes' ? (
                              suspense('Loading passes…', <EntitlementSlotsPanel />)
                            ) : undefined
                          }
                        >
                          {activeView === 'search' ? (
                            suspense('Loading search…', <SearchPanel />)
                          ) : activeView === 'templates' ? (
                            suspense('Loading templates…', <MetaverseTemplatePanel inline />)
                          ) : (
                            <FileExplorer />
                          )}
                          {suspense('Loading editor…', <Editor />)}
                          <RightPanelShell
                            composer={suspense('Loading Composer…', <ChatInterface />)}
                            inbox={suspense('Loading A2A inbox…', <InboxPanel embedded />)}
                            tools={suspense('Loading OASIS tools…', <OASISToolsPanel embedded />)}
                            npcVoice={suspense('Loading NPC voice studio…', <NPCVoicePanel />)}
                            agents={suspense('Loading agents…', <AgentPanel />)}
                          />
                          {suspense('Loading terminal…', <BottomPanel />)}
                        </Layout>
                      </div>
                      <StatusBar />
                      {/* Settings overlay sits inside app-shell-workspace so TitleBar stays visible */}
                      {suspense('Loading settings…', <SettingsModal />)}
                    </div>
                    </StarnetCatalogProvider>
                    </HolonicCanvasProvider>
                    </DomainPackProvider>
                    </OappBuildPlanProvider>
                  </IdeChatProvider>
                  </ProjectMemoryProvider>
                  </WorkspaceIndexProvider>
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
