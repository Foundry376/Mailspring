import { Message } from 'mailspring-exports';
import { LINK_TRACKING_ID, OPEN_TRACKING_ID } from '../plugin-helpers';
import { forEachMessageIn } from '../message-scan';

export interface EngagementStats {
  /** Lower-cased email address, or domain when grouped by domain. */
  key: string;
  name: string;
  email: string;
  domain: string;
  /** Distinct recipients folded into this entry (1 unless grouped by domain). */
  contacts: number;
  sent: number;
  /** Sent messages carrying open or link tracking; engagement is only measurable on these. */
  tracked: number;
  /** Sent messages this recipient opened or clicked at least once. */
  engaged: number;
  opens: number;
  clicks: number;
  replies: number;
  /** Most opens of a single message, counting opens more than a minute apart. */
  maxOpensOfOneMessage: number;
  lastSentAt: number;
  lastSentSubject: string;
  lastSentThreadId: string;
  /** Most recent activity on the latest sent thread; null when it has none yet. */
  lastSentActivityAt: number | null;
  lastSentActivityKind: ActivityKind | null;
  lastActivityAt: number | null;
  lastActivityKind: ActivityKind | null;
  /** Thread the most recent activity happened on. */
  lastActivitySubject: string;
  lastActivityThreadId: string;
  firstOpenDelays: number[];
}

export type ActivityKind = 'open' | 'click' | 'reply';

/** Opens closer together than this are one sitting, not renewed interest. */
const OPEN_BURST_SECONDS = 60;

function emptyStats(key: string, name: string, email: string, domain: string): EngagementStats {
  return {
    key,
    name,
    email,
    domain,
    contacts: 1,
    sent: 0,
    tracked: 0,
    engaged: 0,
    opens: 0,
    clicks: 0,
    replies: 0,
    maxOpensOfOneMessage: 0,
    lastSentAt: 0,
    lastSentSubject: '',
    lastSentThreadId: '',
    lastSentActivityAt: null,
    lastSentActivityKind: null,
    lastActivityAt: null,
    lastActivityKind: null,
    lastActivitySubject: '',
    lastActivityThreadId: '',
    firstOpenDelays: [],
  };
}

function domainOf(email: string) {
  const at = email.lastIndexOf('@');
  return at === -1 ? email : email.slice(at + 1);
}

function noteActivity(
  stats: EngagementStats,
  timestamp: number,
  kind: ActivityKind,
  message: { subject: string; threadId: string }
) {
  if (stats.lastActivityAt === null || timestamp >= stats.lastActivityAt) {
    stats.lastActivityAt = timestamp;
    stats.lastActivityKind = kind;
    stats.lastActivitySubject = message.subject;
    stats.lastActivityThreadId = message.threadId;
  }
  if (
    message.threadId === stats.lastSentThreadId &&
    (stats.lastSentActivityAt === null || timestamp >= stats.lastSentActivityAt)
  ) {
    stats.lastSentActivityAt = timestamp;
    stats.lastSentActivityKind = kind;
  }
}

function countDistinctSittings(timestamps: number[]) {
  let sittings = 0;
  let last = -Infinity;
  for (const t of [...timestamps].sort((a, b) => a - b)) {
    if (t - last > OPEN_BURST_SECONDS) {
      sittings += 1;
      last = t;
    }
  }
  return sittings;
}

/**
 * Attributes each tracking event on a sent message to one of its recipients.
 * Events whose address matched no recipient fall back to the sole recipient,
 * mirroring how the feed and notifications resolve them.
 */
function eventsByRecipient(
  recipientKeys: string[],
  events: { recipient: string; timestamp: number }[]
) {
  const byKey = new Map<string, number[]>();
  for (const event of events) {
    let key = (event.recipient || '').toLocaleLowerCase();
    if (!recipientKeys.includes(key)) {
      if (recipientKeys.length !== 1) continue;
      key = recipientKeys[0];
    }
    const list = byKey.get(key) || [];
    list.push(event.timestamp);
    byKey.set(key, list);
  }
  return byKey;
}

/**
 * Per-recipient engagement over every message sent in the range. Replies are
 * counted only from recipients the user wrote to within the range, so all
 * numbers describe the same window.
 */
