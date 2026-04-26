/**
 * IDE-side capability model for understanding how a STARNET holon can participate
 * in an app. This is intentionally explicit: composition should be based on
 * ports, relations, runtime bindings, UI surfaces, and verification, not just names.
 */

export type HolonCapabilityKind =
  | 'identity'
  | 'catalog'
  | 'order'
  | 'logistics'
  | 'payment'
  | 'communication'
  | 'trust'
  | 'location'
  | 'admin'
  | 'form'
  | 'content'
  | 'workflow'
  | 'unknown';

export type HolonPortDirection = 'input' | 'output' | 'event';

export interface HolonCapabilityPort {
  id: string;
  direction: HolonPortDirection;
  label: string;
  dataShape?: string;
}

export interface HolonCapabilityRelationRule {
  relation: string;
  targetKinds: HolonCapabilityKind[];
  reason: string;
}

export interface HolonCapabilityRuntimeBinding {
  kind: 'star-api' | 'mcp' | 'local-adapter' | 'custom';
  label: string;
  details: string;
}

export interface HolonCapabilityUiSurface {
  kind: 'screen' | 'route' | 'component' | 'service' | 'state' | 'adapter';
  label: string;
  description: string;
}

export interface HolonCapabilityModel {
  kind: HolonCapabilityKind;
  confidence: number;
  summary: string;
  schemaHints: string[];
  ports: HolonCapabilityPort[];
  relationRules: HolonCapabilityRelationRule[];
  runtimeBindings: HolonCapabilityRuntimeBinding[];
  uiSurfaces: HolonCapabilityUiSurface[];
  verification: string[];
}
