import type { HolonicAppBuildContract, HolonicAppStack } from '../../shared/holonicAppBuildTypes';

export const HOLONIC_BUILD_CONTRACT_FENCE = 'oasis-holonic-build-contract';

export function stripHolonicAppBuildContractFences(text: string): string {
  if (!text.includes(HOLONIC_BUILD_CONTRACT_FENCE)) return text;
  return text
    .replace(/```oasis-holonic-build-contract\s*\n[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function isStack(value: unknown): value is HolonicAppStack {
  return value === 'vite' || value === 'expo' || value === 'static' || value === 'custom';
}

function isCommand(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const command = value as Record<string, unknown>;
  return (
    typeof command.label === 'string' &&
    Array.isArray(command.argv) &&
    command.argv.every((part) => typeof part === 'string') &&
    typeof command.cwd === 'string'
  );
}

function isRequiredFile(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const file = value as Record<string, unknown>;
  return typeof file.path === 'string' && typeof file.reason === 'string';
}

function tryParseBuildContract(raw: string): HolonicAppBuildContract | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as Partial<HolonicAppBuildContract>;
    if (!obj || typeof obj !== 'object') return null;
    if (obj.version !== 1) return null;
    if (typeof obj.projectPath !== 'string' || !obj.projectPath.trim()) return null;
    if (!isStack(obj.stack)) return null;
    if (typeof obj.appName !== 'string' || !obj.appName.trim()) return null;
    if (!Array.isArray(obj.requiredFiles) || !obj.requiredFiles.every(isRequiredFile)) return null;
    if (!isCommand(obj.installCommand) || !isCommand(obj.buildCommand) || !isCommand(obj.devCommand)) return null;
    if (!Array.isArray(obj.capabilityBindings)) return null;
    if (!Array.isArray(obj.acceptanceChecks)) return null;
    return obj as HolonicAppBuildContract;
  } catch {
    return null;
  }
}

export function extractLastHolonicAppBuildContract(text: string): HolonicAppBuildContract | null {
  if (!text || !text.includes(HOLONIC_BUILD_CONTRACT_FENCE)) return null;
  const re = /```oasis-holonic-build-contract\s*\n([\s\S]*?)```/gi;
  let last: HolonicAppBuildContract | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const parsed = tryParseBuildContract(match[1] ?? '');
    if (parsed) last = parsed;
  }
  return last;
}
