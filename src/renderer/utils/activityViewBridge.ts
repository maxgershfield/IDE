import type { ActivityView } from '../components/Layout/ActivityBar';

/** Dispatched on `window`; `AppInner` listens and switches the activity bar view. */
export const OASIS_SET_ACTIVITY_VIEW = 'oasis-ide:set-activity-view';

/** Dispatched on `window`; `StarnetDashboard` highlights catalog rows by id. */
export const OASIS_STARNET_SELECT_CATALOG_ROWS = 'oasis-ide:starnet-select-catalog-rows';

export interface StarnetCatalogSelectionRequest {
  ids: string[];
  source: 'agent' | 'manual';
  query?: string;
  createdAt: number;
}

let pendingStarnetCatalogSelection: StarnetCatalogSelectionRequest | null = null;

/** OASIS API starter guide: focus Composer and open the step-by-step flow in the right panel. */
export const OASIS_OPEN_ONBOARD_GUIDE = 'oasis-ide:open-onboard-guide';

export function requestActivityView(view: ActivityView): void {
  window.dispatchEvent(new CustomEvent(OASIS_SET_ACTIVITY_VIEW, { detail: { view } }));
}

export function requestStarnetCatalogSelection(
  ids: string[],
  source: 'agent' | 'manual' = 'agent',
  query?: string
): void {
  const unique = Array.from(
    new Set(
      ids
        .map((id) => id.trim().toLowerCase())
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    )
  );
  if (unique.length === 0) return;
  pendingStarnetCatalogSelection = {
    ids: unique,
    source,
    query: query?.trim() || undefined,
    createdAt: Date.now()
  };
  window.dispatchEvent(
    new CustomEvent(OASIS_STARNET_SELECT_CATALOG_ROWS, {
      detail: pendingStarnetCatalogSelection
    })
  );
}

export function consumePendingStarnetCatalogSelection(): StarnetCatalogSelectionRequest | null {
  const pending = pendingStarnetCatalogSelection;
  pendingStarnetCatalogSelection = null;
  if (!pending) return null;
  // Avoid replaying stale selections from a previous interaction after hot reloads or delayed mounts.
  if (Date.now() - pending.createdAt > 30_000) return null;
  return pending;
}

export function openOasisOnboardGuide(): void {
  window.dispatchEvent(new CustomEvent(OASIS_OPEN_ONBOARD_GUIDE));
}
