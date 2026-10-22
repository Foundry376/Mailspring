/** A share id: 10 random base62 characters, assigned by the backend. */
export const SHARE_ID_REGEXP = /^[A-Za-z0-9]{10}$/;

export function isShareId(value: any): value is string {
  return typeof value === 'string' && SHARE_ID_REGEXP.test(value);
}

/**
 * The share id in a `mailspring://install-view?share=<shareId>` link, or null for anything
 * else. The link can come from any web page, so it's checked before any request uses it.
 */
export function shareIdFromInstallURL(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'mailspring:' || parsed.hostname !== 'install-view') return null;
  const shareIds = parsed.searchParams.getAll('share');
  return shareIds.length === 1 && isShareId(shareIds[0]) ? shareIds[0] : null;
}

/** `raw` if it's an http(s) URL, else null: share links and posters are opened or loaded. */
export function webURL(raw: any): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const { protocol } = new URL(raw);
    return protocol === 'https:' || protocol === 'http:' ? raw : null;
  } catch {
    return null;
  }
}
