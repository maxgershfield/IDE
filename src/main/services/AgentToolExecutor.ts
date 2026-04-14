import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type { AgentToolExecutionResult } from '../../shared/agentTurnTypes.js';
import { isAgentMcpToolAllowed } from './agentMcpAllowlist.js';
import type { FileSystemService } from './FileSystemService.js';
import { formatMcpToolResult } from './mcpToolResultFormat.js';

const READ_MAX_BYTES = 512 * 1024;

/** Max UTF-8 bytes returned from workspace_grep (model context). */
const GREP_MAX_BYTES = 256 * 1024;

const GREP_MAX_PATTERN_LEN = 512;

/** First argv token basename (no shell) — keep tight to reduce abuse from model-supplied argv. */
const RUN_WORKSPACE_ALLOWED = new Set([
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'corepack',
  'node',
  'make',
  'cmake',
  'cargo',
  'rustc',
  'go',
  'dotnet',
  'python3',
  'python',
  'pip',
  'pip3',
  'mvn',
  'gradle',
  'gradlew',
  'tsc',
  'vite',
  'webpack',
  'esbuild',
  'rollup',
  'turbo',
  'nx'
]);

export interface AgentToolExecutorDeps {
  /** Forward to unified MCP (stdio) when present; required for \`mcp_invoke\`. */
  mcpExecuteTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Executes agent tool calls inside the IDE main process (workspace-scoped).
 * Expand with workspace_grep, write — see docs/CURSOR_PARITY_ROADMAP.md and OAPP_IDE_AGENT_BUILD_PLAN.md
 */
export class AgentToolExecutor {
  constructor(
    private readonly fileSystem: FileSystemService,
    private readonly deps: AgentToolExecutorDeps = {}
  ) {}

  /**
   * Resolve a user-supplied path (absolute or relative to workspace) to a real path under workspace.
   */
  private resolveWorkspacePath(userPath: string): string {
    const root = this.fileSystem.getWorkspacePath();
    if (!root) {
      throw new Error('No workspace open');
    }
    const abs = path.isAbsolute(userPath)
      ? path.normalize(userPath)
      : path.normalize(path.join(root, userPath));
    const rootResolved = path.resolve(root);
    const target = path.resolve(abs);
    const rel = path.relative(rootResolved, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Path escapes workspace');
    }
    return target;
  }

  async execute(toolCallId: string, name: string, argsJson: string): Promise<AgentToolExecutionResult> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      return {
        toolCallId,
        content: 'Invalid JSON in tool arguments',
        isError: true
      };
    }

    try {
      switch (name) {
        case 'read_file':
          return await this.readFile(toolCallId, args);
        case 'list_directory':
          return await this.listDirectory(toolCallId, args);
        case 'workspace_grep':
          return await this.workspaceGrep(toolCallId, args);
        case 'run_workspace_command':
          return await this.runWorkspaceCommand(toolCallId, args);
        case 'write_file':
          return await this.writeFile(toolCallId, args);
        case 'mcp_invoke':
          return await this.mcpInvoke(toolCallId, args);
        case 'run_star_cli':
          return await this.runStarCli(toolCallId, args);
        default:
          return {
            toolCallId,
            content: `Unknown tool: ${name}. See docs/CURSOR_PARITY_ROADMAP.md for the rollout order.`,
            isError: true
          };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { toolCallId, content: msg, isError: true };
    }
  }

