/**
 * Default public OASIS / STAR hosts when Integrations (or STARNET override) is left blank, including
 * unpackaged `npm run dev` so the IDE can run without a local ONODE. Override with `OASIS_API_URL` or
 * Settings → API Endpoint; use `DEV_LOCAL_OASIS_API_BASE` for a local dev ONODE.
 */
export const BUNDLE_OASIS_API_BASE = 'https://api.oasisweb4.one';
export const BUNDLE_STAR_API_BASE = 'https://star.oasisweb4.one';

/** Local ONODE from WebAPI `launchSettings` / typical dev. Settings → "Local" uses this. */
export const DEV_LOCAL_OASIS_API_BASE = 'http://127.0.0.1:5003';
