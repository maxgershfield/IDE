import type { HolonCapabilityModel } from './holonCapabilityTypes.js';

export type HolonicAppStack = 'vite' | 'expo' | 'static' | 'custom';
export type HolonicBuildCheckStatus = 'pending' | 'ok' | 'failed' | 'warning';

export interface HolonicAppCommand {
  label: string;
  argv: string[];
  cwd: string;
}

export interface HolonicAppRequiredFile {
  path: string;
  reason: string;
}

export interface HolonicAppCapabilityBinding {
  nodeId: string;
  catalogId?: string;
  name: string;
  role: string;
  capability?: HolonCapabilityModel;
  adapterPath: string;
}

export interface HolonicAppAcceptanceCheck {
  id: string;
  label: string;
  description: string;
  status?: HolonicBuildCheckStatus;
}

export interface HolonicAppBuildContract {
  version: 1;
  projectPath: string;
  stack: HolonicAppStack;
  appName: string;
  recipePath?: string;
  reusableHolonSpecPath?: string;
  liveRuntimeAdapterPath?: string;
  requiredFiles: HolonicAppRequiredFile[];
  installCommand: HolonicAppCommand;
  buildCommand: HolonicAppCommand;
  devCommand: HolonicAppCommand;
  capabilityBindings: HolonicAppCapabilityBinding[];
  acceptanceChecks: HolonicAppAcceptanceCheck[];
}

export interface HolonicAppScaffoldCheck {
  id: string;
  label: string;
  status: HolonicBuildCheckStatus;
  detail: string;
}

export interface HolonicAppScaffoldValidationResult {
  ok: boolean;
  projectPath: string;
  stack: HolonicAppStack;
  checks: HolonicAppScaffoldCheck[];
  repairInstructions?: string[];
}
