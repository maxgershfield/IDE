import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  /** Node `process.platform` for renderer layout (e.g. macOS title bar inset). */
  platform: process.platform,

  // MCP
  listTools: () => ipcRenderer.invoke('mcp:list-tools'),
  executeTool: (toolName: string, args: any) => 
    ipcRenderer.invoke('mcp:execute-tool', toolName, args),
  
  // OASIS API
  healthCheck: () => ipcRenderer.invoke('oasis:health-check'),
  starCliStatus: () => ipcRenderer.invoke('star-cli:status') as Promise<{ found: boolean; path: string | null; version: string | null }>,
  
  // Agents
  discoverAgents: (serviceName?: string) => 
    ipcRenderer.invoke('agents:discover', serviceName),
  invokeAgent: (agentId: string, task: string, context: any) =>
    ipcRenderer.invoke('agents:invoke', agentId, task, context),
  
  // File System
  pickWorkspace: () => ipcRenderer.invoke('fs:pick-workspace'),
  getWorkspacePath: () => ipcRenderer.invoke('fs:get-workspace-path'),
  setWorkspacePath: (dir: string) => ipcRenderer.invoke('fs:set-workspace', dir),
  listTree: (dir?: string) => ipcRenderer.invoke('fs:list-tree', dir),
  listRootLevel: () => ipcRenderer.invoke('fs:list-root-level'),
  listDirShallow: (absPath: string) => ipcRenderer.invoke('fs:list-dir-shallow', absPath),
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  writeFile: (path: string, content: string) =>
    ipcRenderer.invoke('fs:write-file', path, content),
  revealInFinder: (targetPath: string) => ipcRenderer.invoke('fs:reveal-in-finder', targetPath),
  readStarWorkspace: (workspacePath?: string) => ipcRenderer.invoke('fs:read-star-workspace', workspacePath),
  scaffoldTemplate: (engine: string, destDir: string, projectName: string) =>
    ipcRenderer.invoke('scaffold:template', engine, destDir, projectName),
  listTemplateMeta: () =>
    ipcRenderer.invoke('templates:list-meta'),
  applyContentTemplate: (templateId: string, destDir: string, variables: Record<string, string>) =>
    ipcRenderer.invoke('templates:apply-content', templateId, destDir, variables),
  copyOasisOnboardStarter: (parentDir: string, folderName: string) =>
    ipcRenderer.invoke('templates:copy-oasis-onboard-starter', parentDir, folderName) as Promise<
      | { ok: true; projectPath: string; folderName: string }
      | { ok: false; error: string }
    >,
  applyOasisOnboardBranding: (projectPath: string, description: string) =>
    ipcRenderer.invoke('templates:apply-oasis-onboard-branding', projectPath, description) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  bootstrapOasisOnboardStarter: (parentDir: string) =>
    ipcRenderer.invoke('templates:bootstrap-oasis-onboard-starter', parentDir) as Promise<
      | {
          ok: true;
          projectPath: string;
          folderName: string;
          npmInstallOk: boolean;
          npmInstallLog: string;
        }
      | { ok: false; error: string }
    >,
  npmInstallInProject: (projectPath: string) =>
    ipcRenderer.invoke('templates:npm-install-in-project', projectPath) as Promise<
      | { ok: true; npmOk: boolean; log: string; exitCode: number | null }
      | { ok: false; error: string }
    >,
  openUrl: (url: string) => ipcRenderer.invoke('shell:open-url', url),
  checkPort: (port: number) => ipcRenderer.invoke('check-port', port),
  /** A2A inbox + STAR NFT list counts; same sources the OASIS Portal uses for parity. */
  pollPortalActivity: () =>
    ipcRenderer.invoke('portal:poll-activity') as Promise<
      | {
          ok: true;
          a2aMessageCount: number;
          nftCount: number | null;
          a2aError?: string;
          starError?: string;
        }
      | { ok: false; error: string }
    >,

  // ElevenLabs NPC Voice Studio
  elevenlabsListVoices: () =>
    ipcRenderer.invoke('elevenlabs:list-voices'),
  elevenlabsTts: (voiceId: string, text: string) =>
    ipcRenderer.invoke('elevenlabs:tts', voiceId, text),
  elevenlabsCreateAgent: (params: { name: string; systemPrompt: string; firstMessage: string; voiceId: string }) =>
    ipcRenderer.invoke('elevenlabs:create-agent', params),

  /** Generate an image from a text prompt (+ optional reference image data URL) using Glif.app. */
  glifGenerateImage: (prompt: string, referenceImageDataUrl?: string, workflowId?: string) =>
    ipcRenderer.invoke('glif:generate-image', prompt, referenceImageDataUrl, workflowId),

  /** Serve folder via python3 http.server and open browser (IDE assistant). */
  previewStaticFolder: (targetPath: string, openBrowser?: boolean) =>
    ipcRenderer.invoke('ide:preview-static', targetPath, openBrowser),

  stopStaticPreview: () => ipcRenderer.invoke('ide:preview-stop'),

  agentExecuteTool: (payload: {
    toolCallId: string;
    name: string;
    argumentsJson: string;
    executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
  }) => ipcRenderer.invoke('agent:execute-tool', payload),

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
  ) => ipcRenderer.invoke('chat:agent-turn', { body, runId }),

  /** Abort one ONODE agent/turn by the same runId passed to agentTurn. */
  agentTurnCancel: (runId: string) => ipcRenderer.invoke('chat:agent-turn-cancel', runId),

  // Auth
  authLogin: (username: string, password: string) =>
    ipcRenderer.invoke('auth:login', username, password),
  authRegister: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    password: string;
    confirmPassword: string;
  }) => ipcRenderer.invoke('auth:register', payload),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  authGetStatus: () => ipcRenderer.invoke('auth:getStatus'),
  authGetToken: () => ipcRenderer.invoke('auth:getToken') as Promise<string | null>,
  /** Base URL for STAR WebAPI (matches MCP STAR_API_URL after startup resolve). */
  starGetResolvedApiUrl: () => ipcRenderer.invoke('star:getResolvedApiUrl') as Promise<string>,

  // Chat / LLM
  chatHasLLM: () => ipcRenderer.invoke('chat:hasLLM'),
  chatComplete: (messages: Array<{ role: string; content: string }>, model?: string) =>
    ipcRenderer.invoke('chat:complete', messages, model),
  chatGetDefaultAssistantAgentId: () => ipcRenderer.invoke('chat:getDefaultAssistantAgentId'),
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
  ) =>
    ipcRenderer.invoke(
      'chat:agent',
      agentId,
      message,
      conversationId,
      history,
      fromAvatarId,
      model,
      workspaceRoot,
      referencedPaths,
      contextPack
    ),

  chatHolonSave: (payload: {
    threadKey: string;
    workspaceRoot?: string | null;
    rootHolonId?: string | null;
    messagesJson: string;
  }) => ipcRenderer.invoke('chat:holon:save', payload),

  chatHolonLoad: (threadKey: string) => ipcRenderer.invoke('chat:holon:load', threadKey),

  projectMemoryHolonSave: (payload: {
    memoryKey: string;
    workspaceRoot?: string | null;
    rootHolonId?: string | null;
    memoryJson: string;
  }) => ipcRenderer.invoke('project-memory:holon:save', payload),

  projectMemoryHolonLoad: (memoryKey: string) =>
    ipcRenderer.invoke('project-memory:holon:load', memoryKey),

  // A2A Inbox
  a2aGetPending: () => ipcRenderer.invoke('a2a:getPending'),
  a2aMarkProcessed: (messageId: string) =>
    ipcRenderer.invoke('a2a:markProcessed', messageId),
  a2aSendReply: (toAgentId: string, content: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke('a2a:sendReply', toAgentId, content, params),
  a2aSend: (toAgentId: string, method: string, content: string) =>
    ipcRenderer.invoke('a2a:send', toAgentId, method, content),

  // Terminal
  terminalCreate: (cwd?: string) => ipcRenderer.invoke('terminal:create', cwd),
  terminalWrite: (sessionId: string, data: string) =>
    ipcRenderer.invoke('terminal:write', sessionId, data),
  terminalResize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
  terminalDestroy: (sessionId: string) =>
    ipcRenderer.invoke('terminal:destroy', sessionId),
  onTerminalData: (callback: (sessionId: string, data: string) => void) => {
    const handler = (_: unknown, payload: { sessionId: string; data: string }) =>
      callback(payload.sessionId, payload.data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },

  // Telegram bridge
  telegramGetTasks: () => ipcRenderer.invoke('telegram:getTasks'),
  telegramTaskDone: (taskId: string) => ipcRenderer.invoke('telegram:taskDone', taskId),
  onTelegramTask: (callback: (task: unknown) => void) => {
    const handler = (_: unknown, task: unknown) => callback(task);
    ipcRenderer.on('telegram:task', handler);
    return () => ipcRenderer.removeListener('telegram:task', handler);
  },

  // Holonic codebase index
  holonicIndexLoadStatus: (workspaceRoot: string) =>
    ipcRenderer.invoke('holon-index:load-status', workspaceRoot),
  holonicIndexStatus: () => ipcRenderer.invoke('holon-index:status'),
  holonicIndexBuild: (workspaceRoot: string) =>
    ipcRenderer.invoke('holon-index:build', workspaceRoot),
  holonicIndexCancel: () => ipcRenderer.invoke('holon-index:cancel'),
  holonicIndexDelete: (workspaceRoot: string) =>
    ipcRenderer.invoke('holon-index:delete', workspaceRoot),
  holonicIndexSearch: (workspaceRoot: string, query: string, limit?: number) =>
    ipcRenderer.invoke('holon-index:search', workspaceRoot, query, limit),
  holonicIndexAllowlistGet: (workspaceRoot: string) =>
    ipcRenderer.invoke('holon-allowlist:get', workspaceRoot) as Promise<{
      filePath: string;
      names: string[];
    }>,
  holonicIndexAllowlistSet: (
    workspaceRoot: string,
    names: string[]
  ) =>
    ipcRenderer.invoke('holon-allowlist:set', workspaceRoot, names) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  onHolonicIndexProgress: (callback: (status: unknown) => void) => {
    const handler = (_: unknown, status: unknown) => callback(status);
    ipcRenderer.on('holon-index:progress', handler);
    return () => ipcRenderer.removeListener('holon-index:progress', handler);
  },

  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, unknown>>,
  setSettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:set', patch) as Promise<Record<string, unknown>>,

  /** Persisted STARNET OAPP/holon list payloads (userData JSON). */
  starnetListCacheGet: (key: string) =>
    ipcRenderer.invoke('starnet-list-cache:get', key) as Promise<{
      storedAt: number;
      kind: 'holons' | 'oapps';
      payload: unknown;
    } | null>,
  starnetListCacheSet: (
    key: string,
    entry: { storedAt: number; kind: 'holons' | 'oapps'; payload: unknown }
  ) => ipcRenderer.invoke('starnet-list-cache:set', key, entry),
  starnetListCacheClear: () => ipcRenderer.invoke('starnet-list-cache:clear'),
});
