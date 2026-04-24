import React, { useEffect, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useMCP } from '../../contexts/MCPContext';
import {
  MINT_WORKFLOW_CHAIN_IDS,
  mintWorkflowChainLabel,
  SOLANA_CLUSTER_IDS,
  type OnChainMintWorkflowChainId,
  type OnChainSolanaClusterId,
} from '../../constants/onChainMintWorkflow';
import './StatusBar.css';

type OasisHealth = 'unknown' | 'healthy' | 'down';

/**
 * Status strip: workspace label, default chain (Tier A mint workflow), Solana cluster, ONODE health, MCP tool count.
 */
export const StatusBar: React.FC = () => {
  const { settings, updateSettings, openSettings } = useSettings();
  const { tools, loading: mcpLoading } = useMCP();
  const [oasisHealth, setOasisHealth] = useState<OasisHealth>('unknown');

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        if (window.electronAPI?.healthCheck) {
          const h = await window.electronAPI.healthCheck();
          if (!cancelled) {
            setOasisHealth(h?.status === 'healthy' ? 'healthy' : 'down');
          }
        } else {
          if (!cancelled) setOasisHealth('unknown');
        }
      } catch {
        if (!cancelled) setOasisHealth('down');
      }
    };
    void ping();
    const id = window.setInterval(ping, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!settings.showStatusBar) {
    return null;
  }

  const onChainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (MINT_WORKFLOW_CHAIN_IDS.includes(v as OnChainMintWorkflowChainId)) {
      updateSettings({ onChainDefaultChain: v as OnChainMintWorkflowChainId });
    }
  };

  const onClusterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (SOLANA_CLUSTER_IDS.includes(v as OnChainSolanaClusterId)) {
      updateSettings({ onChainSolanaCluster: v as OnChainSolanaClusterId });
    }
  };

  const onodeTitle =
    oasisHealth === 'healthy'
      ? 'ONODE reachable'
      : oasisHealth === 'down'
        ? 'ONODE not reachable'
        : 'ONODE status unknown';

  return (
    <div className="ide-status-bar" role="status">
      <div className="ide-status-bar-left">
        <span className="ide-status-item" title="Workspace">
          OASIS IDE
        </span>
        <span className="ide-status-sep" aria-hidden>
          ·
        </span>
        <label className="ide-status-compact">
          <span className="visually-hidden">Default chain for on-chain actions</span>
          <select
            className="ide-status-select"
            value={settings.onChainDefaultChain}
            onChange={onChainChange}
            title="Default chain for mint workflow and agent prompts (Tier A)"
            aria-label="Default chain"
          >
            {MINT_WORKFLOW_CHAIN_IDS.map((id) => (
              <option key={id} value={id}>
                {mintWorkflowChainLabel(id)}
              </option>
            ))}
          </select>
        </label>
        {settings.onChainDefaultChain === 'solana' ? (
          <>
            <span className="ide-status-sep" aria-hidden>
              ·
            </span>
            <label className="ide-status-compact">
              <span className="visually-hidden">Solana cluster</span>
              <select
                className="ide-status-select"
                value={settings.onChainSolanaCluster}
                onChange={onClusterChange}
                title="Solana cluster (devnet for testing)"
                aria-label="Solana cluster"
              >
                {SOLANA_CLUSTER_IDS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>
      <div className="ide-status-bar-right">
        <button
          type="button"
          className="ide-status-link"
          onClick={() => openSettings('onchain')}
          title="Open On-chain settings"
        >
          On-chain
        </button>
        <span
          className={`ide-status-pill ide-status-pill--onode ide-status-pill--${oasisHealth}`}
          title={onodeTitle}
        >
          ONODE {oasisHealth === 'healthy' ? 'ok' : oasisHealth === 'down' ? 'down' : '…'}
        </span>
        <span
          className={`ide-status-pill ide-status-pill--mcp${mcpLoading ? ' ide-status-pill--loading' : ''}`}
          title={
            tools.length === 0
              ? 'No MCP tools (check hosted MCP / log; or stdio + OASIS_MCP_SERVER_PATH)'
              : `${tools.length} MCP tools`
          }
        >
          MCP {mcpLoading ? '…' : tools.length === 0 ? '0' : tools.length}
        </span>
      </div>
    </div>
  );
};
