# Adaptive Plants Domain Pack Build Plan

## Purpose

Create an **Adaptive Plants** bundled Domain Pack for the OASIS-IDE **Holonic Suites** section.

The pack should turn the existing XPRIZE Adaptive Plants brief into a structured, agent-usable build kit for climate-resilient crop discovery, field-trial evidence, A2A/CRE workflows, Quest proofs, GeoNFT site anchoring, and XPRIZE-style evidence bundles.

Reference brief:

- `OASIS-IDE/docs/OASIS_XPRIZE_ADAPTIVE_PLANTS_BRIEF.md`

## Existing Pattern

Use the current `Genomic Medicine` bundled pack as the implementation template.

Key files:

- `OASIS-IDE/src/shared/domainPackTypes.ts`
- `OASIS-IDE/src/renderer/domainPacks/genomicMedicinePack.ts`
- `OASIS-IDE/src/renderer/domainPacks/index.ts`
- `OASIS-IDE/src/renderer/contexts/DomainPackContext.tsx`
- `OASIS-IDE/src/renderer/components/HolonicSuites/HolonicSuitesDashboard.tsx`
- `OASIS-IDE/src/renderer/utils/domainPackAgentContext.ts`

The existing UI and Composer context should pick up the new pack automatically once it is registered in `bundledDomainPacks`.

## Implementation Scope

Add a new bundled pack:

- `id`: `adaptive-plants`
- `label`: `Adaptive Plants`
- `tagline`: `Climate-resilient crop discovery and field-trial evidence graphs`
- `status`: `bundled`
- `docsPath`: `OASIS-IDE/docs/OASIS_XPRIZE_ADAPTIVE_PLANTS_BRIEF.md`

No new UI should be required for the first pass.

## Files To Change

1. Add:

   - `OASIS-IDE/src/renderer/domainPacks/adaptivePlantsPack.ts`

2. Update:

   - `OASIS-IDE/src/renderer/domainPacks/index.ts`

3. Optional tests:

   - Add or extend a lightweight Domain Pack test file if a suitable pattern exists.

## Pack Content

### Holon Schemas

Initial schemas should cover the Adaptive Plants research and evidence graph:

- `CropSpeciesHolon`
- `CandidateVarietyHolon`
- `GenomeRecordHolon`
- `ClimateScenarioHolon`
- `SoilProfileHolon`
- `FieldTrialHolon`
- `GeoTrialSiteHolon`
- `PhenotypeObservationHolon`
- `TrialEvidenceHolon`
- `AdaptationScoreHolon`
- `AgentAnalysisHolon`
- `QuestObjectiveHolon`
- `SeedLotHolon`
- `VarietyLicenseHolon`
- `XPrizeSubmissionHolon`

Each schema should include:

- `id`
- `name`
- `category`
- `description`
- `fields`
- `requiredRelationships` where useful

### Relationships

Recommended relationships:

- `has_candidate`: `CropSpeciesHolon -> CandidateVarietyHolon`
- `has_genome_record`: `CandidateVarietyHolon -> GenomeRecordHolon`
- `tested_in`: `CandidateVarietyHolon -> FieldTrialHolon`
- `located_at`: `FieldTrialHolon -> GeoTrialSiteHolon`
- `has_soil_profile`: `GeoTrialSiteHolon -> SoilProfileHolon`
- `measured_by`: `FieldTrialHolon -> PhenotypeObservationHolon`
- `validated_by`: `PhenotypeObservationHolon -> TrialEvidenceHolon`
- `scored_against`: `CandidateVarietyHolon -> ClimateScenarioHolon`
- `produces_score`: `AgentAnalysisHolon -> AdaptationScoreHolon`
- `supports_submission`: `TrialEvidenceHolon -> XPrizeSubmissionHolon`
- `anchors_site`: `GeoTrialSiteHolon -> TrialEvidenceHolon`
- `licenses_variety`: `VarietyLicenseHolon -> CandidateVarietyHolon`

### Dashboard Tabs

Create tabs that map to how a team would work inside Holonic Suites:

- `Research Graph`
- `Field Trials`
- `Agent Workflows`
- `Evidence And Submission`
- `Marketplace And Provenance`

### Recipes

Recommended first recipes:

1. **Create Crop Data Commons**
   - Define crop, variety, genome, soil, climate, and field trial Holons.
   - Link the graph for cross-institution query and reuse.

2. **Author AI Breeding Pipeline**
   - Plan a CRE workflow triggered by a new genome or field trial.
   - Add A2A agent steps for trait prediction, climate suitability, and agronomy review.
   - Save ranked `AdaptationScoreHolon` outputs.

3. **Create Geo-Anchored Field Trial**
   - Create `GeoTrialSiteHolon` and `FieldTrialHolon`.
   - Attach observations and trial evidence.
   - Prepare GeoNFT placement inputs.

4. **Create Quest Proof For Trial Objective**
   - Define trial objective.
   - Attach field evidence.
   - Produce a Quest proof or evidence Holon.

5. **Prepare XPRIZE Evidence Bundle**
   - Gather candidate variety, trial evidence, adaptation scores, and GeoNFT/site records.
   - Generate an `XPrizeSubmissionHolon` for review and presentation.

6. **Prototype Emergency Adaptation Trigger**
   - Model drought, frost, salinity, or flood alert.
   - Query candidate varieties validated in similar conditions.
   - Create a recommendation and procurement Quest.

### Quick Actions

Add Composer prompts such as:

- `Design a field trial workflow for drought-resilient sorghum.`
- `Create Holon schemas for climate-adaptive rice trials.`
- `Generate CRE workflow steps for agent scoring, Quest proof, and GeoNFT anchoring.`
- `Prepare an XPRIZE-style evidence bundle from trial observations.`
- `Map an emergency drought trigger to resilient varieties and regional seed lots.`

### Safety Rules

Recommended safety rules:

- Do not make unsupported agronomic, yield, or climate-resilience claims.
- Separate raw observations from AI-generated interpretation.
- Preserve data provenance for every trial, observation, and evidence record.
- Treat farmer, field location, partner, and unpublished variety data as sensitive.
- Require evidence links before generating submission or marketplace claims.
- Keep payment, licensing, and NFT flows explicit and reviewable.

## Acceptance Criteria

- `Adaptive Plants` appears in the Holonic Suites pack list.
- Selecting the pack updates the active Domain Pack state.
- Composer receives Adaptive Plants context via `buildDomainPackContextNote`.
- The pack links to `OASIS_XPRIZE_ADAPTIVE_PLANTS_BRIEF.md`.
- Dashboard tabs render without missing schema references.
- Quick actions are available wherever existing Domain Pack quick actions are surfaced.
- Existing `Genomic Medicine` behavior remains unchanged.

## Verification

Run from `OASIS-IDE`:

```bash
npm test
npm run build
```

If full build is too broad during development, run targeted tests first, then the full package build before considering the change complete.

## Future Enhancements

- Add a dedicated Adaptive Plants demo workspace generator.
- Add CRE workflow fixtures for field trial scoring, Quest proof creation, and GeoNFT site anchoring.
- Add MCP-backed quick actions that create sample Holons through OASIS APIs.
- Add STARNET/OAPP publishing recipes for crop data commons and variety marketplace flows.
