import { z } from 'zod';
import { MailspringAPIRequest } from 'mailspring-exports';
import { parseReply, requestJSON } from '../agent/client';
import { AgentAPIError } from '../agent/types';
import { declaredGrants } from '../consent';
import { SHARE_ID_REGEXP, isShareId, webURL } from './share-link';

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

const ShareIdSchema = z.string().regex(SHARE_ID_REGEXP);
const WebURLSchema = z.string().refine((v) => webURL(v) !== null);

/** The reply to `POST /api/views/share`. */
const PublishedShareSchema = z.object({ shareId: ShareIdSchema, url: WebURLSchema });
export type PublishedShare = z.infer<typeof PublishedShareSchema>;

/** One of the caller's live shares (`GET /api/views/shares`). */
const ShareRecordSchema = z.object({
  shareId: ShareIdSchema,
  url: WebURLSchema,
  viewId: z.string(),
  revision: z.number().int(),
  name: z.string(),
  createdAt: z.string().nullable(),
});
export type ShareRecord = z.infer<typeof ShareRecordSchema>;

// Entries are checked one by one so a malformed share doesn't hide the others.
const ShareListSchema = z.object({ shares: z.array(z.unknown()) });

/**
 * A share's public metadata (`GET /api/views/shared/<id>`), for the install sheet. Permissions
 * and hosts are filtered afterwards (see parseSharedInfo); a poster that isn't a web URL is
 * dropped rather than failing the sheet.
 */
const SharedInfoSchema = z.object({
  name: z.string(),
  description: z.string().nullish(),
  permissions: z.unknown().optional(),
  network: z.unknown().optional(),
  posterURL: z.unknown().optional(),
});

export interface SharedViewInfo {
  shareId: string;
  name: string;
  description: string;
  permissions: string[];
  network: string[];
  posterURL: string | null;
}

/** The install route's bundle, unverified. */
const SharedBundleSchema = z.object({
  shareId: z.string(),
  manifest: z.record(z.string(), z.any()),
  files: z.record(z.string(), z.string()),
  signature: z.string(),
});
export type SharedBundle = z.infer<typeof SharedBundleSchema>;

export interface ShareTransport {
  publish(body: ShareRequest): Promise<PublishedShare>;
  remove(shareId: string): Promise<void>;
  listShares(viewId: string): Promise<ShareRecord[]>;
  getShared(shareId: string): Promise<SharedViewInfo>;
  install(shareId: string): Promise<SharedBundle>;
}

export function parsePublished(json: unknown): PublishedShare {
  return parseReply(PublishedShareSchema, json, 'the share request');
}

export function parseShares(json: unknown): ShareRecord[] {
  const { shares } = parseReply(ShareListSchema, json, 'the shares request');
  return shares.flatMap((s) => {
    const parsed = ShareRecordSchema.safeParse(s);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Validates a share's public metadata. Permissions and hosts go through the same filter as
 * a manifest's (consent.ts declaredGrants), so the sheet never lists anything the consent
 * card wouldn't.
 */
export function parseSharedInfo(json: unknown, shareId: string): SharedViewInfo {
  const schema = SharedInfoSchema.extend({ shareId: z.literal(shareId) });
  const info = parseReply(schema, json, 'the shared View request');
  const grants = declaredGrants({ permissions: info.permissions, network: info.network });
  return {
    shareId,
    name: info.name.trim().slice(0, 60) || shareId,
    description: (info.description || '').slice(0, 500),
    permissions: grants.permissions,
    network: grants.network,
    posterURL: webURL(info.posterURL),
  };
}

export function parseBundle(json: unknown, shareId: string): SharedBundle {
  const schema = SharedBundleSchema.extend({ shareId: z.literal(shareId) });
  return parseReply(schema, json, 'the install request');
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
