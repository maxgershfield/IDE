import { app, BrowserWindow, ipcMain, shell, type WebContents } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MCPServerManager } from './services/MCPServerManager.js';
import {
  getResolvedStarApiBaseUrl,
  resetStarApiCache,
  resolveStarApiBaseUrl,
} from './services/starApiUrlResolve.js';
import { OASISAPIClient } from './services/OASISAPIClient.js';
import { AgentRuntime } from './services/AgentRuntime.js';
import { FileSystemService } from './services/FileSystemService.js';
import { TerminalService } from './services/TerminalService.js';
import { loadStoredAuth, saveAuth, clearStoredAuth } from './services/AuthStore.js';
import {
  clearSessionRefreshTimer,
  refreshSessionIfExpiringSoon,
  scheduleSessionRefresh,
  type SessionRefreshDeps
} from './services/sessionRefresh.js';
import { ChatService } from './services/ChatService.js';
import { StaticPreviewService } from './services/StaticPreviewService.js';
import { AgentToolExecutor } from './services/AgentToolExecutor.js';
import { SemanticSearchService } from './services/SemanticSearchService.js';
import { HolonicIndexService } from './services/HolonicIndexService.js';
import { TEMPLATE_REGISTRY, TEMPLATE_META, getContentTemplateFiles } from './templates/metaverseTemplates.js';
import { LocalBridgeServer } from './services/LocalBridgeServer.js';
import { runNpmInstall } from './services/oasisOnboardNpm.js';
import { fetchPortalActivitySnapshot } from './services/portalActivityPoll.js';
import {
  allocateOasisOnboardStarterDest,
  getOasisOnboardStarterSourceDir,
  oasisOnboardStarterSourceExists,
  sanitizeOasisStarterFolderName
} from './services/oasisOnboardStarterPath.js';
import { applyOasisOnboardBranding } from './services/oasisOnboardBranding.js';
import { BUNDLE_OASIS_API_BASE, BUNDLE_STAR_API_BASE } from '../shared/oasisIdeBundleDefaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load OASIS-IDE/.env into process.env before any other reads (Electron main does not load Vite env). */
function loadIdeRootEnv(): void {
  const envPath = path.join(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}
loadIdeRootEnv();

function ignoreConsolePipeErrors(stream: NodeJS.WriteStream): void {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error?.code === 'EPIPE') return;
    throw error;
  });
}

ignoreConsolePipeErrors(process.stdout);
ignoreConsolePipeErrors(process.stderr);

/** Default OASIS IDE Assistant agent ID. Override with env OASIS_IDE_ASSISTANT_AGENT_ID when backend registers the agent. */
const DEFAULT_IDE_ASSISTANT_AGENT_ID = process.env.OASIS_IDE_ASSISTANT_AGENT_ID || 'oasis-ide-assistant';

let mainWindow: BrowserWindow | null = null;
let authUsername: string | undefined;
let authAvatarId: string | undefined;
let mcpManager: MCPServerManager;
let oasisClient: OASISAPIClient;

function getSessionRefreshDeps(): SessionRefreshDeps {
  return {
    oasisClient,
    mcpManager,
    getUsername: () => authUsername,
    getAvatarId: () => authAvatarId
  };
}
let agentRuntime: AgentRuntime;
let fileSystemService: FileSystemService;
let terminalService: TerminalService;
let chatService: ChatService;
let staticPreviewService: StaticPreviewService;
let holonicIndexService: HolonicIndexService;
let agentToolExecutor: AgentToolExecutor;

let rendererDistWatchStarted = false;
let localBridgeServer: LocalBridgeServer | null = null;

/** Cached result of the STAR CLI probe performed at startup. */
let starCliStatus: { found: boolean; path: string | null; version: string | null } = {
  found: false,
  path: null,
  version: null
};

/**
 * Probe the STAR CLI binary. Resolves STAR_CLI_PATH env var first, then falls back
 * to `star` on PATH. Runs `star version` with a 5s timeout to confirm the binary works.
 */