export async function computeRecipientEngagement(
  accountIds: string[],
  startUnix: number,
  endUnix: number,
  isCancelled: () => boolean
): Promise<EngagementStats[] | null> {
  const byKey = new Map<string, EngagementStats>();
  const threadRecipients = new Map<string, Set<string>>();

  const finished = await forEachMessageIn(
    accountIds,
    startUnix,
    endUnix,
    (message, messageUnix) => {
      if (!message.isFromMe()) {
        const from = message.from[0];
        const key = from ? from.email.toLocaleLowerCase() : '';
        const stats = byKey.get(key);
        const wroteTo = threadRecipients.get(message.threadId);
        if (stats && wroteTo && wroteTo.has(key)) {
          stats.replies += 1;
          noteActivity(stats, messageUnix, 'reply', message);
        }
        return;
      }

      const recipients = message.to
        .concat(message.cc, message.bcc)
        .filter((c) => c.email && !c.isMe());
      if (recipients.length === 0) return;

      const recipientKeys: string[] = [];
      for (const contact of recipients) {
        const key = contact.email.toLocaleLowerCase();
        let stats = byKey.get(key);
        if (!stats) {
          stats = emptyStats(key, contact.name || '', contact.email, domainOf(key));
          byKey.set(key, stats);
        } else if (!stats.name && contact.name) {
          stats.name = contact.name;
        }
        stats.sent += 1;
        if (messageUnix >= stats.lastSentAt) {
          stats.lastSentAt = messageUnix;
          stats.lastSentSubject = message.subject;
          if (message.threadId !== stats.lastSentThreadId) {
            stats.lastSentThreadId = message.threadId;
            stats.lastSentActivityAt = null;
            stats.lastSentActivityKind = null;
          }
        }
        recipientKeys.push(key);
      }
      const wroteTo = threadRecipients.get(message.threadId) || new Set<string>();
      recipientKeys.forEach((k) => wroteTo.add(k));
      threadRecipients.set(message.threadId, wroteTo);

      const openMetadata = message.metadataForPluginId(OPEN_TRACKING_ID);
      const linkMetadata = message.metadataForPluginId(LINK_TRACKING_ID);
      if (openMetadata || (linkMetadata && linkMetadata.tracked)) {
        recipientKeys.forEach((k) => (byKey.get(k).tracked += 1));
      }

      const engagedKeys = new Set<string>();
      if (openMetadata && openMetadata.open_data) {
        for (const [key, times] of eventsByRecipient(recipientKeys, openMetadata.open_data)) {
          const stats = byKey.get(key);
          stats.opens += times.length;
          stats.maxOpensOfOneMessage = Math.max(
            stats.maxOpensOfOneMessage,
            countDistinctSittings(times)
          );
          stats.firstOpenDelays.push(Math.max(0, Math.min(...times) - messageUnix));
          noteActivity(stats, Math.max(...times), 'open', message);
          engagedKeys.add(key);
        }
      }
      if (linkMetadata && linkMetadata.links) {
        const clicks = linkMetadata.links.flatMap((l) => l.click_data || []);
        for (const [key, times] of eventsByRecipient(recipientKeys, clicks)) {
          const stats = byKey.get(key);
          stats.clicks += times.length;
          noteActivity(stats, Math.max(...times), 'click', message);
          engagedKeys.add(key);
        }
      }
      for (const key of engagedKeys) {
        byKey.get(key).engaged += 1;
      }
    },
    isCancelled
  );

  return finished ? Array.from(byKey.values()) : null;
}

export function groupEngagementByDomain(recipients: EngagementStats[]): EngagementStats[] {
  const byDomain = new Map<string, EngagementStats>();
  for (const r of recipients) {
    let d = byDomain.get(r.domain);
    if (!d) {
      d = { ...emptyStats(r.domain, r.domain, '', r.domain), contacts: 0, firstOpenDelays: [] };
      byDomain.set(r.domain, d);
    }
    d.contacts += 1;
    d.sent += r.sent;
    d.tracked += r.tracked;
    d.engaged += r.engaged;
    d.opens += r.opens;
    d.clicks += r.clicks;
    d.replies += r.replies;
    d.maxOpensOfOneMessage = Math.max(d.maxOpensOfOneMessage, r.maxOpensOfOneMessage);
    if (r.lastSentAt >= d.lastSentAt) {
      d.lastSentAt = r.lastSentAt;
      d.lastSentSubject = r.lastSentSubject;
      d.lastSentThreadId = r.lastSentThreadId;
      d.lastSentActivityAt = r.lastSentActivityAt;
      d.lastSentActivityKind = r.lastSentActivityKind;
    }
    if (r.lastActivityAt !== null) {
      noteActivity(d, r.lastActivityAt, r.lastActivityKind, {
        subject: r.lastActivitySubject,
        threadId: r.lastActivityThreadId,
      });
    }
    d.firstOpenDelays.push(...r.firstOpenDelays);
  }
  return Array.from(byDomain.values());
}

export function averageFirstOpenDelay(stats: EngagementStats) {
  if (stats.firstOpenDelays.length === 0) return null;
  return stats.firstOpenDelays.reduce((a, b) => a + b, 0) / stats.firstOpenDelays.length;
}
