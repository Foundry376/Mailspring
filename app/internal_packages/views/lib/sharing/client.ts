import { MailspringAPIRequest } from 'mailspring-exports';
import { requestJSON } from '../agent/client';
import { AgentAPIError } from '../agent/types';
import { declaredGrants } from '../consent';
import { isShareId, webURL } from './share-link';

/** `POST /api/views/share`. */
export interface ShareRequest {
  viewId: string;
  revision: number;
  sha256: { [file: string]: string };
  name: string;
  description: string;
  /** Base64 PNGs: `og` 1200×630, `card` 640×272. */
  posters: { og: string; card: string };
}

export interface PublishedShare {
  shareId: string;
  url: string;
}

/** One of the caller's live shares (`GET /api/views/shares`). */
export interface ShareRecord {
  shareId: string;
  url: string;
  viewId: string;
  revision: number;
  name: string;
  createdAt: string | null;
}

/** A share's public metadata (`GET /api/views/shared/<id>`), for the install sheet. */
export interface SharedViewInfo {
  shareId: string;
  name: string;
  description: string;
  permissions: string[];
  network: string[];
  posterURL: string | null;
  createdAt: string | null;
}

/** The install route's bundle, unverified. */
export interface SharedBundle {
  shareId: string;
  manifest: { [key: string]: any };
  files: { [name: string]: string };
  signature: string;
}

export interface ShareTransport {
  publish(body: ShareRequest): Promise<PublishedShare>;
  remove(shareId: string): Promise<void>;
  listShares(viewId: string): Promise<ShareRecord[]>;
  getShared(shareId: string): Promise<SharedViewInfo>;
  install(shareId: string): Promise<SharedBundle>;
}

const str = (v: any, fallback = '') => (typeof v === 'string' ? v : fallback);

function malformed(desc: string) {
  return new AgentAPIError(`The Mailspring servers sent an unexpected reply to ${desc}.`, {
    code: 'malformed_response',
  });
}

export function parsePublished(json: any): PublishedShare {
  const url = webURL(json && json.url);
  if (!json || !isShareId(json.shareId) || !url) throw malformed('the share request');
  return { shareId: json.shareId, url };
}

export function parseShares(json: any): ShareRecord[] {
  const list = json && Array.isArray(json.shares) ? json.shares : [];
  return list
    .filter((s: any) => s && isShareId(s.shareId) && webURL(s.url))
    .map((s: any) => ({
      shareId: s.shareId,
      url: s.url,
      viewId: str(s.viewId),
      revision: Number.isInteger(s.revision) ? s.revision : 0,
      name: str(s.name),
      createdAt: str(s.createdAt) || null,
    }));
}

/**
 * Validates a share's public metadata. Permissions and hosts go through the same filter as
 * a manifest's (consent.ts declaredGrants), so the sheet never lists anything the consent
 * card wouldn't.
 */
export function parseSharedInfo(json: any, shareId: string): SharedViewInfo {
  if (!json || json.shareId !== shareId || typeof json.name !== 'string') {
    throw malformed('the shared View request');
  }
  const grants = declaredGrants({ permissions: json.permissions, network: json.network });
  return {
    shareId,
    name: json.name.trim().slice(0, 60) || shareId,
    description: str(json.description).slice(0, 500),
    permissions: grants.permissions,
    network: grants.network,
    posterURL: webURL(json.posterURL),
    createdAt: str(json.createdAt) || null,
  };
}

export function parseBundle(json: any, shareId: string): SharedBundle {
  if (
    !json ||
    json.shareId !== shareId ||
    !json.manifest ||
    typeof json.manifest !== 'object' ||
    Array.isArray(json.manifest) ||
    !json.files ||
    typeof json.files !== 'object' ||
    typeof json.signature !== 'string'
  ) {
    throw malformed('the install request');
  }
  return {
    shareId,
    manifest: json.manifest,
    files: json.files,
    signature: json.signature,
  };
}

function assertShareId(shareId: string) {
  if (!isShareId(shareId)) {
    throw new AgentAPIError(`"${shareId}" is not a valid share id.`, { code: 'invalid_share' });
  }
}

/** The sharing routes on the identity server, beside the authoring proxy's. */
export class ShareClient implements ShareTransport {
  constructor(
    private root: () => string = () => MailspringAPIRequest.rootURLForServer('identity')
  ) {}

  async publish(body: ShareRequest) {
    return parsePublished(await requestJSON(this.root(), 'POST', '/api/views/share', body));
  }

  async remove(shareId: string) {
    assertShareId(shareId);
    await requestJSON(this.root(), 'DELETE', `/api/views/share/${shareId}`);
  }

  async listShares(viewId: string) {
    const path = `/api/views/shares?viewId=${encodeURIComponent(viewId)}`;
    return parseShares(await requestJSON(this.root(), 'GET', path));
  }

  async getShared(shareId: string) {
    assertShareId(shareId);
    const path = `/api/views/shared/${shareId}`;
    return parseSharedInfo(
      await requestJSON(this.root(), 'GET', path, undefined, { auth: false }),
      shareId
    );
  }

  async install(shareId: string) {
    assertShareId(shareId);
    const path = `/api/views/shared/${shareId}/install`;
    return parseBundle(await requestJSON(this.root(), 'POST', path, {}), shareId);
  }
}