function probeStarCli(): Promise<void> {
  return new Promise((resolve) => {
    const binPath = process.env.STAR_CLI_PATH?.trim() || 'star';
    const pathWithHomebrew = ['/usr/local/bin', '/opt/homebrew/bin', process.env.PATH ?? '']
      .filter(Boolean)
      .join(path.delimiter);

    execFile(
      binPath,
      ['version'],
      { env: { ...process.env, PATH: pathWithHomebrew }, timeout: 5000 },
      (err, stdout) => {
        if (err) {
          starCliStatus = { found: false, path: null, version: null };
          console.warn(
            `[Main] STAR CLI not found at "${binPath}". Set STAR_CLI_PATH or add "star" to PATH.`,
            `Error: ${err.message}`
          );
        } else {
          const version = stdout.trim().split('\n')[0] || null;
          starCliStatus = { found: true, path: binPath, version };
          console.log(`[Main] STAR CLI found: ${binPath}${version ? ` (${version})` : ''}`);
        }
        resolve();
      }
    );
  });
}

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

/**
 * Block full-document navigations that would unload the IDE shell (e.g. clicking a
 * relative markdown link in the composer). Optionally open http(s) externally from setWindowOpenHandler.
 */
function attachRendererNavigationGuards(contents: WebContents): void {
  const useVite = process.env.OASIS_IDE_VITE_DEV === '1';
  const devUrl = process.env.OASIS_IDE_VITE_URL || 'http://127.0.0.1:3000';

  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      if (useVite) {
        const next = new URL(navigationUrl);
        const base = new URL(devUrl);
        if (next.origin !== base.origin) {
          event.preventDefault();
          return;
        }
        const pathname = next.pathname.endsWith('/') && next.pathname.length > 1
          ? next.pathname.slice(0, -1)
          : next.pathname;
        if (pathname === '' || pathname === '/') {
          return;
        }
        event.preventDefault();
        return;
      }
      const next = new URL(navigationUrl);
      if (next.protocol !== 'file:') {
        event.preventDefault();
        return;
      }
      const normalized = next.pathname.replace(/\\/g, '/');
      if (!/index\.html$/i.test(normalized)) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  contents.setWindowOpenHandler((details) => {
    const { url } = details;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,          // enables <webview> for the live world preview pane
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e'
  });

  attachRendererNavigationGuards(mainWindow.webContents);

  // Load app: default is packaged files (desktop). Set OASIS_IDE_VITE_DEV=1 for Vite dev server + HMR.
  const useViteDevServer = process.env.OASIS_IDE_VITE_DEV === '1';
  const ideDev = process.env.OASIS_IDE_DEV === '1' || useViteDevServer;
  const devUrl = process.env.OASIS_IDE_VITE_URL || 'http://127.0.0.1:3000';

  if (useViteDevServer) {
    let loadAttempts = 0;
    const maxAttempts = 20;
    const tryLoad = () => {
      loadAttempts += 1;
      void mainWindow!.loadURL(devUrl);
    };
    mainWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!useViteDevServer || !isMainFrame) return;
        const u = String(validatedURL || '');
        if (u && u !== devUrl && !u.startsWith(`${devUrl}/`)) return;
        // Chromium: -102 connection refused, -105 not resolved, -106 offline, -109 address unreachable
        const retryable = [-102, -105, -106, -109].includes(errorCode);
        if (retryable && loadAttempts < maxAttempts) {
          console.warn(
            `[Main] Main frame did-fail-load (${errorCode} ${errorDescription}), retrying Vite (${loadAttempts}/${maxAttempts})…`
          );
          setTimeout(tryLoad, 450);
          return;
        }
        console.error('[Main] Renderer did-fail-load:', errorCode, errorDescription, validatedURL);
      }
    );
    tryLoad();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[Main] Window still hidden after timeout; showing to avoid a stuck black frame.');
      mainWindow.show();
    }
  }, 10000);

  if (ideDev) {
    mainWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (useViteDevServer) return;
        if (!isMainFrame) return;
        console.error('[Main] Renderer did-fail-load:', errorCode, errorDescription, validatedURL);
      }
    );
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
    if (process.env.OASIS_IDE_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools();
    }
  }

  mainWindow.on('closed', () => {
    terminalService.setMainWindow(null);
    mainWindow = null;
  });

  terminalService.setMainWindow(mainWindow);
}

