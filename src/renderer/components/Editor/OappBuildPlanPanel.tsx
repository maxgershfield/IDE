import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, ListChecks, Send } from 'lucide-react';
import { useOappBuildPlan } from '../../contexts/OappBuildPlanContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  OASIS_IDE_EXPLORER_FILE_PATH_MIME,
  resolveUserFilePathInput
} from '../../utils/buildPlanningDocContextNote';
import { requestActivityView } from '../../utils/activityViewBridge';
import { BUILD_PLAN_MATCH_HOLONS_COMPOSER_PROMPT } from '../../constants/buildPlanHolonMatchPrompt';
import './OappBuildPlanPanel.css';

function readDroppedFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsText(file);
  });
}

export const OappBuildPlanPanel: React.FC = () => {
  const {
    template,
    holonRows,
    compositionPlan,
    buildContract,
    lastIngestedAt,
    toggleHolon,
    selectAllHolons,
    clearPlan,
    buildContinuationDraft,
    planningDocPath,
    planningDocContent,
    planningDocLoading,
    planningDocError,
    setPlanningDocFromUserText,
    loadPlanningDocFromAbsolutePath,
    loadPlanningDocFromProjectHint,
    clearPlanningDoc
  } = useOappBuildPlan();
  const { injectComposerDraft } = useIdeChat();
  const { openFilePath, workspacePath } = useWorkspace();

  const [draft, setDraft] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [pathHint, setPathHint] = useState<string | null>(null);

  useEffect(() => {
    setDraft(planningDocContent ?? '');
  }, [planningDocContent, planningDocPath]);

  const hasActivePlan = Boolean(planningDocContent?.trim());
  const hasRows = holonRows.length > 0;
  const hasTemplate = Boolean(template?.label && template?.framework);
  const hasComposition = Boolean(compositionPlan);
  const hasBuildContract = Boolean(buildContract);
  const structuredEmpty = !hasTemplate && !hasRows && !hasComposition && !hasBuildContract;

  const onSave = useCallback(() => {
    setPlanningDocFromUserText(draft);
  }, [draft, setPlanningDocFromUserText]);

  const onClearPlanText = useCallback(() => {
    clearPlanningDoc();
    setDraft('');
  }, [clearPlanningDoc]);

  const onInsertComposer = useCallback(() => {
    injectComposerDraft(buildContinuationDraft());
  }, [buildContinuationDraft, injectComposerDraft]);

  const onMatchHolonsDraft = useCallback(() => {
    injectComposerDraft(BUILD_PLAN_MATCH_HOLONS_COMPOSER_PROMPT);
  }, [injectComposerDraft]);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      setPathHint(null);
      const dt = e.dataTransfer;
      if (dt.files?.length) {
        const file = dt.files[0];
        try {
          const text = await readDroppedFileAsText(file);
          setDraft(text);
          setPlanningDocFromUserText(text);
        } catch {
          /* ignore */
        }
        return;
      }
      const fromExplorer = dt.getData(OASIS_IDE_EXPLORER_FILE_PATH_MIME).trim();
      const plain = dt.getData('text/plain').trim();
      const rawPath = fromExplorer || plain;
      if (!rawPath) return;
      const resolved = resolveUserFilePathInput(workspacePath, rawPath);
      if (!resolved) {
        setPathHint('Open a workspace folder first, or use an absolute path.');
        return;
      }
      await loadPlanningDocFromAbsolutePath(resolved);
    },
    [workspacePath, setPlanningDocFromUserText, loadPlanningDocFromAbsolutePath]
  );

  const onLoadPathField = useCallback(() => {
    setPathHint(null);
    const resolved = resolveUserFilePathInput(workspacePath, pathInput);
    if (!resolved) {
      setPathHint(
        workspacePath
          ? 'Could not resolve that path (try Docs/… from the workspace root, or a full path).'
          : 'Open a workspace folder first, or paste an absolute file path.'
      );
      return;
    }
    void loadPlanningDocFromAbsolutePath(resolved);
  }, [workspacePath, pathInput, loadPlanningDocFromAbsolutePath]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  return (
    <div className="oapp-build-plan" role="region" aria-label="Build plan">
      <div className="oapp-build-plan__header">
        <ClipboardList size={18} strokeWidth={2} aria-hidden className="oapp-build-plan__header-icon" />
        <div>
          <h2 className="oapp-build-plan__title">Build plan</h2>
          <p className="oapp-build-plan__sub">
            Type your plan below, drop a file from your desktop, or <strong>drag a file from the Explorer</strong>{' '}
            onto the dashed box. You can also paste a repo-relative or absolute path and load it. Then click{' '}
            <strong>Save to agent context</strong> for typed text (drops from Explorer load immediately).
          </p>
        </div>
      </div>

      <div
        className={`oapp-build-plan__composer${dragOver ? ' is-drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {planningDocError ? (
          <p className="oapp-build-plan__err" role="alert">
            {planningDocError}
          </p>
        ) : null}
        {pathHint ? (
          <p className="oapp-build-plan__err" role="alert">
            {pathHint}
          </p>
        ) : null}
        <div className="oapp-build-plan__path-row">
          <label className="oapp-build-plan__label oapp-build-plan__label--inline" htmlFor="oapp-build-plan-path">
            File path
          </label>
          <input
            id="oapp-build-plan-path"
            type="text"
            className="oapp-build-plan__path-input"
            value={pathInput}
            onChange={(e) => {
              setPathInput(e.target.value);
              setPathHint(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onLoadPathField();
              }
            }}
            placeholder="Docs/FirstRow/FirstRow_IDE_Build_Context.md or /full/path/to/file.md"
            spellCheck={false}
            disabled={planningDocLoading}
            autoComplete="off"
          />
          <button
            type="button"
            className="oapp-build-plan__btn"
            onClick={onLoadPathField}
            disabled={planningDocLoading || !pathInput.trim()}
          >
            Load file
          </button>
        </div>
        <label className="oapp-build-plan__label" htmlFor="oapp-build-plan-textarea">
          Your plan
        </label>
        <textarea
          id="oapp-build-plan-textarea"
          className="oapp-build-plan__textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            'Example: We are building a Weverse-style fan app for FirstRow. Phase 1 is…\n\nOr drop a .md / .txt file onto this box.'
          }
          spellCheck
          disabled={planningDocLoading}
          rows={14}
        />
        <p className="oapp-build-plan__drop-hint">
          Drop a document, or drag a file from the left Explorer (files are draggable).
        </p>
        <div className="oapp-build-plan__row">
          <button
            type="button"
            className="oapp-build-plan__btn oapp-build-plan__btn--primary"
            onClick={onSave}
            disabled={planningDocLoading || !draft.trim()}
          >
            Save to agent context
          </button>
          <button
            type="button"
            className="oapp-build-plan__btn"
            onClick={onClearPlanText}
            disabled={planningDocLoading || (!draft.trim() && !hasActivePlan)}
          >
            Clear
          </button>
        </div>
        {hasActivePlan ? (
          <p className="oapp-build-plan__saved-hint" role="status">
            {planningDocPath ? (
              <>
                Saved. File: <code>{planningDocPath}</code>
              </>
            ) : (
              <>Saved. This text is included on every Agent send until you clear it.</>
            )}
          </p>
        ) : null}

        {hasActivePlan && !hasRows ? (
          <div className="oapp-build-plan__next">
            <h3 className="oapp-build-plan__next-title">What to do next (STARNET + vibe code)</h3>
            <ol className="oapp-build-plan__next-steps">
              <li>
                <strong>Done:</strong> the assistant already receives your planning text on every Composer message
                (no extra paste).
              </li>
              <li>
                <strong>Match holons:</strong> fill the Composer with a ready-made prompt, then send in{' '}
                <strong>Agent</strong> mode (Plan first is fine). The reply should add toggles here via{' '}
                <code>oasis-build-plan</code> JSON.
              </li>
              <li>
                <strong>Build:</strong> toggle rows below when they appear, insert the selection into Composer, switch
                to <strong>Execute</strong>, and send so the agent can scaffold and wire STARNET / repo files.
              </li>
            </ol>
            <div className="oapp-build-plan__next-actions">
              <button
                type="button"
                className="oapp-build-plan__btn oapp-build-plan__btn--primary"
                onClick={onMatchHolonsDraft}
              >
                Match holons (fill Composer)
              </button>
              <button
                type="button"
                className="oapp-build-plan__btn"
                onClick={() => requestActivityView('starnet')}
              >
                Open STARNET catalog
              </button>
            </div>
            <p className="oapp-build-plan__next-foot">
              Use <strong>Composer</strong> on the right (same chat). Stay in this tab if you want to read your plan
              while the assistant answers.
            </p>
          </div>
        ) : null}
      </div>

      <details className="oapp-build-plan__advanced">
        <summary className="oapp-build-plan__advanced-sum">More options</summary>
        <div className="oapp-build-plan__advanced-body">
          <button
            type="button"
            className="oapp-build-plan__btn"
            onClick={() => openFilePath && void loadPlanningDocFromAbsolutePath(openFilePath)}
            disabled={planningDocLoading || !openFilePath}
            title={openFilePath ?? ''}
          >
            Load file open in editor
          </button>
          <button
            type="button"
            className="oapp-build-plan__btn"
            onClick={() => void loadPlanningDocFromProjectHint()}
            disabled={planningDocLoading}
          >
            Load from .oasiside/planning-doc.path
          </button>
        </div>
      </details>

      {structuredEmpty ? (
        <p className="oapp-build-plan__holon-hint">
          Optional: after you chat, the assistant can add an <code>oasis-build-plan</code> JSON block for holon
          toggles below.
        </p>
      ) : null}

      {hasTemplate ? (
        <section className="oapp-build-plan__section" aria-labelledby="oapp-build-plan-template">
          <h3 id="oapp-build-plan-template" className="oapp-build-plan__section-title">
            Recommended app template
          </h3>
          <div className="oapp-build-plan__template-card">
            <div className="oapp-build-plan__template-label">{template!.label}</div>
            <div className="oapp-build-plan__template-fw">
              Framework: <strong>{template!.framework}</strong>
            </div>
            {template!.templatePathOrId ? (
              <div className="oapp-build-plan__template-meta">
                Template / recipe: <code>{template!.templatePathOrId}</code>
              </div>
            ) : null}
            {template!.rationale ? (
              <p className="oapp-build-plan__template-rationale">{template!.rationale}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasRows ? (
        <p className="oapp-build-plan__execute-hint" role="note">
          <strong>Next:</strong> adjust toggles below, use <strong>Insert holon selection into Composer</strong>, set
          Composer to <strong>Execute</strong>, and send to scaffold and wire the app (npm, files,{' '}
          <code>mcp_invoke</code> / STAR as needed).
        </p>
      ) : null}

      {compositionPlan ? (
        <section className="oapp-build-plan__section" aria-labelledby="oapp-build-plan-composition">
          <h3 id="oapp-build-plan-composition" className="oapp-build-plan__section-title">
            Composition contract
          </h3>
          <div className="oapp-build-plan__composition-card">
            <div className="oapp-build-plan__composition-summary">
              <strong>{compositionPlan.intent}</strong>
              <span>{compositionPlan.appType}</span>
              <span>
                {compositionPlan.nodes.length} nodes, {compositionPlan.edges.length} edges,{' '}
                {compositionPlan.gaps.length} gaps
              </span>
            </div>
            <div className="oapp-build-plan__composition-grid">
              <div>
                <h4>Capability lanes</h4>
                <ul>
                  {compositionPlan.capabilityLanes.slice(0, 8).map((lane) => (
                    <li key={lane.id}>
                      <strong>{lane.label}</strong>
                      <span>
                        {lane.matchedNodeIds.length > 0
                          ? `${lane.matchedNodeIds.length} matched node${lane.matchedNodeIds.length === 1 ? '' : 's'}`
                          : lane.gap ?? 'Gap'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Build steps</h4>
                <ol>
                  {compositionPlan.buildSteps.slice(0, 8).map((step) => (
                    <li key={step.id}>{step.title}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {buildContract ? (
        <section className="oapp-build-plan__section" aria-labelledby="oapp-build-plan-scaffold">
          <h3 id="oapp-build-plan-scaffold" className="oapp-build-plan__section-title">
            Holonic app scaffold
          </h3>
          <div className="oapp-build-plan__scaffold-card">
            <div className="oapp-build-plan__scaffold-summary">
              <strong>{buildContract.appName}</strong>
              <span>
                <code>{buildContract.projectPath}</code>
              </span>
              <span>{buildContract.stack} stack</span>
              {buildContract.reusableHolonSpecPath ? (
                <span>
                  reusable specs <code>{buildContract.reusableHolonSpecPath}</code>
                </span>
              ) : null}
              {buildContract.liveRuntimeAdapterPath ? (
                <span>
                  live adapter <code>{buildContract.liveRuntimeAdapterPath}</code>
                </span>
              ) : null}
            </div>
            <div className="oapp-build-plan__scaffold-grid">
              <div>
                <h4>Required files</h4>
                <ul>
                  {buildContract.requiredFiles.slice(0, 10).map((file) => (
                    <li key={file.path}>
                      <strong>{file.path}</strong>
                      <span>{file.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Verification sequence</h4>
                <ol>
                  <li>
                    <code>validate_holonic_app_scaffold</code>
                  </li>
                  <li>{buildContract.installCommand.argv.join(' ')}</li>
                  <li>{buildContract.buildCommand.argv.join(' ')}</li>
                  <li>{buildContract.devCommand.argv.join(' ')}</li>
                </ol>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {hasRows ? (
        <section className="oapp-build-plan__section" aria-labelledby="oapp-build-plan-holons">
          <div className="oapp-build-plan__section-head">
            <h3 id="oapp-build-plan-holons" className="oapp-build-plan__section-title">
              Holon features
            </h3>
            <div className="oapp-build-plan__bulk">
              <button type="button" className="oapp-build-plan__linkish" onClick={() => selectAllHolons(true)}>
                Select all
              </button>
              <span aria-hidden className="oapp-build-plan__bulk-sep">
                ·
              </span>
              <button type="button" className="oapp-build-plan__linkish" onClick={() => selectAllHolons(false)}>
                Clear
              </button>
            </div>
          </div>
          <ul className="oapp-build-plan__holon-list">
            {holonRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={`oapp-build-plan__holon-row${row.selected ? ' is-selected' : ''}`}
                  onClick={() => toggleHolon(row.id)}
                  aria-pressed={row.selected}
                >
                  <span className="oapp-build-plan__holon-check" aria-hidden>
                    {row.selected ? '☑' : '☐'}
                  </span>
                  <span className="oapp-build-plan__holon-body">
                    <span className="oapp-build-plan__holon-feature">{row.feature}</span>
                    {(row.catalogHolonName || row.catalogId) && (
                      <span className="oapp-build-plan__holon-meta">
                        {row.catalogHolonName ? <strong>{row.catalogHolonName}</strong> : null}
                        {row.catalogHolonName && row.catalogId ? ' · ' : null}
                        {row.catalogId ? <code>{row.catalogId}</code> : null}
                      </span>
                    )}
                    {row.roleInApp ? (
                      <span className="oapp-build-plan__holon-role">Role: {row.roleInApp}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!structuredEmpty ? (
        <footer className="oapp-build-plan__footer">
          <button
            type="button"
            className="oapp-build-plan__btn oapp-build-plan__btn--primary"
            onClick={onInsertComposer}
          >
            <Send size={14} strokeWidth={2} aria-hidden />
            Insert holon selection into Composer
          </button>
          <button type="button" className="oapp-build-plan__btn" onClick={clearPlan}>
            <ListChecks size={14} strokeWidth={2} aria-hidden />
            Clear holon/template plan
          </button>
          {lastIngestedAt ? (
            <span className="oapp-build-plan__footer-meta" title={new Date(lastIngestedAt).toISOString()}>
              Holon plan from assistant
            </span>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
};
