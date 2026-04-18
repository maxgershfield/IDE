import type { OnChainMintWorkflowChainId, OnChainSolanaClusterId } from './onChainMintWorkflow';
import { mintWorkflowChainLabel } from './onChainMintWorkflow';

/** Appended to the agent context pack so the model sees the user’s chain defaults. */
export function buildOnChainAgentContextNote(
  chain: OnChainMintWorkflowChainId,
  cluster: OnChainSolanaClusterId
): string {
  const label = mintWorkflowChainLabel(chain);
  if (chain === 'solana') {
    return (
      `Default chain: ${label}. Solana cluster: ${cluster}. ` +
      `Use these when invoking oasis_workflow_mint_nft or wallet MCP tools unless the user specifies otherwise.`
    );
  }
  return (
    `Default chain: ${label}. ` +
    `Use this when invoking oasis_workflow_mint_nft or wallet MCP tools unless the user specifies otherwise.`
  );
}

export function buildCopyPromptForTool(toolName: string): string {
  if (toolName === 'oasis_health_check') {
    return 'Use mcp_invoke with tool "oasis_health_check" and arguments {}.';
  }
  return `Use mcp_invoke with tool "${toolName}" and arguments per the tool schema (see OASIS Tools panel or MCP).`;
}
