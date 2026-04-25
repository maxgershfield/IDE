/**
 * Default public OASIS / STAR hosts for **packaged** (installed) OASIS IDE builds.
 * Unpackaged / dev (from source) still defaults to local ONODE + launchSettings STAR unless overridden.
 */
export const BUNDLE_OASIS_API_BASE = 'https://api.oasisweb4.one';
export const BUNDLE_STAR_API_BASE = 'https://star.oasisweb4.one';

/** `launchSettings` ONODE **http** profile: `OASIS_API` → `http://localhost:5003` (see that repo’s WebAPI/Properties/launchSettings.json). */
export const DEV_LOCAL_OASIS_API_BASE = 'http://127.0.0.1:5003';
