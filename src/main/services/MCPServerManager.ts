import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getResolvedStarApiBaseUrl } from './starApiUrlResolve.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Minimal KEY=VAL .env parser (no export keyword, no command substitution). */
function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, 'utf8');
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
    if (key) out[key] = val;
  }
  return out;
}

interface MCPServerConnection {
  client: Client;
  transport: StdioClientTransport;
  status: 'running' | 'stopped' | 'error';
  tools: any[];
}

/**
 * Resolve path to the OASIS MCP server entry script.
 * - OASIS_MCP_SERVER_PATH: explicit path to dist/src/index.js (for external repo or custom install)
 * - Else: monorepo layout OASIS-IDE/.../services/ -> ../../../../MCP/dist/src/index.js
 */
function getMCPServerPath(): string {
  const envPath = process.env.OASIS_MCP_SERVER_PATH;
  if (envPath && envPath.trim()) {
    return path.resolve(envPath.trim());
  }
  return path.join(__dirname, '../../../../MCP/dist/src/index.js');
}

export class MCPServerManager {
  private servers: Map<string, MCPServerConnection> = new Map();
  private mcpServerPath: string;
  /**
   * Resolved ONODE base URL (from env + Settings); when set, overrides `process.env.OASIS_API_URL`
   * for the stdio MCP child so it matches `OASISAPIClient`.
   */
  private oasisApiUrlResolved: string | null = null;
  /** JWT for ONODE-backed oasis_* MCP tools; applied on next MCP process start. */
  private oasisJwtToken: string | null = null;
  /** Avatar id for STAR WebAPI X-Avatar-Id when JWT omits it; applied on next MCP process start. */
  private oasisAvatarId: string | null = null;

  constructor() {
    this.mcpServerPath = getMCPServerPath();

    if (!fs.existsSync(this.mcpServerPath)) {
      console.error(`[MCP] MCP server not found at: ${this.mcpServerPath}`);
      console.error(
        '[MCP] Set OASIS_MCP_SERVER_PATH to the path of MCP dist/src/index.js, or from monorepo: cd MCP && npm run build'
      );
    }
  }

  /**
   * Set JWT for MCP child process env (\`OASIS_JWT_TOKEN\` / \`OASIS_API_KEY\`).
   * Call \`restartOASISMCP()\` after login/logout so the server picks up the token.
   */
  setOasisJwtToken(token: string | null): void {
    this.oasisJwtToken = token && token.trim() ? token.trim() : null;
  }

  /**
   * Set current avatar id for MCP child env (`OASIS_AVATAR_ID`) so STAR `star_*` tools send X-Avatar-Id.
   * Call after login and pass null on logout; restart MCP to apply.
   */
  setOasisAvatarId(avatarId: string | null | undefined): void {
    const t = avatarId?.trim();
    this.oasisAvatarId = t ? t : null;
  }

  /**
   * Keep stdio OASIS MCP HTTP calls aligned with the IDE `OASISAPIClient` (same precedence as main process).
   */
  setOasisApiUrlResolved(url: string): void {
    const t = url?.trim();
    this.oasisApiUrlResolved = t ? t.replace(/\/$/, '') : null;
  }

