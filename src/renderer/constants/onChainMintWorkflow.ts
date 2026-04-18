/**
 * Chains supported by MCP `oasis_workflow_mint_nft` (see MCP/src/clients/oasisClient.ts).
 * Keep in sync with MINT_WORKFLOW_EVM + Solana.
 */
export const MINT_WORKFLOW_CHAIN_IDS = [
  'solana',
  'ethereum',
  'base',
  'arbitrum',
  'polygon',
  'optimism',
  'avalanche',
  'bnb',
  'fantom',
] as const;

export type OnChainMintWorkflowChainId = (typeof MINT_WORKFLOW_CHAIN_IDS)[number];

export const SOLANA_CLUSTER_IDS = ['devnet', 'mainnet-beta', 'mainnet'] as const;
export type OnChainSolanaClusterId = (typeof SOLANA_CLUSTER_IDS)[number];

const CHAIN_LABELS: Record<OnChainMintWorkflowChainId, string> = {
  solana: 'Solana',
  ethereum: 'Ethereum',
  base: 'Base',
  arbitrum: 'Arbitrum',
  polygon: 'Polygon',
  optimism: 'Optimism',
  avalanche: 'Avalanche',
  bnb: 'BNB Chain',
  fantom: 'Fantom',
};

export function mintWorkflowChainLabel(id: OnChainMintWorkflowChainId): string {
  return CHAIN_LABELS[id] ?? id;
}

export function isMintWorkflowChainId(s: unknown): s is OnChainMintWorkflowChainId {
  return typeof s === 'string' && (MINT_WORKFLOW_CHAIN_IDS as readonly string[]).includes(s);
}

export function isSolanaClusterId(s: unknown): s is OnChainSolanaClusterId {
  return typeof s === 'string' && (SOLANA_CLUSTER_IDS as readonly string[]).includes(s);
}

export type McpToolCategory = 'all' | 'health' | 'wallet' | 'nft' | 'star' | 'holon' | 'other';

export function categorizeMcpToolName(name: string): Exclude<McpToolCategory, 'all'> {
  const n = name.toLowerCase();
  if (n.includes('health') || n === 'oasis_health_check') return 'health';
  if (
    n.includes('wallet') ||
    n.includes('balance') ||
    n.includes('portfolio') ||
    n.includes('transaction') ||
    n.includes('send_token')
  ) {
    return 'wallet';
  }
  if (n.includes('nft') || n.includes('mint') || n.includes('geo_nft')) return 'nft';
  if (n.startsWith('star_')) return 'star';
  if (n.includes('holon')) return 'holon';
  return 'other';
}
