/**
 * IndexingStatusBar
 *
 * Cursor-style codebase-indexing notice for the OASIS composer.
 *
 * Three visual modes:
 *  • NOT_INDEXED  — banner prompting user to index their holons
 *  • IN_PROGRESS  — progress bar showing "Indexing holons X / Y"
 *  • READY        — compact pill in the session bar ("177 holons ✓")
 */

import React from 'react';
import { useWorkspaceIndex, type IndexPhase } from '../../contexts/WorkspaceIndexContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import './IndexingStatusBar.css';

function phaseLabel(phase: IndexPhase): string {
  switch (phase) {
    case 'scanning':  return 'Scanning workspace…';
    case 'reading':   return 'Reading holons…';
    case 'embedding': return 'Generating embeddings…';
    case 'saving':    return 'Saving index…';
    default:          return 'Indexing…';
  }
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/* ── Compact ready pill (rendered inside the session bar) ─────────────────── */
export const IndexingReadyPill: React.FC = () => {
  const { status, startIndexing } = useWorkspaceIndex();
  const { workspacePath } = useWorkspace();
  if (!workspacePath || status.phase !== 'ready') return null;

  return (
    <button
      type="button"
      className="holonic-index-pill"
      title={`${status.holonsIndexed} holons indexed${status.lastBuiltAt ? ` · ${timeAgo(status.lastBuiltAt)}` : ''}\nClick to re-index`}
      onClick={startIndexing}
    >
      <span className="holonic-index-pill-dot" aria-hidden />
      <span>{status.holonsIndexed} holons</span>
      {status.hasEmbeddings && (
        <span className="holonic-index-pill-emb" title="Semantic embeddings active">⬡</span>
      )}
    </button>
  );
};

/* ── Full-width status bar (shown when idle/in-progress/error) ──────────── */
export const IndexingStatusBar: React.FC = () => {
  const { status, startIndexing, cancelIndexing } = useWorkspaceIndex();
  const { workspacePath } = useWorkspace();

  if (!workspacePath) return null;

  const isActive =
    status.phase === 'scanning' ||
    status.phase === 'reading' ||
    status.phase === 'embedding' ||
    status.phase === 'saving';

  /* Nothing to show once ready — pill handles it */
  if (status.phase === 'ready') return null;

  /* Error state */
  if (status.phase === 'error') {
    return (
      <div className="holonic-index-bar holonic-index-bar--error" role="alert">
        <span className="holonic-index-bar-icon">⚠</span>
        <span className="holonic-index-bar-text">
          Holonic index error: {status.error ?? 'unknown'}
        </span>
        <button type="button" className="holonic-index-bar-action" onClick={startIndexing}>
          Retry
        </button>
      </div>
    );
  }

  /* In-progress state */
  if (isActive) {
    const pct =
      status.holonsTotal > 0
        ? Math.round((status.holonsIndexed / status.holonsTotal) * 100)
        : 0;

    return (
      <div className="holonic-index-bar holonic-index-bar--progress" role="status" aria-live="polite">
        <div className="holonic-index-bar-top">
          <span className="holonic-index-bar-label">{phaseLabel(status.phase)}</span>
          <span className="holonic-index-bar-count">
            {status.holonsIndexed}
            {status.holonsTotal > 0 ? ` / ${status.holonsTotal}` : ''} holons
          </span>
          <button
            type="button"
            className="holonic-index-bar-cancel"
            onClick={cancelIndexing}
            aria-label="Cancel indexing"
          >
            ✕
          </button>
        </div>
        <div className="holonic-index-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="holonic-index-bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  /* Idle / not indexed state — Cursor-style prompt */
  return (
    <div className="holonic-index-bar holonic-index-bar--idle">
      <div className="holonic-index-bar-body">
        <span className="holonic-index-bar-icon">⬡</span>
        <div className="holonic-index-bar-copy">
          <span className="holonic-index-bar-headline">Holons not indexed</span>
          <span className="holonic-index-bar-sub">
            Index your workspace so the agent understands its holonic architecture —
            directories, types, entry points, and relationships.
          </span>
        </div>
      </div>
      <button type="button" className="holonic-index-bar-action holonic-index-bar-action--primary" onClick={startIndexing}>
        Index holons
      </button>
    </div>
  );
};
