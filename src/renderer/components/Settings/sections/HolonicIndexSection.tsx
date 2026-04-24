import React from 'react';
import { useWorkspaceIndex } from '../../../contexts/WorkspaceIndexContext';
import { useWorkspace } from '../../../contexts/WorkspaceContext';

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export const HolonicIndexSection: React.FC = () => {
  const { workspacePath } = useWorkspace();
  const { status, startIndexing, cancelIndexing, deleteIndex } = useWorkspaceIndex();

  const isActive =
    status.phase === 'scanning' ||
    status.phase === 'reading' ||
    status.phase === 'embedding' ||
    status.phase === 'saving';

  const pct =
    isActive && status.holonsTotal > 0
      ? Math.round((status.holonsIndexed / status.holonsTotal) * 100)
      : status.phase === 'ready'
      ? 100
      : 0;

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Holonic Codebase Index</h2>
      <p className="settings-section-desc">
        Index your workspace by holon — each top-level directory is treated as a semantic
        architectural component rather than a flat collection of file chunks. The agent uses
        this index to understand workspace structure without requiring explicit{' '}
        <code>list_directory</code> calls. When <code>OPENAI_API_KEY</code> is set in the IDE
        environment, holons are embedded semantically; otherwise keyword search is used.
      </p>

      {!workspacePath ? (
        <p className="settings-section-desc" style={{ color: 'var(--text-secondary)' }}>
          Open a workspace folder to enable holonic indexing.
        </p>
      ) : (
        <>
          {/* Status row */}
          <div className="settings-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        status.phase === 'ready'
                          ? '#4ade80'
                          : status.phase === 'error'
                          ? 'var(--error, #f48771)'
                          : isActive
                          ? '#3b82f6'
                          : 'var(--text-secondary)',
                    }}
                  />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                    {status.phase === 'ready'
                      ? `${status.holonsIndexed} holons indexed`
                      : status.phase === 'error'
                      ? 'Index error'
                      : isActive
                      ? `Indexing… ${status.holonsIndexed}${status.holonsTotal > 0 ? ` / ${status.holonsTotal}` : ''} holons`
                      : 'Not indexed'}
                  </span>
                  {status.phase === 'ready' && status.hasEmbeddings && (
                    <span
                      title="Semantic embeddings active (OpenAI)"
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'rgba(59,130,246,0.15)',
                        color: '#93c5fd',
                        border: '1px solid rgba(59,130,246,0.3)',
                        fontWeight: 600,
                      }}
                    >
                      ⬡ semantic
                    </span>
                  )}
                  {status.phase === 'ready' && !status.hasEmbeddings && (
                    <span
                      title="Keyword search only — add OPENAI_API_KEY for semantic embeddings"
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'rgba(255,193,7,0.12)',
                        color: '#fde68a',
                        border: '1px solid rgba(255,193,7,0.25)',
                        fontWeight: 600,
                      }}
                    >
                      keyword only
                    </span>
                  )}
                </div>

                {status.phase === 'ready' && status.lastBuiltAt && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Last indexed {timeAgo(status.lastBuiltAt)}
                  </div>
                )}

                {status.phase === 'error' && (
                  <div style={{ fontSize: 11, color: 'var(--error, #f48771)', marginTop: 2 }}>
                    {status.error}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {isActive ? (
                  <button className="settings-btn" onClick={cancelIndexing}>
                    Cancel
                  </button>
                ) : (
                  <button
                    className="settings-btn settings-btn--primary"
                    onClick={startIndexing}
                    disabled={isActive}
                  >
                    {status.phase === 'ready' ? '↺ Sync' : 'Index holons'}
                  </button>
                )}
                {status.phase === 'ready' && (
                  <button
                    className="settings-btn settings-btn--danger"
                    onClick={deleteIndex}
                    title="Delete the stored index"
                  >
                    Delete index
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {(isActive || status.phase === 'ready') && (
              <div
                style={{
                  width: '100%',
                  height: 4,
                  borderRadius: 2,
                  background: 'rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background:
                      status.phase === 'ready'
                        ? 'linear-gradient(90deg,#4ade80,#06b6d4)'
                        : 'linear-gradient(90deg,#3b82f6,#06b6d4)',
                    borderRadius: 2,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            )}

            {(isActive || status.phase === 'ready') && (
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                {pct}%{status.holonsTotal > 0 ? ` · ${status.holonsTotal} holons total` : ''}
              </div>
            )}
          </div>

          {/* Info boxes */}
          <div className="settings-info-box" style={{ marginTop: 12 }}>
            <strong>What gets indexed</strong>
            <ul style={{ margin: '6px 0 0 0', paddingLeft: 16, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>Each root-level directory is treated as one holon</li>
              <li>README, package.json/manifest, and entry-point file per holon</li>
              <li>Embedded with OpenAI <code>text-embedding-3-small</code> when API key is set</li>
              <li>Falls back to keyword (BM25) search without an API key</li>
              <li>Index stored locally in Electron userData — no code leaves your machine</li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
};
