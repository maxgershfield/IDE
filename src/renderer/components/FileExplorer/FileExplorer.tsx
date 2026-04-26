import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import type { TreeNode } from '../../contexts/WorkspaceContext';
import { OASIS_IDE_EXPLORER_FILE_PATH_MIME } from '../../utils/buildPlanningDocContextNote';
import './FileExplorer.css';

// ─── File-type icon helpers ───────────────────────────────────────────────────

const ChevronRight: React.FC = () => (
  <svg className="fe-chevron" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 4l4 4-4 4V4z" />
  </svg>
);

const ChevronDown: React.FC = () => (
  <svg className="fe-chevron" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 6l4 4 4-4H4z" />
  </svg>
);

const FolderIcon: React.FC<{ open?: boolean }> = ({ open }) => (
  <svg className="fe-icon fe-icon-folder" viewBox="0 0 16 16" fill="none">
    {open ? (
      // Open: lighter face visible, darker back wall peeks above
      <>
        <path fill="#3a5a70" d="M0 8v4.5A1.5 1.5 0 0 0 1.5 14h13A1.5 1.5 0 0 0 16 12.5V8H0z"/>
        <path fill="#5580a0" d="M0 6.5V8h16V7a1 1 0 0 0-1-1H9L7.5 4.5H2A2 2 0 0 0 0 6.5z"/>
      </>
    ) : (
      // Closed: sharp-edged tab (dark) + main body (mid steel)
      <>
        <path fill="#3a5a70" d="M1.5 3h4L7 4.5H1C1 3.67 1.22 3 1.5 3z"/>
        <path fill="#5580a0" d="M0 5v7.5A1.5 1.5 0 0 0 1.5 14h13A1.5 1.5 0 0 0 16 12.5V6.5A1.5 1.5 0 0 0 14.5 5H7L5.5 3.5H1.5A1.5 1.5 0 0 0 0 5z"/>
      </>
    )}
  </svg>
);

type IconSpec = { color: string; content: string };

function getIconSpec(name: string, isDirectory: boolean): IconSpec {
  if (isDirectory) return { color: '#dcb67a', content: '' }; // handled by FolderIcon
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  switch (ext) {
    // TypeScript
    case 'ts':    return { color: '#3178c6', content: 'TS' };
    case 'tsx':   return { color: '#3178c6', content: 'TSX' };
    // JavaScript
    case 'js':    return { color: '#f7df1e', content: 'JS' };
    case 'jsx':   return { color: '#f7df1e', content: 'JSX' };
    // Web
    case 'html':  return { color: '#e34c26', content: 'HTML' };
    case 'css':   return { color: '#264de4', content: 'CSS' };
    case 'scss':  return { color: '#c6538c', content: 'SCSS' };
    case 'svg':   return { color: '#ffb13b', content: 'SVG' };
    // Data
    case 'json':  return { color: '#cbcb41', content: '{ }' };
    case 'yaml':
    case 'yml':   return { color: '#cb7a33', content: 'YML' };
    case 'toml':  return { color: '#9c4121', content: 'TOML' };
    case 'env':   return { color: '#eacd6e', content: 'ENV' };
    // Docs
    case 'md':    return { color: '#519aba', content: 'MD' };
    case 'mdx':   return { color: '#519aba', content: 'MDX' };
    case 'txt':   return { color: '#858585', content: 'TXT' };
    case 'pdf':   return { color: '#e2574c', content: 'PDF' };
    // Scripts
    case 'sh':
    case 'bash':
    case 'zsh':   return { color: '#4caf50', content: 'SH' };
    case 'py':    return { color: '#3572A5', content: 'PY' };
    // .NET / Solidity
    case 'cs':    return { color: '#9b4f96', content: 'C#' };
    case 'sol':   return { color: '#aa6746', content: 'SOL' };
    case 'rs':    return { color: '#dea584', content: 'RS' };
    case 'go':    return { color: '#00add8', content: 'GO' };
    // Config
    case 'gitignore':
    case 'gitattributes': return { color: '#f14e32', content: 'GIT' };
    case 'lock':  return { color: '#858585', content: '🔒' };
    case 'dockerfile':
    case 'docker': return { color: '#2496ed', content: 'DOC' };
    default:      return { color: '#858585', content: '·' };
  }
}

function FileTypeIcon({ name, isDirectory, open }: { name: string; isDirectory: boolean; open?: boolean }) {
  if (isDirectory) {
    return <FolderIcon open={open} />;
  }
  const spec = getIconSpec(name, false);
  // Very short labels (≤2 chars) use a circle-badge; longer use tiny text
  const isText = spec.content.length > 1 && spec.content !== '🔒';
  return (
    <span
      className={`fe-file-icon-badge${isText ? ' fe-file-icon-text' : ''}`}
      style={{ color: spec.color, borderColor: spec.color + '55' }}
    >
      {spec.content}
    </span>
  );
}

