import React, { useState, useEffect, useMemo } from 'react';
import { useMCP } from '../../contexts/MCPContext';
import {
  categorizeMcpToolName,
  type McpToolCategory,
} from '../../constants/onChainMintWorkflow';
import { buildCopyPromptForTool } from '../../constants/onChainQuickPrompts';
import './OASISToolsPanel.css';

interface ToolRow {
  name: string;
  description?: string;
  inputSchema?: { required?: string[]; properties?: Record<string, unknown> };
}

type ToolRunKind = 'direct' | 'needsArgs' | 'mutating';

const CATEGORY_TABS: { id: McpToolCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'health', label: 'Health' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'nft', label: 'NFT' },
  { id: 'star', label: 'STAR' },
  { id: 'holon', label: 'Holons' },
  { id: 'other', label: 'Other' },
];

const READ_ONLY_NAME_PARTS = [
  'health',
  'list',
  'get',
  'status',
  'search',
  'find',
  'discover',
  'lookup',
  'read',
  'query',
  'inspect',
  'describe',
  'balance',
  'portfolio'
];

const MUTATING_NAME_PARTS = [
  'create',
  'mint',
  'send',
  'delete',
  'remove',
  'update',
  'set',
  'save',
  'publish',
  'register',
  'connect',
  'transfer',
  'deploy',
  'write',
  'append',
  'seed',
  'generate'
];

function requiredFields(tool: ToolRow): string[] {
  return Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
}

function nameIncludesAny(name: string, parts: string[]): boolean {
  const n = name.toLowerCase();
  return parts.some((part) => n.includes(part));
}

function nameHasAnyToken(name: string, tokens: string[]): boolean {
  const nameTokens = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => nameTokens.includes(token));
}

function classifyToolRun(tool: ToolRow): ToolRunKind {
  if (requiredFields(tool).length > 0) return 'needsArgs';
  if (nameHasAnyToken(tool.name, MUTATING_NAME_PARTS)) return 'mutating';
  if (tool.name === 'oasis_health_check' || nameIncludesAny(tool.name, READ_ONLY_NAME_PARTS)) {
    return 'direct';
  }
  return 'needsArgs';
}

function canRunDirectly(tool: ToolRow): boolean {
  return classifyToolRun(tool) === 'direct';
}

function isErrorPayload(result: unknown): result is { error?: unknown; isError?: unknown; message?: unknown } {
  if (!result || typeof result !== 'object') return false;
  const r = result as { error?: unknown; isError?: unknown };
  return r.error === true || r.isError === true;
}

function summarizeObject(obj: Record<string, unknown>): string | null {
  if (typeof obj.userSummary === 'string' && obj.userSummary.trim()) {
    return obj.userSummary;
  }
  if (typeof obj.message === 'string' && obj.message.trim() && obj.isError === true) {
    return obj.message;
  }
  if (typeof obj.walletCount === 'number' && Array.isArray(obj.providers)) {
    const providers = obj.providers
      .map((provider) => {
        if (!provider || typeof provider !== 'object') return '';
        const p = provider as { provider?: unknown; count?: unknown };
        return typeof p.provider === 'string' && typeof p.count === 'number'
          ? `${p.provider} (${p.count})`
          : '';
      })
      .filter(Boolean)
      .join(', ');
    return `Found ${obj.walletCount} wallet${obj.walletCount === 1 ? '' : 's'}${providers ? `: ${providers}` : ''}.`;
  }
  return null;
}

function summarizeText(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const summary = summarizeObject(parsed as Record<string, unknown>);
      if (summary) return summary;
    }
  } catch {
    // Plain text results are fine.
  }
  return text;
}

function summarizeResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const summary = summarizeObject(result as Record<string, unknown>);
    if (summary) return summary;
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const textParts = content
        .map((part) => {
          if (!part || typeof part !== 'object') return '';
          const p = part as { type?: unknown; text?: unknown };
          return p.type === 'text' && typeof p.text === 'string' ? summarizeText(p.text) : '';
        })
        .filter(Boolean);
      if (textParts.length > 0) return textParts.join('\n');
    }
  }
  return JSON.stringify(result, null, 2);
}

