import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type {
  AgentActivityMeta,
  AgentToolExecutionResult
} from '../../shared/agentTurnTypes.js';
import { buildSimpleDiffPreview } from '../../shared/diffPreview.js';
import { isAgentMcpToolAllowed } from './agentMcpAllowlist.js';
import type { FileSystemService } from './FileSystemService.js';
import type { SemanticSearchService } from './SemanticSearchService.js';
import { formatMcpToolResult } from './mcpToolResultFormat.js';

const READ_MAX_BYTES = 512 * 1024;

function lineCountUtf8(s: string): number {
  if (!s) return 0;
  return s.split('\n').length;
}

const DIFF_PREVIEW_MAX_BYTES = 384 * 1024;

function maybeDiffPreview(oldText: string, newText: string): string | null {
  if (oldText.length + newText.length > DIFF_PREVIEW_MAX_BYTES) return null;
  try {
    return buildSimpleDiffPreview(oldText, newText, { maxOutputLines: 56 });
  } catch {
    return null;
  }
}

/** Max UTF-8 bytes returned from workspace_grep (model context). */
const GREP_MAX_BYTES = 256 * 1024;

const GREP_MAX_PATTERN_LEN = 512;

/** Tavily web search: max bytes of raw HTTP response before string handling. */
const WEB_FETCH_MAX_BYTES = 1_500_000;
const WEB_FETCH_TIMEOUT_MS = 30_000;

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
  'nx',
  'git',
  'curl',
  'wget',
  'jq',
  'tar',
  'gzip',
  'gunzip',
  'bzip2',
  'bunzip2',
  'xz',
  'zip',
  'unzip',
  'find',
  'sed',
  'awk',
  'grep',
  'head',
  'tail',
  'cat',
  'ls',
  'env',
  'which',
  'uname',
  'file',
  'dirname',
  'basename',
  'realpath',
  'sort',
  'uniq',
  'cut',
  'tr',
  'wc',
  'diff',
  'patch',
  'openssl',
  'ssh-keygen'
]);

