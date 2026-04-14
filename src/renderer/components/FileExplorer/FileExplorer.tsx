import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import type { TreeNode } from '../../contexts/WorkspaceContext';
import './FileExplorer.css';

function FileTreeItem({
  node,
  openFile,
  onContextMenuNode,
  level = 0,
}: {
  node: TreeNode;
  openFile: (path: string) => void;
  onContextMenuNode: (e: React.MouseEvent, node: TreeNode) => void;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.isDirectory && node.children && node.children.length > 0;

  const handleClick = () => {
    if (node.isDirectory) {
      setExpanded((e) => !e);
    } else {
      openFile(node.path);
    }
  };

  return (
    <div className="file-tree-item" style={{ paddingLeft: level * 12 + 4 }}>
      <div
        className={`file-tree-node ${node.isDirectory ? 'folder' : 'file'}`}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenuNode(e, node)}
      >
        {node.isDirectory && (
          <span className="file-tree-chevron">{expanded ? '▼' : '▶'}</span>
        )}
        {!node.isDirectory && <span className="file-tree-chevron file-icon">📄</span>}
        <span className="file-tree-name">{node.name}</span>
      </div>
      {node.isDirectory && expanded && hasChildren && (
        <div className="file-tree-children">
          {node.children!.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              openFile={openFile}
              onContextMenuNode={onContextMenuNode}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileExplorerProps {
  onLoginClick?: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ onLoginClick }) => {
  const { workspacePath, tree, pickWorkspace, openFile, refreshTree } = useWorkspace();
  const { loggedIn, username, logout } = useAuth();
  const { addReference, requestNewChatWithPaths } = useIdeChat();
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const handleContextMenuNode = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, node });
  };

  const copyPath = async (p: string) => {
    try {
      await navigator.clipboard.writeText(p);
    } catch {
      /* ignore */
    }
    setMenu(null);
  };

  const revealInFinder = async (p: string) => {
    const api = window.electronAPI;
    if (api?.revealInFinder) {
      await api.revealInFinder(p);
    }
    setMenu(null);
  };

  const ctxMenu =
    menu &&
    createPortal(
      <div
        className="file-explorer-ctx-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="file-explorer-ctx-item"
          role="menuitem"
          onClick={() => {
            addReference(menu.node.path);
            setMenu(null);
          }}
        >
          Add to Chat
        </button>
        <button
          type="button"
          className="file-explorer-ctx-item"
          role="menuitem"
          onClick={() => {
            requestNewChatWithPaths([menu.node.path]);
            setMenu(null);
          }}
        >
          Add to New Chat
        </button>
        <div className="file-explorer-ctx-sep" role="separator" />
        <button
          type="button"
          className="file-explorer-ctx-item"
          role="menuitem"
          onClick={() => void copyPath(menu.node.path)}
        >
          Copy Path
        </button>
        <button
          type="button"
          className="file-explorer-ctx-item"
          role="menuitem"
          onClick={() => void revealInFinder(menu.node.path)}
        >
          Reveal in Finder
        </button>
      </div>,
      document.body
    );

  return (
    <div className="file-explorer panel">
      {ctxMenu}
      <div className="panel-header file-explorer-header">
        <span>Explorer</span>
        <div className="file-explorer-actions">
          <button
            type="button"
            className="icon-button"
            onClick={refreshTree}
            title="Refresh"
          >
            ↻
          </button>
          <button
            type="button"
            className="open-folder-button"
            onClick={pickWorkspace}
          >
            Open folder
          </button>
        </div>
      </div>
      <div className="panel-content">
        <div className="file-tree">
          {!workspacePath ? (
            <div className="empty-state">
              <p>No folder open</p>
              <p className="hint">Open a folder to get started</p>
              <button
                type="button"
                className="open-folder-button"
                onClick={pickWorkspace}
              >
                Open folder
              </button>
            </div>
          ) : tree.length === 0 ? (
            <div className="empty-state">
              <p>Empty folder</p>
            </div>
          ) : (
            tree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                openFile={openFile}
                onContextMenuNode={handleContextMenuNode}
              />
            ))
          )}
        </div>
      </div>
      <div className="file-explorer-footer">
        {loggedIn ? (
          <>
            <span className="file-explorer-identity" title={username}>
              {username ?? 'Logged in'}
            </span>
            <button type="button" className="footer-btn" onClick={() => logout()}>
              Log out
            </button>
          </>
        ) : (
          <button type="button" className="footer-btn" onClick={onLoginClick}>
            Log in to OASIS
          </button>
        )}
      </div>
    </div>
  );
};
