import React from 'react';
import { useSettings } from '../../../contexts/SettingsContext';
import {
  MINT_WORKFLOW_CHAIN_IDS,
  mintWorkflowChainLabel,
  SOLANA_CLUSTER_IDS,
  type OnChainMintWorkflowChainId,
  type OnChainSolanaClusterId,
} from '../../../constants/onChainMintWorkflow';

export const OnChainSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  return (
    <>
      <div className="settings-info-box">
        <strong>On-chain defaults</strong> apply to the status bar, Composer quick actions, and the
        agent context pack. Only chains supported by the MCP mint workflow (Tier A) are listed here.
        Mainnet transactions spend real assets. Prefer devnet for experiments on Solana. See{' '}
        <code>OASIS-IDE/docs/ONCHAIN_IDE_CHAIN_READINESS_AND_ENTITLEMENTS.md</code> in the repo for
        chain tiers and entitlements.
      </div>

      <p className="settings-section-heading">Default chain</p>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Mint workflow chain</div>
            <div className="settings-row-desc">
              Used for prompts and agent context. Matches <code>oasis_workflow_mint_nft</code> in MCP.
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.onChainDefaultChain}
              onChange={(e) => {
                const v = e.target.value;
                if (MINT_WORKFLOW_CHAIN_IDS.includes(v as OnChainMintWorkflowChainId)) {
                  updateSettings({ onChainDefaultChain: v as OnChainMintWorkflowChainId });
                }
              }}
            >
              {MINT_WORKFLOW_CHAIN_IDS.map((id) => (
                <option key={id} value={id}>
                  {mintWorkflowChainLabel(id)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Solana cluster</div>
            <div className="settings-row-desc">
              Applies when the default chain is Solana (devnet for testing).
            </div>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={settings.onChainSolanaCluster}
              disabled={settings.onChainDefaultChain !== 'solana'}
              onChange={(e) => {
                const v = e.target.value;
                if (SOLANA_CLUSTER_IDS.includes(v as OnChainSolanaClusterId)) {
                  updateSettings({ onChainSolanaCluster: v as OnChainSolanaClusterId });
                }
              }}
            >
              {SOLANA_CLUSTER_IDS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

    </>
  );
};
