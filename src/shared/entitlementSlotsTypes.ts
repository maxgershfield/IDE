/**
 * NFT entitlement slots (see docs/NFT_ENTITLEMENT_SLOTS_SPEC.md).
 * Client catalog + ONODE GET /api/ide/entitlement-slots states.
 */

export const ENTITLEMENT_CATALOG_VERSION = '1';

export type EntitlementSlotCategory =
  | 'access'
  | 'chain'
  | 'oasis'
  | 'integration'
  | 'community';

export type EntitlementSlotStatus = 'locked' | 'active' | 'pending';

export interface EntitlementSlotCatalogEntry {
  skuId: string;
  category: EntitlementSlotCategory;
  title: string;
  shortDescription: string;
  /** What the pass unlocks in product language */
  unlocksSummary: string;
  /** Machine-oriented flags; enforcement comes from ONODE JWT later */
  featureFlags: string[];
}

export interface EntitlementSlotStateDto {
  status: EntitlementSlotStatus;
  verifiedAt?: string;
  walletAddress?: string;
  chain?: string;
  tokenId?: string;
}

/** Response from GET /api/ide/entitlement-slots */
export interface IdeEntitlementSlotsApiResponse {
  catalogVersion: string;
  generatedAt: string;
  avatarId?: string;
  states: Record<string, EntitlementSlotStateDto>;
}

export interface EntitlementSlotViewRow extends EntitlementSlotCatalogEntry {
  effectiveStatus: EntitlementSlotStatus;
  verifiedAt?: string;
  walletAddress?: string;
  chain?: string;
  tokenId?: string;
}
