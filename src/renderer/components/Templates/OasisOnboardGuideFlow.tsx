import React, { useRef, useEffect } from 'react';
import { Code2, Check, Circle, Zap, Terminal, Sparkles } from 'lucide-react';
import { DEFAULT_OASIS_ONBOARD_FOLDER, safeFolderName, type OasisOnboardGuideViewModel } from './useOasisOnboardGuide';
import './OasisOnboardGuide.css';

export interface OasisOnboardGuideFlowProps {
  m: OasisOnboardGuideViewModel;
  /** Full title row with icon (Templates card). Hide in Composer; inline shell has its own title. */
  showMarketingHead: boolean;
  /** Tighter class on root for composer inline body */
  className?: string;
  /**
   * Called when the user clicks "Ask the assistant" on the done screen (no description given).
   * Pre-fills the Composer input — user decides when to send.
   */
  onInsertComposer?: (text: string) => void;
  /**
   * True when the agent is actively customizing the project (auto-fired after creation).
   * Drives the "Personalizing…" indicator on the done screen.
   */
  agentCustomizing?: boolean;
}

/**
 * Step UI for the OASIS API Vite starter.
 * Single-prompt experience: user describes their app → create → done.
 */
export const OasisOnboardGuideFlow: React.FC<OasisOnboardGuideFlowProps> = ({
  m,
  showMarketingHead,
  className = '',
  onInsertComposer,
  agentCustomizing = false,
}) => {
  const {
    rootRef,
    screen,
    description,
    setDescription,
    folderName,
    setFolderName,
    skipNpm,
    setSkipNpm,
    errText,
    setErrText,
    working,
    errorDetail,
    setErrorDetail,
    lastProjectPath,
    setLastProjectPath,
    npmLogTail,
    setNpmLogTail,
    resolvedRoot,
    previewPath,
    canNpm,
    goCreate,
    retryNpm,
    reset,
    safeFolderName: sf,
  } = m;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-focus the textarea when the prompt screen appears */
  useEffect(() => {
    if (screen === 'prompt' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [screen]);

  /** Build the "start building" pre-fill text from the user's description */
  function buildComposerPreFill(): string {
    const folder = sf(folderName);
    const base = `My OASIS app is at ./${folder}/. `;
    if (description.trim()) {
      return base + `I want to build: ${description.trim()}. What should I customise first?`;
    }
    return base + 'The template is scaffolded. Where should I start?';
  }

  return (
    <div className={`oasis-guide${className ? ` ${className}` : ''}`} ref={rootRef}>
      {showMarketingHead ? (
        <div className="oasis-guide-head">
          <div className="oasis-guide-icon" aria-hidden>
            <Code2 size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="oasis-guide-title">OASIS API app (Vite + TypeScript)</h2>
            <p className="oasis-guide-lead">
              Describe what you want to build and we'll scaffold a ready-to-run starter in seconds.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── PROMPT ── */}
      {screen === 'prompt' && (
        <div className="oasis-guide-block">
          <label className="oasis-guide-label oasis-guide-label--large">
            What are you building?
            <textarea
              ref={textareaRef}
              className="oasis-guide-textarea"
              rows={3}
              placeholder="A metaverse world with avatar login and Solana wallet…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void goCreate();
                }
              }}
            />
          </label>

          <div className="oasis-guide-name-row">
            <label className="oasis-guide-label">
              App folder name
              <input
                className="oasis-guide-input"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onBlur={() => setFolderName(sf(folderName) || DEFAULT_OASIS_ONBOARD_FOLDER)}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {previewPath && (
              <p className="oasis-guide-path oasis-guide-path--inline">
                <code title={previewPath}>{previewPath}</code>
              </p>
            )}
            {!resolvedRoot && (
              <p className="oasis-guide-warn">Open a workspace folder first.</p>
            )}
          </div>

          <label className="oasis-guide-skip">
            <input type="checkbox" checked={skipNpm} onChange={(e) => setSkipNpm(e.target.checked)} />
            Skip npm install (install later in a terminal)
          </label>

          <div className="oasis-guide-actions">
            <button
              type="button"
              className="tmpl-btn tmpl-btn-primary oasis-guide-create-btn"
              onClick={() => void goCreate()}
              disabled={working || !resolvedRoot}
            >
              <Zap size={14} strokeWidth={2} />
              {working ? 'Creating…' : 'Create App'}
            </button>
          </div>
          <p className="oasis-guide-hint">Press ⌘↩ to create · Scaffolds an OASIS Vite + TypeScript starter</p>
          {errText ? <p className="tmpl-error">{errText}</p> : null}
        </div>
      )}

      {/* ── COPYING ── */}
      {screen === 'copying' && (
        <div className="oasis-guide-block oasis-guide-block--status" aria-live="polite">
          <OasisGuideProgressRow done={false} active label="Copying template files…" />
          <OasisGuideProgressRow done={false} label={skipNpm ? 'Skipping npm install' : 'Installing dependencies (npm)'} />
        </div>
      )}

      {/* ── INSTALLING ── */}
      {screen === 'installing' && (
        <div className="oasis-guide-block oasis-guide-block--status" aria-live="polite">
          <OasisGuideProgressRow done label="Template files copied" />
          <OasisGuideProgressRow done={false} active label="Installing dependencies (npm)…" />
          <p className="oasis-guide-muted">First install can take a minute on a slow connection.</p>
        </div>
      )}

      {/* ── DONE ── */}
      {screen === 'done' && lastProjectPath && (
        <div className="oasis-guide-done-card" aria-live="polite">
          <div className="oasis-guide-done-header">
            <span className="oasis-guide-done-icon" aria-hidden><Check size={18} strokeWidth={2.5} /></span>
            <div>
              <p className="oasis-guide-done-title">App scaffolded</p>
              <p className="oasis-guide-done-path">
                <code title={lastProjectPath}>{lastProjectPath}</code>
              </p>
            </div>
          </div>

          <div className="oasis-guide-steps-done">
            <OasisGuideProgressRow done label="Files scaffolded" />
            <OasisGuideProgressRow done label={skipNpm ? 'npm skipped — run it when ready' : 'Dependencies installed'} />
            {description.trim() ? (
              <OasisGuideProgressRow
                done={!agentCustomizing}
                active={agentCustomizing}
                label={agentCustomizing ? `Personalizing for "${description.trim().slice(0, 48)}${description.trim().length > 48 ? '…' : ''}"` : 'App personalized to your description'}
              />
            ) : null}
          </div>

          {agentCustomizing && (
            <p className="oasis-guide-customizing-hint">
              <Sparkles size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              The assistant is rewriting the UI in the activity feed above — watch it live.
            </p>
          )}

          {!agentCustomizing && (
            <div className="oasis-guide-run-box">
              <span className="oasis-guide-run-label"><Terminal size={12} /> Start the app</span>
              <code className="oasis-guide-run-cmd">
                cd {sf(folderName || (lastProjectPath.split('/').pop() ?? 'app'))} &amp;&amp; npm run dev
              </code>
              <p className="oasis-guide-run-note">Start ONODE first (port 5003 by default), then run this in a terminal.</p>
            </div>
          )}

          <div className="oasis-guide-actions oasis-guide-actions--done">
            {!description.trim() && onInsertComposer && (
              <button
                type="button"
                className="tmpl-btn tmpl-btn-primary"
                onClick={() => onInsertComposer(buildComposerPreFill())}
              >
                Ask the assistant
              </button>
            )}
            <button
              type="button"
              className="tmpl-btn"
              onClick={reset}
            >
              Create another
            </button>
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {screen === 'error' && (
        <div className="oasis-guide-block" role="alert">
          <p className="oasis-guide-err-title">Something went wrong</p>
          <pre className="oasis-guide-err-body">{errorDetail || 'Unknown error'}</pre>
          {npmLogTail ? (
            <details className="oasis-guide-details">
              <summary>npm output (tail)</summary>
              <pre>{npmLogTail}</pre>
            </details>
          ) : null}
          <div className="oasis-guide-actions">
            <button
              type="button"
              className="tmpl-btn"
              onClick={() => {
                setScreen('prompt');
                setErrText('');
                setErrorDetail('');
                setNpmLogTail('');
                setLastProjectPath(null);
              }}
            >
              Back
            </button>
            {lastProjectPath && !skipNpm && canNpm ? (
              <button
                type="button"
                className="tmpl-btn tmpl-btn-primary"
                onClick={() => void retryNpm()}
                disabled={working}
              >
                {working ? 'Running npm…' : 'Retry npm install'}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

function OasisGuideProgressRow({
  done,
  active,
  label,
}: {
  done: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <div
      className={`oasis-guide-progress${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
    >
      <span className="oasis-guide-progress-ico" aria-hidden>
        {done ? <Check size={16} strokeWidth={2.5} /> : <Circle size={14} strokeWidth={1.5} />}
      </span>
      <span>{label}</span>
    </div>
  );
}
