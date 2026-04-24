/**
 * ComposerInlineBuildPlanGuide
 *
 * A Cursor-style inline build flow that lives in the Composer message column.
 * The three phases map directly onto the agent loop already wired in ComposerSessionPanel:
 *
 *   1. INTENT — user describes what they want to build (free-text + optional planning doc)
 *   2. PLAN   — IDE runs plan_gather + plan_present (two-pass), shows the plan as an
 *               assistant bubble with quick-reply chips (Proceed / Narrow / Swap stack …)
 *   3. BUILD  — user clicks Proceed (or picks a chip); IDE switches to Execute mode and
 *               runs the full agent loop, streaming file edits into the feed
 *
 * The component does NOT own the agent loop — it drives it via onSendToComposer(text, mode)
 * so the existing loop, write-confirm UI, and activity feed all work unchanged.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { X, Hammer, Lightbulb, CheckCircle2 } from 'lucide-react';
import { useOappBuildPlan } from '../../contexts/OappBuildPlanContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import '../OnChain/ComposerInlineOnChainWorkflow.css';
import './ComposerInlineBuildPlanGuide.css';

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Phase = 'intent' | 'planning' | 'plan_ready' | 'building' | 'done' | 'error';

type ChatLine = {
  role: 'assistant' | 'user';
  content: string;
};

export interface ComposerInlineBuildPlanGuideProps {
  onDismiss: () => void;
  scrollParentRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Called to kick off a send. `mode` is either 'plan' (first pass) or 'execute' (build pass).
   * The parent (ComposerSessionPanel) intercepts this exactly like a user send, so the full
   * agent loop, write-confirm UI, and activity feed all work.
   */
  onSendToComposer: (text: string, mode: 'plan' | 'execute') => void;
  /** Latest assistant reply text from the Composer so the guide can mirror the plan. */
  latestAssistantReply: string | null;
  /** Whether the agent loop is currently running. */
  agentLoading: boolean;
}

/* ─── Starter chips ──────────────────────────────────────────────────────── */

