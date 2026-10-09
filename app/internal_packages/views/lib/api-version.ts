/**
 * Views declare the API they were written against as `apiVersion: "YYYY-MM-DD"` in their
 * manifest (docs/plans/views-api.md §1.2). The host runs any View between
 * MIN_SUPPORTED_API_VERSION and CURRENT_API_VERSION, applying the shims below for older ones,
 * and shows a host card instead of loading anything outside that range.
 */

/** The first release of the View API. Manifests without `apiVersion` predate versioning. */
export const INITIAL_API_VERSION = '2026-10-01';

/** The API this build implements. New and rebuilt Views are stamped with it. */
export const CURRENT_API_VERSION = '2026-10-05';

/** The oldest API this build still runs. Raise it only when dropping a shim. */
export const MIN_SUPPORTED_API_VERSION = INITIAL_API_VERSION;

const VERSION_REGEXP = /^\d{4}-\d{2}-\d{2}$/;

export type ApiCompatibility = 'ok' | 'too-old' | 'too-new';

/** The manifest's declared version, or the initial version when it's missing or malformed. */
export function apiVersionOf(manifest: any): string {
  const v = manifest && manifest.apiVersion;
  return typeof v === 'string' && VERSION_REGEXP.test(v) ? v : INITIAL_API_VERSION;
}

/** ISO dates compare correctly as strings. */
export function compatibility(
  version: string,
  { min = MIN_SUPPORTED_API_VERSION, current = CURRENT_API_VERSION } = {}
): ApiCompatibility {
  if (version < min) return 'too-old';
  if (version > current) return 'too-new';
  return 'ok';
}

/**
 * A behavior change between API versions. A shim applies to Views declaring a version older
 * than `since`; the runtime (runtime/mailspring-view.js) and the bridge read the list from
 * `shimsFor` and keep the old behavior for those Views.
 */
export interface ApiShim {
  id: string;
  since: string;
  description: string;
}

// Empty so far: 2026-10-05 only removed the ai.* 'quota' status, which older Views simply never
// see, so nothing needs translating.
export const SHIMS: ApiShim[] = [];

/** Shim ids that apply to a View declaring `version`. */
export function shimsFor(version: string, shims: ApiShim[] = SHIMS): string[] {
  return shims.filter((s) => version < s.since).map((s) => s.id);
}

/** The manifest a draft is written with: unchanged, or stamped with the current version. */
export function withApiVersion<T extends object>(manifest: T): T {
  if (manifest && (manifest as any).apiVersion) return manifest;
  return { ...(manifest || ({} as T)), apiVersion: CURRENT_API_VERSION };
}

/** The message the authoring panel offers when a View is too old to run. */
export function rebuildRequest(version: string) {
  return (
    `This View was built for Mailspring View API ${version}, which this version of Mailspring ` +
    `no longer runs. Please update it to API ${CURRENT_API_VERSION}: set "apiVersion": ` +
    `"${CURRENT_API_VERSION}" in manifest.json and adjust any calls that changed, keeping the ` +
    `View's behavior the same.`
  );
}
