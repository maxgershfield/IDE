import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MCPServerManager } from './services/MCPServerManager.js';
import { OASISAPIClient } from './services/OASISAPIClient.js';
import { AgentRuntime } from './services/AgentRuntime.js';
import { FileSystemService } from './services/FileSystemService.js';
import { TerminalService } from './services/TerminalService.js';
import { loadStoredAuth, saveAuth, clearStoredAuth } from './services/AuthStore.js';
import { ChatService } from './services/ChatService.js';
import { StaticPreviewService } from './services/StaticPreviewService.js';
import { AgentToolExecutor } from './services/AgentToolExecutor.js';
import { TEMPLATE_REGISTRY } from './templates/metaverseTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default OASIS IDE Assistant agent ID. Override with env OASIS_IDE_ASSISTANT_AGENT_ID when backend registers the agent. */
const DEFAULT_IDE_ASSISTANT_AGENT_ID = process.env.OASIS_IDE_ASSISTANT_AGENT_ID || 'oasis-ide-assistant';

let mainWindow: BrowserWindow | null = null;
let authUsername: string | undefined;
let authAvatarId: string | undefined;
let mcpManager: MCPServerManager;
let oasisClient: OASISAPIClient;
let agentRuntime: AgentRuntime;
let fileSystemService: FileSystemService;
let terminalService: TerminalService;
let chatService: ChatService;
let staticPreviewService: StaticPreviewService;
let agentToolExecutor: AgentToolExecutor;

let rendererDistWatchStarted = false;

/** One watcher: reload focused (or any) IDE window when `vite build --watch` updates `dist/renderer`. */
function ensureRendererDistWatch() {
  if (rendererDistWatchStarted) return;
  if (process.env.OASIS_IDE_DEV !== '1' || process.env.OASIS_IDE_VITE_DEV === '1') return;
  rendererDistWatchStarted = true;
  const dir = path.join(__dirname, '../renderer');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleReload = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.reloadIgnoringCache();
      }
    }, 450);
  };
  try {
    fs.watch(dir, { persistent: true }, () => scheduleReload());
  } catch (e) {
    console.warn('[Main] Could not watch renderer dist for reload:', e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e'
  });

  // Load app: default is packaged files (desktop). Set OASIS_IDE_VITE_DEV=1 for Vite dev server + HMR.
  const useViteDevServer = process.env.OASIS_IDE_VITE_DEV === '1';
  const ideDev = process.env.OASIS_IDE_DEV === '1' || useViteDevServer;
  if (useViteDevServer) {
    const devUrl = process.env.OASIS_IDE_VITE_URL || 'http://127.0.0.1:3000';
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  if (ideDev) {
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[Main] Renderer did-fail-load:', errorCode, errorDescription, validatedURL);
    });
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const prefix = `[Renderer console L${level}]`;
      if (level >= 2) {
        console.error(prefix, message, sourceId ? `(${sourceId}:${line})` : '');
      } else if (level === 1) {
        console.warn(prefix, message);
      } else {
        console.log(prefix, message);
      }
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[Main] render-process-gone:', details.reason, details.exitCode);
    });
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    terminalService.setMainWindow(null);
    mainWindow = null;
  });

  terminalService.setMainWindow(mainWindow);
}

