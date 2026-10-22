import crypto from 'crypto';
import { hostMatchesGrants, networkGrantsFromManifest } from './view-sandbox-policy';

/**
 * Pure policy for View credentials: API keys a user stores for a View, which the host attaches
 * to that View's requests without the View ever seeing them. Kept free of Electron APIs so it
 * can be unit tested; view-credentials.ts performs the requests.
 *
 * A credential is declared in the manifest and bound to hosts the View already has a `network`
 * grant for. The View can only use it through `credentials.fetch`, which the main process runs
 * on the View's behalf: https on a bound host, default port, no userinfo. Responses are scrubbed
 * for the secret before they reach the View, so an endpoint that echoes request headers can't
 * hand it back.
 */

export interface ViewCredential {
  id: string;
  label: string;
  hosts: string[];
  header: string;
  format: string;
  help: string | null;
  helpUrl: string | null;
}

export const CREDENTIAL_ID_REGEXP = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const HEADER_NAME_REGEXP = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

// Headers the network stack or the browser owns, or that would let a View smuggle the secret
// somewhere other than the bound header.
const DENIED_HEADERS = [
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'content-type',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
];
const DENIED_HEADER_PREFIXES = ['proxy-', 'sec-'];

export function isDeniedHeader(name: string) {
  const lower = name.toLowerCase();
  return DENIED_HEADERS.includes(lower) || DENIED_HEADER_PREFIXES.some((p) => lower.startsWith(p));
}

const str = (value: any, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/**
 * Valid credentials from a manifest's `credentials` field. An entry is dropped, not repaired,
 * if any part is invalid: a bad host list or header means the user would be consenting to
 * something other than what the View will do.
 */
export function credentialsFromManifest(manifest: any): ViewCredential[] {
  const declared = manifest && Array.isArray(manifest.credentials) ? manifest.credentials : [];
  const grants = networkGrantsFromManifest(manifest);
  const seen = new Set<string>();
  const result: ViewCredential[] = [];
  for (const entry of declared) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id : '';
    if (!CREDENTIAL_ID_REGEXP.test(id) || seen.has(id)) continue;

    const hosts = Array.isArray(entry.hosts)
      ? entry.hosts.filter((h: any) => typeof h === 'string').map((h: string) => h.toLowerCase())
      : [];
    // Every bound host must be one of the View's own network grants, written identically.
    if (!hosts.length || !hosts.every((h: string) => grants.includes(h))) continue;

    const header = typeof entry.header === 'string' ? entry.header : 'Authorization';
    if (!HEADER_NAME_REGEXP.test(header) || isDeniedHeader(header)) continue;

    const format = typeof entry.format === 'string' ? entry.format : 'Bearer {secret}';
    if (format.length > 200 || /[\r\n\0]/.test(format) || format.split('{secret}').length !== 2) {
      continue;
    }

    const helpUrl = str(entry.helpUrl, 500);
    seen.add(id);
    result.push({
      id,
      label: str(entry.label, 60) || id,
      hosts: [...new Set<string>(hosts)],
      header,
      format,
      help: str(entry.help, 500),
      helpUrl: helpUrl && /^https:\/\//i.test(helpUrl) ? helpUrl : null,
    });
  }
  return result;
}

/**
 * Fingerprint of what a stored secret was consented for. A manifest revision that changes a
 * credential's hosts, header or format changes this, and the stored secret stops applying until
 * the user enters it again.
 */
export function credentialBinding(credential: ViewCredential): string {
  const canonical = JSON.stringify({
    hosts: [...credential.hosts].sort(),
    header: credential.header.toLowerCase(),
    format: credential.format,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function isCredentialURLAllowed(url: string, credential: ViewCredential): boolean {
  try {
    const target = new URL(url);
    return (
      target.protocol === 'https:' &&
      target.port === '' &&
      !target.username &&
      !target.password &&
      hostMatchesGrants(target.hostname, credential.hosts)
    );
  } catch {
    return false;
  }
}

export function headerValue(credential: ViewCredential, secret: string) {
  return credential.format.replace('{secret}', secret);
}

// base64 of `value` as it appears when embedded at each of the three byte alignments inside a
// longer base64 string (e.g. Basic auth's base64("user:secret")). The partial characters at
// either edge depend on neighbouring bytes, so only the stable middle is kept.
function base64Cores(value: Buffer, urlSafe: boolean) {
  const cores: string[] = [];
  for (let offset = 0; offset < 3; offset++) {
    const padded = Buffer.concat([Buffer.alloc(offset), value]);
    let b64 = padded.toString('base64').replace(/=+$/, '');
    if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_');
    const skip = Math.ceil((offset * 4) / 3);
    const core = b64.slice(skip, b64.length - 2);
    if (core.length >= 8) cores.push(core);
  }
  return cores;
}

/**
 * Every encoding of the secret (and of the full header value) a response could reasonably echo:
 * raw, URL-encoded, JSON-escaped, and base64/base64url at any alignment. Variants shorter than 8
 * characters are skipped so scrubbing can't mangle ordinary text.
 */
export function secretVariants(credential: ViewCredential, secret: string): string[] {
  const variants = new Set<string>();
  for (const value of [secret, headerValue(credential, secret)]) {
    variants.add(value);
    variants.add(encodeURIComponent(value));
    variants.add(JSON.stringify(value).slice(1, -1));
    for (const core of base64Cores(Buffer.from(value, 'utf8'), false)) variants.add(core);
    for (const core of base64Cores(Buffer.from(value, 'utf8'), true)) variants.add(core);
  }
  return [...variants].filter((v) => v.length >= 8).sort((a, b) => b.length - a.length);
}

/** Overwrites every occurrence of any variant with `*`, keeping the length. */
export function scrubBuffer(body: Buffer, variants: string[]): { body: Buffer; found: boolean } {
  let found = false;
  const out = Buffer.from(body);
  for (const variant of variants) {
    const needle = Buffer.from(variant, 'utf8');
    let index = out.indexOf(needle);
    while (index !== -1) {
      found = true;
      out.fill(0x2a, index, index + needle.length);
      index = out.indexOf(needle, index + needle.length);
    }
  }
  return { body: out, found };
}

export function scrubString(value: string, variants: string[]): { value: string; found: boolean } {
  const { body, found } = scrubBuffer(Buffer.from(value, 'utf8'), variants);
  return { value: found ? body.toString('utf8') : value, found };
}

/** Whether a response body should be returned to the View as text rather than base64. */
export function isTextualContentType(contentType: string | null | undefined) {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  return (
    !type ||
    type.startsWith('text/') ||
    /(^|[+/])(json|xml|javascript|graphql|x-www-form-urlencoded|csv)($|[+;])/.test(type)
  );
}

/** Token bucket: `burst` calls at once, refilling at `perMinute`. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private perMinute: number,
    private burst: number
  ) {}

  take(key: string, now = Date.now()) {
    const bucket = this.buckets.get(key) || { tokens: this.burst, at: now };
    bucket.tokens = Math.min(
      this.burst,
      bucket.tokens + ((now - bucket.at) / 60000) * this.perMinute
    );
    bucket.at = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return allowed;
  }
}
