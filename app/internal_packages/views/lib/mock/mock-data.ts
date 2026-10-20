import fs from 'fs';
import path from 'path';

/**
 * A View's mock-data.json: invented mail, calendar and AI answers that the View renders in mock
 * mode instead of the user's own. It lets a View be screenshotted for its card or for sharing
 * without anyone (an on-device agent, a cloud agent, or the person viewing the share) seeing
 * the user's mail. The format is documented for authors in docs/plans/views-api.md (§5.1).
 *
 * The file describes threads with their messages, events and calendars in the loose shapes an
 * author would write; this module expands them into the serialized shapes the bridge returns
 * (ThreadSummary, MessageSummary, Event …), so a View can't tell mock data from real data.
 */

export const MOCK_DATA_FILE = 'mock-data.json';

export interface MockContact {
  name: string;
  email: string;
  isMe: boolean;
}

export interface MockCategory {
  id: string;
  accountId: string;
  name: string;
  kind: 'folder' | 'label';
  role: string | null;
}

export interface MockMessage {
  summary: any;
  thread: MockThread;
  text: string | null;
  html: string | null;
  structured: object[];
  extract: object | null;
  digest: { gist: string | null; asks: string | null; needsAction: boolean } | null;
  meta: object | null;
}

export interface MockThread {
  id: string;
  accountId: string;
  subject: string;
  categories: MockCategory[];
  unread: boolean;
  starred: boolean;
  meta: object | null;
  messages: MockMessage[];
}

export interface MockEvent {
  event: any;
  extract: object | null;
}

export interface MockData {
  accounts: {
    id: string;
    label: string;
    email: string;
    provider: string;
    categories: MockCategory[];
  }[];
  identity: { accounts: { id: string; email: string; name: string }[]; addresses: string[] };
  threads: MockThread[];
  events: MockEvent[];
  calendars: any[];
  /** What `ai.generate` answers, whatever the prompt. */
  generate: { text?: string | null; value?: any } | null;
  fetch: { url: string; status: number; contentType: string; body: string }[];
  viewState: { [key: string]: any };
  selectedThreadId: string | null;
}

const ROLES = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam'];

// `@now`, `@now-90m`, `@today+2d 14:30` and `@date-3d` keep mock data current: a Week Ahead
// rendered next month still shows next week. `@now`/`@today` become ISO timestamps (`@today`
// is local midnight); `@date` becomes a local YYYY-MM-DD for APIs that want plain dates.
const DATE_TOKEN = /^@(now|today|date)((?:[+-]\d+[mhdw])*)(?:\s+(\d{1,2}):(\d{2}))?$/;

function resolveDateToken(value: string, now: Date): string | null {
  const match = DATE_TOKEN.exec(value);
  if (!match) return null;
  const [, base, offsets, hours, minutes] = match;
  const d = new Date(now.getTime());
  if (base !== 'now') d.setHours(0, 0, 0, 0);
  for (const [, sign, amount, unit] of offsets.matchAll(/([+-])(\d+)([mhdw])/g)) {
    const n = Number(amount) * (sign === '-' ? -1 : 1);
    if (unit === 'm') d.setMinutes(d.getMinutes() + n);
    if (unit === 'h') d.setHours(d.getHours() + n);
    if (unit === 'd') d.setDate(d.getDate() + n);
    if (unit === 'w') d.setDate(d.getDate() + n * 7);
  }
  if (hours !== undefined) d.setHours(Number(hours), Number(minutes), 0, 0);
  if (base === 'date') {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return d.toISOString();
}

export function resolveDateTokens(value: any, now = new Date()): any {
  if (typeof value === 'string') return resolveDateToken(value, now) || value;
  if (Array.isArray(value)) return value.map((v) => resolveDateTokens(v, now));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveDateTokens(v, now);
    return out;
  }
  return value;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function htmlToText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function snippetOf(text: string | null) {
  return text ? text.replace(/\s+/g, ' ').trim().slice(0, 190) : null;
}

export class MockDataError extends Error {}

/** Reads and expands `<dir>/mock-data.json`. Throws MockDataError with a readable message. */
export function loadMockData(dir: string, now = new Date()): MockData {
  const file = path.join(dir, MOCK_DATA_FILE);
  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new MockDataError(
      err.code === 'ENOENT'
        ? `This View has no ${MOCK_DATA_FILE}.`
        : `${MOCK_DATA_FILE} is not valid JSON: ${err.message}`
    );
  }
  return expandMockData(raw, now);
}

