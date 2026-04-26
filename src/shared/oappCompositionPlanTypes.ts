/**
 * Canonical IDE-owned composition contract for turning STARNET holons into an OAPP.
 * Carried in assistant/IDE messages inside a fenced ```oasis-composition-plan ... ``` block.
 */

import type { HolonCapabilityModel } from './holonCapabilityTypes.js';

export type CompositionNodeSource = 'starnet' | 'agent' | 'ide' | 'custom';
export type CompositionSurfaceKind = 'route' | 'screen' | 'component' | 'service' | 'state' | 'adapter' | 'job' | 'config';
export type CompositionStepStatus = 'pending' | 'approved' | 'running' | 'done' | 'blocked';

export interface CompositionHolonNode {
  id: string;
  catalogId?: string;
  name: string;
  holonType?: string;
  role: string;
  source: CompositionNodeSource;
  confidence?: number;
  notes?: string;
  capability?: HolonCapabilityModel;
}

export interface CompositionHolonEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  reason: string;
  requiredAdapter?: string;
}

export interface CompositionCapabilityLane {
  id: string;
  label: string;
  matchedNodeIds: string[];
  gap?: string;
}

export interface CompositionSurface {
  id: string;
  kind: CompositionSurfaceKind;
  label: string;
  drivenByNodeIds: string[];
  description: string;
}

export interface CompositionGap {
  id: string;
  label: string;
  reason: string;
  suggestedResolution: string;
}

export interface CompositionBuildStep {
  id: string;
  title: string;
  description: string;
  nodeIds: string[];
  expectedFiles?: string[];
  risk?: string;
  status?: CompositionStepStatus;
}

export interface CompositionVerificationStep {
  id: string;
  label: string;
  description: string;
}

export interface OappCompositionPlan {
  version: 1;
  intent: string;
  appType: string;
  nodes: CompositionHolonNode[];
  edges: CompositionHolonEdge[];
  capabilityLanes: CompositionCapabilityLane[];
  surfaces: CompositionSurface[];
  gaps: CompositionGap[];
  buildSteps: CompositionBuildStep[];
  verification: CompositionVerificationStep[];
  createdAt?: string;
}
