import type { ActivityView } from '../components/Layout/ActivityBar';

/** Dispatched on `window`; `AppInner` listens and switches the activity bar view. */
export const OASIS_SET_ACTIVITY_VIEW = 'oasis-ide:set-activity-view';

/** OASIS API starter guide: focus Composer and open the step-by-step flow in the right panel. */
export const OASIS_OPEN_ONBOARD_GUIDE = 'oasis-ide:open-onboard-guide';

export function requestActivityView(view: ActivityView): void {
  window.dispatchEvent(new CustomEvent(OASIS_SET_ACTIVITY_VIEW, { detail: { view } }));
}

export function openOasisOnboardGuide(): void {
  window.dispatchEvent(new CustomEvent(OASIS_OPEN_ONBOARD_GUIDE));
}
