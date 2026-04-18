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

const CATEGORY_TABS: { id: McpToolCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'health', label: 'Health' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'nft', label: 'NFT' },
  { id: 'star', label: 'STAR' },
  { id: 'holon', label: 'Holons' },
  { id: 'other', label: 'Other' },
];

function isSafeAutoRun(tool: ToolRow): boolean {
  return tool.name === 'oasis_health_check';
}

export const OASISToolsPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { tools: mcpTools, loading, refreshTools, executeTool } = useMCP();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<McpToolCategory>('all');
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [runFlash, setRunFlash] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

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

  const handleRunSafe = async (tool: ToolRow) => {
    if (!isSafeAutoRun(tool)) return;
    setRunError(null);
    try {
      const result = await executeTool(tool.name, {});
      const snippet =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2).slice(0, 2000);
      setRunFlash(`${tool.name}: ${snippet.slice(0, 400)}${snippet.length > 400 ? '…' : ''}`);
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : String(e));
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
              Set <code>OASIS_MCP_SERVER_PATH</code> to the built OASIS unified MCP server, then restart
              the IDE. See README.md.
            </p>
          </div>
        ) : (
          <div className="tools-list">
            {filtered.length === 0 ? (
              <div className="empty-state">No tools match this filter.</div>
            ) : (
              filtered.map((tool, index) => (
                <div key={`${tool.name}-${index}`} className="tool-item">
                  <div className="tool-item-header">
                    <div className="tool-name">{tool.name}</div>
                    <div className="tool-item-actions">
                      <button
                        type="button"
                        className="tool-action-btn"
                        onClick={() => void handleCopy(tool)}
                        title="Copy a short agent prompt for this tool"
                      >
                        {copyFlash === tool.name ? 'Copied' : 'Copy prompt'}
                      </button>
                      {isSafeAutoRun(tool) ? (
                        <button
                          type="button"
                          className="tool-action-btn tool-action-btn--primary"
                          onClick={() => void handleRunSafe(tool)}
                        >
                          Run
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="tool-description">{tool.description ?? '—'}</div>
                </div>
              ))
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
