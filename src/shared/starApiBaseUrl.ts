/**
 * STAR WebAPI public base URL normalization.
 *
 * Renderer calls use paths like `/api/Holons/...` appended to this base. Deployments often document
 * a URL ending in `/star/api`; that duplicates `/api` and yields `/star/api/api/...` and broken
 * preflight/CORS. Strip one trailing `/api` so the base is the path **before** the app's `/api` routes
 * (e.g. `https://star.oasisweb4.one` or `https://oasisweb4.one/star` when PathBase is `/star`).
 */
export function normalizeStarApiBaseUrl(url: string): string {
  let u = url.trim().replace(/\/$/, '');
  while (u.toLowerCase().endsWith('/api')) {
    u = u.slice(0, -4);
  }
  return u;
}
