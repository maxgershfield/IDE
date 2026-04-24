/**
 * Normalized base URL to the OASIS Web Portal for "Open in browser" from the IDE.
 */
export function buildPortalUrl(base: string): string {
  const b = (base || 'https://oasisweb4.one/portal/').trim();
  if (!b) return 'https://oasisweb4.one/portal/';
  return b.endsWith('/') ? b : `${b}/`;
}
