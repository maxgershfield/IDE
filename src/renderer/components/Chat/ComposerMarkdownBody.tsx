import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { resolveMarkdownLinkToWorkspacePath } from '../../utils/resolveMarkdownWorkspacePath';

export interface ComposerMarkdownBodyProps {
  text: string;
}

/**
 * Renders composer message text as Markdown (GFM tables, lists, code).
 * Intercepts link clicks so the Electron shell never performs a full document
 * navigation (which would unload the IDE and hide the chat).
 */
function MarkdownAnchor(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { href, children, ...rest } = props;
  const { workspacePath, openFile } = useWorkspace();

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(href)) {
      await window.electronAPI?.openUrl?.(href);
      return;
    }
    const fsPath = resolveMarkdownLinkToWorkspacePath(workspacePath, href);
    if (fsPath) {
      try {
        await openFile(fsPath);
      } catch (err) {
        console.warn('[Composer] Could not open markdown link:', href, err);
      }
      return;
    }
    console.warn('[Composer] Unhandled markdown link (no workspace or unknown form):', href);
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

export const ComposerMarkdownBody: React.FC<ComposerMarkdownBodyProps> = ({ text }) => {
  const components = useMemo<Components>(
    () => ({
      a: MarkdownAnchor
    }),
    []
  );

  return (
    <div className="composer-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
};
