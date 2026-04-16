import React, { useState, useRef } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import './SearchPanel.css';

interface SearchResult {
  file: string;
  line: number;
  text: string;
}

export const SearchPanel: React.FC = () => {
  const { workspacePath } = useWorkspace();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const { openFile } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = async () => {
    if (!query.trim() || !workspacePath) return;
    setSearching(true);
    setSearched(false);
    try {
      // Use workspace_grep via agentExecuteTool or a dedicated IPC call if available;
      // fall back to readFile-based search via the grep tool.
      const res = await window.electronAPI.agentExecuteTool({
        toolCallId: 'search-' + Date.now(),
        name: 'workspace_grep',
        argumentsJson: JSON.stringify({
          pattern: query,
          path: workspacePath,
          case_sensitive: false,
          max_results: 100,
        }),
      });
      if (res.ok) {
        const raw: string = res.result.content ?? '';
        const parsed = parseGrepOutput(raw, workspacePath);
        setResults(parsed);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') runSearch();
  };

  // Group results by file
  const byFile = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.file] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="search-panel panel">
      <div className="panel-header search-panel-header">
        <span>Search</span>
      </div>
      <div className="search-panel-input-row">
        <input
          ref={inputRef}
          className="search-panel-input"
          type="text"
          placeholder="Search files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button
          type="button"
          className="search-panel-go"
          onClick={runSearch}
          disabled={searching || !query.trim()}
          title="Search (Enter)"
        >
          {searching ? '…' : '↵'}
        </button>
      </div>
      {!workspacePath && (
        <p className="search-panel-hint">Open a folder to search.</p>
      )}
      <div className="search-panel-results">
        {searched && results.length === 0 && (
          <p className="search-panel-hint">No results for "{query}"</p>
        )}
        {Object.entries(byFile).map(([file, hits]) => {
          const label = file.replace(workspacePath ?? '', '').replace(/^\//, '');
          return (
            <div key={file} className="search-result-group">
              <div
                className="search-result-file"
                onClick={() => openFile(file)}
                title={file}
              >
                {label}
              </div>
              {hits.map((h, i) => (
                <div
                  key={i}
                  className="search-result-row"
                  onClick={() => openFile(file)}
                  title={`Line ${h.line}`}
                >
                  <span className="search-result-line">{h.line}</span>
                  <span className="search-result-text">{h.text.trimStart()}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function parseGrepOutput(raw: string, root: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const line of raw.split('\n')) {
    // ripgrep output: path:line:text  OR  path:text (no line numbers)
    const m = line.match(/^(.+?):(\d+):(.*)$/);
    if (m) {
      results.push({ file: m[1], line: parseInt(m[2], 10), text: m[3] });
    }
  }
  return results;
}
