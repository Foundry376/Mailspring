import fs from 'fs';
import ICAL from 'ical.js';
import {
  AttachmentStore,
  CalendarUtils,
  DatabaseStore,
  Message,
  SearchQueryAST,
  Thread,
} from 'mailspring-exports';
import { bestICSAttachment } from './ics-attachment';

/** An invitation as one email carried it. */
export interface EmailedInvitation {
  ics: string;
  message: Message;
}

/** Where a VEVENT sits in its series: the RECURRENCE-ID instant, or '' for the series itself. */
function occurrenceKey(vevent: ICAL.Component): string {
  const rid = vevent.getFirstPropertyValue('recurrence-id') as ICAL.Time | null;
  return rid ? String(rid.toJSDate().getTime()) : '';
}

/** RFC 5546 section 2.1.5: the higher SEQUENCE is the newer revision, then the later DTSTAMP. */
function isNewerRevision(a: ICAL.Component, b: ICAL.Component): boolean {
  const sequence = (v: ICAL.Component) => Number(v.getFirstPropertyValue('sequence')) || 0;
  if (sequence(a) !== sequence(b)) return sequence(a) > sequence(b);
  const stamp = (v: ICAL.Component) => {
    const dtstamp = v.getFirstPropertyValue('dtstamp') as ICAL.Time | null;
    return dtstamp ? dtstamp.toJSDate().getTime() : 0;
  };
  return stamp(a) > stamp(b);
}

function referencedZones(vevent: ICAL.Component): string[] {
  return vevent
    .getAllProperties()
    .map((p) => p.getParameter('tzid'))
    .filter((tzid): tzid is string => !!tzid);
}

/**
 * The invitation as its organizer last sent it: the newest VEVENT for the series and for each of
 * its occurrences across every emailed REQUEST for its UID. Organizers revise these piecemeal:
 * Google mails a moved occurrence as a REQUEST holding that occurrence alone, and a cancelled
 * one as the series again with an EXDATE. An invitation to one occurrence takes nothing from
 * mail about other occurrences.
 *
 * @returns null when `ownIcs` already holds the newest of each; else the assembled invitation and
 *   the latest email it took from.
 */
export function newestInvitation(
  ownIcs: string,
  others: EmailedInvitation[]
): { ics: string; message: Message } | null {
  const { root, event } = CalendarUtils.parseICSString(ownIcs);
  const uid = event.uid;
  const chosen = new Map<string, { vevent: ICAL.Component; from?: EmailedInvitation }>();
  for (const vevent of root.getAllSubcomponents('vevent')) {
    if (vevent.getFirstPropertyValue('uid') === uid) chosen.set(occurrenceKey(vevent), { vevent });
  }
  const aboutOneOccurrence = !chosen.has('');
  const zones = new Map<string, ICAL.Component>();

  for (const other of others) {
    let otherRoot: ICAL.Component;
    try {
      otherRoot = CalendarUtils.parseICSString(other.ics).root;
    } catch (e) {
      continue;
    }
    const method = otherRoot.getFirstPropertyValue('method');
    if (method && String(method).toUpperCase() !== 'REQUEST') continue;
    for (const vevent of otherRoot.getAllSubcomponents('vevent')) {
      if (vevent.getFirstPropertyValue('uid') !== uid) continue;
      const key = occurrenceKey(vevent);
      const current = chosen.get(key);
      if (current ? !isNewerRevision(vevent, current.vevent) : aboutOneOccurrence) continue;
      chosen.set(key, { vevent, from: other });
    }
    for (const vtimezone of otherRoot.getAllSubcomponents('vtimezone')) {
      zones.set(String(vtimezone.getFirstPropertyValue('tzid')), vtimezone);
    }
  }

  const taken = [...chosen.values()].filter((c) => c.from).map((c) => c.from);
  if (!taken.length) return null;

  for (const vevent of root.getAllSubcomponents('vevent')) {
    if (vevent.getFirstPropertyValue('uid') === uid) root.removeSubcomponent(vevent);
  }
  // The series first: readers take the first VEVENT as the event.
  const ordered = [...chosen.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0));
  const present = new Set(
    root.getAllSubcomponents('vtimezone').map((z) => String(z.getFirstPropertyValue('tzid')))
  );
  for (const [, { vevent }] of ordered) {
    for (const tzid of referencedZones(vevent)) {
      if (present.has(tzid) || !zones.has(tzid)) continue;
      root.addSubcomponent(new ICAL.Component(zones.get(tzid).toJSON()));
      present.add(tzid);
    }
    root.addSubcomponent(new ICAL.Component(vevent.toJSON()));
  }

  const latest = taken.reduce((a, b) => (b.message.date > a.message.date ? b : a));
  return { ics: root.toString(), message: latest.message };
}

/**
 * The other emails in this account that may carry the same invitation: from its sender, with its
 * title in the subject, as every organizer's mailer titles an update ("Updated invitation: ...").
 * Messages whose bodies are not downloaded come back with a null body and no files yet.
 */
export async function otherInvitationEmails(message: Message, title: string): Promise<Message[]> {
  const sender = message.from[0] && message.from[0].email;
  if (!sender || !title) return [];
  const { AndQueryExpression, SubjectQueryExpression, FromQueryExpression, TextQueryExpression } =
    SearchQueryAST;
  const text = (s: string) => new TextQueryExpression(new SearchQueryAST.SearchQueryToken(s));
  const threads = await DatabaseStore.findAll<Thread>(Thread)
    .where({ accountId: message.accountId })
    .structuredSearch(
      new AndQueryExpression(
        new SubjectQueryExpression(text(title)),
        new FromQueryExpression(text(sender))
      )
    )
    .limit(25)
    .background();
  if (!threads.length) return [];
  const messages = await DatabaseStore.findAll<Message>(Message)
    .where([Message.attributes.threadId.in(threads.map((t) => t.id))])
    .include(Message.attributes.body);
  return messages.filter((m) => m.id !== message.id && !m.draft);
}

/** The invitations these emails carry, for those whose attachment is on disk. */
export async function readEmailedInvitations(messages: Message[]): Promise<EmailedInvitation[]> {
  const read = await Promise.all(
    messages.map(async (message) => {
      const file = bestICSAttachment(message.files);
      if (!file) return null;
      try {
        const filePath = await AttachmentStore.resolvePathForFile(file);
        return { message, ics: await fs.promises.readFile(filePath, 'utf8') };
      } catch (e) {
        return null;
      }
    })
  );
  return read.filter((r): r is EmailedInvitation => !!r);
}
