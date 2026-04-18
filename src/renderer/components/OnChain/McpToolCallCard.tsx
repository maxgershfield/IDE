import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import './McpToolCallCard.css';

export type McpInvocationPhase = 'idle' | 'running' | 'success' | 'error';

function redactForDisplay(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  if ('password' in out) out.password = '••••••••';
  if ('imageBase64' in out && typeof out.imageBase64 === 'string') {
    out.imageBase64 = `[${out.imageBase64.length} chars base64 omitted]`;
  }
  return out;
}

function formatResultPreview(result: unknown): string {
  if (result === null || result === undefined) return '—';
  if (typeof result === 'string') return result.length > 4000 ? `${result.slice(0, 4000)}…` : result;
  try {
    const s = JSON.stringify(result, null, 2);
    return s.length > 6000 ? `${s.slice(0, 6000)}…` : s;
  } catch {
    return String(result);
  }
}

export interface McpToolCallCardProps {
  toolName: string;
  phase: McpInvocationPhase;
  args?: Record<string, unknown>;
  result?: unknown;
  errorMessage?: string;
}

/**
 * Cursor-style inline MCP tool card: tool name, redacted args, collapsible result.
 */
export const McpToolCallCard: React.FC<McpToolCallCardProps> = ({
  toolName,
  phase,
  args,
  result,
  errorMessage,
}) => {
  const [argsOpen, setArgsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(true);

  const displayArgs = args ? redactForDisplay(toolName, args) : null;

  return (
    <div
      className={`mcp-tool-call-card mcp-tool-call-card--${phase}`}
      role="region"
      aria-label={`MCP tool ${toolName}`}
    >
      <div className="mcp-tool-call-card__header">
        <span className="mcp-tool-call-card__badge">MCP</span>
        <code className="mcp-tool-call-card__name">{toolName}</code>
        {phase === 'running' ? (
          <span className="mcp-tool-call-card__status mcp-tool-call-card__status--running">
            <Loader2 size={12} className="mcp-tool-call-card__spin" aria-hidden />
            Running
          </span>
        ) : phase === 'success' ? (
          <span className="mcp-tool-call-card__status mcp-tool-call-card__status--ok">Done</span>
        ) : phase === 'error' ? (
          <span className="mcp-tool-call-card__status mcp-tool-call-card__status--err">Failed</span>
        ) : null}
      </div>

      {displayArgs && Object.keys(displayArgs).length > 0 ? (
        <div className="mcp-tool-call-card__args">
          <button
            type="button"
            className="mcp-tool-call-card__toggle"
            onClick={() => setArgsOpen((v) => !v)}
            aria-expanded={argsOpen}
          >
            {argsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Arguments
          </button>
          {argsOpen ? (
            <pre className="mcp-tool-call-card__pre">{JSON.stringify(displayArgs, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}

      {phase === 'error' && errorMessage ? (
        <div className="mcp-tool-call-card__error-msg">{errorMessage}</div>
      ) : null}

      {phase === 'success' || (phase === 'error' && result !== undefined) ? (
        <div className="mcp-tool-call-card__result">
          <button
            type="button"
            className="mcp-tool-call-card__toggle"
            onClick={() => setResultOpen((v) => !v)}
            aria-expanded={resultOpen}
          >
            {resultOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Result
          </button>
          {resultOpen ? (
            <pre className="mcp-tool-call-card__pre mcp-tool-call-card__pre--result">
              {formatResultPreview(result)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
