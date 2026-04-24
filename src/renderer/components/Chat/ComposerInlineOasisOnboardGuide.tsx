import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useOasisOnboardGuide } from '../Templates/useOasisOnboardGuide';
import { OasisOnboardGuideFlow } from '../Templates/OasisOnboardGuideFlow';
import '../OnChain/ComposerInlineOnChainWorkflow.css';

export interface ComposerInlineOasisOnboardGuideProps {
  onDismiss: () => void;
  scrollParentRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Pre-fills the Composer input on the done screen when no description was given.
   * User still decides when to send — no auto-submit.
   */
  onInsertComposer?: (text: string) => void;
  /**
   * Fires the customization prompt directly to the Composer agent.
   * Called automatically after creation when the user provided a description.
   */
  onSendToComposer?: (text: string) => void;
}

/**
 * OASIS API (Vite + TypeScript) starter — lovable-style single-prompt flow.
 * After creation, auto-fires a targeted customization prompt to the agent
 * so the app is personalized without any extra click.
 */
export const ComposerInlineOasisOnboardGuide: React.FC<ComposerInlineOasisOnboardGuideProps> = ({
  onDismiss,
  scrollParentRef,
  onInsertComposer,
  onSendToComposer,
}) => {
  /** True while the agent customization send is in flight (agent loading, not our local state). */
  const [customizing, setCustomizing] = useState(false);

  const handleAutoCustomize = useCallback((prompt: string) => {
    if (!onSendToComposer) return;
    setCustomizing(true);
    onSendToComposer(prompt);
    // The agent takes over from here; we clear our local flag after a brief moment
    // so the UI transitions from "personalizing" once the agent feed kicks in.
    setTimeout(() => setCustomizing(false), 12000);
  }, [onSendToComposer]);

  const m = useOasisOnboardGuide({
    onSuccessBanner: () => {},
    onAutoCustomize: onSendToComposer ? handleAutoCustomize : undefined,
  });

  useEffect(() => {
    const el = scrollParentRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [m.screen, scrollParentRef]);

  return (
    <div className="composer-inline-onchain" role="region" aria-label="OASIS API app setup">
      <header className="composer-inline-onchain-header">
        <div>
          <h2 className="composer-inline-onchain-title">OASIS API app (Vite + TypeScript)</h2>
          <p className="composer-inline-onchain-sub">Describe your app — we'll scaffold and personalize it</p>
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
      <div className="composer-inline-onchain-body">
        <OasisOnboardGuideFlow
          m={m}
          showMarketingHead={false}
          className="oasis-guide--in-composer"
          onInsertComposer={onInsertComposer}
          agentCustomizing={customizing}
        />
      </div>
    </div>
  );
};
