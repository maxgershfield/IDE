import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { resolveMarkdownLinkToWorkspacePath } from '../../utils/resolveMarkdownWorkspacePath';
import { HolonDiagram } from './HolonDiagram';

export interface ComposerMarkdownBodyProps {
  text: string;
}

/**
 * Renders composer message text as Markdown (GFM tables, lists, code).
 * Intercepts link clicks so the Electron shell never performs a full document
 * navigation (which would unload the IDE and hide the chat).
 * Also renders <oasis_holon_diagram> blocks as live React Flow graphs.
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

// ---------------------------------------------------------------------------
// Segment type — either a raw markdown string or a holon diagram JSON string
// ---------------------------------------------------------------------------

type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'holon_diagram'; source: string };

const DIAGRAM_RE = /<oasis_holon_diagram>([\s\S]*?)<\/oasis_holon_diagram>/g;

function splitSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  DIAGRAM_RE.lastIndex = 0;
  while ((match = DIAGRAM_RE.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ kind: 'markdown', text: text.slice(last, match.index) });
    }
    segments.push({ kind: 'holon_diagram', source: match[1].trim() });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: 'markdown', text: text.slice(last) });
  }
  return segments;
}

export const ComposerMarkdownBody: React.FC<ComposerMarkdownBodyProps> = ({ text }) => {
  const components = useMemo<Components>(
    () => ({
      a: MarkdownAnchor
    }),
    []
  );

  const segments = useMemo(() => splitSegments(text), [text]);

  return (
    <div className="composer-markdown">
      {segments.map((seg, i) =>
        seg.kind === 'holon_diagram' ? (
          <HolonDiagram key={i} source={seg.source} />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>
            {seg.text}
          </ReactMarkdown>
        )
      )}
    </div>
  );
};
