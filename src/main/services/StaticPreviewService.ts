import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createServer } from 'net';
import { shell } from 'electron';

/**
 * Serves a folder over HTTP on 127.0.0.1 and opens the system browser.
 * Used when the user asks the IDE assistant to "run in the browser" (Cursor-like).
 */
export class StaticPreviewService {
  private proc: ChildProcess | null = null;
  private lastPort = 0;

  private async allocatePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = createServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const p = typeof addr === 'object' && addr ? addr.port : 0;
        srv.close(() => resolve(p));
      });
      srv.on('error', reject);
    });
  }

  stop(): void {
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    this.proc = null;
    this.lastPort = 0;
  }

  /**
   * @param targetPath Absolute file or directory path under the workspace
   * @param openBrowser If true, open default browser to the served root URL
   */
  async start(targetPath: string, openBrowser: boolean): Promise<{ url: string; port: number; root: string }> {
    this.stop();
    const resolved = path.resolve(targetPath.trim());
    if (!fs.existsSync(resolved)) {
      throw new Error(`Path not found: ${resolved}`);
    }
    const st = fs.statSync(resolved);
    const root = st.isDirectory() ? resolved : path.dirname(resolved);

    const port = await this.allocatePort();
    const proc = spawn(
      'python3',
      ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
      {
        cwd: root,
        stdio: 'ignore',
        detached: false,
        env: { ...process.env }
      }
    );

    const spawnErr = await new Promise<Error | null>((resolve) => {
      const done = (err: Error | null) => resolve(err);
      proc.once('error', (err) => done(err));
      setTimeout(() => done(null), 600);
    });

    if (spawnErr) {
      try {
        proc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      throw new Error(
        `Could not start Python static server (${spawnErr.message}). Install Python 3 or run a server manually in ${root}.`
      );
    }

    await new Promise((r) => setTimeout(r, 200));
    if (proc.exitCode !== null && proc.exitCode !== 0) {
      throw new Error(
        `python3 http.server exited immediately (code ${proc.exitCode}). Check Python is installed.`
      );
    }

    this.proc = proc;
    this.lastPort = port;

    const url = `http://127.0.0.1:${port}/`;
    if (openBrowser) {
      try {
        await shell.openExternal(url);
      } catch (e) {
        console.warn('[StaticPreview] shell.openExternal failed:', e);
      }
    }

    return { url, port, root };
  }

  getLastPort(): number {
    return this.lastPort;
  }
}