app.whenReady().then(async () => {
  // When unset, use hosted Streamable MCP (matches default remote OASIS API; no local `MCP/dist` or ONODE
  // required). Override: `OASIS_MCP_TRANSPORT=stdio` in `.env` for monorepo local stdio MCP.
  if (!process.env.OASIS_MCP_TRANSPORT?.trim()) {
    process.env.OASIS_MCP_TRANSPORT = 'http';
  }

  // Initialize services — AgentRuntime shares the authenticated oasisClient
  mcpManager = new MCPServerManager();
  const oasisBase = resolveOasisApiBaseUrl();
  oasisClient = new OASISAPIClient(oasisBase);
  mcpManager.setOasisApiUrlResolved(oasisBase);
  console.log('[Main] OASIS API base URL:', oasisBase);
  agentRuntime = new AgentRuntime(oasisClient, mcpManager);
  fileSystemService = new FileSystemService();
  terminalService = new TerminalService();
  chatService = new ChatService();
  staticPreviewService = new StaticPreviewService();
  const semanticSearchService = new SemanticSearchService();
  holonicIndexService = new HolonicIndexService();
  agentToolExecutor = new AgentToolExecutor(fileSystemService, {
    mcpExecuteTool: (toolName, args) => mcpManager.executeTool(toolName, args),
    openExternalUrl: (url) => shell.openExternal(url),
    semanticSearch: semanticSearchService
  });

  const stored = await loadStoredAuth();
  if (stored?.token) {
    oasisClient.setAuthToken(stored.token);
    if (stored.refreshToken) {
      oasisClient.setRefreshToken(stored.refreshToken);
    }
    authUsername = stored.username;
    authAvatarId = stored.avatarId;
  }

  try {
    await refreshSessionIfExpiringSoon(getSessionRefreshDeps(), 3 * 60 * 1000);
  } catch (e: unknown) {
    console.warn('[Main] Session startup refresh skipped:', e);
  }

  mcpManager.setOasisJwtToken(oasisClient.getAuthToken());
  mcpManager.setOasisAvatarId(authAvatarId);

  try {
    const starUrl = await resolveStarApiBaseUrl(getEffectiveStarnetEndpointFromSettingsDisk());
    process.env.STAR_API_URL = starUrl;
    console.log('[Main] Resolved STAR WebAPI URL:', starUrl);
  } catch (e: unknown) {
    console.warn('[Main] STAR URL resolve failed, using fallback:', e);
  }

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

  if (oasisClient.getRefreshToken()) {
    scheduleSessionRefresh(getSessionRefreshDeps());
  }

  // Probe STAR CLI (non-blocking: app starts regardless of result)
  probeStarCli().catch((e) => console.warn('[Main] STAR CLI probe threw:', e));

  // Start local bridge server for Telegram-to-IDE integration
  const bridgeSecret = process.env.OASIS_IDE_BRIDGE_SECRET?.trim();
  if (bridgeSecret) {
    const bridgePort = parseInt(process.env.OASIS_IDE_BRIDGE_PORT ?? '7391', 10);
    localBridgeServer = new LocalBridgeServer(bridgePort, bridgeSecret);
    localBridgeServer.on('task', (task) => {
      const win = mainWindow ?? BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('telegram:task', task);
      }
    });
    localBridgeServer.start().catch((e) => {
      console.error('[Main] LocalBridgeServer failed to start:', e);
    });
  } else {
    console.log('[Main] OASIS_IDE_BRIDGE_SECRET not set — Telegram bridge disabled.');
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
  const settingsOasisOverrideActive = Boolean(readOasisApiEndpointFromSettingsDisk().trim());
  const envOasisApiUrlSet = Boolean(process.env.OASIS_API_URL?.trim());
  try {
    const r = await oasisClient.healthCheck();
    return {
      ...r,
      envOasisApiUrlSet,
      /** True when a non-empty API base is saved in Integrations; it takes precedence over `OASIS_API_URL`. */
      settingsOasisOverrideActive
    };
  } catch (error: any) {
    return {
      status: 'unhealthy' as const,
      error: error.message,
      resolvedBaseUrl: oasisClient.getBaseURL(),
      envOasisApiUrlSet,
      settingsOasisOverrideActive
    };
  }
});

