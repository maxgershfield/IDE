import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import {
  GAME_QUICK_ACTIONS,
  type GameQuickActionId,
} from '../../constants/gameQuickActions';
import '../OnChain/ComposerInlineOnChainWorkflow.css';

type ChatLine = { role: 'assistant' | 'user'; content: string };

export interface ComposerInlineGameWorkflowProps {
  actionId: GameQuickActionId;
  onDismiss: () => void;
  scrollParentRef: React.RefObject<HTMLDivElement | null>;
  onOpenBuilder: (builderId: string) => void;
  onInsertComposer: (text: string) => void;
}

/**
 * Game Dev quick actions: same inline Composer pattern as mint / wallet (assistant thread + footer actions).
 */
export const ComposerInlineGameWorkflow: React.FC<ComposerInlineGameWorkflowProps> = ({
  actionId,
  onDismiss,
  scrollParentRef,
  onOpenBuilder,
  onInsertComposer,
}) => {
  const def = GAME_QUICK_ACTIONS[actionId];
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [step, setStep] = useState<'ready' | 'done'>('ready');

  useEffect(() => {
    setStep('ready');
    setLines([
      {
        role: 'assistant',
        content: def.intro,
      },
    ]);
  }, [actionId, def.intro]);

  useEffect(() => {
    const el = scrollParentRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lines, scrollParentRef]);

  const handlePrimary = useCallback(() => {
    if (def.primaryAction === 'insertPrompt' && def.injectPrompt) {
      onInsertComposer(def.injectPrompt);
      setStep('done');
      setLines((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'The planning prompt is in the composer input below. Review and edit it, then send your message.',
        },
      ]);
      return;
    }
    if (def.primaryAction === 'openBuilder' && def.builderId) {
      onOpenBuilder(def.builderId);
      setStep('done');
      setLines((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'The builder is opening in the main editor. Complete the form there. When the builder offers Send to chat, use it to continue in this thread.',
        },
      ]);
    }
  }, [def, onInsertComposer, onOpenBuilder]);

  const handleStartOver = useCallback(() => {
    setStep('ready');
    setLines([{ role: 'assistant', content: def.intro }]);
  }, [def.intro]);

  const titleText = def.title;

  return (
    <div
      className="composer-inline-onchain"
      role="region"
      aria-label={`Game Dev workflow: ${titleText}`}
    >
      <header className="composer-inline-onchain-header">
        <div>
          <h2 className="composer-inline-onchain-title">{titleText}</h2>
          <p className="composer-inline-onchain-sub">In Composer · Game Dev quick action (same session as your chat)</p>
        </div>
        <button type="button" className="composer-inline-onchain-close" onClick={onDismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
      </header>

      <div className="composer-inline-onchain-body">
        <div className="composer-inline-onchain-thread">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`composer-inline-onchain-bubble composer-inline-onchain-bubble--${line.role}`}
            >
              {line.role === 'assistant' ? (
                <span className="composer-inline-onchain-bubble-label">Assistant</span>
              ) : (
                <span className="composer-inline-onchain-bubble-label">You</span>
              )}
              <div className="composer-inline-onchain-bubble-text">{line.content}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="composer-inline-onchain-footer">
        {step === 'ready' ? (
          <div className="composer-inline-onchain-form composer-inline-onchain-success-actions">
            <button type="button" className="composer-inline-onchain-primary" onClick={handlePrimary}>
              {def.primaryLabel}
            </button>
            <button type="button" className="composer-inline-onchain-secondary" onClick={onDismiss}>
              Close
            </button>
          </div>
        ) : (
          <div className="composer-inline-onchain-form composer-inline-onchain-success-actions">
            <button type="button" className="composer-inline-onchain-primary" onClick={handleStartOver}>
              Run this action again
            </button>
            <button type="button" className="composer-inline-onchain-secondary" onClick={onDismiss}>
              Close
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};
