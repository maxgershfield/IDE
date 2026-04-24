import { spawn } from 'child_process';

const OUTPUT_CAP = 200 * 1024;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 min

/**
 * Run `npm install` in a directory. Uses npm.cmd on Windows.
 */
export function runNpmInstall(
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ ok: boolean; log: string; exitCode: number | null }> {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npm.cmd' : 'npm';

  return new Promise((resolve) => {
    let combined = '';
    const append = (chunk: Buffer) => {
      const s = chunk.toString('utf-8');
      if (combined.length >= OUTPUT_CAP) return;
      const room = OUTPUT_CAP - combined.length;
      combined += s.length <= room ? s : `${s.slice(0, room)}\n… (truncated)`;
    };

    const child = spawn(
      cmd,
      ['install', '--no-fund', '--no-audit', '--loglevel', 'error'],
      {
        cwd,
        env: process.env,
        windowsHide: true,
        shell: false,
      }
    );

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
      combined += `\n[spawn] ${err.message}`;
      resolve({ ok: false, log: combined, exitCode: null });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      if (!ok) {
        combined += `\n---\nnpm install exit code: ${code ?? 'null'}`;
      }
      resolve({ ok, log: combined, exitCode: code });
    });
  });
}
