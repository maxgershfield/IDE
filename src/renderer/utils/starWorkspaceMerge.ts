/**
 * Merge a new STAR OAPP registration into `.star-workspace.json` contents.
 * Preserves unrelated keys (e.g. gameEngine) from an existing file.
 */
export function mergeStarWorkspaceForNewOapp(
  existing: Record<string, unknown> | null,
  params: {
    oappId: string;
    name: string;
    description: string;
    version: string;
    selectedHolonIds: string[];
  }
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};

  return {
    ...base,
    name: params.name.trim(),
    description: params.description.trim().slice(0, 4000),
    version: params.version.trim() || '1.0.0',
    oappId: params.oappId,
    oasisProjectId: params.oappId,
    selectedStarnetHolonIds: [...params.selectedHolonIds],
    projectType: typeof base.projectType === 'string' && base.projectType.length > 0 ? base.projectType : 'oapp',
    starnetNetwork: base.starnetNetwork === 'mainnet' ? 'mainnet' : 'testnet',
    ideOappCreatedAt: new Date().toISOString()
  };
}
