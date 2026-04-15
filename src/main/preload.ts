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
  listTree: (dir?: string) => ipcRenderer.invoke('fs:list-tree', dir),
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
  openUrl: (url: string) => ipcRenderer.invoke('shell:open-url', url),
  checkPort: (port: number) => ipcRenderer.invoke('check-port', port),

  // ElevenLabs NPC Voice Studio
  elevenlabsListVoices: () =>
    ipcRenderer.invoke('elevenlabs:list-voices'),
  elevenlabsTts: (voiceId: string, text: string) =>
    ipcRenderer.invoke('elevenlabs:tts', voiceId, text),
  elevenlabsCreateAgent: (params: { name: string; systemPrompt: string; firstMessage: string; voiceId: string }) =>
    ipcRenderer.invoke('elevenlabs:create-agent', params),

  /** Serve folder via python3 http.server and open browser (IDE assistant). */
  previewStaticFolder: (targetPath: string, openBrowser?: boolean) =>
    ipcRenderer.invoke('ide:preview-static', targetPath, openBrowser),

  stopStaticPreview: () => ipcRenderer.invoke('ide:preview-stop'),

  agentExecuteTool: (payload: { toolCallId: string; name: string; argumentsJson: string }) =>
    ipcRenderer.invoke('agent:execute-tool', payload),

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
      executionMode?: 'plan' | 'execute';
    },
    runId: string
  ) => ipcRenderer.invoke('chat:agent-turn', { body, runId }),

  /** Abort one ONODE agent/turn by the same runId passed to agentTurn. */
  agentTurnCancel: (runId: string) => ipcRenderer.invoke('chat:agent-turn-cancel', runId),

  // Auth
  authLogin: (username: string, password: string) =>
    ipcRenderer.invoke('auth:login', username, password),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  authGetStatus: () => ipcRenderer.invoke('auth:getStatus'),

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

  // A2A Inbox
  a2aGetPending: () => ipcRenderer.invoke('a2a:getPending'),
  a2aMarkProcessed: (messageId: string) =>
    ipcRenderer.invoke('a2a:markProcessed', messageId),
  a2aSendReply: (toAgentId: string, content: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke('a2a:sendReply', toAgentId, content, params),

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

  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, unknown>>,
  setSettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:set', patch) as Promise<Record<string, unknown>>,
});