export function expandMockData(input: any, now = new Date()): MockData {
  const raw = resolveDateTokens(input || {}, now);
  const me = raw.me || { name: 'Alex Rivera', email: 'alex@example.com' };
  const accountSpecs: any[] = raw.accounts && raw.accounts.length ? raw.accounts : [me];
  const folderNames: string[] = raw.folders || [];

  const accounts = accountSpecs.map((a, idx) => {
    const id = `mock-account-${idx + 1}`;
    const categories: MockCategory[] = [
      ...ROLES.map((role) => ({
        id: `${id}-${role}`,
        accountId: id,
        name: role[0].toUpperCase() + role.slice(1),
        kind: 'folder' as const,
        role,
      })),
      ...folderNames.map((name) => ({
        id: `${id}-${slug(name)}`,
        accountId: id,
        name,
        kind: 'label' as const,
        role: null,
      })),
    ];
    return {
      id,
      label: a.label || a.email,
      email: a.email.toLowerCase(),
      name: a.name || '',
      provider: a.provider || 'gmail',
      categories,
    };
  });
  const addresses = [
    ...new Set([
      ...accounts.map((a) => a.email),
      ...(raw.aliases || []).map((a: string) => a.toLowerCase()),
    ]),
  ];
  const isMe = (email: string) => addresses.includes((email || '').toLowerCase());

  const contact = (value: any): MockContact | null => {
    if (!value) return null;
    if (typeof value === 'object') {
      const email = String(value.email || '').toLowerCase();
      return { name: value.name || '', email, isMe: isMe(email) };
    }
    const named = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(String(value));
    const email = (named ? named[2] : String(value)).trim().toLowerCase();
    const name = named ? named[1].trim() : '';
    if (email === 'me' || isMe(email)) {
      const account = accounts.find((a) => a.email === email) || accounts[0];
      return { name: name || account.name, email: account.email, isMe: true };
    }
    return { name, email, isMe: false };
  };
  const contacts = (value: any) => (value ? [].concat(value).map(contact).filter(Boolean) : []);

  const accountFor = (spec: any) =>
    (spec && accounts.find((a) => a.email === String(spec).toLowerCase() || a.id === spec)) ||
    accounts[0];
  const categoryFor = (account, name: string) => {
    const lower = name.toLowerCase();
    const found = account.categories.find(
      (c) => c.role === lower || c.name.toLowerCase() === lower || c.id === name
    );
    if (!found) {
      throw new MockDataError(
        `Thread folder "${name}" is not a role (${ROLES.join(', ')}) or listed in "folders".`
      );
    }
    return found;
  };

  let nextId = 1;
  const threads: MockThread[] = (raw.threads || []).map((t: any, ti: number) => {
    const account = accountFor(t.account);
    const thread: MockThread = {
      id: t.id || `t${ti + 1}`,
      accountId: account.id,
      subject: t.subject || '',
      categories: [],
      unread: false,
      starred: !!t.starred,
      meta: t.meta || null,
      messages: [],
    };
    const inNames: string[] = [].concat(t.in || 'inbox');
    const categories = inNames.map((n) => categoryFor(account, n));

    thread.messages = (t.messages || [{}]).map((m: any) => {
      const from = contact(m.from) || contact('me');
      const html = typeof m.html === 'string' ? m.html : null;
      const text = typeof m.body === 'string' ? m.body : html ? htmlToText(html) : null;
      const id = m.id || `m${nextId++}`;
      const files = (m.attachments || []).map((f: any, fi: number) => ({
        id: `${id}-f${fi + 1}`,
        filename: typeof f === 'string' ? f : f.filename,
        contentType: (f && f.contentType) || null,
        size: (f && f.size) || 48000,
        isInline: !!(f && f.isInline),
      }));
      const summary = {
        id,
        threadId: thread.id,
        accountId: account.id,
        subject: m.subject || thread.subject,
        snippet: m.snippet || snippetOf(text),
        date: m.date || now.toISOString(),
        from,
        to: contacts(m.to === undefined ? (from.isMe ? [] : 'me') : m.to),
        cc: contacts(m.cc),
        bcc: contacts(m.bcc),
        isSent: from.isMe,
        unread: !!m.unread,
        starred: !!m.starred,
        draft: false,
        categories: null,
        attachments: files.map((f) => ({ ...f, messageId: id })),
        listUnsubscribe:
          m.listUnsubscribe === true
            ? `<mailto:unsubscribe@${from.email.split('@')[1] || 'example.com'}>`
            : m.listUnsubscribe || null,
        meta: m.meta || null,
      };
      return {
        summary,
        thread,
        text,
        html,
        structured: m.structured || [],
        extract: m.extract || null,
        digest: m.summary || null,
        meta: m.meta || null,
      } as MockMessage;
    });
    thread.messages.sort((a, b) => Date.parse(a.summary.date) - Date.parse(b.summary.date));

    const sentRole = account.categories.find((c) => c.role === 'sent');
    if (thread.messages.some((m) => m.summary.isSent) && !categories.includes(sentRole)) {
      categories.push(sentRole);
    }
    thread.categories = categories;
    thread.unread =
      t.unread !== undefined ? !!t.unread : thread.messages.some((m) => m.summary.unread);
    for (const m of thread.messages) m.summary.categories = categories;
    return thread;
  });

  const calendars = (raw.calendars || [{ name: 'Calendar' }]).map((c: any, idx: number) => ({
    id: c.id || `cal${idx + 1}`,
    accountId: accountFor(c.account).id,
    name: c.name || 'Calendar',
    color: c.color || null,
    readOnly: !!c.readOnly,
    isDefault: c.isDefault !== undefined ? !!c.isDefault : idx === 0,
  }));
  const calendarFor = (spec: any) =>
    calendars.find((c) => c.id === spec || c.name === spec) || calendars[0];

  const events: MockEvent[] = (raw.events || []).map((e: any, idx: number) => {
    const calendar = calendarFor(e.calendar);
    const start = e.start || now.toISOString();
    const end =
      e.end ||
      new Date(Date.parse(start) + (e.isAllDay ? 24 * 60 : e.minutes || 60) * 60000).toISOString();
    const id = e.id || `e${idx + 1}`;
    const attendees = (e.attendees || []).map((a: any) => ({
      ...contact(a),
      status: (a && a.status) || 'accepted',
    }));
    const text = `${e.location || ''} ${e.description || ''}`;
    const conference =
      /https:\/\/[^\s]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com)[^\s]*/.exec(text);
    return {
      event: {
        id,
        eventId: e.eventId || id,
        calendarId: calendar.id,
        accountId: calendar.accountId,
        title: e.title || '',
        start,
        end,
        isAllDay: !!e.isAllDay,
        location: e.location || null,
        description: e.description || null,
        status: e.status || 'CONFIRMED',
        organizer: contact(e.organizer),
        attendees,
        myStatus: e.myStatus !== undefined ? e.myStatus : attendees.length ? 'accepted' : null,
        conferenceUrl: conference ? conference[0] : null,
        isRecurring: !!e.isRecurring,
        isException: false,
      },
      extract: e.extract || null,
    };
  });

  const fetchEntries = (raw.fetch || []).map((f: any) => ({
    url: String(f.url || ''),
    status: f.status || 200,
    contentType: f.contentType || (f.json !== undefined ? 'application/json' : 'text/plain'),
    body: f.json !== undefined ? JSON.stringify(f.json) : String(f.text || ''),
  }));

  return {
    accounts: accounts.map(({ name, ...a }) => a),
    identity: {
      accounts: accounts.map((a) => ({ id: a.id, email: a.email, name: a.name })),
      addresses,
    },
    threads,
    events,
    calendars,
    generate: raw.generate || null,
    fetch: fetchEntries,
    viewState: raw.viewState || {},
    selectedThreadId: raw.selectedThread || (threads[0] ? threads[0].id : null),
  };
}