const INTENT_CHIPS: string[] = [
  'Game world (Three.js / Hyperfy)',
  'Social community app',
  'Quest & mission chain',
  'NFT drop with GeoNFTs',
  'AI NPC companion',
  'Custom OAPP from scratch',
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function buildPlanPrompt(intent: string, workspacePath: string | null, planningDoc: string | null): string {
  const ws = workspacePath ? `\nWorkspace root: ${workspacePath}` : '';
  const doc = planningDoc?.trim()
    ? `\n\n[Planning doc from Build plan tab]\n${planningDoc.slice(0, 8000)}`
    : '';
  return (
    `Build the following OASIS app — run Plan mode first:\n\n${intent.trim()}${ws}${doc}\n\n` +
    `[IDE guided build — Phase 1: Plan]\n` +
    `1. Call list_directory on the workspace root and read any README / AGENTS.md you find.\n` +
    `2. Check the STARNET catalog section already in your context (star_list_holons / star_list_oapps only if the catalog is absent).\n` +
    `3. Propose a numbered build plan: A) MVP one-liner B) Holon map table (job / holon name / id / role) ` +
    `C) Starter template D) Build order (5-8 steps, last step is "Execute these steps")\n` +
    `End with quick-reply chips exactly like this:\n` +
    `<oasis_plan_replies>\n` +
    `["Proceed with this plan","Narrow to MVP","Swap starter template","Not sure — pick best default"]\n` +
    `</oasis_plan_replies>`
  );
}

function buildExecutePrompt(planText: string, intent: string): string {
  return (
    `[IDE guided build — Phase 2: Execute]\n` +
    `The user approved the following build plan. Execute each step now — write files, run commands, ` +
    `use STAR CLI where needed. Show file edits via write_file / write_files / search_replace.\n\n` +
    `Original intent: ${intent.trim()}\n\n` +
    `Approved plan:\n${planText.trim().slice(0, 6000)}`
  );
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export const ComposerInlineBuildPlanGuide: React.FC<ComposerInlineBuildPlanGuideProps> = ({
  onDismiss,
  scrollParentRef,
  onSendToComposer,
  latestAssistantReply,
  agentLoading,
}) => {
  const { planningDocContent } = useOappBuildPlan();
  const { workspacePath } = useWorkspace();

  const [phase, setPhase] = useState<Phase>('intent');
  const [intent, setIntent] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([
    {
      role: 'assistant',
      content:
        'Tell me what you want to build — a game world, quest chain, NFT drop, social app, anything on OASIS.\n\n' +
        'I will scan your workspace, pick the right STARNET holons and template, write a numbered plan, then execute it step-by-step when you say go.',
    },
  ]);
  const [planText, setPlanText] = useState('');
  const [planChips, setPlanChips] = useState<string[]>([]);
  const [error, setError] = useState('');

  /* Track latestAssistantReply to detect when planning finishes */
  const prevReplyRef = useRef<string | null>(null);
  const intentRef = useRef(intent);
  intentRef.current = intent;

  /* Auto-scroll */
  const scrollDown = useCallback(() => {
    const el = scrollParentRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [scrollParentRef]);

  useEffect(scrollDown, [lines, phase, scrollDown]);

  /* Pick up the plan from the Composer assistant reply after planning finishes */
  useEffect(() => {
    if (phase !== 'planning') return;
    if (!latestAssistantReply || latestAssistantReply === prevReplyRef.current) return;
    if (agentLoading) return;

    prevReplyRef.current = latestAssistantReply;

    /* Extract quick-reply chips if present */
    const chipsMatch = latestAssistantReply.match(
      /<oasis_plan_replies>\s*(\[[\s\S]*?\])\s*<\/oasis_plan_replies>/
    );
    let chips: string[] = ['Proceed with this plan', 'Narrow to MVP', 'Swap starter template'];
    if (chipsMatch) {
      try {
        const parsed = JSON.parse(chipsMatch[1]) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) chips = parsed;
      } catch {
        /* keep defaults */
      }
    }

    /* Strip chip block from the displayed plan */
    const cleanPlan = latestAssistantReply
      .replace(/<oasis_plan_replies>[\s\S]*?<\/oasis_plan_replies>/g, '')
      .trim();

    setPlanText(cleanPlan);
    setPlanChips(chips);
    setLines((prev) => [
      ...prev,
      { role: 'assistant', content: cleanPlan.slice(0, 1200) + (cleanPlan.length > 1200 ? '\n\n…(full plan in chat above)' : '') },
    ]);
    setPhase('plan_ready');
  }, [latestAssistantReply, agentLoading, phase]);

  /* Detect build finishing */
  useEffect(() => {
    if (phase !== 'building') return;
    if (agentLoading) return;
    if (latestAssistantReply && latestAssistantReply !== prevReplyRef.current) {
      prevReplyRef.current = latestAssistantReply;
      setLines((prev) => [
        ...prev,
        { role: 'assistant', content: '✓ Build complete. Check the Explorer for new files, review the write confirmations above, then run the dev command shown in the README.' },
      ]);
      setPhase('done');
    }
  }, [latestAssistantReply, agentLoading, phase]);

  /* ── Handlers ── */

  const handleChipSelect = useCallback((chip: string) => {
    setIntent((prev) => prev || chip);
    const txt = `${chip} — ${chip}`;
    setLines((prev) => [...prev, { role: 'user', content: chip }]);
    void handleStartPlan(chip);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartPlan = useCallback(
    async (overrideIntent?: string) => {
      const raw = (overrideIntent ?? intent).trim();
      if (!raw) {
        setError('Describe what you want to build first.');
        return;
      }
      setError('');
      setLines((prev) => [
        ...prev,
        { role: 'user', content: raw },
        { role: 'assistant', content: 'Scanning workspace and STARNET catalog, then writing your build plan…' },
      ]);
      setPhase('planning');
      prevReplyRef.current = null;
      const prompt = buildPlanPrompt(raw, workspacePath, planningDocContent);
      onSendToComposer(prompt, 'plan');
    },
    [intent, workspacePath, planningDocContent, onSendToComposer]
  );

  const handleProceed = useCallback(
    (chip?: string) => {
      const chosenChip = chip ?? planChips[0] ?? 'Proceed with this plan';
      setLines((prev) => [
        ...prev,
        { role: 'user', content: chosenChip },
        { role: 'assistant', content: 'Executing the build plan — writing files and running commands…' },
      ]);
      setPhase('building');
      prevReplyRef.current = null;
      const prompt = buildExecutePrompt(planText, intentRef.current);
      onSendToComposer(prompt, 'execute');
    },
    [planText, planChips, onSendToComposer]
  );

  const handleRestart = useCallback(() => {
    setPhase('intent');
    setIntent('');
    setPlanText('');
    setPlanChips([]);
    setError('');
    prevReplyRef.current = null;
    setLines([
      {
        role: 'assistant',
        content:
          'Tell me what you want to build — a game world, quest chain, NFT drop, social app, anything on OASIS.\n\n' +
          'I will scan your workspace, pick the right STARNET holons and template, write a numbered plan, then execute it step-by-step when you say go.',
      },
    ]);
  }, []);

  /* ── Render ── */

  const phaseLabel: Record<Phase, string> = {
    intent: 'Describe your idea',
    planning: 'Planning…',
    plan_ready: 'Review the plan',
    building: 'Building…',
    done: 'Done',
    error: 'Error',
  };

  return (
    <div className="composer-inline-onchain composer-build-guide" role="region" aria-label="OASIS app builder">
      {/* Header */}
      <header className="composer-inline-onchain-header composer-build-guide-header">
        <div className="composer-build-guide-header-left">
          <span className="composer-build-guide-icon" aria-hidden>
            <Hammer size={14} strokeWidth={2} />
          </span>
          <div>
            <h2 className="composer-inline-onchain-title">Build an OASIS app</h2>
            <p className="composer-inline-onchain-sub">
              In Composer · {phaseLabel[phase]}
              {planningDocContent ? ' · Planning doc loaded' : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="composer-inline-onchain-close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </header>

      {/* Thread */}
      <div className="composer-inline-onchain-body">
        <div className="composer-inline-onchain-thread">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`composer-inline-onchain-bubble composer-inline-onchain-bubble--${line.role}`}
            >
              <span className="composer-inline-onchain-bubble-label">
                {line.role === 'assistant' ? 'Assistant' : 'You'}
              </span>
              <div className="composer-inline-onchain-bubble-text" style={{ whiteSpace: 'pre-wrap' }}>
                {line.content}
              </div>
            </div>
          ))}

          {/* Typing indicator while agent runs */}
          {(phase === 'planning' || phase === 'building') && agentLoading && (
            <div className="composer-build-guide-typing" aria-live="polite">
              <span className="composer-build-guide-dot" />
              <span className="composer-build-guide-dot" />
              <span className="composer-build-guide-dot" />
            </div>
          )}
        </div>
      </div>

      {/* Footer — changes per phase */}
      <footer className="composer-inline-onchain-footer">
        {/* ── INTENT phase ── */}
        {phase === 'intent' && (
          <div className="composer-build-guide-intent">
            {/* Starter chips */}
            <div className="composer-build-guide-chips" role="group" aria-label="Quick start ideas">
              {INTENT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="composer-build-guide-chip"
                  onClick={() => {
                    setIntent(chip);
                    void handleStartPlan(chip);
                  }}
                >
                  <Lightbulb size={11} strokeWidth={1.8} aria-hidden />
                  {chip}
                </button>
              ))}
            </div>

            {/* Free-text intent input */}
            <div className="composer-build-guide-input-row">
              <textarea
                className="composer-build-guide-textarea"
                placeholder="Or describe your app idea… (press ⌘↵ or click Plan)"
                value={intent}
                rows={3}
                onChange={(e) => setIntent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void handleStartPlan();
                  }
                }}
              />
              <div className="composer-build-guide-input-actions">
                {planningDocContent ? (
                  <span className="composer-build-guide-doc-badge" title="Planning doc is loaded from the Build plan tab">
                    📄 Planning doc attached
                  </span>
                ) : (
                  <span className="composer-build-guide-doc-hint">
                    Drop a planning doc in the Build plan tab (left) to attach extra context.
                  </span>
                )}
                <button
                  type="button"
                  className="composer-inline-onchain-primary"
                  disabled={!intent.trim()}
                  onClick={() => void handleStartPlan()}
                >
                  Plan →
                </button>
              </div>
            </div>
            {error ? <p className="composer-build-guide-err">{error}</p> : null}
          </div>
        )}

        {/* ── PLANNING phase ── */}
        {phase === 'planning' && (
          <div className="composer-inline-onchain-form">
            <span className="composer-build-guide-status-text">
              Scanning workspace and STARNET catalog…
            </span>
            <button type="button" className="composer-inline-onchain-secondary" onClick={onDismiss}>
              Run in background
            </button>
          </div>
        )}

        {/* ── PLAN_READY phase — show chips + proceed ── */}
        {phase === 'plan_ready' && (
          <div className="composer-build-guide-plan-ready">
            <p className="composer-build-guide-plan-label">How do you want to proceed?</p>
            <div className="composer-build-guide-plan-chips" role="group" aria-label="Plan choices">
              {planChips.map((chip, i) => (
                <button
                  key={chip}
                  type="button"
                  className={`composer-build-guide-plan-chip${i === 0 ? ' is-primary' : ''}`}
                  onClick={() => handleProceed(chip)}
                >
                  {i === 0 && <CheckCircle2 size={12} strokeWidth={2} aria-hidden />}
                  {chip}
                </button>
              ))}
            </div>
            <div className="composer-build-guide-plan-actions">
              <button
                type="button"
                className="composer-inline-onchain-secondary"
                onClick={handleRestart}
              >
                Start over
              </button>
              <button
                type="button"
                className="composer-inline-onchain-secondary"
                onClick={onDismiss}
              >
                Close (keep in chat)
              </button>
            </div>
          </div>
        )}

        {/* ── BUILDING phase ── */}
        {phase === 'building' && (
          <div className="composer-inline-onchain-form">
            <span className="composer-build-guide-status-text">
              Writing files… watch the activity feed above for progress.
            </span>
            <button type="button" className="composer-inline-onchain-secondary" onClick={onDismiss}>
              Run in background
            </button>
          </div>
        )}

        {/* ── DONE phase ── */}
        {phase === 'done' && (
          <div className="composer-inline-onchain-form composer-inline-onchain-success-actions">
            <button
              type="button"
              className="composer-inline-onchain-primary"
              onClick={handleRestart}
            >
              Build something else
            </button>
            <button
              type="button"
              className="composer-inline-onchain-secondary"
              onClick={onDismiss}
            >
              Close
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};
