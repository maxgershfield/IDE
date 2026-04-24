import React from 'react';
import type { OnChainWorkflowMode } from '../OnChain/ComposerInlineOnChainWorkflow';

export interface OnChainQuickPaletteProps {
  onStartWorkflow: (mode: OnChainWorkflowMode) => void;
}

/**
 * Opens assistant-led on-chain workflows (modal) with MCP result cards, not raw composer text.
 */
export const OnChainQuickPalette: React.FC<OnChainQuickPaletteProps> = ({ onStartWorkflow }) => {
  return (
    <div className="onchain-quick-palette" aria-label="On-chain quick actions">
      <span className="onchain-quick-palette__heading">On-chain</span>
      <div className="onchain-quick-palette__actions" role="list">
        <button
          type="button"
          role="listitem"
          className="onchain-quick-palette__btn"
          title="Open mint workflow assistant"
          onClick={() => onStartWorkflow('mint')}
        >
          <span className="onchain-quick-palette__label">Mint NFT</span>
          <span className="onchain-quick-palette__sublabel">workflow</span>
        </button>
        <button
          type="button"
          role="listitem"
          className="onchain-quick-palette__btn"
          title="Open create wallet assistant"
          onClick={() => onStartWorkflow('wallet')}
        >
          <span className="onchain-quick-palette__label">Create wallet</span>
          <span className="onchain-quick-palette__sublabel">MCP</span>
        </button>
        <button
          type="button"
          role="listitem"
          className="onchain-quick-palette__btn"
          title="Open health check"
          onClick={() => onStartWorkflow('health')}
        >
          <span className="onchain-quick-palette__label">Health check</span>
          <span className="onchain-quick-palette__sublabel">oasis_health_check</span>
        </button>
      </div>
    </div>
  );
};
