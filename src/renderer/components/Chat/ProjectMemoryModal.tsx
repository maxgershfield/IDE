import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectMemory } from '../../contexts/ProjectMemoryContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { PROJECT_MEMORY_TEXT_MAX } from '../../../shared/projectMemoryTypes';
import './ProjectMemoryModal.css';

export const ProjectMemoryModal: React.FC = () => {
  const {
    memoryModalOpen,
    setMemoryModalOpen,
    text,
    setText,
    syncState,
    loggedIn,
    workspaceRulesHint,
    autoLogTurns,
    setAutoLogTurns
  } = useProjectMemory();
  const { activeSessionId } = useIdeChat();
  const [summarizeBusy, setSummarizeBusy] = useState(false);
  const [summarizeMessage, setSummarizeMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!memoryModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMemoryModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [memoryModalOpen, setMemoryModalOpen]);

  useEffect(() => {
    if (memoryModalOpen) setSummarizeMessage(null);
  }, [memoryModalOpen]);

  if (!memoryModalOpen) return null;

  const onSummarizeChat = () => {
    setSummarizeMessage(null);
    setSummarizeBusy(true);
    new Promise<{ ok: boolean; error?: string; skipped?: boolean }>((resolve) => {
      window.dispatchEvent(
        new CustomEvent('oasis-ide-project-memory-summarize-request', {
          detail: { sessionId: activeSessionId, resolve }
        })
      );
    })
      .then((result) => {
        if (!result.ok) {
          setSummarizeMessage({ kind: 'error', text: result.error ?? 'Summarization failed.' });
          return;
        }
        if (result.skipped) {
          setSummarizeMessage({
            kind: 'success',
            text: 'The model found nothing new worth adding to project memory. Your transcript may be small talk or already covered by rules.'
          });
          return;
        }
        setSummarizeMessage({
          kind: 'success',
          text: 'Added summarized bullets to project memory. They are included on the next agent request.'
        });
      })
      .catch((e: unknown) => {
        setSummarizeMessage({
          kind: 'error',
          text: e instanceof Error ? e.message : String(e)
        });
      })
      .finally(() => setSummarizeBusy(false));
  };

  const syncLabel = !loggedIn
    ? 'Saved locally only. Log in to sync this workspace memory to OASIS.'
    : syncState === 'error'
      ? 'Last sync failed. Check ONODE and try editing again.'
      : syncState === 'synced'
        ? 'Synced to OASIS in the background.'
        : 'Preparing sync…';

  const modal = (
    <div
      className="project-memory-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) setMemoryModalOpen(false);
      }}
    >
      <div
        className="project-memory-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-memory-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="project-memory-modal-header">
          <h2 id="project-memory-modal-title" className="project-memory-modal-title">
            Project memory
          </h2>
          <button
            type="button"
            className="project-memory-modal-close"
            aria-label="Close"
            onClick={() => setMemoryModalOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="project-memory-modal-intro">
          <p>
            Extra notes for this workspace are <strong>included in every Composer agent request automatically</strong>.
            You do not need to open this dialog for that to happen. When you are logged in, changes also{' '}
            <strong>save to OASIS in the background</strong>.
          </p>
          {workspaceRulesHint ? (
            <p className="project-memory-modal-rules-hint">
              This repo already loads <code>.oasiside/rules.md</code> (or <code>.OASIS_IDE/rules.md</code>) into the
              agent automatically. Use project memory for things that are not in those files (for example, recent
              decisions or preferences).
            </p>
          ) : (
            <p className="project-memory-modal-rules-hint muted">
              No workspace rules file found yet. You can add one under <code>.oasiside/rules.md</code> for repo-wide
              instructions, and use this panel for additional notes.
            </p>
          )}
        </div>

        <label className="project-memory-modal-auto">
          <input
            type="checkbox"
            checked={autoLogTurns}
            onChange={(e) => setAutoLogTurns(e.target.checked)}
          />
          <span>
            Automatically append a short summary line after each successful <strong>Agent</strong> reply (on by
            default). Turn off if you only want manual notes below.
          </span>
        </label>

        <div className="project-memory-modal-summarize">
          <button
            type="button"
            className="project-memory-modal-summarize-btn"
            disabled={summarizeBusy}
            onClick={onSummarizeChat}
          >
            {summarizeBusy ? 'Summarizing…' : 'Summarize active chat into memory'}
          </button>
          <p className="project-memory-modal-summarize-hint">
            Runs a one-shot LLM pass on the visible Composer session (same model as that tab&apos;s picker). Uses your
            local API keys from the IDE main process.
          </p>
          {summarizeMessage ? (
            <p
              className={
                summarizeMessage.kind === 'error'
                  ? 'project-memory-modal-summarize-msg project-memory-modal-summarize-msg--err'
                  : 'project-memory-modal-summarize-msg project-memory-modal-summarize-msg--ok'
              }
              role="status"
            >
              {summarizeMessage.text}
            </p>
          ) : null}
        </div>

        <textarea
          className="project-memory-modal-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Optional: add durable notes, or leave empty and rely on rules files + auto log (if enabled)."
          spellCheck
          aria-label="Project memory text"
          maxLength={PROJECT_MEMORY_TEXT_MAX}
        />

        <div className="project-memory-modal-footer">
          <span className="project-memory-modal-sync" title={syncLabel}>
            {syncLabel}
          </span>
          <span className="project-memory-modal-count">
            {text.length.toLocaleString()} / {PROJECT_MEMORY_TEXT_MAX.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