/** Return the result of the STAR CLI probe run at startup. Re-probes if not yet resolved. */
ipcMain.handle('star-cli:status', async () => {
  if (!starCliStatus.found) {
    // Re-probe in case the user installed the CLI after app launch.
    await probeStarCli().catch(() => {});
  }
  return starCliStatus;
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

ipcMain.handle('fs:set-workspace', async (_, dir: string) => {
  try {
    fileSystemService.setWorkspacePath(dir);
    return await fileSystemService.listRootLevel(2);
  } catch {
    return [];
  }
});

ipcMain.handle('fs:list-tree', async (_, dir?: string) => {
  try {
    return await fileSystemService.listTree(dir);
  } catch (error: any) {
    console.error('[IPC] List tree error:', error);
    return [];
  }
});

ipcMain.handle('fs:list-root-level', async () => {
  try {
    return await fileSystemService.listRootLevel(2);
  } catch (error: any) {
    console.error('[IPC] List root level error:', error);
    return [];
  }
});

ipcMain.handle('fs:list-dir-shallow', async (_, absPath: string) => {
  try {
    if (typeof absPath !== 'string' || !path.isAbsolute(absPath)) return [];
    return await fileSystemService.listDirectoryShallow(absPath);
  } catch (error: any) {
    console.error('[IPC] List dir shallow error:', error);
    return [];
  }
});

ipcMain.handle('fs:read-file', async (_, filePath: string) => {
  try {
    return await fileSystemService.readFile(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return null;
    }
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

/** Return template metadata for the MetaverseTemplatePanel card grid. */
ipcMain.handle('templates:list-meta', async () => {
  return { ok: true, templates: TEMPLATE_META };
});

/**
 * Copy the OASIS API (onboard) Vite starter from bundled `docs/templates/oasis-onboard-starter`
 * into `path.join(parentDir, folderName)`.
 */
ipcMain.handle(
  'templates:copy-oasis-onboard-starter',
  async (_evt, parentDir: string, folderName: string) => {
    try {
      if (typeof parentDir !== 'string' || !parentDir.trim()) {
        return { ok: false as const, error: 'Open a workspace folder first.' };
      }
      const safeName = sanitizeOasisStarterFolderName(
        typeof folderName === 'string' ? folderName : 'oasis-onboard-starter'
      );
      const normParent = path.resolve(parentDir.trim());
      const normDest = path.resolve(path.join(normParent, safeName));
      const rel = path.relative(normParent, normDest);
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
        return { ok: false as const, error: 'Invalid destination path.' };
      }
      if (!(await oasisOnboardStarterSourceExists())) {
        return {
          ok: false as const,
          error:
            'OASIS onboard starter template is missing from this app install. If you are developing the IDE, ensure docs/templates/oasis-onboard-starter exists and is included in the packaged build.',
        };
      }
      try {
        await fs.promises.access(normDest);
        return {
          ok: false as const,
          error: `A folder or file already exists: ${safeName}. Choose another name or remove it first.`,
        };
      } catch {
        /* not exists */
      }
      const src = getOasisOnboardStarterSourceDir();
      await fs.promises.cp(src, normDest, { recursive: true, errorOnExist: true });
      return { ok: true as const, projectPath: normDest, folderName: safeName };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[IPC] templates:copy-oasis-onboard-starter error:', e);
      return { ok: false as const, error: message };
    }
  }
);

ipcMain.handle(
  'templates:apply-oasis-onboard-branding',
  async (_evt, projectPath: string, description: string) => {
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return { ok: false as const, error: 'No project path.' };
    }
    return applyOasisOnboardBranding(
      projectPath,
      typeof description === 'string' ? description : ''
    );
  }
);

/**
 * One action: create `oasis-onboard-starter` (or -2, -3, …), copy files, run `npm install`.
 */
ipcMain.handle('templates:bootstrap-oasis-onboard-starter', async (_evt, parentDir: string) => {
  try {
    if (typeof parentDir !== 'string' || !parentDir.trim()) {
      return { ok: false as const, error: 'No workspace folder. Open a folder first.' };
    }
    if (!(await oasisOnboardStarterSourceExists())) {
      return {
        ok: false as const,
        error:
          'OASIS onboard starter template is missing from this app install. Rebuild or reinstall the IDE.',
      };
    }
    const src = getOasisOnboardStarterSourceDir();
    const { fullPath, folderName } = await allocateOasisOnboardStarterDest(parentDir);
    await fs.promises.cp(src, fullPath, { recursive: true, errorOnExist: true });
    const npm = await runNpmInstall(fullPath);
    return {
      ok: true as const,
      projectPath: fullPath,
      folderName,
      npmInstallOk: npm.ok,
      npmInstallLog: npm.log,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[IPC] templates:bootstrap-oasis-onboard-starter error:', e);
    return { ok: false as const, error: message };
  }
});

/**
 * Run `npm install` in an existing project directory (used by the guided OASIS API setup).
 */
ipcMain.handle('templates:npm-install-in-project', async (_evt, projectPath: string) => {
  try {
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return { ok: false as const, error: 'No project path.' };
    }
    const norm = path.resolve(projectPath.trim());
    const st = await fs.promises.stat(norm).catch(() => null);
    if (!st?.isDirectory()) {
      return { ok: false as const, error: 'Path is not a directory.' };
    }
    const npm = await runNpmInstall(norm);
    return {
      ok: true as const,
      npmOk: npm.ok,
      log: npm.log,
      exitCode: npm.exitCode,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[IPC] templates:npm-install-in-project error:', e);
    return { ok: false as const, error: message };
  }
});

/**
 * Apply a content template (Phase 5 variable-substitution templates) to destDir.
 * For engine templates (hyperfy/threejs/babylonjs) the existing scaffold:template
 * handler is used directly from the renderer.
 */
ipcMain.handle('templates:apply-content', async (
  _,
  templateId: string,
  destDir: string,
  variables: Record<string, string>
) => {
  try {
    const files = getContentTemplateFiles(templateId, variables);
    if (!files.length) return { ok: false, error: `Unknown content template: ${templateId}` };
    const created: string[] = [];
    for (const { path: relPath, content } of files) {
      const abs = path.join(destDir, relPath);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, content, 'utf-8');
      created.push(relPath);
    }
    return { ok: true, filesCreated: created, projectPath: destDir };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

// ─── ElevenLabs NPC Voice Studio ─────────────────────────────────────────────

ipcMain.handle('elevenlabs:list-voices', async () => {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'ELEVENLABS_API_KEY not set' };
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });
    if (!res.ok) return { ok: false, error: `ElevenLabs API error: ${res.status}` };
    const data = await res.json() as { voices: unknown[] };
    return { ok: true, voices: data.voices };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

ipcMain.handle('elevenlabs:tts', async (_, voiceId: string, text: string) => {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'ELEVENLABS_API_KEY not set' };
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
    });
    if (!res.ok) return { ok: false, error: `ElevenLabs TTS error: ${res.status}` };
    const buf = await res.arrayBuffer();
    return { ok: true, audioBase64: Buffer.from(buf).toString('base64') };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

ipcMain.handle('elevenlabs:create-agent', async (_, params: {
  name: string; systemPrompt: string; firstMessage: string; voiceId: string;
}) => {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'ELEVENLABS_API_KEY not set' };
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        conversation_config: {
          agent: {
            prompt: { prompt: params.systemPrompt },
            first_message: params.firstMessage,
            language: 'en',
          },
        },
        tts: { voice_id: params.voiceId },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `ElevenLabs agent error: ${res.status} ${txt}` };
    }
    const data = await res.json() as { agent_id: string };
    return { ok: true, agentId: data.agent_id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

// ─────────────────────────────────────────────────────────────────────────────

/** Generate an image via Glif.app (Flux 2 Pro by default). */
ipcMain.handle('glif:generate-image', async (_, prompt: string, referenceImageDataUrl?: string, workflowId?: string) => {
  const apiToken = process.env.GLIF_API_TOKEN?.trim();
  const apiUrl = process.env.GLIF_API_URL?.trim() || 'https://simple-api.glif.app';
  if (!apiToken) return { ok: false, error: 'GLIF_API_TOKEN not set in .env' };
  try {
    const inputs: Record<string, string> = { input1: prompt };
    if (referenceImageDataUrl) {
      inputs.image1 = referenceImageDataUrl;
    }
    const body = {
      id: workflowId || 'cmigcvfwm0000k004u9shifki',
      inputs,
    };
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `Glif API error: ${res.status} ${txt}` };
    }
    const data = await res.json() as { output?: string; error?: string };
    if (data.error) return { ok: false, error: data.error };
    if (data.output) return { ok: true, imageUrl: data.output };
    return { ok: false, error: 'No image URL in Glif response' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

// ─────────────────────────────────────────────────────────────────────────────

/** Open a URL in the user's default system browser. */
ipcMain.handle('shell:open-url', async (_, url: string) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) };
  }
});

/**
 * Check whether a TCP port is currently accepting connections on localhost.
 * Used by the live preview pane to detect when the Vite / Hyperfy dev server is ready.
 */
ipcMain.handle('check-port', async (_, port: number): Promise<boolean> => {
  const net = await import('net');
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
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

/** Agent tool execution (OASIS_IDE-style loop — see docs/OASIS_IDE_PARITY_ROADMAP.md). */
ipcMain.handle(
  'agent:execute-tool',
  async (
    _e,
    payload: {
      toolCallId: string;
      name: string;
      argumentsJson: string;
      executionMode?: 'plan' | 'plan_gather' | 'plan_present' | 'execute';
    }
  ) => {
    try {
      const result = await agentToolExecutor.execute(
        payload.toolCallId,
        payload.name,
        payload.argumentsJson,
        { executionMode: payload.executionMode }
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
type OasisAuthResult = Awaited<
  ReturnType<InstanceType<typeof OASISAPIClient>['authenticateAvatar']>
>;

async function applyOasisSessionAfterAuthenticate(
  result: OasisAuthResult,
  usernameFallback: string
): Promise<{ username: string; avatarId: string }> {
  authUsername = result.username ?? usernameFallback;
  authAvatarId = result.avatarId;
  await saveAuth({
    token: result.token,
    refreshToken: result.refreshToken || undefined,
    username: authUsername,
    avatarId: authAvatarId
  });
  mcpManager.setOasisJwtToken(result.token);
  mcpManager.setOasisAvatarId(authAvatarId);
  try {
    await mcpManager.restartOASISMCP();
  } catch (mcpErr: unknown) {
    console.error('[Main] MCP restart after login failed:', mcpErr);
  }
  clearSessionRefreshTimer();
  if (oasisClient.getRefreshToken()) {
    scheduleSessionRefresh(getSessionRefreshDeps());
  }
  oasisClient.registerAgentCapabilities(authAvatarId, [
    'code-generation', 'data-analysis', 'general', 'ide-session'
  ]).catch((err: unknown) => {
    console.warn('[Main] A2A agent registration failed (non-fatal):', err);
  });
  return { username: authUsername, avatarId: authAvatarId };
}

ipcMain.handle('auth:login', async (_, username: string, password: string) => {
  try {
    const result = await oasisClient.authenticateAvatar(username, password);
    const out = await applyOasisSessionAfterAuthenticate(result, username);
    return { success: true, username: out.username, avatarId: out.avatarId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  'auth:register',
  async (
    _,
    payload: {
      firstName: string;
      lastName: string;
      email: string;
      username: string;
      password: string;
      confirmPassword: string;
    }
  ) => {
    try {
      await oasisClient.registerAvatar(payload);
      const result = await oasisClient.authenticateAvatar(payload.username, payload.password);
      const out = await applyOasisSessionAfterAuthenticate(result, payload.username);
      return { success: true, username: out.username, avatarId: out.avatarId };
    } catch (error: any) {
      return { success: false, error: error.message ?? String(error) };
    }
  }
);

ipcMain.handle('auth:logout', async () => {
  clearSessionRefreshTimer();
  oasisClient.clearAuthToken();
  authUsername = undefined;
  authAvatarId = undefined;
  await clearStoredAuth();
  mcpManager.setOasisJwtToken(null);
  mcpManager.setOasisAvatarId(null);
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

ipcMain.handle('auth:getToken', () => oasisClient.getAuthToken());

/** Poll A2A message count (OASIS API) and NFT list length (STAR) for portal parity notifications. */
ipcMain.handle('portal:poll-activity', async () => {
  try {
    const token = oasisClient.getAuthToken();
    if (!token) {
      return { ok: false as const, error: 'not_authenticated' };
    }
    const starBase = await resolveStarApiBaseUrl(getEffectiveStarnetEndpointFromSettingsDisk());
    return await fetchPortalActivitySnapshot(oasisClient, starBase, token);
  } catch (e: unknown) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
});

/** STAR WebAPI base URL (resolved at startup from launchSettings + health probe, or STAR_API_URL). */
ipcMain.handle('star:getResolvedApiUrl', () => getResolvedStarApiBaseUrl());

/* ── Holonic codebase index ──────────────────────────────────────────────── */

ipcMain.handle('holon-index:load-status', async (_, workspaceRoot: string) => {
  return holonicIndexService.loadStoredStatus(workspaceRoot);
});

ipcMain.handle('holon-index:status', () => {
  return holonicIndexService.getStatus();
});

ipcMain.handle('holon-index:build', (_, workspaceRoot: string) => {
  holonicIndexService.setProgressCallback((status) => {
    mainWindow?.webContents.send('holon-index:progress', status);
  });
  holonicIndexService.buildIndex(workspaceRoot);
  return { ok: true };
});

ipcMain.handle('holon-index:cancel', () => {
  holonicIndexService.cancel();
  return { ok: true };
});

ipcMain.handle('holon-index:delete', async (_, workspaceRoot: string) => {
  await holonicIndexService.deleteIndex(workspaceRoot);
  return { ok: true };
});

ipcMain.handle('holon-index:search', async (_, workspaceRoot: string, query: string, limit?: number) => {
  return holonicIndexService.search(workspaceRoot, query, limit ?? 8);
});

ipcMain.handle('holon-allowlist:get', async (_, workspaceRoot: string) => {
  return holonicIndexService.getAllowlistForUI(workspaceRoot);
});

ipcMain.handle('holon-allowlist:set', async (_, workspaceRoot: string, names: string[]) => {
  if (!Array.isArray(names)) {
    return { ok: false as const, error: 'names must be an array' };
  }
  return holonicIndexService.setAllowlistForUI(workspaceRoot, names);
});

// A2A Inbox (uses auth token from oasisClient)
ipcMain.handle('a2a:getPending', async () => {
  try {
    const messages = await oasisClient.getPendingA2AMessages();
    return { ok: true, messages: Array.isArray(messages) ? messages : [] };
  } catch (error: any) {
    console.error('[IPC] Get pending A2A error:', error);
    return { ok: false, messages: [], error: error.message ?? 'Failed to fetch messages' };
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

ipcMain.handle('a2a:send', async (_, toAgentId: string, method: string, content: string) => {
  try {
    await oasisClient.sendA2ANewMessage(toAgentId, method, content);
    return { ok: true };
  } catch (error: any) {
    console.error('[IPC] A2A send error:', error);
    return { ok: false, error: error.message ?? 'Failed to send message' };
  }
});

// Telegram bridge
ipcMain.handle('telegram:getTasks', () => {
  return localBridgeServer?.getQueuedTasks() ?? [];
});

ipcMain.handle('telegram:taskDone', (_, taskId: string) => {
  localBridgeServer?.removeTask(taskId);
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

ipcMain.handle(
  'project-memory:holon:save',
  async (
    _,
    payload: {
      memoryKey: string;
      workspaceRoot?: string | null;
      rootHolonId?: string | null;
      memoryJson: string;
    }
  ) => {
    try {
      return await oasisClient.saveProjectMemoryHolon(payload);
    } catch (error: any) {
      console.error('[IPC] project-memory:holon:save error:', error);
      return { error: error.message ?? String(error) };
    }
  }
);

ipcMain.handle('project-memory:holon:load', async (_, memoryKey: string) => {
  try {
    return await oasisClient.loadProjectMemoryByMemoryKey(memoryKey);
  } catch (error: any) {
    console.error('[IPC] project-memory:holon:load error:', error);
    return { error: error.message ?? String(error) };
  }
});

// Settings persistence — stored as JSON in userData
const SETTINGS_FILE = path.join(app.getPath('userData'), 'oasis-ide-settings.json');

function readSettingsFromDisk(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeSettingsToDisk(data: Record<string, unknown>): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Settings] Failed to write settings:', e);
  }
}

function readOasisApiEndpointFromSettingsDisk(): string {
  const data = readSettingsFromDisk();
  const ep = typeof data.oasisApiEndpoint === 'string' ? data.oasisApiEndpoint.trim() : '';
  return ep.replace(/\/$/, '');
}

function readStarnetEndpointOverrideFromSettingsDisk(): string {
  const data = readSettingsFromDisk();
  const ep =
    typeof data.starnetEndpointOverride === 'string' ? data.starnetEndpointOverride.trim() : '';
  return ep.replace(/\/$/, '');
}

function getEffectiveOasisApiEndpointFromSettingsDisk(): string {
  const from = readOasisApiEndpointFromSettingsDisk();
  if (from) return from;
  /** Unset Integrations field: public API (same as packaged). Set Local in Settings or OASIS_API_URL for a local ONODE. */
  return BUNDLE_OASIS_API_BASE;
}

function getEffectiveStarnetEndpointFromSettingsDisk(): string {
  const from = readStarnetEndpointOverrideFromSettingsDisk();
  if (from) return from;
  if (app.isPackaged) return BUNDLE_STAR_API_BASE;
  return '';
}

function starnetEndpointFromSettingsRecord(data: Record<string, unknown>): string {
  const ep =
    typeof data.starnetEndpointOverride === 'string' ? data.starnetEndpointOverride.trim() : '';
  return ep.replace(/\/$/, '');
}

function getEffectiveStarnetEndpointFromSettingsRecord(
  data: Record<string, unknown>
): string {
  const from = starnetEndpointFromSettingsRecord(data);
  if (from) return from;
  if (app.isPackaged) return BUNDLE_STAR_API_BASE;
  return '';
}

/**
 * Merged view for the renderer: packaged builds show public defaults when Integrations is unset;
 * not written to disk until the user changes settings.
 */
function mergeSettingsPayloadWithPackagedDefaults(
  disk: Record<string, unknown>
): Record<string, unknown> {
  if (!app.isPackaged) {
    const out: Record<string, unknown> = { ...disk };
    const o = typeof out.oasisApiEndpoint === 'string' ? String(out.oasisApiEndpoint).trim() : '';
    if (!o) {
      out.oasisApiEndpoint = BUNDLE_OASIS_API_BASE;
    }
    return out;
  }
  const out: Record<string, unknown> = { ...disk };
  if (typeof out.oasisApiEndpoint !== 'string' || !String(out.oasisApiEndpoint).trim()) {
    out.oasisApiEndpoint = BUNDLE_OASIS_API_BASE;
  }
  if (
    typeof out.starnetEndpointOverride !== 'string' ||
    !String(out.starnetEndpointOverride).trim()
  ) {
    out.starnetEndpointOverride = BUNDLE_STAR_API_BASE;
  }
  return out;
}

/**
 * Same ONODE base for `OASISAPIClient` and OASIS MCP.
 * Precedence: non-empty **Settings → API Endpoint** (on disk) wins, then `OASIS_API_URL`, then
 * public `https://api.oasisweb4.one` (local ONODE: `http://127.0.0.1:5003` in Settings or env).
 */
function resolveOasisApiBaseUrl(): string {
  const fromDisk = readOasisApiEndpointFromSettingsDisk();
  if (fromDisk) {
    return OASISAPIClient.normalizeBaseUrl(fromDisk);
  }
  const env = process.env.OASIS_API_URL?.trim();
  if (env) {
    return OASISAPIClient.normalizeBaseUrl(env);
  }
  return BUNDLE_OASIS_API_BASE;
}

ipcMain.handle('settings:get', () =>
  mergeSettingsPayloadWithPackagedDefaults(readSettingsFromDisk())
);

ipcMain.handle('settings:set', async (_, patch: Record<string, unknown>) => {
  const current = readSettingsFromDisk();
  const merged = { ...current, ...patch };
  writeSettingsToDisk(merged);
  let needMcpRestart = false;
  if ('oasisApiEndpoint' in patch && mcpManager && oasisClient) {
    const url = resolveOasisApiBaseUrl();
    oasisClient.setBaseURL(url);
    mcpManager.setOasisApiUrlResolved(url);
    needMcpRestart = true;
  }
  if ('starnetEndpointOverride' in patch && mcpManager) {
    resetStarApiCache();
    try {
      const starUrl = await resolveStarApiBaseUrl(
        getEffectiveStarnetEndpointFromSettingsRecord(merged)
      );
      process.env.STAR_API_URL = starUrl;
      console.log('[Settings] STAR WebAPI URL after STARNET endpoint change:', starUrl);
    } catch (e: unknown) {
      console.error('[Settings] STAR URL resolve after STARNET endpoint change:', e);
    }
    needMcpRestart = true;
  }
  if (needMcpRestart && mcpManager) {
    try {
      await mcpManager.restartOASISMCP();
    } catch (e: unknown) {
      console.error('[Settings] MCP restart after settings change:', e);
    }
  }
  return merged;
});

// STARNET list durable cache (renderer: OAPP + holon arrays for fast dashboard paint)
const STARNET_LIST_CACHE_FILE = path.join(app.getPath('userData'), 'oasis-ide-starnet-list-cache.json');

type StarnetListDiskEntry = {
  storedAt: number;
  kind: 'holons' | 'oapps';
  payload: unknown;
};

function readStarnetListCacheFromDisk(): Record<string, StarnetListDiskEntry> {
  try {
    const raw = fs.readFileSync(STARNET_LIST_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, StarnetListDiskEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStarnetListCacheToDisk(data: Record<string, StarnetListDiskEntry>): void {
  try {
    fs.writeFileSync(STARNET_LIST_CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch (e) {
    console.error('[StarnetListCache] Failed to write:', e);
  }
}

ipcMain.handle('starnet-list-cache:get', (_, key: string) => {
  const all = readStarnetListCacheFromDisk();
  return all[key] ?? null;
});

ipcMain.handle(
  'starnet-list-cache:set',
  (_, key: string, entry: StarnetListDiskEntry) => {
    const all = readStarnetListCacheFromDisk();
    all[key] = entry;
    writeStarnetListCacheToDisk(all);
  }
);

ipcMain.handle('starnet-list-cache:clear', () => {
  try {
    if (fs.existsSync(STARNET_LIST_CACHE_FILE)) fs.unlinkSync(STARNET_LIST_CACHE_FILE);
  } catch (e) {
    console.error('[StarnetListCache] Failed to clear:', e);
  }
});