export const OASISToolsPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { tools: mcpTools, loading, refreshTools, executeTool } = useMCP();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<McpToolCategory>('all');
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [runFlash, setRunFlash] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runningTool, setRunningTool] = useState<string | null>(null);

  const tools = mcpTools as ToolRow[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tools.filter((t) => {
      const cat = categorizeMcpToolName(t.name);
      if (category !== 'all' && cat !== category) return false;
      if (!q) return true;
      const desc = (t.description ?? '').toLowerCase();
      return t.name.toLowerCase().includes(q) || desc.includes(q);
    });
  }, [tools, search, category]);

  useEffect(() => {
    if (!copyFlash) return;
    const id = window.setTimeout(() => setCopyFlash(null), 1500);
    return () => window.clearTimeout(id);
  }, [copyFlash]);

  useEffect(() => {
    if (!runFlash) return;
    const id = window.setTimeout(() => setRunFlash(null), 2500);
    return () => window.clearTimeout(id);
  }, [runFlash]);

  const handleCopy = async (tool: ToolRow) => {
    const text = buildCopyPromptForTool(tool.name);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(tool.name);
    } catch {
      setCopyFlash(null);
    }
  };

  const handleRunDirect = async (tool: ToolRow) => {
    if (!canRunDirectly(tool) || runningTool) return;
    setRunError(null);
    setRunningTool(tool.name);
    try {
      const result = await executeTool(tool.name, {});
      if (isErrorPayload(result)) {
        const msg = typeof result.message === 'string' ? result.message : summarizeResult(result);
        throw new Error(msg);
      }
      const snippet = summarizeResult(result).slice(0, 2000);
      setRunFlash(`${tool.name}: ${snippet.slice(0, 400)}${snippet.length > 400 ? '…' : ''}`);
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningTool(null);
    }
  };

  return (
    <div className={`oasis-tools-panel panel${embedded ? ' oasis-tools-panel--embedded' : ''}`}>
      {!embedded && <div className="panel-header">OASIS Tools</div>}
      <div className="panel-content oasis-tools-panel__inner">
        <div className="oasis-tools-toolbar">
          <input
            type="search"
            className="oasis-tools-search"
            placeholder="Search tools…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search MCP tools"
          />
          <button
            type="button"
            className="oasis-tools-refresh"
            onClick={() => void refreshTools()}
            title="Refresh tool list"
          >
            Refresh
          </button>
        </div>
        <div className="oasis-tools-categories" role="tablist" aria-label="Tool categories">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={category === tab.id}
              className={`oasis-tools-cat${category === tab.id ? ' is-active' : ''}`}
              onClick={() => setCategory(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">Loading tools…</div>
        ) : tools.length === 0 ? (
          <div className="oasis-tools-empty">
            <p>No MCP tools loaded.</p>
            <p className="oasis-tools-empty-hint">
              Default is hosted MCP. If startup failed, check the console for <code>[MCP]</code> errors,
              or use local MCP: <code>OASIS_MCP_TRANSPORT=stdio</code> and{' '}
              <code>OASIS_MCP_SERVER_PATH</code> to <code>MCP/dist/src/index.js</code>, then restart.
            </p>
          </div>
        ) : (
          <div className="tools-list">
            {filtered.length === 0 ? (
              <div className="empty-state">No tools match this filter.</div>
            ) : (
              filtered.map((tool, index) => {
                const runKind = classifyToolRun(tool);
                const required = requiredFields(tool);
                const isRunning = runningTool === tool.name;
                return (
                  <div key={`${tool.name}-${index}`} className="tool-item">
                    <div className="tool-item-header">
                      <div className="tool-name">{tool.name}</div>
                      <div className="tool-item-actions">
                        {runKind === 'direct' ? (
                          <button
                            type="button"
                            className="tool-action-btn tool-action-btn--primary"
                            onClick={() => void handleRunDirect(tool)}
                            disabled={runningTool !== null}
                            title="Run this read-only command now"
                          >
                            {isRunning ? 'Running…' : 'Run'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="tool-action-btn"
                          onClick={() => void handleCopy(tool)}
                          title="Copy a short agent prompt for this tool"
                        >
                          {copyFlash === tool.name ? 'Copied' : 'Copy prompt'}
                        </button>
                      </div>
                    </div>
                    <div className="tool-description">{tool.description ?? '—'}</div>
                    <div className={`tool-run-hint tool-run-hint--${runKind}`}>
                      {runKind === 'direct'
                        ? 'Ready to run directly. Uses your signed-in OASIS session.'
                        : runKind === 'needsArgs'
                          ? required.length > 0
                            ? `Needs arguments: ${required.join(', ')}.`
                            : 'Needs a small argument form before this can run directly.'
                          : 'Mutation-capable command. Keeping this behind prompts until confirmation UI is added.'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
        {runFlash ? (
          <div className="oasis-tools-run-result" role="status">
            {runFlash}
          </div>
        ) : null}
        {runError ? (
          <div className="oasis-tools-run-error" role="alert">
            {runError}
          </div>
        ) : null}
      </div>
    </div>
  );
};
