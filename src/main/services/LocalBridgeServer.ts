import http from 'http';
import { EventEmitter } from 'events';

export interface TelegramTask {
  taskId: string;
  text: string;
  fromId: number;
  fromUsername?: string;
  fromFirstName?: string;
  chatId: number;
  receivedAt: string;
}

export class LocalBridgeServer extends EventEmitter {
  private server: http.Server | null = null;
  private port: number;
  private secret: string;
  private queue: TelegramTask[] = [];

  constructor(port: number, secret: string) {
    super();
    this.port = port;
    this.secret = secret;
  }

  getQueuedTasks(): TelegramTask[] {
    return [...this.queue];
  }

  removeTask(taskId: string): void {
    this.queue = this.queue.filter((t) => t.taskId !== taskId);
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const secret = req.headers['x-bridge-secret'];
        if (!secret || secret !== this.secret) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        const url = req.url ?? '/';

        if (req.method === 'GET' && url === '/api/ide/ping') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, ide: 'oasis' }));
          return;
        }

        if (req.method === 'POST' && url === '/api/ide/inbound') {
          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            if (body.length > 64_000) {
              res.writeHead(413);
              res.end('Payload too large');
              req.destroy();
            }
          });
          req.on('end', () => {
            try {
              const task = JSON.parse(body) as TelegramTask;
              if (!task.taskId || typeof task.text !== 'string') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid payload' }));
                return;
              }
              task.text = task.text.trim();
              this.queue.push(task);
              this.emit('task', task);
              console.log(`[LocalBridgeServer] Task queued: ${task.taskId}`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, taskId: task.taskId }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[LocalBridgeServer] Port ${this.port} in use; bridge disabled.`);
          resolve();
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[LocalBridgeServer] Listening on 127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}