  private buildMcpChildEnv(): Record<string, string> {
    const env: Record<string, string> = { ...getDefaultEnvironment() };
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string' && v.length > 0) {
        env[k] = v;
      }
    }
    const apiUrl =
      this.oasisApiUrlResolved ||
      process.env.OASIS_API_URL?.trim() ||
      'http://127.0.0.1:5003';
    env.OASIS_API_URL = apiUrl;
    if (this.oasisJwtToken) {
      env.OASIS_JWT_TOKEN = this.oasisJwtToken;
      env.OASIS_API_KEY = this.oasisJwtToken;
    } else {
      delete env.OASIS_JWT_TOKEN;
      delete env.OASIS_API_KEY;
    }

    if (this.oasisAvatarId) {
      env.OASIS_AVATAR_ID = this.oasisAvatarId;
    } else {
      delete env.OASIS_AVATAR_ID;
    }

    const mcpDistDir = path.dirname(this.mcpServerPath);
    const mcpRoot = path.resolve(mcpDistDir, '..', '..');
    const ideRoot = path.resolve(mcpRoot, '..', 'OASIS-IDE');
    const mcpDotEnv = parseEnvFile(path.join(mcpRoot, '.env'));
    const ideDotEnv = parseEnvFile(path.join(ideRoot, '.env'));

    const starUrl =
      process.env.STAR_API_URL?.trim() ||
      ideDotEnv.STAR_API_URL?.trim() ||
      mcpDotEnv.STAR_API_URL?.trim() ||
      getResolvedStarApiBaseUrl();
    env.STAR_API_URL = starUrl;

    const elevenLabsKey =
      process.env.ELEVENLABS_API_KEY?.trim() ||
      ideDotEnv.ELEVENLABS_API_KEY?.trim() ||
      mcpDotEnv.ELEVENLABS_API_KEY?.trim();
    if (elevenLabsKey) {
      env.ELEVENLABS_API_KEY = elevenLabsKey;
    }

    return env;
  }

  /** Stop and start the unified MCP server (e.g. after auth changes). */
  async restartOASISMCP(): Promise<void> {
    await this.stopServer('oasis-unified');
    await this.startOASISMCP();
  }

  async startOASISMCP(): Promise<void> {
    try {
      console.log('[MCP] Starting OASIS MCP server...');
      console.log('[MCP] Server path:', this.mcpServerPath);

      if (!fs.existsSync(this.mcpServerPath)) {
        const error = `MCP server not found at ${this.mcpServerPath}. Please build it first: cd MCP && npm run build`;
        console.error(`[MCP] ${error}`);
        throw new Error(error);
      }

      const client = new Client(
        {
          name: 'oasis-ide',
          version: '1.0.0'
        },
        {
          capabilities: {}
        }
      );

      const transport = new StdioClientTransport({
        command: 'node',
        args: [this.mcpServerPath],
        env: this.buildMcpChildEnv()
      });

      await client.connect(transport);

      const listResult = await client.listTools();
      const tools = listResult.tools || [];

      this.servers.set('oasis-unified', {
        client,
        transport,
        status: 'running',
        tools
      });

      console.log(`[MCP] OASIS MCP server started with ${tools.length} tools`);

      transport.onclose = () => {
        const conn = this.servers.get('oasis-unified');
        if (conn) conn.status = 'stopped';
      };
      transport.onerror = (error: unknown) => {
        console.error('[MCP] Transport error:', error);
        const conn = this.servers.get('oasis-unified');
        if (conn) conn.status = 'error';
      };
    } catch (error: any) {
      console.error('[MCP] Failed to start server:', error);
      throw error;
    }
  }

  async listTools(serverName: string = 'oasis-unified'): Promise<any[]> {
    const conn = this.servers.get(serverName);
    if (!conn || conn.status !== 'running') {
      throw new Error(`Server ${serverName} is not running`);
    }
    return conn.tools;
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    const conn = this.servers.get('oasis-unified');
    if (!conn || conn.status !== 'running') {
      throw new Error('OASIS MCP server is not running');
    }

    try {
      const result = await conn.client.callTool({
        name: toolName,
        arguments: args || {}
      });
      return result;
    } catch (error: any) {
      console.error('[MCP] Tool execution error:', error);
      throw new Error(`Failed to execute tool ${toolName}: ${error.message}`);
    }
  }

  getServer(serverName: string): MCPServerConnection | undefined {
    return this.servers.get(serverName);
  }

  async stopServer(serverName: string): Promise<void> {
    const conn = this.servers.get(serverName);
    if (conn) {
      await conn.transport.close();
      this.servers.delete(serverName);
    }
  }
}
