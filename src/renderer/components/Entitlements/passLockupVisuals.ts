/**
 * Visual tokens per SKU for pass lockup mini-cards (aligned with public/pass-lockup-editor.html).
 */
export interface PassLockupVisual {
  tierLine: string;
  placeholderDisplayName: string;
  placeholderHandle: string;
  accent: { glow: string; inner: string; edge: string; sheen: string; grain: number };
  brandDomain: string | null;
}

export const PASS_LOCKUP_VISUAL_BY_SKU: Record<string, PassLockupVisual> = {
  'founder-annual': {
    tierLine: 'Founder Annual',
    placeholderDisplayName: 'Founder Pass',
    placeholderHandle: '@founder.yearly',
    accent: { glow: '56, 189, 248', inner: '125, 211, 252', edge: '147, 197, 253', sheen: '56, 189, 248', grain: 0.065 },
    brandDomain: null,
  },
  'founder-lifetime-ga': {
    tierLine: 'Lifetime GA',
    placeholderDisplayName: 'Founder GA',
    placeholderHandle: '@founder.ga',
    accent: { glow: '45, 212, 191', inner: '94, 234, 212', edge: '110, 231, 210', sheen: '45, 212, 191', grain: 0.07 },
    brandDomain: null,
  },
  'solana-builder-pass': {
    tierLine: 'Solana Builder',
    placeholderDisplayName: 'Builder',
    placeholderHandle: '@solana.builder',
    accent: { glow: '167, 139, 250', inner: '196, 181, 253', edge: '192, 132, 252', sheen: '167, 139, 250', grain: 0.068 },
    brandDomain: 'solana.com',
  },
  'evm-core-pass': {
    tierLine: 'EVM Core',
    placeholderDisplayName: 'EVM Tier A',
    placeholderHandle: '@evm.core',
    accent: { glow: '129, 140, 248', inner: '165, 180, 252', edge: '129, 140, 248', sheen: '99, 102, 241', grain: 0.064 },
    brandDomain: 'ethereum.org',
  },
  'geonft-studio-pass': {
    tierLine: 'GeoNFT Studio',
    placeholderDisplayName: 'Geo Author',
    placeholderHandle: '@geo.studio',
    accent: { glow: '52, 211, 153', inner: '110, 231, 183', edge: '52, 211, 153', sheen: '16, 185, 129', grain: 0.072 },
    brandDomain: 'mapbox.com',
  },
  'starnet-publisher-pass': {
    tierLine: 'STARNET Publish',
    placeholderDisplayName: 'Publisher',
    placeholderHandle: '@starnet.pub',
    accent: { glow: '244, 114, 182', inner: '251, 207, 232', edge: '244, 114, 182', sheen: '236, 72, 153', grain: 0.066 },
    brandDomain: null,
  },
  'game-content-studio-pass': {
    tierLine: 'Game Studio',
    placeholderDisplayName: 'Content Lead',
    placeholderHandle: '@game.studio',
    accent: { glow: '251, 191, 36', inner: '253, 224, 71', edge: '251, 191, 36', sheen: '245, 158, 11', grain: 0.069 },
    brandDomain: null,
  },
  'voice-studio-pass': {
    tierLine: 'Voice Studio',
    placeholderDisplayName: 'Voice Lead',
    placeholderHandle: '@voice.studio',
    accent: { glow: '248, 113, 113', inner: '252, 165, 165', edge: '248, 113, 113', sheen: '239, 68, 68', grain: 0.067 },
    brandDomain: 'elevenlabs.io',
  },
  'unity-bridge-pass': {
    tierLine: 'Unity Bridge',
    placeholderDisplayName: 'Unity Dev',
    placeholderHandle: '@unity.bridge',
    accent: { glow: '148, 163, 184', inner: '203, 213, 225', edge: '148, 163, 184', sheen: '100, 116, 139', grain: 0.063 },
    brandDomain: 'unity.com',
  },
  'partner-season-badge': {
    tierLine: 'Partner Season',
    placeholderDisplayName: 'Season',
    placeholderHandle: '@partner.drop',
    accent: { glow: '251, 191, 36', inner: '253, 230, 138', edge: '234, 179, 8', sheen: '202, 138, 4', grain: 0.075 },
    brandDomain: null,
  },
};

export function getPassLockupVisual(skuId: string): PassLockupVisual | undefined {
  return PASS_LOCKUP_VISUAL_BY_SKU[skuId];
}