/** The ThreadSummary the bridge would return for `thread`. */
export function threadSummary(thread: MockThread) {
  const seen = new Set<string>();
  const participants: MockContact[] = [];
  for (const m of thread.messages) {
    for (const c of [m.summary.from, ...m.summary.to, ...m.summary.cc]) {
      if (c && !seen.has(c.email)) {
        seen.add(c.email);
        participants.push(c);
      }
    }
  }
  participants.sort((a, b) => Number(a.isMe) - Number(b.isMe));
  const newest = (sent: boolean) => {
    const matching = thread.messages.filter((m) => m.summary.isSent === sent);
    return matching.length ? matching[matching.length - 1].summary.date : null;
  };
  const last = thread.messages[thread.messages.length - 1];
  return {
    id: thread.id,
    accountId: thread.accountId,
    subject: thread.subject,
    snippet: last ? last.summary.snippet : null,
    unread: thread.unread,
    starred: thread.starred,
    participants,
    categories: thread.categories,
    attachmentCount: thread.messages.reduce(
      (n, m) => n + m.summary.attachments.filter((f) => !f.isInline).length,
      0
    ),
    firstMessageAt: thread.messages.length ? thread.messages[0].summary.date : null,
    lastReceivedAt: newest(false),
    lastSentAt: newest(true),
    meta: thread.meta && Object.keys(thread.meta).length ? thread.meta : null,
  };
}

export function lastMessageDate(thread: MockThread) {
  const last = thread.messages[thread.messages.length - 1];
  return last ? Date.parse(last.summary.date) : 0;
}
