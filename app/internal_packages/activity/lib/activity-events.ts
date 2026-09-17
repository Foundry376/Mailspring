import { Contact, Message, localized } from 'mailspring-exports';
import { LINK_TRACKING_ID, OPEN_TRACKING_ID } from './plugin-helpers';

/**
 * A single open or click, flattened out of a message's open-tracking or
 * link-tracking plugin metadata.
 */
export interface ActivityEvent {
  messageId: string;
  threadId: string;
  accountId: string;
  subject: string;
  /** Subject for opens, link URL for clicks; used for notification text and repeat detection. */
  title: string;
  linkUrl?: string;
  recipient: Contact | null;
  recipientEmail: string | null;
  pluginId: string;
  timestamp: number;
  sentAt: number;
  /** Events folded into this one when repeats are hidden; 1 when they are shown. */
  occurrences: number;
}

export function pluckByEmail(recipients: Contact[], email: string) {
  if (email) {
    return recipients.find((r) => r.email === email);
  } else if (recipients.length === 1) {
    return recipients[0];
  }
  return null;
}

export function eventCountLabel(count: number) {
  return count === 1 ? localized('1 event') : localized('%@ events', count);
}

/**
 * Collapses repeated opens of a message / clicks of a link by the same recipient
 * into the earliest one, with `occurrences` counting the rest. Returns copies,
 * newest first.
 */
export function foldRepeatedEvents(events: ActivityEvent[]) {
  const firstByKey = new Map<string, ActivityEvent>();
  for (const event of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
    const key = `${event.messageId}|${event.pluginId}|${event.title}|${event.recipientEmail || ''}`;
    const first = firstByKey.get(key);
    if (first) {
      first.occurrences += 1;
    } else {
      firstByKey.set(key, { ...event, occurrences: 1 });
    }
  }
  return Array.from(firstByKey.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export function eventsForMessage(
  message: Message,
  { includeRepeats }: { includeRepeats: boolean }
): ActivityEvent[] {
  const recipients = message.to.concat(message.cc, message.bcc);
  const base = {
    messageId: message.id,
    threadId: message.threadId,
    accountId: message.accountId,
    subject: message.subject,
    sentAt: message.date ? Math.floor(message.date.getTime() / 1000) : 0,
    occurrences: 1,
  };
  const withRecipient = (email: string) => {
    const recipient = pluckByEmail(recipients, email);
    return { recipient, recipientEmail: email || (recipient ? recipient.email : null) };
  };

  const events: ActivityEvent[] = [];

  const openMetadata = message.metadataForPluginId(OPEN_TRACKING_ID);
  if (openMetadata && openMetadata.open_count > 0 && openMetadata.open_data) {
    for (const open of openMetadata.open_data) {
      events.push({
        ...base,
        ...withRecipient(open.recipient),
        title: message.subject,
        pluginId: OPEN_TRACKING_ID,
        timestamp: open.timestamp,
      });
    }
  }

  const linkMetadata = message.metadataForPluginId(LINK_TRACKING_ID);
  if (linkMetadata && linkMetadata.links) {
    for (const link of linkMetadata.links) {
      for (const click of link.click_data || []) {
        events.push({
          ...base,
          ...withRecipient(click.recipient),
          title: link.url,
          linkUrl: link.url,
          pluginId: LINK_TRACKING_ID,
          timestamp: click.timestamp,
        });
      }
    }
  }

  return includeRepeats ? events : foldRepeatedEvents(events);
}

/** Returns events for all messages, newest first. */
export function eventsForMessages(
  messages: Message[],
  opts: { includeRepeats: boolean }
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const message of messages) {
    events.push(...eventsForMessage(message, opts));
  }
  return events.sort((a, b) => b.timestamp - a.timestamp);
}
