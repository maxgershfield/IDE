# Holonic OAPP Intelligence Proof

This recipe is the second-OAPP proof for the IDE intelligence layer. It is intentionally not food delivery: the same pipeline must build a different product shape while preserving the golden-path invariants.

## Proof OAPP

**Local Services Marketplace OAPP**

Roles:

- Customer: browses local service providers, requests a booking, tracks status, opens support, leaves a review.
- Provider: manages availability, accepts bookings, updates job status.
- Operator: monitors live bookings, handles support, resolves disputes.

Reusable holons:

- `AvatarAuthHolon`: OASIS Avatar session identity.
- `ProfileHolon`: customer/provider/operator profile and addresses.
- `CatalogHolon`: service-provider listings and service packages.
- `BookingCartHolon`: draft booking package, time slot, address, and notes.
- `CheckoutHolon`: deposit or authorization event.
- `BookingWorkflowHolon`: requested -> accepted -> scheduled -> in-progress -> completed.
- `GeoZoneHolon`: service area and travel estimate.
- `NotificationHolon`: booking status events.
- `SupportHolon`: customer/provider issue flow.
- `ReviewHolon`: post-service trust event.
- `AdminOpsHolon`: marketplace operations console.

## Required IDE Artifacts

The planner must emit:

1. `oasis-composition-plan`: selected catalog rows, gaps, role surfaces, runtime bindings, and verification.
2. `oasis-holonic-build-contract`: executable scaffold contract with `reusableHolonSpecPath` and `liveRuntimeAdapterPath`.
3. `oasis-build-plan`: user-selectable holon rows and template recommendation.

## Required Scaffold

The builder must generate:

- `package.json`
- `vite.config.js`
- `index.html`
- `src/main.jsx`
- `src/App.jsx`
- `src/styles.css`
- `src/api/starnetApi.js`
- `src/api/holonRuntimeAdapter.js`
- `src/holons/reusableHolonSpecs.js`
- `src/holons/serviceMarketplaceFixtures.js`
- `src/holons/manifest.js`
- `README.md`

## Validation Sequence

The IDE must run the following sequence before claiming success:

1. `validate_holonic_app_scaffold`
2. `validate_oapp_quality`
3. `npm install`
4. `npm run build`

If either validator fails, the agent must treat the returned `Repair instructions` section as the next implementation brief and rerun validation.

## Comparison Against Food Delivery

| Golden-path invariant | Food delivery proof | Services marketplace proof |
| --- | --- | --- |
| Multi-role UI | customer, restaurant, courier, admin | customer, provider, operator |
| Real app actions | basket, order, courier status, support | booking request, provider acceptance, job status, support |
| Reusable specs | food-delivery holon kit | services marketplace holon kit |
| Fixture mode | deterministic order lifecycle | deterministic booking lifecycle |
| Live mode | Venue/Menu/Cart/Delivery/Courier writes | Provider/Package/Booking/Workflow writes |
| Runtime boundary | `src/api/holonRuntimeAdapter.js` | `src/api/holonRuntimeAdapter.js` |
| Quality gate | app build plus rubric | app build plus rubric |

This recipe proves that the IDE intelligence layer is not memorizing food delivery. It must preserve the architecture and validation discipline while swapping the domain payloads.
