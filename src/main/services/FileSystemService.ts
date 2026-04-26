import { dialog } from 'electron';
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'release',
  'build',
  'Build',
  'Builds',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.vite',
  'coverage',
  'TestResults',
  '__pycache__',
  '.venv',
  'venv',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'Library',
  'Temp',
  'UserSettings',
  'Archived',
  'holochain-client-csharp.backup',
  'OASIS Omniverse',
  '.DS_Store',
  '*.log',
]);

export interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
  isDirectory: boolean;
}

export class FileSystemService {
  private workspacePath: string | null = null;

  getWorkspacePath(): string | null {
    return this.workspacePath;
  }

  async pickWorkspace(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open folder as workspace',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    this.workspacePath = result.filePaths[0];
    return this.workspacePath;
  }

  setWorkspacePath(dir: string): void {
    this.workspacePath = dir;
  }

  async listTree(dir?: string): Promise<TreeNode[]> {
    const root = dir ?? this.workspacePath;
    if (!root) return [];
    return this.readDirRecursive(root, root);
  }

  /**
   * Shallow listing (default depth 2) used for holonic annotation and similar
   * analysis tasks. Safe to call on huge monorepos where a full recursive tree
   * would time out or exhaust memory.
   */
  async listRootLevel(maxDepth = 2): Promise<TreeNode[]> {
    const root = this.workspacePath;
    if (!root) return [];
    return this.readDirRecursive(root, root, 0, maxDepth);
  }

  /** One directory level (no children loaded) for path-scoped composer context. */
  async listDirectoryShallow(absolutePath: string): Promise<TreeNode[]> {
    const resolved = path.resolve(absolutePath);
    return this.readDirRecursive(resolved, resolved, 0, 0);
  }

  private async readDirRecursive(
    currentPath: string,
    rootPath: string,
    currentDepth = 0,
    maxDepth = Infinity
  ): Promise<TreeNode[]> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);
      if (this.shouldIgnore(entry.name, relativePath)) continue;
      const node: TreeNode = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
      };
      if (entry.isDirectory() && currentDepth < maxDepth) {
        try {
          node.children = await this.readDirRecursive(fullPath, rootPath, currentDepth + 1, maxDepth);
        } catch {
          node.children = [];
        }
      } else if (entry.isDirectory()) {
        node.children = [];
      }
      nodes.push(node);
    }
    nodes.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
      return a.isDirectory ? -1 : 1;
    });
    return nodes;
  }

  private shouldIgnore(name: string, relativePath: string): boolean {
    if (DEFAULT_IGNORE.has(name)) return true;
    if (name.endsWith('.log') || name.endsWith('.zip') || name.endsWith('.dmg')) return true;
    const parts = relativePath.split(path.sep);
    if (parts.some((p) => DEFAULT_IGNORE.has(p))) return true;
    return false;
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }
}