app.whenReady().then(async () => {
  // Initialize services
  mcpManager = new MCPServerManager();
  oasisClient = new OASISAPIClient();
  agentRuntime = new AgentRuntime();
  fileSystemService = new FileSystemService();
  terminalService = new TerminalService();
  chatService = new ChatService();
  staticPreviewService = new StaticPreviewService();
  agentToolExecutor = new AgentToolExecutor(fileSystemService, {
    mcpExecuteTool: (toolName, args) => mcpManager.executeTool(toolName, args)
  });

  const stored = await loadStoredAuth();
  if (stored?.token) {
    oasisClient.setAuthToken(stored.token);
    authUsername = stored.username;
    authAvatarId = stored.avatarId;
  }

  mcpManager.setOasisJwtToken(oasisClient.getAuthToken());

  // Start OASIS MCP server
  try {
    await mcpManager.startOASISMCP();
    console.log('[Main] OASIS MCP server started');
  } catch (error: any) {
    console.error('[Main] Failed to start MCP server:', error);
    console.error('[Main] Error details:', error.message);
    // Don't throw - let the app start even if MCP fails
    // The UI will show an error state
  }

  createWindow();
  ensureRendererDistWatch();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('mcp:list-tools', async () => {
  try {
    return await mcpManager.listTools('oasis-unified');
  } catch (error: any) {
    console.error('[IPC] List tools error:', error);
    return [];
  }
});

ipcMain.handle('mcp:execute-tool', async (_, toolName: string, args: any) => {
  try {
    return await mcpManager.executeTool(toolName, args);
  } catch (error: any) {
    console.error('[IPC] Execute tool error:', error);
    return { error: true, message: error.message };
  }
});

ipcMain.handle('oasis:health-check', async () => {
  try {
    return await oasisClient.healthCheck();
  } catch (error: any) {
    return { status: 'unhealthy', error: error.message };
  }
});

ipcMain.handle('agents:discover', async (_, serviceName?: string) => {
  try {
    return await oasisClient.discoverAgents(serviceName);
  } catch (error: any) {
    console.error('[IPC] Discover agents error:', error);
    return [];
  }
});

ipcMain.handle('agents:invoke', async (_, agentId: string, task: string, context: any) => {
  try {
    return await agentRuntime.invokeAgent(agentId, task, context);
  } catch (error: any) {
    return { success: false, result: { error: error.message } };
  }
});

// File system
ipcMain.handle('fs:pick-workspace', async () => {
  try {
    return await fileSystemService.pickWorkspace();
  } catch (error: any) {
    console.error('[IPC] Pick workspace error:', error);
    return null;
  }
});

ipcMain.handle('fs:get-workspace-path', async () => {
  return fileSystemService.getWorkspacePath();
});

ipcMain.handle('fs:list-tree', async (_, dir?: string) => {
  try {
    return await fileSystemService.listTree(dir);
  } catch (error: any) {
    console.error('[IPC] List tree error:', error);
    return [];
  }
});

ipcMain.handle('fs:read-file', async (_, filePath: string) => {
  try {
    return await fileSystemService.readFile(filePath);
  } catch (error: any) {
    console.error('[IPC] Read file error:', error);
    throw error;
  }
});

ipcMain.handle('fs:write-file', async (_, filePath: string, content: string) => {
  try {
    await fileSystemService.writeFile(filePath, content);
  } catch (error: any) {
    console.error('[IPC] Write file error:', error);
    throw error;
  }
});

ipcMain.handle('fs:reveal-in-finder', async (_, targetPath: string) => {
  try {
    const normalized = path.normalize(targetPath);
    const st = await fs.promises.stat(normalized);
    if (st.isDirectory()) {
      const err = await shell.openPath(normalized);
      if (err) return { ok: false, error: err };
      return { ok: true };
    }
    shell.showItemInFolder(normalized);
    return { ok: true };
  } catch (error: any) {
    console.error('[IPC] Reveal in Finder error:', error);
    return { ok: false, error: error?.message ?? String(error) };
  }
});

/**
 * Read .star-workspace.json from the current workspace root (or a supplied dir).
 * Returns the parsed config or null if the file doesn't exist / can't be parsed.
 */
ipcMain.handle('fs:read-star-workspace', async (_, workspacePath?: string) => {
  try {
    const base = workspacePath ?? fileSystemService.getWorkspacePath();
    if (!base) return null;
    const cfgPath = path.join(base, '.star-workspace.json');
    const raw = await fs.promises.readFile(cfgPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

/**
 * Scaffold a metaverse world template into the given destination directory.
 * Creates the destination folder if needed, then writes all template files.
 * Returns { ok, files } on success or { ok: false, error } on failure.
 */
ipcMain.handle('scaffold:template', async (_, engine: string, destDir: string, projectName: string) => {
  try {
    const builder = TEMPLATE_REGISTRY[engine];
    if (!builder) return { ok: false, error: `Unknown engine: ${engine}` };

    const files = builder(projectName);
    const created: string[] = [];

    for (const { path: relPath, content } of files) {
      const abs = path.join(destDir, relPath);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, content, 'utf-8');
      created.push(relPath);
    }

    return { ok: true, files: created, projectPath: destDir };
  } catch (error: any) {
    console.error('[IPC] scaffold:template error:', error);
    return { ok: false, error: error?.message ?? String(error) };
  }
});

/** Open a URL in the user's default system browser. */
ipcMain.handle('shell:open-url', async (_, url: string) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) };
  }
});

/** Serve a folder with python3 -m http.server and optionally open the browser (IDE assistant). */
ipcMain.handle('ide:preview-static', async (_, targetPath: string, openBrowser?: boolean) => {
  try {
    const r = await staticPreviewService.start(targetPath, openBrowser !== false);
    return { ok: true, url: r.url, port: r.port, root: r.root };
  } catch (error: any) {
    console.error('[IPC] ide:preview-static error:', error);
    return { ok: false, error: error?.message ?? String(error) };
  }
});

ipcMain.handle('ide:preview-stop', () => {
  try {
    staticPreviewService.stop();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) };
  }
});

