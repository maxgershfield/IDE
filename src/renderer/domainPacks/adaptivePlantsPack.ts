import type { DomainPack } from '../../shared/domainPackTypes';

export const adaptivePlantsPack: DomainPack = {
  id: 'adaptive-plants',
  label: 'Adaptive Plants',
  tagline: 'Climate-resilient crop discovery and field-trial evidence graphs',
  description:
    'A bundled domain pack for modelling adaptive crop research as linked Holons: crop species, candidate varieties, genomes, climate scenarios, field trials, phenotype observations, evidence, agent analysis, Geo trial sites, seed provenance, and XPRIZE-style submissions.',
  status: 'bundled',
  docsPath: 'OASIS-IDE/docs/OASIS_XPRIZE_ADAPTIVE_PLANTS_BRIEF.md',
  holonSchemas: [
    {
      id: 'crop-species',
      name: 'CropSpeciesHolon',
      category: 'Research Graph',
      description: 'Crop species, target adaptation context, taxonomy, and linked breeding program scope.',
      fields: ['speciesId', 'commonName', 'scientificName', 'targetRegions', 'adaptationGoals', 'status']
    },
    {
      id: 'candidate-variety',
      name: 'CandidateVarietyHolon',
      category: 'Research Graph',
      description: 'Candidate crop variety, lineage, breeder, provenance, and target resilience traits.',
      fields: ['varietyId', 'name', 'lineage', 'breeder', 'targetTraits', 'provenance', 'status'],
      requiredRelationships: ['has_candidate', 'tested_in']
    },
    {
      id: 'genome-record',
      name: 'GenomeRecordHolon',
      category: 'Research Graph',
      description: 'Genome, marker, or sequencing metadata linked to a candidate variety.',
      fields: ['recordId', 'dataType', 'uri', 'checksum', 'referenceGenome', 'markerSet', 'accessPolicy']
    },
    {
      id: 'climate-scenario',
      name: 'ClimateScenarioHolon',
      category: 'Trial Design',
      description: 'Target climate stress profile such as drought, heat, salinity, flood, frost, or pest pressure.',
      fields: ['scenarioId', 'stressType', 'region', 'severity', 'timeHorizon', 'sourceModel', 'assumptions']
    },
    {
      id: 'soil-profile',
      name: 'SoilProfileHolon',
      category: 'Trial Design',
      description: 'Soil chemistry, structure, water profile, and sampling metadata for a trial site.',
      fields: ['profileId', 'siteId', 'ph', 'organicMatter', 'salinity', 'texture', 'sampledAt', 'source']
    },
    {
      id: 'field-trial',
      name: 'FieldTrialHolon',
      category: 'Field Trials',
      description: 'Field trial design, location, season, treatment arms, protocol, and operating status.',
      fields: ['trialId', 'season', 'protocol', 'treatments', 'replicates', 'startDate', 'endDate', 'status'],
      requiredRelationships: ['tested_in', 'located_at', 'measured_by']
    },
    {
      id: 'geo-trial-site',
      name: 'GeoTrialSiteHolon',
      category: 'Field Trials',
      description: 'Geographic trial site with coordinates, site owner, region, and optional GeoNFT anchor.',
      fields: ['siteId', 'name', 'latitude', 'longitude', 'region', 'siteOwner', 'geoNftId', 'privacyTier']
    },
    {
      id: 'phenotype-observation',
      name: 'PhenotypeObservationHolon',
      category: 'Observations',
      description: 'Raw phenotype or yield observation with source, units, timing, method, and confidence.',
      fields: ['observationId', 'trait', 'value', 'unit', 'method', 'observedAt', 'source', 'confidence'],
      requiredRelationships: ['validated_by']
    },
    {
      id: 'trial-evidence',
      name: 'TrialEvidenceHolon',
      category: 'Evidence',
      description: 'Evidence record linking raw observations, files, methods, reviewers, and limitations.',
      fields: ['evidenceId', 'summary', 'inputHolonIds', 'artifactUris', 'methodRef', 'limitations', 'reviewStatus']
    },
    {
      id: 'adaptation-score',
      name: 'AdaptationScoreHolon',
      category: 'Agent Workflows',
      description: 'Scored resilience output with model or agent provenance, uncertainty, and recommendation.',
      fields: ['scoreId', 'trait', 'score', 'confidence', 'modelVersion', 'inputHolonIds', 'recommendation', 'limitations']
    },
    {
      id: 'agent-analysis',
      name: 'AgentAnalysisHolon',
      category: 'Agent Workflows',
      description: 'Audited A2A or CRE agent action over crop, trial, climate, or evidence inputs.',
      fields: ['analysisId', 'agentId', 'serviceName', 'workflowId', 'inputHolonIds', 'outputHolonIds', 'timestamp', 'status']
    },
    {
      id: 'quest-objective',
      name: 'QuestObjectiveHolon',
      category: 'Evidence',
      description: 'Research mission or proof objective for trial completion, review, or site validation.',
      fields: ['objectiveId', 'title', 'criteria', 'requiredEvidence', 'geoConstraint', 'reward', 'status']
    },
    {
      id: 'seed-lot',
      name: 'SeedLotHolon',
      category: 'Marketplace And Provenance',
      description: 'Seed lot provenance, quantity, certification, chain of custody, and distribution state.',
      fields: ['seedLotId', 'varietyId', 'quantity', 'unit', 'certificationStatus', 'custodyChain', 'region', 'status']
    },
    {
      id: 'variety-license',
      name: 'VarietyLicenseHolon',
      category: 'Marketplace And Provenance',
      description: 'Licensing, royalty, NFT, or payment metadata for a candidate or released variety.',
      fields: ['licenseId', 'licenseType', 'territory', 'royaltyTerms', 'nftId', 'x402Status', 'reviewStatus']
    },
    {
      id: 'xprize-submission',
      name: 'XPrizeSubmissionHolon',
      category: 'Evidence And Submission',
      description: 'Submission bundle tying claims, evidence, trial sites, adaptation scores, limitations, and sign-off.',
      fields: ['submissionId', 'title', 'claims', 'evidenceHolonIds', 'readinessStatus', 'reviewers', 'submittedAt']
    }
  ],
  relationships: [
    {
      id: 'has_candidate',
      label: 'has_candidate',
      from: 'CropSpeciesHolon',
      to: 'CandidateVarietyHolon',
      description: 'Crop species or program includes a candidate variety.'
    },
    {
      id: 'has_genome_record',
      label: 'has_genome_record',
      from: 'CandidateVarietyHolon',
      to: 'GenomeRecordHolon',
      description: 'Candidate variety has a linked genome, marker, or sequencing record.'
    },
    {
      id: 'tested_in',
      label: 'tested_in',
      from: 'CandidateVarietyHolon',
      to: 'FieldTrialHolon',
      description: 'Candidate variety is evaluated in a field trial.'
    },
    {
      id: 'located_at',
      label: 'located_at',
      from: 'FieldTrialHolon',
      to: 'GeoTrialSiteHolon',
      description: 'Field trial is anchored to a geographic trial site.'
    },
    {
      id: 'has_soil_profile',
      label: 'has_soil_profile',
      from: 'GeoTrialSiteHolon',
      to: 'SoilProfileHolon',
      description: 'Trial site has a soil profile used for interpretation and comparison.'
    },
    {
      id: 'measured_by',
      label: 'measured_by',
      from: 'FieldTrialHolon',
      to: 'PhenotypeObservationHolon',
      description: 'Trial produced phenotype, yield, stress, or quality observations.'
    },
    {
      id: 'validated_by',
      label: 'validated_by',
      from: 'PhenotypeObservationHolon',
      to: 'TrialEvidenceHolon',
      description: 'Observation is supported by durable evidence, files, methods, or reviewer state.'
    },
    {
      id: 'scored_against',
      label: 'scored_against',
      from: 'CandidateVarietyHolon',
      to: 'ClimateScenarioHolon',
      description: 'Candidate variety is evaluated against a target climate stress scenario.'
    },
    {
      id: 'produces_score',
      label: 'produces_score',
      from: 'AgentAnalysisHolon',
      to: 'AdaptationScoreHolon',
      description: 'Agent or workflow analysis produced a scored recommendation.'
    },
    {
      id: 'supports_submission',
      label: 'supports_submission',
      from: 'TrialEvidenceHolon',
      to: 'XPrizeSubmissionHolon',
      description: 'Evidence supports an XPRIZE-style submission claim or milestone.'
    },
    {
      id: 'anchors_site',
      label: 'anchors_site',
      from: 'GeoTrialSiteHolon',
      to: 'TrialEvidenceHolon',
      description: 'Geo trial site anchors evidence to a location or GeoNFT record.'
    },
    {
      id: 'licenses_variety',
      label: 'licenses_variety',
      from: 'VarietyLicenseHolon',
      to: 'CandidateVarietyHolon',
      description: 'License, NFT, or payment terms apply to a candidate or released variety.'
    }
  ],
  recipes: [
    {
      id: 'create-crop-data-commons',
      title: 'Create Crop Data Commons',
      description: 'Create the starter Holon graph for crop species, candidate varieties, genomes, trial sites, climate scenarios, and observations.',
      steps: [
        {
          label: 'Plan commons graph',
          description: 'Select crop, target region, resilience traits, and minimum Holon types before creating records.',
          mode: 'plan'
        },
        {
          label: 'Create core Holons',
          description: 'Create CropSpecies, CandidateVariety, GenomeRecord, ClimateScenario, GeoTrialSite, FieldTrial, and PhenotypeObservation drafts.',
          mode: 'execute'
        },
        {
          label: 'Link research graph',
          description: 'Connect candidate varieties, genome records, trials, sites, soil profiles, observations, and evidence placeholders.',
          mode: 'execute'
        }
      ]
    },
    {
      id: 'author-ai-breeding-pipeline',
      title: 'Author AI Breeding Pipeline',
      description: 'Plan a CRE/A2A pipeline that scores a candidate variety against climate scenarios and trial observations.',
      steps: [
        {
          label: 'Define trigger and inputs',
          description: 'Choose whether the workflow starts from a new GenomeRecord, FieldTrial, or PhenotypeObservation Holon.',
          mode: 'plan'
        },
        {
          label: 'Draft agent steps',
          description: 'Draft A2A service requests for trait prediction, climate suitability scoring, and agronomy review.',
          mode: 'plan'
        },
        {
          label: 'Save workflow outputs',
          description: 'Prepare AgentAnalysis and AdaptationScore Holons as explicit workflow outputs.',
          mode: 'execute'
        }
      ]
    },
    {
      id: 'create-geo-anchored-field-trial',
      title: 'Create Geo-Anchored Field Trial',
      description: 'Create a field trial site and evidence structure that can later be anchored with GeoNFT placement.',
      steps: [
        {
          label: 'Validate site sensitivity',
          description: 'Confirm whether coordinates, farmer/site identity, and partner details can be stored or should be privacy-tiered.',
          mode: 'plan'
        },
        {
          label: 'Create site and trial',
          description: 'Create GeoTrialSite and FieldTrial Holons with coordinates, season, protocol, and treatment metadata.',
          mode: 'execute'
        },
        {
          label: 'Prepare GeoNFT inputs',
          description: 'Prepare the GeoNFT placement payload and link it to trial evidence once confirmed.',
          mode: 'execute'
        }
      ]
    },
    {
      id: 'create-trial-quest-proof',
      title: 'Create Quest Proof For Trial Objective',
      description: 'Define a trial objective and convert validated field evidence into a Quest proof or durable evidence record.',
      steps: [
        {
          label: 'Define objective',
          description: 'Specify the trial objective, evidence criteria, review requirement, and optional geographic constraint.',
          mode: 'plan'
        },
        {
          label: 'Attach evidence',
          description: 'Link observations, artifacts, reviewer state, and limitations to the objective.',
          mode: 'execute'
        },
        {
          label: 'Create proof',
          description: 'Create or prepare a Quest proof for the completed trial objective.',
          mode: 'execute'
        }
      ]
    },
    {
      id: 'prepare-xprize-evidence-bundle',
      title: 'Prepare XPRIZE Evidence Bundle',
      description: 'Gather crop, trial, evidence, score, GeoNFT/site, and limitation records into a reviewable submission bundle.',
      steps: [
        {
          label: 'Check readiness',
          description: 'Identify missing observations, evidence links, review state, site anchors, and unsupported claims.',
          mode: 'plan'
        },
        {
          label: 'Draft submission',
          description: 'Create an XPrizeSubmissionHolon draft with claims, evidence Holon ids, limitations, and reviewer placeholders.',
          mode: 'execute'
        }
      ]
    },
    {
      id: 'prototype-emergency-adaptation-trigger',
      title: 'Prototype Emergency Adaptation Trigger',
      description: 'Model a drought, frost, salinity, flood, or pest alert and produce a recommended variety or procurement Quest path.',
      steps: [
        {
          label: 'Define emergency signal',
          description: 'Capture the external signal, region, timeframe, climate scenario, and severity assumptions.',
          mode: 'plan'
        },
        {
          label: 'Query validated candidates',
          description: 'Find candidate varieties with evidence in similar conditions and identify missing confidence data.',
          mode: 'plan'
        },
        {
          label: 'Prepare response action',
          description: 'Draft recommendation outputs, seed lot links, or procurement Quest placeholders.',
          mode: 'execute'
        }
      ]
    }
  ],
  quickActions: [
    {
      id: 'draft-drought-trial',
      label: 'Draft drought trial',
      description: 'Plan a drought-resilience field trial graph for a target crop and region.',
      mode: 'plan',
      prompt:
        'Using the Adaptive Plants domain pack, design a drought-resilience field trial graph. Include CropSpeciesHolon, CandidateVarietyHolon, ClimateScenarioHolon, GeoTrialSiteHolon, FieldTrialHolon, SoilProfileHolon, PhenotypeObservationHolon, and TrialEvidenceHolon. Keep this in Plan mode and identify missing evidence requirements.'
    },
    {
      id: 'draft-ai-pipeline',
      label: 'Draft AI breeding pipeline',
      description: 'Plan CRE/A2A workflow steps for scoring candidate varieties.',
      mode: 'plan',
      prompt:
        'Using the Adaptive Plants domain pack, draft CRE workflow steps for candidate variety scoring. Include A2A agent service requests for trait prediction, climate suitability, and agronomy review, then define AgentAnalysisHolon and AdaptationScoreHolon outputs.'
    },
    {
      id: 'prepare-geo-trial-site',
      label: 'Prepare Geo trial site',
      description: 'Prepare a privacy-aware GeoNFT-ready field trial site model.',
      mode: 'plan',
      prompt:
        'Using the Adaptive Plants domain pack, prepare a GeoTrialSiteHolon and FieldTrialHolon draft for a geo-anchored trial. Include coordinate privacy considerations, soil profile requirements, GeoNFT placement inputs, and evidence links.'
    },
    {
      id: 'draft-evidence-bundle',
      label: 'Draft evidence bundle',
      description: 'Create an XPRIZE-style readiness checklist and submission draft.',
      mode: 'plan',
      prompt:
        'Using the Adaptive Plants domain pack, prepare an XPRIZE-style evidence bundle checklist. Map each claim to required TrialEvidenceHolon, PhenotypeObservationHolon, AdaptationScoreHolon, GeoTrialSiteHolon, reviewer state, and limitations.'
    },
    {
      id: 'map-emergency-trigger',
      label: 'Map emergency trigger',
      description: 'Plan an emergency adaptation trigger from climate signal to recommendation.',
      mode: 'plan',
      prompt:
        'Using the Adaptive Plants domain pack, map an emergency adaptation trigger for drought, frost, salinity, flood, or pest risk. Include the ClimateScenarioHolon, validated CandidateVarietyHolon search, SeedLotHolon availability, and possible QuestObjectiveHolon response.'
    }
  ],
  dashboardTabs: [
    {
      id: 'research-graph',
      label: 'Research Graph',
      description: 'Crop species, candidate varieties, genome records, climate scenarios, and relationships.',
      holonSchemaIds: ['crop-species', 'candidate-variety', 'genome-record', 'climate-scenario'],
      recipeIds: ['create-crop-data-commons']
    },
    {
      id: 'field-trials',
      label: 'Field Trials',
      description: 'Geo trial sites, soil profiles, trial designs, phenotype observations, and evidence capture.',
      holonSchemaIds: ['geo-trial-site', 'soil-profile', 'field-trial', 'phenotype-observation', 'trial-evidence'],
      recipeIds: ['create-geo-anchored-field-trial', 'create-trial-quest-proof']
    },
    {
      id: 'agent-workflows',
      label: 'Agent Workflows',
      description: 'A2A/CRE analysis runs, adaptation scores, and workflow output Holons.',
      holonSchemaIds: ['agent-analysis', 'adaptation-score', 'climate-scenario'],
      recipeIds: ['author-ai-breeding-pipeline', 'prototype-emergency-adaptation-trigger']
    },
    {
      id: 'evidence-submission',
      label: 'Evidence And Submission',
      description: 'Trial evidence, Quest objectives, readiness checks, and XPRIZE-style submission bundles.',
      holonSchemaIds: ['trial-evidence', 'quest-objective', 'xprize-submission'],
      recipeIds: ['prepare-xprize-evidence-bundle', 'create-trial-quest-proof']
    },
    {
      id: 'marketplace-provenance',
      label: 'Marketplace And Provenance',
      description: 'Seed lots, variety licensing, NFT/payment placeholders, and provenance records.',
      holonSchemaIds: ['seed-lot', 'variety-license', 'candidate-variety']
    }
  ],
  safetyRules: [
    {
      id: 'no-unsupported-claims',
      title: 'No unsupported resilience claims',
      description: 'Do not present agronomic, yield, or climate-resilience claims as supported unless linked evidence and limitations are explicit.'
    },
    {
      id: 'separate-observation-analysis',
      title: 'Separate observation from interpretation',
      description: 'Raw field observations, agent analysis, and human conclusions must be represented as distinct Holons.'
    },
    {
      id: 'preserve-provenance',
      title: 'Preserve trial provenance',
      description: 'Every trial, observation, artifact, score, and submission claim should retain source, method, timestamp, and responsible actor metadata.'
    },
    {
      id: 'protect-location-partner-data',
      title: 'Protect field and partner data',
      description: 'Treat farmer identity, field coordinates, unpublished varieties, partner data, and commercial seed information as sensitive by default.'
    },
    {
      id: 'review-before-publication',
      title: 'Review before publication',
      description: 'Submissions, marketplace claims, NFTs, licensing, and payment flows should remain reviewable and explicit before execution.'
    }
  ]
};
