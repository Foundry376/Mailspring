import fs from 'fs';
import net from 'net';
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
// Mock mode renders a View from its mock-data.json (internal_packages/views/lib/mock). Its
// partition is in-memory so nothing it stores outlives the app, and it gets no network.
export const MOCK_PARTITION_PREFIX = 'view-mock-';
export const VIEW_ID_REGEXP = /^[a-z0-9][a-z0-9-]{0,63}$/;

const ALWAYS_ALLOWED_PROTOCOLS = ['data:', 'blob:', 'devtools:'];
const GRANTABLE_PROTOCOLS = ['https:', 'wss:'];

// Nothing listens on the discard port, so every connection through this proxy is refused;
// Chromium fails the request rather than falling back to DIRECT.
const DEAD_PROXY = 'socks5://127.0.0.1:9';

const GRANT_REGEXP = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const NEVER_GRANTABLE_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.test'];

export function viewIdForPartition(partition: string | undefined): string | null {
  const prefix = [PARTITION_PREFIX, MOCK_PARTITION_PREFIX].find((p) =>
    (partition || '').startsWith(p)
  );
  if (!prefix) return null;
  const viewId = partition.substr(prefix.length);
  return VIEW_ID_REGEXP.test(viewId) ? viewId : null;
}

export function isMockPartition(partition: string | undefined): boolean {
  return (partition || '').startsWith(MOCK_PARTITION_PREFIX);
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

/**
 * What the user has approved for each View, by id: `{ [viewId]: { permissions, network } }`.
 * Written only by the host window's consent card (views/lib/consent.ts). Every revision of a
 * View shares one record, so a revision can never use more than the user allowed.
 */
export const APPROVALS_CONFIG_KEY = 'core.views.approvals';

/** The entries of `declared` the user approved under `field` in `approvals[viewId]`. */
export function approvedSubset(
  declared: string[],
  approvals: any,
  viewId: string,
  field: 'permissions' | 'network'
): string[] {
  const record =
    approvals && Object.prototype.hasOwnProperty.call(approvals, viewId) ? approvals[viewId] : null;
  const approved = record && Array.isArray(record[field]) ? record[field] : [];
  return declared.filter((entry) => approved.includes(entry));
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
 * Whether the host may fetch `url` on a View's behalf as an email image: http(s) on the default
 * port to a DNS name that isn't local. An email can point an <img> anywhere, and the proxy must
 * not become a way to probe local services, so IP literals and trailing-dot names (`localhost.`)
 * are refused outright. Names are also checked after resolution (isPublicAddress) on every
 * redirect hop, in view-sessions.ts.
 */
export function isProxyableImageURL(url: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(target.protocol)) return false;
  if (target.username || target.password || target.port !== '') return false;
  const host = target.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.') || host.startsWith('[')) return false;
  if (net.isIP(host) || /^[\d.]+$/.test(host)) return false;
  return !NEVER_GRANTABLE_SUFFIXES.some((suffix) => `.${host}`.endsWith(suffix));
}

function isPublicIPv4(address: string) {
  const [a, b, c] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * Whether a resolved address is on the public internet: not loopback, private, link-local,
 * CGNAT, benchmarking, multicast or reserved, including IPv4 addresses embedded in IPv6
 * (`::ffff:127.0.0.1`, NAT64 `64:ff9b::7f00:1`).
 */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family !== 6) return false;
  const ip = address.toLowerCase();
  const embedded = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (embedded) return isPublicIPv4(embedded[1]);
  const mapped = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return isPublicIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  // 6to4 (2002::/16) carries an IPv4 address in its second and third groups.
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/.exec(ip);
  if (sixToFour) {
    const hi = parseInt(sixToFour[1], 16);
    const lo = parseInt(sixToFour[2], 16);
    return isPublicIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  // Global unicast is 2000::/3; everything else (::, ::1, fc00::/7, fe80::/10, ff00::/8, and
  // the deprecated IPv4-compatible ::a.b.c.d) is local, reserved or multicast.
  return /^[23][0-9a-f]{3}:/.test(ip);
}

/** Content types a View may receive for host-served resources; anything else is opaque bytes. */
export function servableResourceType(contentType: string | null | undefined): string {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  return /^image\/(png|jpe?g|gif|webp|bmp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)
    ? type
    : 'application/octet-stream';
}