/** Agent tool execution (Cursor-style loop — see docs/CURSOR_PARITY_ROADMAP.md). */
ipcMain.handle(
  'agent:execute-tool',
  async (_e, payload: { toolCallId: string; name: string; argumentsJson: string }) => {
    try {
      const result = await agentToolExecutor.execute(
        payload.toolCallId,
        payload.name,
        payload.argumentsJson
      );
      return { ok: true, result };
    } catch (error: any) {
      console.error('[IPC] agent:execute-tool error:', error);
      return {
        ok: false,
        error: error?.message ?? String(error)
      };
    }
  }
);

// Terminal
ipcMain.handle('terminal:create', async (_, cwd?: string) => {
  try {
    return terminalService.createSession(cwd);
  } catch (error: any) {
    console.error('[IPC] Terminal create error:', error);
    throw error;
  }
});

ipcMain.handle('terminal:write', (_, sessionId: string, data: string) => {
  terminalService.write(sessionId, data);
});

ipcMain.handle('terminal:resize', (_, sessionId: string, cols: number, rows: number) => {
  terminalService.resize(sessionId, cols, rows);
});

ipcMain.handle('terminal:destroy', (_, sessionId: string) => {
  terminalService.destroy(sessionId);
});

// Auth
ipcMain.handle('auth:login', async (_, username: string, password: string) => {
  try {
    const result = await oasisClient.authenticateAvatar(username, password);
    authUsername = result.username ?? username;
    authAvatarId = result.avatarId;
    await saveAuth({
      token: result.token,
      username: authUsername,
      avatarId: authAvatarId
    });
    mcpManager.setOasisJwtToken(result.token);
    try {
      await mcpManager.restartOASISMCP();
    } catch (mcpErr: unknown) {
      console.error('[Main] MCP restart after login failed:', mcpErr);
    }
    return { success: true, username: authUsername, avatarId: authAvatarId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  oasisClient.clearAuthToken();
  authUsername = undefined;
  authAvatarId = undefined;
  await clearStoredAuth();
  mcpManager.setOasisJwtToken(null);
  try {
    await mcpManager.restartOASISMCP();
  } catch (mcpErr: unknown) {
    console.error('[Main] MCP restart after logout failed:', mcpErr);
  }
});

ipcMain.handle('auth:getStatus', async () => {
  const token = oasisClient.getAuthToken();
  return {
    loggedIn: !!token,
    username: authUsername,
    avatarId: authAvatarId
  };
});

// A2A Inbox (uses auth token from oasisClient)
ipcMain.handle('a2a:getPending', async () => {
  try {
    return await oasisClient.getPendingA2AMessages();
  } catch (error: any) {
    console.error('[IPC] Get pending A2A error:', error);
    return [];
  }
});

ipcMain.handle('a2a:markProcessed', async (_, messageId: string) => {
  try {
    await oasisClient.markMessageProcessed(messageId);
  } catch (error: any) {
    console.error('[IPC] Mark processed error:', error);
    throw error;
  }
});

ipcMain.handle('a2a:sendReply', async (_, toAgentId: string, content: string, params?: Record<string, unknown>) => {
  try {
    return await oasisClient.sendA2AJsonRpc(toAgentId, 'service_request', {
      content: content,
      ...params
    });
  } catch (error: any) {
    console.error('[IPC] Send reply error:', error);
    throw error;
  }
});

// Chat / LLM
ipcMain.handle('chat:hasLLM', async () => chatService.hasLLM());
ipcMain.handle(
  'chat:complete',
  async (_, messages: Array<{ role: string; content: string }>, model?: string) => {
    try {
      return await chatService.complete(
        messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
        { model }
      );
    } catch (error: any) {
      console.error('[IPC] Chat complete error:', error);
      return { content: '', error: error.message };
    }
  }
);

// Chat with OASIS agent (IDE assistant)
ipcMain.handle('chat:getDefaultAssistantAgentId', () => DEFAULT_IDE_ASSISTANT_AGENT_ID);

/** Concurrent POST /api/ide/agent/turn keyed by renderer-supplied runId (one AbortController each). */
const ideAgentTurnAborts = new Map<string, AbortController>();

ipcMain.handle('chat:agent-turn-cancel', (_, runId: unknown) => {
  try {
    if (typeof runId === 'string' && runId.length > 0) {
      const ac = ideAgentTurnAborts.get(runId);
      ac?.abort();
      ideAgentTurnAborts.delete(runId);
    }
  } catch {
    /* ignore */
  }
  return { ok: true as const };
});

ipcMain.handle('chat:agent-turn', async (_, payload: unknown) => {
  const pack = payload as { body?: unknown; runId?: string };
  const body = pack?.body;
  const runId = typeof pack?.runId === 'string' ? pack.runId : '';
  if (!runId) {
    return { ok: false, error: 'Missing agent runId' };
  }
  const ac = new AbortController();
  ideAgentTurnAborts.set(runId, ac);
  try {
    return await oasisClient.agentTurn(body as any, { signal: ac.signal });
  } catch (error: any) {
    if (ac.signal.aborted) {
      return { ok: false, error: 'Stopped.' };
    }
    console.error('[IPC] chat:agent-turn error:', error);
    return { ok: false, error: error?.message ?? String(error) };
  } finally {
    ideAgentTurnAborts.delete(runId);
  }
});

ipcMain.handle(
  'chat:agent',
  async (
    _,
    agentId: string,
    message: string,
    conversationId?: string,
    history?: Array<{ role: string; content: string }>,
    fromAvatarId?: string,
    model?: string,
    workspaceRoot?: string | null,
    referencedPaths?: string[],
    contextPack?: string
  ) => {
    try {
      return await oasisClient.chatWithAgent(agentId, message, {
        conversationId,
        history: history ?? [],
        fromAvatarId,
        model,
        workspaceRoot: workspaceRoot ?? undefined,
        referencedPaths: referencedPaths ?? undefined,
        contextPack: contextPack ?? undefined
      });
    } catch (error: any) {
      console.error('[IPC] Chat agent error:', error);
      return { content: '', error: error.message };
    }
  }
);

ipcMain.handle(
  'chat:holon:save',
  async (
    _,
    payload: {
      threadKey: string;
      workspaceRoot?: string | null;
      rootHolonId?: string | null;
      messagesJson: string;
    }
  ) => {
    try {
      return await oasisClient.saveIdeConversationHolon(payload);
    } catch (error: any) {
      console.error('[IPC] chat:holon:save error:', error);
      return { error: error.message ?? String(error) };
    }
  }
);

ipcMain.handle('chat:holon:load', async (_, threadKey: string) => {
  try {
    return await oasisClient.loadIdeConversationByThreadKey(threadKey);
  } catch (error: any) {
    console.error('[IPC] chat:holon:load error:', error);
    return { error: error.message ?? String(error) };
  }
});