export interface AgentToolExecutorDeps {
  /** Forward to unified MCP (stdio) when present; required for \`mcp_invoke\`. */
  mcpExecuteTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Open a validated https (or localhost http) URL in the system browser for \`open_browser_url\`. */
  openExternalUrl?: (url: string) => Promise<void>;
  /** OpenAI embedding index + cosine search for \`semantic_search\`. */
  semanticSearch?: SemanticSearchService;
}

/**
 * Executes agent tool calls inside the IDE main process (workspace-scoped).
 * Expand with workspace_grep, write — see docs/OASIS_IDE_PARITY_ROADMAP.md and OAPP_IDE_AGENT_BUILD_PLAN.md
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
    // Absolute paths are allowed — the agent may write to a sibling project directory.
    // Relative paths are resolved against the workspace root (requires a workspace to be open).
    if (path.isAbsolute(userPath)) {
      return path.normalize(userPath);
    }
    if (!root) {
      throw new Error('No workspace open — provide an absolute path or open a workspace first');
    }
    return path.normalize(path.join(root, userPath));
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
        case 'codebase_search':
          return await this.codebaseSearch(toolCallId, args);
        case 'search_replace':
          return await this.searchReplace(toolCallId, args);
        case 'open_browser_url':
          return await this.openBrowserUrl(toolCallId, args);
        case 'run_workspace_command':
          return await this.runWorkspaceCommand(toolCallId, args);
        case 'write_file':
          return await this.writeFile(toolCallId, args);
        case 'write_files':
          return await this.writeFiles(toolCallId, args);
        case 'mcp_invoke':
          return await this.mcpInvoke(toolCallId, args);
        case 'run_star_cli':
          return await this.runStarCli(toolCallId, args);
        case 'web_search':
          return await this.webSearch(toolCallId, args);
        case 'fetch_url':
          return await this.fetchUrl(toolCallId, args);
        case 'semantic_search':
          return await this.semanticSearchTool(toolCallId, args);
        default:
          return {
            toolCallId,
            content: `Unknown tool: ${name}. See docs/OASIS_IDE_PARITY_ROADMAP.md for the rollout order.`,
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
    const ignoreCase = Boolean(args.ignore_case);
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
    if (ignoreCase) {
      rgArgs.push('-i');
    }
    if (literal) {
      rgArgs.push('-F');
    }
    rgArgs.push('--');
    rgArgs.push(patternRaw);
    rgArgs.push('.');

    return this.runRipgrep(toolCallId, rgArgs, cwd, 90_000, headLimit, GREP_MAX_BYTES);
  }

  /**
   * Natural-language-ish repo search: tokenize query, OR ripgrep across keywords (case-insensitive).
   * Falls back to literal substring when no keywords survive stopword filtering.
   */
  private async codebaseSearch(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return { toolCallId, content: 'codebase_search requires query (non-empty string)', isError: true };
    }
    const pathRel = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : '.';
    const glob =
      typeof args.glob === 'string' && args.glob.trim() && !args.glob.includes('..')
        ? args.glob.trim()
        : undefined;
    const headLimit =
      typeof args.max_hits === 'number' && Number.isFinite(args.max_hits) && args.max_hits > 0
        ? Math.min(Math.floor(args.max_hits), 300)
        : 120;

    let terms = extractCodebaseTerms(query);
    let pattern: string;
    let literal: boolean;
    if (terms.length === 0) {
      const q = query.length > 240 ? `${query.slice(0, 240)}…` : query;
      pattern = q;
      literal = true;
    } else if (terms.length === 1) {
      pattern = terms[0]!;
      literal = true;
    } else {
      while (terms.length > 1) {
        pattern = terms.map((t) => escapeRegExpPattern(t)).join('|');
        if (pattern.length <= GREP_MAX_PATTERN_LEN) break;
        terms = terms.slice(0, -1);
      }
      if (terms.length === 1) {
        pattern = terms[0]!;
        literal = true;
      } else {
        pattern = terms.map((t) => escapeRegExpPattern(t)).join('|');
        literal = false;
      }
    }

    const inner = await this.workspaceGrep(toolCallId, {
      pattern,
      path: pathRel,
      ...(glob ? { glob } : {}),
      literal,
      head_limit: headLimit,
      ignore_case: true
    });
    if (inner.isError) {
      return inner;
    }
    const header =
      terms.length > 1
        ? `codebase_search (OR keywords: ${terms.join(', ')})\n\n`
        : terms.length === 1
          ? `codebase_search (keyword: ${terms[0]})\n\n`
          : `codebase_search (literal substring)\n\n`;
    return { toolCallId, content: header + inner.content, isError: false };
  }

  private async openBrowserUrl(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const urlStr = typeof args.url === 'string' ? args.url.trim() : '';
    if (!urlStr) {
      return { toolCallId, content: 'open_browser_url requires url', isError: true };
    }
    const validated = validateAgentFetchUrl(urlStr);
    if (!validated.ok) {
      return { toolCallId, content: validated.error, isError: true };
    }
    const fn = this.deps.openExternalUrl;
    if (!fn) {
      return {
        toolCallId,
        content: 'open_browser_url is not available (IDE did not wire shell.openExternal).',
        isError: true
      };
    }
    try {
      await fn(validated.url.toString());
      return { toolCallId, content: `Opened in system browser: ${validated.url.toString()}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: `open_browser_url failed: ${msg}`, isError: true };
    }
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

    // Auto-create the cwd if it doesn't exist yet — the agent may specify a project dir
    // before any files have been written there.
    await fs.mkdir(cwdFull, { recursive: true });
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
    let oldText = '';
    let existed = false;
    try {
      oldText = (await fs.readFile(full)).toString('utf-8');
      existed = true;
    } catch {
      /* new file */
    }
    const newLines = lineCountUtf8(content);
    const oldLines = lineCountUtf8(oldText);
    const diffPreview = maybeDiffPreview(existed ? oldText : '', content);
    await fs.writeFile(full, content, 'utf-8');
    const activityMeta: AgentActivityMeta = {
      kind: 'file_write',
      path: p,
      addedLines: newLines,
      removedLines: existed ? oldLines : 0,
      isNewFile: !existed,
      diffPreview
    };
    return {
      toolCallId,
      content: `wrote ${content.length} chars to ${p}`,
      activityMeta
    };
  }

  /**
   * write_files — write an entire project in one tool round.
   * args.files: Array<{ path: string; content: string }>
   * Parent directories are created automatically for every file.
   */
  private async writeFiles(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const filesRaw = args.files;
    if (!Array.isArray(filesRaw) || filesRaw.length === 0) {
      return {
        toolCallId,
        content: 'write_files requires files (non-empty array of {path, content} objects)',
        isError: true
      };
    }
    if (filesRaw.length > 50) {
      return { toolCallId, content: 'write_files: max 50 files per call', isError: true };
    }

    const written: string[] = [];
    const errors: string[] = [];
    const fileStats: Array<{
      path: string;
      addedLines: number;
      removedLines: number;
      isNewFile: boolean;
      diffPreview: string | null;
    }> = [];

    for (const entry of filesRaw) {
      if (!entry || typeof entry !== 'object') { errors.push('skipped non-object entry'); continue; }
      const p = typeof (entry as any).path === 'string' ? (entry as any).path : '';
      const content = typeof (entry as any).content === 'string' ? (entry as any).content : '';
      if (!p) { errors.push('skipped entry with missing path'); continue; }
      if (content.length > 2 * 1024 * 1024) { errors.push(`${p}: too large`); continue; }
      try {
        const full = this.resolveWorkspacePath(p);
        let oldText = '';
        let existed = false;
        try {
          oldText = (await fs.readFile(full)).toString('utf-8');
          existed = true;
        } catch {
          /* new */
        }
        const newLines = lineCountUtf8(content);
        const oldLines = lineCountUtf8(oldText);
        const diffPreview = maybeDiffPreview(existed ? oldText : '', content);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content, 'utf-8');
        written.push(p);
        fileStats.push({
          path: p,
          addedLines: newLines,
          removedLines: existed ? oldLines : 0,
          isNewFile: !existed,
          diffPreview
        });
      } catch (e) {
        errors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const summary = `wrote ${written.length} file(s): ${written.join(', ')}`;
    const activityMeta: AgentActivityMeta | undefined =
      fileStats.length > 0 ? { kind: 'file_writes', files: fileStats } : undefined;
    if (errors.length > 0) {
      return {
        toolCallId,
        content: `${summary}\nerrors: ${errors.join('; ')}`,
        isError: false,
        activityMeta
      };
    }
    return { toolCallId, content: summary, activityMeta };
  }

  /**
   * Replace a unique substring in one file (Cursor-style). Prefer over write_file for small edits.
   */
  private async searchReplace(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const p = typeof args.path === 'string' ? args.path : '';
    const oldStr = typeof args.old_string === 'string' ? args.old_string : '';
    const newStr = typeof args.new_string === 'string' ? args.new_string : '';
    const replaceAll = Boolean(args.replace_all);
    if (!p) {
      return { toolCallId, content: 'search_replace requires path', isError: true };
    }
    if (!oldStr) {
      return { toolCallId, content: 'search_replace requires old_string (non-empty)', isError: true };
    }
    if (oldStr.length > READ_MAX_BYTES) {
      return { toolCallId, content: 'search_replace: old_string too large', isError: true };
    }
    let full: string;
    try {
      full = this.resolveWorkspacePath(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }
    let buf: Buffer;
    try {
      buf = await fs.readFile(full);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: msg, isError: true };
    }
    if (buf.length > READ_MAX_BYTES) {
      return {
        toolCallId,
        content: `search_replace: file too large (${buf.length} bytes; max ${READ_MAX_BYTES})`,
        isError: true
      };
    }
    const text = buf.toString('utf-8');
    if (!text.includes(oldStr)) {
      return {
        toolCallId,
        content: `search_replace: old_string not found in ${p}. Match exact whitespace and line endings (LF vs CRLF).`,
        isError: true
      };
    }
    let n = 0;
    let idx = 0;
    while ((idx = text.indexOf(oldStr, idx)) !== -1) {
      n += 1;
      idx += oldStr.length;
    }
    if (!replaceAll && n > 1) {
      return {
        toolCallId,
        content: `search_replace: ${n} matches for old_string in ${p}. Pass replace_all: true or use a longer unique old_string.`,
        isError: true
      };
    }
    const next = replaceAll ? text.split(oldStr).join(newStr) : text.replace(oldStr, newStr);
    const diffPreview = maybeDiffPreview(text, next);
    await fs.writeFile(full, next, 'utf-8');
    const repCount = replaceAll ? n : 1;
    const activityMeta: AgentActivityMeta = {
      kind: 'search_replace',
      path: p,
      replacementCount: repCount,
      diffPreview
    };
    return {
      toolCallId,
      content: `search_replace: updated ${p} (${replaceAll ? n : 1} replacement(s), ${next.length} chars)`,
      activityMeta
    };
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

    await fs.mkdir(cwdFull, { recursive: true });
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

  /**
   * Public web search via Tavily (https://tavily.com). Requires TAVILY_API_KEY in OASIS-IDE/.env.
   */
  private async webSearch(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return { toolCallId, content: 'web_search requires query (non-empty string)', isError: true };
    }
    let maxResults = 5;
    if (typeof args.max_results === 'number' && Number.isFinite(args.max_results)) {
      maxResults = Math.min(10, Math.max(1, Math.floor(args.max_results)));
    }
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
      return {
        toolCallId,
        content:
          'web_search requires TAVILY_API_KEY in OASIS-IDE/.env (get a key at https://tavily.com). Restart the IDE after setting the variable.',
        isError: true
      };
    }
    const body = {
      api_key: apiKey,
      query,
      search_depth: 'basic',
      include_answer: true,
      max_results: maxResults
    };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45_000);
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          toolCallId,
          content: `Tavily HTTP ${res.status}: ${text.slice(0, 2000)}`,
          isError: true
        };
      }
      let data: unknown;
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        return { toolCallId, content: 'web_search: invalid JSON from Tavily', isError: true };
      }
      return { toolCallId, content: formatTavilyResponse(data) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: `web_search failed: ${msg}`, isError: true };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * GET a public URL and return body text (HTML stripped loosely). SSRF guard for private IPs and metadata hosts.
   */
  private async fetchUrl(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const urlStr = typeof args.url === 'string' ? args.url.trim() : '';
    if (!urlStr) {
      return { toolCallId, content: 'fetch_url requires url', isError: true };
    }
    let maxChars = 80_000;
    if (typeof args.max_chars === 'number' && Number.isFinite(args.max_chars)) {
      maxChars = Math.min(200_000, Math.max(1000, Math.floor(args.max_chars)));
    }
    const validated = validateAgentFetchUrl(urlStr);
    if (!validated.ok) {
      return { toolCallId, content: validated.error, isError: true };
    }
    const target = validated.url;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), WEB_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: ac.signal,
        headers: {
          'User-Agent': 'OASIS-IDE/1.0 (agent fetch_url)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5'
        }
      });
      const ct = res.headers.get('content-type') ?? '';
      const buf = await res.arrayBuffer();
      if (!res.ok) {
        return {
          toolCallId,
          content: `fetch_url: HTTP ${res.status} ${res.statusText} (${ct})`,
          isError: true
        };
      }
      if (buf.byteLength > WEB_FETCH_MAX_BYTES) {
        return {
          toolCallId,
          content: `fetch_url: response too large (${buf.byteLength} bytes; max ${WEB_FETCH_MAX_BYTES}).`,
          isError: true
        };
      }
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      let text = raw;
      if (/html/i.test(ct) || /^\s*</.test(raw.slice(0, 120))) {
        text = htmlToLoosePlainText(raw);
      }
      if (text.length > maxChars) {
        text = `${text.slice(0, maxChars)}\n\n…(truncated to max_chars)`;
      }
      return {
        toolCallId,
        content: `URL: ${target.toString()}\nContent-Type: ${ct}\n\n${text}`
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { toolCallId, content: `fetch_url failed: ${msg}`, isError: true };
    } finally {
      clearTimeout(timer);
    }
  }

  private async semanticSearchTool(
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<AgentToolExecutionResult> {
    const svc = this.deps.semanticSearch;
    if (!svc) {
      return {
        toolCallId,
        content: 'semantic_search is not wired in this IDE build.',
        isError: true
      };
    }
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const limit =
      typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.floor(args.limit) : undefined;
    const pathPrefix =
      typeof args.path_prefix === 'string' && args.path_prefix.trim()
        ? args.path_prefix.trim()
        : undefined;
    const refreshIndex = Boolean(args.refresh_index);
    const root = this.fileSystem.getWorkspacePath();
    const r = await svc.search(root, query, { limit, pathPrefix, refreshIndex });
    return { toolCallId, content: r.text, isError: r.isError };
  }
}

