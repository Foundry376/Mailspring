import fs from 'fs';
import path from 'path';

/**
 * Pure policy for Sandboxed Views: which partitions are Views, which files a View may be
 * served, and which network requests it may make. Kept free of Electron APIs so it can be
 * unit tested; view-sessions.ts applies it to real sessions.
 *
 * Network access is denied unless the View's manifest lists hosts in `network`. A grant is
 * a public DNS name (optionally `*.`-prefixed) reachable over HTTPS/WSS on the default
 * port only. Loopback, private and IP-literal hosts are never grantable, so a View can't
 * reach the MCP server or other local services even if it asks.
 */

export const VIEW_SCHEME = 'mailspring-view';
export const PARTITION_PREFIX = 'persist:view-';
export const VIEW_ID_REGEXP = /^[a-z0-9][a-z0-9-]{0,63}$/;

const ALWAYS_ALLOWED_PROTOCOLS = ['data:', 'blob:', 'devtools:'];
const GRANTABLE_PROTOCOLS = ['https:', 'wss:'];

// Nothing listens on the discard port, so every connection through this proxy is refused;
// Chromium fails the request rather than falling back to DIRECT.
const DEAD_PROXY = 'socks5://127.0.0.1:9';

const GRANT_REGEXP = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const NEVER_GRANTABLE_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.test'];

export function viewIdForPartition(partition: string | undefined): string | null {
  if (!partition || !partition.startsWith(PARTITION_PREFIX)) return null;
  const viewId = partition.substr(PARTITION_PREFIX.length);
  return VIEW_ID_REGEXP.test(viewId) ? viewId : null;
}

// Node's URL reports `null` as the origin of custom schemes, so compare the parts.
export function isViewOrigin(url: string, viewId: string): boolean {
  try {
    const target = new URL(url);
    return target.protocol === `${VIEW_SCHEME}:` && target.host === viewId;
  } catch {
    return false;
  }
}

/**
 * Resolves `relativePath` inside `rootDir`, or returns null if it escapes the root — via
 * `..`, an absolute path, or a symlink pointing outside — or is not a regular file.
 */
export function containedFile(rootDir: string, relativePath: string): string | null {
  try {
    const root = fs.realpathSync(rootDir);
    const candidate = fs.realpathSync(path.resolve(root, relativePath));
    if (!candidate.startsWith(root + path.sep)) return null;
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/** Valid, de-duplicated host grants from a manifest's `network` field. Invalid entries are dropped. */
export function networkGrantsFromManifest(manifest: any): string[] {
  const network = manifest && Array.isArray(manifest.network) ? manifest.network : [];
  const grants = network
    .filter((h: any) => typeof h === 'string')
    .map((h: string) => h.trim().toLowerCase())
    .filter(
      (h: string) =>
        GRANT_REGEXP.test(h) && !NEVER_GRANTABLE_SUFFIXES.some((suffix) => `.${h}`.endsWith(suffix))
    );
  return [...new Set<string>(grants)];
}

export function hostMatchesGrants(hostname: string, grants: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return grants.some((grant) =>
    grant.startsWith('*.') ? host.endsWith(grant.substr(1)) : host === grant
  );
}

/** Whether a request from View `viewId`, holding `grants`, may leave the renderer. */
export function isRequestAllowed(url: string, viewId: string, grants: string[]): boolean {
  if (ALWAYS_ALLOWED_PROTOCOLS.some((p) => url.startsWith(p))) return true;
  if (isViewOrigin(url, viewId)) return true;
  try {
    const target = new URL(url);
    return (
      GRANTABLE_PROTOCOLS.includes(target.protocol) &&
      target.port === '' &&
      !target.username &&
      !target.password &&
      hostMatchesGrants(target.hostname, grants)
    );
  } catch {
    return false;
  }
}

function grantSources(grants: string[]) {
  return grants.map((g) => `https://${g} wss://${g}`).join(' ');
}

export function contentSecurityPolicy(grants: string[]): string {
  const connect = grants.length ? grantSources(grants) : "'none'";
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${grants.length ? ` ${grantSources(grants)}` : ''}`,
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Session proxy config sending granted hosts DIRECT and everything else to a proxy that
 * refuses connections. This backstops traffic that never passes through webRequest, chiefly
 * WebRTC: with the `disable_non_proxied_udp` policy, ICE/TURN may only use proxied TCP.
 * `<-loopback>` removes Chromium's implicit loopback bypass, without which TURN-over-TCP to
 * 127.0.0.1 goes direct and can reach local services.
 */
export function proxyConfig(grants: string[]): Electron.ProxyConfig {
  return {
    mode: 'fixed_servers',
    proxyRules: DEAD_PROXY,
    proxyBypassRules: ['<-loopback>', ...grants].join(','),
  };
}

/**
 * Whether the host may fetch `url` on a View's behalf as an email image. Only http(s) to
 * names that aren't loopback, private or link-local addresses: an email can point an <img>
 * anywhere, and the proxy must not become a way to probe local services.
 */
export function isProxyableImageURL(url: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(target.protocol)) return false;
  if (target.username || target.password) return false;
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || (!host.includes('.') && !host.includes(':'))) return false;
  if (NEVER_GRANTABLE_SUFFIXES.some((suffix) => `.${host}`.endsWith(suffix))) return false;
  if (/^[\d.]+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (host.includes(':')) {
    return !(
      host === '::1' ||
      host === '::' ||
      /^(fc|fd|fe8|fe9|fea|feb)/.test(host) ||
      host.startsWith('::ffff:')
    );
  }
  return true;
}

/** Content types a View may receive for host-served resources; anything else is opaque bytes. */
export function servableResourceType(contentType: string | null | undefined): string {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  return /^image\/(png|jpe?g|gif|webp|bmp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)
    ? type
    : 'application/octet-stream';
}
