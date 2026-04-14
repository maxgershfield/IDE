import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ComposerMarkdownBodyProps {
  text: string;
}

/**
 * Renders composer message text as Markdown (GFM tables, lists, code) for parity with Cursor-style replies.
 */
export const ComposerMarkdownBody: React.FC<ComposerMarkdownBodyProps> = ({ text }) => {
  return (
    <div className="composer-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
};