/** Stopwords for codebase_search tokenization (keyword OR search over rg). */
const CODEBASE_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'and',
  'but',
  'if',
  'or',
  'because',
  'until',
  'while',
  'although',
  'though',
  'this',
  'that',
  'these',
  'those',
  'what',
  'which',
  'who',
  'whom',
  'it',
  'its',
  'they',
  'them',
  'their',
  'we',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'i',
  'me',
  'my',
  'find',
  'show',
  'code',
  'file',
  'files',
  'repo',
  'project',
  'about',
  'using',
  'use',
  'uses',
  'used',
  'get',
  'gets',
  'see',
  'look',
  'looks',
  'want',
  'wants',
  'make',
  'makes',
  'work',
  'works',
  'working',
  'help',
  'helps',
  'tell',
  'tells',
  'know',
  'doing'
]);

function extractCodebaseTerms(q: string): string[] {
  const raw = q.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  const out: string[] = [];
  for (const w of raw) {
    if (w.length < 2 || CODEBASE_STOPWORDS.has(w)) continue;
    out.push(w);
    if (out.length >= 8) break;
  }
  return out;
}

function escapeRegExpPattern(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatTavilyResponse(data: unknown): string {
  const o = data as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof o.answer === 'string' && o.answer.trim()) {
    lines.push('## Answer (Tavily)');
    lines.push(o.answer.trim());
    lines.push('');
  }
  const results = o.results;
  if (!Array.isArray(results) || results.length === 0) {
    lines.push(results === undefined ? '(No results array in response)' : '(No results)');
    return lines.join('\n').trim();
  }
  lines.push('## Results');
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title : '';
    const url = typeof row.url === 'string' ? row.url : '';
    const content = typeof row.content === 'string' ? row.content : '';
    lines.push(`### ${title || url || 'Result'}`);
    if (url) lines.push(`Source: ${url}`);
    if (content) lines.push(content.trim());
    lines.push('');
  }
  return lines.join('\n').trim();
}

function htmlToLoosePlainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Block SSRF to private nets, link-local, CGNAT, and cloud metadata endpoints. */
function validateAgentFetchUrl(
  urlStr: string
): { ok: true; url: URL } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return { ok: false, error: 'fetch_url: invalid URL' };
  }
  if (u.username || u.password) {
    return { ok: false, error: 'fetch_url: URL must not embed credentials' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'fetch_url: only http and https are allowed' };
  }
  const host = u.hostname.toLowerCase();
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (u.protocol === 'http:' && !isLocal) {
    return { ok: false, error: 'fetch_url: http is only allowed for localhost or 127.0.0.1' };
  }
  if (
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    host === 'metadata.azure.com'
  ) {
    return { ok: false, error: 'fetch_url: host not allowed' };
  }
  if (isBlockedPrivateIpLiteral(host)) {
    return { ok: false, error: 'fetch_url: private or reserved IP literals are not allowed' };
  }
  return { ok: true, url: u };
}

function isBlockedPrivateIpLiteral(hostname: string): boolean {
  const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((x) => x > 255)) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return false;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}