// ─── Tree item ────────────────────────────────────────────────────────────────

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
  const [children, setChildren] = useState<TreeNode[] | undefined>(node.children);
  const [childrenLoaded, setChildrenLoaded] = useState(Boolean(node.children && node.children.length > 0));
  const hasChildren = node.isDirectory && children && children.length > 0;

  useEffect(() => {
    setChildren(node.children);
    setChildrenLoaded(Boolean(node.children && node.children.length > 0));
  }, [node.path, node.children]);

  const handleClick = async () => {
    if (!node.isDirectory) {
      openFile(node.path);
      return;
    }
    if (!expanded && !childrenLoaded && window.electronAPI?.listDirShallow) {
      try {
        const loaded = await window.electronAPI.listDirShallow(node.path);
        setChildren((loaded ?? []) as TreeNode[]);
      } catch {
        setChildren([]);
      } finally {
        setChildrenLoaded(true);
      }
    }
    setExpanded((e) => !e);
  };

  return (
    <div className="file-tree-item">
      <div
        className={`file-tree-node ${node.isDirectory ? 'folder' : 'file'}`}
        style={{ paddingLeft: level * 12 + 6 }}
        draggable={!node.isDirectory}
        onDragStart={
          node.isDirectory
            ? undefined
            : (e) => {
                e.dataTransfer.setData('text/plain', node.path);
                e.dataTransfer.setData(OASIS_IDE_EXPLORER_FILE_PATH_MIME, node.path);
                e.dataTransfer.effectAllowed = 'copy';
              }
        }
        onClick={handleClick}
        onContextMenu={(e) => onContextMenuNode(e, node)}
      >
        <span className="fe-chevron-wrap">
          {node.isDirectory
            ? (expanded ? <ChevronDown /> : <ChevronRight />)
            : <span className="fe-chevron-spacer" />
          }
        </span>
        <FileTypeIcon name={node.name} isDirectory={node.isDirectory} open={expanded} />
        <span className="file-tree-name">{node.name}</span>
      </div>
      {node.isDirectory && expanded && hasChildren && (
        <div className="file-tree-children">
          {children!.map((child) => (
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

// ─── Main component ───────────────────────────────────────────────────────────

interface FileExplorerProps {
  onLoginClick?: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ onLoginClick }) => {
  const { workspacePath, tree, pickWorkspace, openFile, refreshTree } = useWorkspace();
  const { loggedIn, username, logout } = useAuth();
  const { addReference, requestNewChatWithPaths } = useIdeChat();
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);

  const workspaceName = workspacePath
    ? workspacePath.split('/').filter(Boolean).pop() ?? workspacePath
    : null;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
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
    try { await navigator.clipboard.writeText(p); } catch { /* ignore */ }
    setMenu(null);
  };

  const revealInFinder = async (p: string) => {
    if (window.electronAPI?.revealInFinder) await window.electronAPI.revealInFinder(p);
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
        <button type="button" className="file-explorer-ctx-item" role="menuitem"
          onClick={() => { addReference(menu.node.path); setMenu(null); }}>
          Add to Chat
        </button>
        <button type="button" className="file-explorer-ctx-item" role="menuitem"
          onClick={() => { requestNewChatWithPaths([menu.node.path]); setMenu(null); }}>
          Add to New Chat
        </button>
        <div className="file-explorer-ctx-sep" role="separator" />
        <button type="button" className="file-explorer-ctx-item" role="menuitem"
          onClick={() => void copyPath(menu.node.path)}>
          Copy Path
        </button>
        <button type="button" className="file-explorer-ctx-item" role="menuitem"
          onClick={() => void revealInFinder(menu.node.path)}>
          Reveal in Finder
        </button>
      </div>,
      document.body
    );

  return (
    <div className="file-explorer panel">
      {ctxMenu}

      {/* Header: "EXPLORER" label + signed-in username + open folder */}
      <div className="panel-header file-explorer-header">
        <div className="fe-header-left">
          <span className="fe-header-title">Explorer</span>
          {loggedIn && username && (
            <span className="fe-header-user">{username}</span>
          )}
        </div>
        <div className="file-explorer-actions">
          <button type="button" className="open-folder-button" onClick={pickWorkspace}>
            Open folder
          </button>
        </div>
      </div>


      {/* Workspace name section — project row */}
      {workspaceName && (
        <div className="fe-workspace-section">
          <span className="fe-workspace-name">{workspaceName.toUpperCase()}</span>
        </div>
      )}

      <div className="panel-content file-tree-scroll">
        <div className="file-tree">
          {!workspacePath ? (
            <div className="empty-state">
              <p>No folder open</p>
              <p className="hint">Open a folder to get started</p>
              <button type="button" className="open-folder-button" onClick={pickWorkspace}>
                Open folder
              </button>
            </div>
          ) : tree.length === 0 ? (
            <div className="empty-state"><p>Empty folder</p></div>
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
            <span className="file-explorer-identity" title={username}>{username ?? 'Logged in'}</span>
            <button type="button" className="footer-btn" onClick={() => logout()}>Log out</button>
          </>
        ) : (
          <button type="button" className="footer-btn" onClick={onLoginClick}>Log in to OASIS</button>
        )}
      </div>
    </div>
  );
};
