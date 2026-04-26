import type { HolonCapabilityKind, HolonCapabilityModel } from './holonCapabilityTypes.js';

export type ReusableHolonPortDirection = 'input' | 'output' | 'event';
export type ReusableHolonDependencyKind = 'required' | 'optional';
export type ReusableHolonAdapterKind = 'internal' | 'oss' | 'oasis' | 'star' | 'custom';
export type ReusableHolonUiSurfaceKind =
  | 'route'
  | 'screen'
  | 'component'
  | 'service'
  | 'state'
  | 'adapter'
  | 'admin';

export interface ReusableHolonPort {
  id: string;
  direction: ReusableHolonPortDirection;
  label: string;
  dataShape: string;
}

export interface ReusableHolonDependency {
  holonId: string;
  kind: ReusableHolonDependencyKind;
  reason: string;
}

export interface ReusableHolonAdapter {
  id: string;
  kind: ReusableHolonAdapterKind;
  label: string;
  path?: string;
  packageName?: string;
  url?: string;
  notes: string;
}

export interface ReusableHolonFixture {
  id: string;
  label: string;
  path: string;
  scenario: string;
}

export interface ReusableHolonVerification {
  id: string;
  label: string;
  command?: string[];
  path?: string;
  expected: string;
}

export interface ReusableHolonUiSurface {
  id: string;
  kind: ReusableHolonUiSurfaceKind;
  label: string;
  description: string;
}

export interface ReusableHolonStarBinding {
  catalogId?: string;
  catalogName?: string;
  source?: 'holon' | 'oapp' | 'template' | 'internal';
  required?: boolean;
}

export interface ReusableHolonSpec {
  id: string;
  name: string;
  kind: HolonCapabilityKind;
  version: 1;
  description: string;
  capability: HolonCapabilityModel;
  ports: ReusableHolonPort[];
  state: {
    shape: string;
    lifecycle: string[];
  };
  dependencies: ReusableHolonDependency[];
  adapters: ReusableHolonAdapter[];
  fixtures: ReusableHolonFixture[];
  verification: ReusableHolonVerification[];
  uiSurfaces: ReusableHolonUiSurface[];
  starBinding?: ReusableHolonStarBinding;
}

export interface ReusableHolonKitManifest {
  version: 1;
  name: string;
  description: string;
  specs: ReusableHolonSpec[];
}