  private async readFile(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const p = typeof args.path === 'string' ? args.path : '';
    if (!p) {
      return { toolCallId, content: 'read_file requires path', isError: true };
    }
    let full: string;
    try {
      full = this.resolveWorkspacePath(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        toolCallId,
        content: `${msg} (path was: ${p}). Paths must be under the open workspace root; try list_directory on the parent folder.`,
        isError: true
      };
    }
    try {
      const buf = await fs.readFile(full);
      if (buf.length > READ_MAX_BYTES) {
        return {
          toolCallId,
          content: `File too large (${buf.length} bytes; max ${READ_MAX_BYTES}).`,
          isError: true
        };
      }
      return { toolCallId, content: buf.toString('utf-8') };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        const parent = path.dirname(p) || '.';
        return {
          toolCallId,
          content: `File not found: ${p} (resolved to ${full}). list_directory on "${parent}" to see exact names; markdown plans are often under a Docs/ subfolder.`,
          isError: true
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }
  }

  private async listDirectory(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const p = typeof args.path === 'string' ? args.path : '.';
    const full = this.resolveWorkspacePath(p);
    const entries = await fs.readdir(full, { withFileTypes: true });
    const lines = entries.map((e) => `${e.isDirectory() ? 'dir ' : 'file'} ${e.name}`);
    return { toolCallId, content: lines.join('\n') };
  }

  /**
   * Run ripgrep (`rg`) under a workspace-relative directory. Requires `rg` on PATH.
   * Exit 1 with no output means no matches (not an error).
   */
  private async workspaceGrep(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const patternRaw = typeof args.pattern === 'string' ? args.pattern.trim() : '';
    if (!patternRaw) {
      return { toolCallId, content: 'workspace_grep requires pattern (non-empty string).', isError: true };
    }
    if (patternRaw.length > GREP_MAX_PATTERN_LEN) {
      return {
        toolCallId,
        content: `workspace_grep pattern exceeds max length (${GREP_MAX_PATTERN_LEN}).`,
        isError: true
      };
    }

    const pathRel = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : '.';
    let resolved: string;
    try {
      resolved = this.resolveWorkspacePath(pathRel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }

    const st = await fs.stat(resolved).catch(() => null);
    if (!st) {
      return { toolCallId, content: `workspace_grep path not found: ${pathRel}`, isError: true };
    }
    const cwd = st.isFile() ? path.dirname(resolved) : resolved;

    const globArg =
      typeof args.glob === 'string' && args.glob.trim() && !args.glob.includes('..')
        ? args.glob.trim()
        : '';
    const literal = Boolean(args.literal);
    const headLimit =
      typeof args.head_limit === 'number' && Number.isFinite(args.head_limit) && args.head_limit > 0
        ? Math.min(Math.floor(args.head_limit), 500)
        : 200;

    const rgArgs: string[] = [
      '-n',
      '--color',
      'never',
      '--no-messages',
      '--max-columns',
      '240',
      '--max-filesize',
      '2M'
    ];
    if (globArg) {
      rgArgs.push('--glob', globArg);
    }
    if (literal) {
      rgArgs.push('-F');
    }
    rgArgs.push('--');
    rgArgs.push(patternRaw);
    rgArgs.push('.');

    return this.runRipgrep(toolCallId, rgArgs, cwd, 90_000, headLimit, GREP_MAX_BYTES);
  }

  private runRipgrep(
    toolCallId: string,
    rgArgs: string[],
    cwd: string,
    timeoutMs: number,
    headLimit: number,
    maxBytes: number
  ): Promise<AgentToolExecutionResult> {
    return new Promise((resolve) => {
      let combined = '';
      let lineCount = 0;
      let stoppedEarly = false;
      let timedOut = false;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (result: AgentToolExecutionResult) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        resolve(result);
      };

      const pathWithHomebrew = ['/usr/local/bin', '/opt/homebrew/bin', process.env.PATH ?? '']
        .filter(Boolean)
        .join(path.delimiter);
      const child = spawn('rg', rgArgs, {
        cwd,
        env: { ...process.env, PATH: pathWithHomebrew },
        shell: false,
        windowsHide: true
      });

      const appendChunk = (chunk: Buffer) => {
        if (stoppedEarly) return;
        let s = chunk.toString('utf-8');
        if (combined.length >= maxBytes) {
          combined += '\n… (output truncated: byte limit)';
          stoppedEarly = true;
          try {
            child.kill('SIGTERM');
          } catch {
            /* ignore */
          }
          return;
        }
        const room = maxBytes - combined.length;
        if (s.length > room) {
          s = s.slice(0, room);
        }
        const newLines = (s.match(/\n/g) || []).length;
        if (lineCount + newLines >= headLimit) {
          const need = headLimit - lineCount;
          if (need <= 0) {
            combined += '\n… (stopped: head_limit reached)';
            stoppedEarly = true;
            try {
              child.kill('SIGTERM');
            } catch {
              /* ignore */
            }
            return;
          }
          let cut = 0;
          let seen = 0;
          for (let i = 0; i < s.length; i++) {
            if (s[i] === '\n') {
              seen++;
              if (seen >= need) {
                cut = i + 1;
                break;
              }
            }
          }
          combined += cut > 0 ? s.slice(0, cut) : s;
          combined += '\n… (stopped: head_limit reached)';
          lineCount = headLimit;
          stoppedEarly = true;
          try {
            child.kill('SIGTERM');
          } catch {
            /* ignore */
          }
          return;
        }
        combined += s;
        lineCount += newLines;
      };

      timer = setTimeout(() => {
        timedOut = true;
        stoppedEarly = true;
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }, timeoutMs);

      child.stdout?.on('data', appendChunk);
      child.stderr?.on('data', appendChunk);

      child.on('error', (err: NodeJS.ErrnoException) => {
        const msg = err.message || String(err);
        const noRg = err.code === 'ENOENT' || /ENOENT/i.test(msg);
        finish({
          toolCallId,
          content: noRg
            ? 'ripgrep (rg) is not installed or not on PATH. Install from https://github.com/BurntSushi/ripgrep/releases or use list_directory and read_file. On macOS: brew install ripgrep.'
            : msg,
          isError: true
        });
      });

      child.on('close', (code, signal) => {
        if (settled) return;
        if (timer !== undefined) clearTimeout(timer);
        const text = combined.trimEnd();
        if (timedOut) {
          finish({
            toolCallId,
            content: text ? `${text}\n---\n(timed out)` : '(no output; timed out)',
            isError: false
          });
          return;
        }
        if (text.length > 0) {
          finish({ toolCallId, content: text });
          return;
        }
        if (code === 1) {
          finish({ toolCallId, content: '(no matches)' });
          return;
        }
        if (code === 0) {
          finish({ toolCallId, content: '(no matches)' });
          return;
        }
        if (code === 2) {
          finish({ toolCallId, content: 'rg reported an error (exit 2).', isError: true });
          return;
        }
        finish({
          toolCallId,
          content: `rg exited with code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}.`,
          isError: true
        });
      });
    });
  }

  private allowedArgv0(raw: string): boolean {
    const t = raw.trim();
    if (!t || t.includes('..')) return false;
    const base = path.basename(t.replace(/\\/g, '/'));
    const lower = base.toLowerCase();
    const key = lower.replace(/\.(exe|cmd|bat)$/i, '');
    return RUN_WORKSPACE_ALLOWED.has(key);
  }

  private async runWorkspaceCommand(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const argvRaw = args.argv;
    if (!Array.isArray(argvRaw) || argvRaw.length === 0) {
      return {
        toolCallId,
        content:
          'run_workspace_command requires argv (string array), e.g. ["npm","ci"] or ["npm","run","build"]. Optional cwd (directory under workspace, default ".").',
        isError: true
      };
    }
    const argv = argvRaw.map((a) => String(a ?? '').trim()).filter(Boolean);
    if (argv.length === 0) {
      return { toolCallId, content: 'argv must contain at least one non-empty string', isError: true };
    }
    if (!this.allowedArgv0(argv[0])) {
      return {
        toolCallId,
        content: `First argv token not allowed: ${argv[0]}. Use a standard CLI (npm, yarn, cargo, dotnet, make, …).`,
        isError: true
      };
    }

    const cwdRel =
      typeof args.cwd === 'string' && args.cwd.trim().length > 0 ? args.cwd.trim() : '.';
    let cwdFull: string;
    try {
      cwdFull = this.resolveWorkspacePath(cwdRel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }

    const st = await fs.stat(cwdFull).catch(() => null);
    if (!st?.isDirectory()) {
      return { toolCallId, content: `cwd is not a directory: ${cwdRel}`, isError: true };
    }

    const capTimeout =
      typeof args.timeoutMs === 'number' && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
        ? Math.min(Math.floor(args.timeoutMs), 600_000)
        : 600_000;

    try {
      const log = await this.spawnAndCollect(argv[0], argv.slice(1), cwdFull, capTimeout);
      return { toolCallId, content: log };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }
  }

  private spawnAndCollect(
    command: string,
    argvRest: string[],
    cwd: string,
    timeoutMs: number
  ): Promise<string> {
    const maxBytes = 256 * 1024;
    return new Promise((resolve, reject) => {
      const child = spawn(command, argvRest, {
        cwd,
        env: process.env,
        shell: false,
        windowsHide: true
      });

      let combined = '';
      const append = (chunk: Buffer) => {
        const s = chunk.toString('utf-8');
        if (combined.length >= maxBytes) return;
        const room = maxBytes - combined.length;
        combined += s.length <= room ? s : `${s.slice(0, room)}\n… (output truncated)`;
      };

      child.stdout?.on('data', append);
      child.stderr?.on('data', append);

      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }, timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const tail = `\n---\nexit_code: ${code ?? 'null'}${signal ? ` signal: ${signal}` : ''}`;
        resolve(combined + tail);
      });
    });
  }

  private async writeFile(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const p = typeof args.path === 'string' ? args.path : '';
    const content = typeof args.content === 'string' ? args.content : '';
    if (!p) {
      return { toolCallId, content: 'write_file requires path', isError: true };
    }
    if (content.length > 2 * 1024 * 1024) {
      return { toolCallId, content: 'write_file: content too large (max 2 MiB)', isError: true };
    }
    let full: string;
    try {
      full = this.resolveWorkspacePath(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
    return { toolCallId, content: `wrote ${content.length} chars to ${p}` };
  }

  private async mcpInvoke(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const tool = typeof args.tool === 'string' ? args.tool.trim() : '';
    if (!tool) {
      return {
        toolCallId,
        content: 'mcp_invoke requires tool (string), e.g. "oasis_health_check" or "star_list_oapps".',
        isError: true
      };
    }
    if (!isAgentMcpToolAllowed(tool)) {
      return {
        toolCallId,
        content: `MCP tool not allowed for agent: ${tool}. Use an allowlisted oasis_* or star_* tool.`,
        isError: true
      };
    }
    const fn = this.deps.mcpExecuteTool;
    if (!fn) {
      return {
        toolCallId,
        content: 'MCP is not wired in this build (mcp_invoke unavailable).',
        isError: true
      };
    }
    const rawArgs =
      args.arguments !== undefined && args.arguments !== null && typeof args.arguments === 'object'
        ? (args.arguments as Record<string, unknown>)
        : {};
    try {
      const result = await fn(tool, rawArgs);
      const text = formatMcpToolResult(result);
      const r = result as { isError?: boolean };
      return { toolCallId, content: text, isError: Boolean(r?.isError) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }
  }

  /**
   * Run STAR CLI (\`star\`) with argv[0] === "star". Command resolved from \`STAR_CLI_PATH\` or PATH.
   */
  private async runStarCli(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const argvRaw = args.argv;
    if (!Array.isArray(argvRaw) || argvRaw.length === 0) {
      return {
        toolCallId,
        content:
          'run_star_cli requires argv with first token "star", e.g. ["star","help"] or ["star","-n","oapp","list"]. Optional cwd (under workspace).',
        isError: true
      };
    }
    const argv = argvRaw.map((a) => String(a ?? '').trim()).filter(Boolean);
    if (argv.length === 0 || argv[0] !== 'star') {
      return {
        toolCallId,
        content: 'run_star_cli requires argv[0] to be exactly "star" (use STAR_CLI_PATH env for a non-PATH binary).',
        isError: true
      };
    }

    const cwdRel =
      typeof args.cwd === 'string' && args.cwd.trim().length > 0 ? args.cwd.trim() : '.';
    let cwdFull: string;
    try {
      cwdFull = this.resolveWorkspacePath(cwdRel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }

    const st = await fs.stat(cwdFull).catch(() => null);
    if (!st?.isDirectory()) {
      return { toolCallId, content: `cwd is not a directory: ${cwdRel}`, isError: true };
    }

    const capTimeout =
      typeof args.timeoutMs === 'number' && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0
        ? Math.min(Math.floor(args.timeoutMs), 600_000)
        : 600_000;

    const command = process.env.STAR_CLI_PATH?.trim() || 'star';

    try {
      const log = await this.spawnAndCollect(command, argv.slice(1), cwdFull, capTimeout);
      return { toolCallId, content: log };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }
  }
}
