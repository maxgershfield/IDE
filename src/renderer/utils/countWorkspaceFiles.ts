import type { TreeNode } from '../contexts/WorkspaceContext';

/** Count file (non-directory) nodes in the explorer tree. */
export function countWorkspaceFiles(nodes: TreeNode[]): number {
  let n = 0;
  const walk = (arr: TreeNode[]) => {
    for (const node of arr) {
      if (!node.isDirectory) n += 1;
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return n;
}
