import { ViewError } from '../bridge/errors';
import type { MailQuery } from '../../../mcp-server/lib/capabilities/queries';
import type { Dim } from '../bridge/counts';
import { MockData, MockMessage, MockThread, lastMessageDate, threadSummary } from './mock-data';

/**
 * Runs the bridge's mail queries over mock data in memory. Queries arrive already validated and
 * normalized by `mailQuery` (bridge/handlers.ts), the same path real queries take, so a filter
 * that is wrong against the user's mail is wrong here too. Matching follows the SQL compiler in
 * mcp-server/lib/capabilities/filter.ts closely enough for posters; full-text matching is plain
 * word containment rather than stemmed FTS.
 *
 * The authoring agent's checker bundles this file and mock-data.ts (backend
 * agents/views/harness-src), so both stay free of Electron and app imports beyond types.
 */

const EXACT = /^[^\s@]+@[^\s@]+$/;

function addressMatches(email: string, values: string | string[]) {
  const address = (email || '').toLowerCase();
  return [].concat(values).some((raw: string) => {
    const v = raw.trim().toLowerCase();
    if (EXACT.test(v)) return address === v;
    const domain = v.replace(/^@/, '');
    return address.endsWith(`@${domain}`) || address.endsWith(`.${domain}`);
  });
}

const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).map(stem);
// Enough of Porter stemming that "rides" finds "ride" and "shipping" finds "shipped".
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '');

function threadText(thread: MockThread) {
  const parts = [thread.subject, ...thread.categories.map((c) => c.name)];
  for (const m of thread.messages) {
    const s = m.summary;
    parts.push(s.subject, m.text || '');
    for (const c of [s.from, ...s.to, ...s.cc]) if (c) parts.push(c.name, c.email);
  }
  return new Set(words(parts.join(' ')));
}

function inCategory(thread: MockThread, values: string | string[]) {
  return [].concat(values).some((value: string) => {
    const lower = value.toLowerCase();
    return thread.categories.some(
      (c) => c.role === lower || c.id === value || c.name.toLowerCase() === lower
    );
  });
}

function knownCategory(data: MockData, value: string) {
  const lower = value.toLowerCase();
  const roles = [
    'inbox',
    'sent',
    'drafts',
    'trash',
    'spam',
    'archive',
    'all',
    'important',
    'snoozed',
  ];
  if (roles.includes(lower)) return true;
  return data.accounts.some((a) =>
    a.categories.some((c) => c.id === value || c.name.toLowerCase() === lower)
  );
}

/** Search-bar syntax, approximately: `from:`, `to:`, `in:`, `subject:`, `is:` and free words. */
function searchMatches(search: string, thread: MockThread, message: MockMessage | null) {
  const tokens = search.match(/(\w+:)?("[^"]*"|\S+)/g) || [];
  const text = threadText(thread);
  return tokens.every((token) => {
    const [, key, rawValue] = /^(?:(\w+):)?(.*)$/.exec(token);
    const value = rawValue.replace(/^"|"$/g, '');
    const messages = message ? [message] : thread.messages;
    switch ((key || '').toLowerCase()) {
      case 'from':
        return messages.some(
          (m) => m.summary.from && m.summary.from.email.includes(value.toLowerCase())
        );
      case 'to':
        return messages.some((m) =>
          m.summary.to.some((c) => c.email.includes(value.toLowerCase()))
        );
      case 'in':
        return inCategory(thread, value);
      case 'subject':
        return thread.subject.toLowerCase().includes(value.toLowerCase());
      case 'is':
        if (value === 'unread') return thread.unread;
        if (value === 'starred') return thread.starred;
        return true;
      default:
        return words(token).every((w) => text.has(w) || [...text].some((t) => t.startsWith(w)));
    }
  });
}

// Conditions on a single message's fields. In a thread query each one means "the thread has a
// message matching it", one condition at a time, as in filter.ts: `{ not: { direction: 'sent' } }`
// is a thread with no sent message, not a thread with some received one.
function messageLeaf(key: string, value: any, m: MockMessage): boolean {
  const s = m.summary;
  switch (key) {
    case 'from':
      return !!s.from && addressMatches(s.from.email, value);
    case 'to':
      return [...s.to, ...s.cc, ...s.bcc].some((c) => addressMatches(c.email, value));
    case 'participant':
      return [s.from, ...s.to, ...s.cc, ...s.bcc].some((c) => c && addressMatches(c.email, value));
    case 'direction':
      return s.isSent === (value === 'sent');
    case 'hasAttachment':
      return s.attachments.some((f) => !f.isInline) === value;
    case 'listUnsubscribe':
      return !!s.listUnsubscribe === value;
    default:
      return null;
  }
}

/** Evaluates `filter` on a thread, or on a message when `message` is given. */
function matches(data: MockData, filter: any, thread: MockThread, message: MockMessage | null) {
  const [key] = Object.keys(filter);
  const value = filter[key];
  switch (key) {
    case 'and':
      return value.every((f) => matches(data, f, thread, message));
    case 'or':
      return value.some((f) => matches(data, f, thread, message));
    case 'not':
      return !matches(data, value, thread, message);
    case 'from':
    case 'to':
    case 'participant':
    case 'direction':
    case 'hasAttachment':
    case 'listUnsubscribe':
      return message
        ? messageLeaf(key, value, message)
        : thread.messages.some((m) => messageLeaf(key, value, m));
    case 'in':
      for (const name of [].concat(value)) {
        if (!knownCategory(data, name)) {
          throw new ViewError('invalid', `"in": no folder or label "${name}"`);
        }
      }
      return inCategory(thread, value);
    case 'text': {
      const haystack = threadText(thread);
      return words(value).every((w) => haystack.has(w));
    }
    case 'search':
      return searchMatches(value, thread, null);
    case 'subject':
      return (message ? message.summary.subject : thread.subject)
        .toLowerCase()
        .includes(value.toLowerCase());
    case 'unread':
      return (message ? message.summary.unread : thread.unread) === value;
    case 'starred':
      return (message ? message.summary.starred : thread.starred) === value;
    case 'account': {
      const account = data.accounts.find((a) => a.id === thread.accountId);
      return [].concat(value).some((v) => v === account.id || v.toLowerCase() === account.email);
    }
    case 'date': {
      const at = message ? Date.parse(message.summary.date) : lastMessageDate(thread);
      if (value.after && at < Date.parse(value.after)) return false;
      if (value.before && at >= Date.parse(value.before)) return false;
      return true;
    }
    case 'tagged': {
      const meta = message ? message.meta : thread.meta;
      return !!(meta && Object.keys(meta).length) === value;
    }
    default:
      return false;
  }
}

function threadMatches(data: MockData, q: MailQuery, thread: MockThread) {
  if (q.ids && !q.ids.includes(thread.id)) return false;
  if (q.accountId && thread.accountId !== q.accountId) return false;
  if (q.categoryId && !thread.categories.some((c) => c.id === q.categoryId)) return false;
  if (q.metadataPluginId && !(thread.meta && Object.keys(thread.meta).length)) return false;
  if (q.search && !searchMatches(q.search, thread, null)) return false;
  if (!q.filter) return true;
  return matches(data, q.filter, thread, null);
}

function messageMatches(data: MockData, q: MailQuery, m: MockMessage) {
  const thread = m.thread;
  if (q.ids && !q.ids.includes(m.summary.id)) return false;
  if (q.threadId && thread.id !== q.threadId) return false;
  if (q.accountId && thread.accountId !== q.accountId) return false;
  if (q.categoryId && !thread.categories.some((c) => c.id === q.categoryId)) return false;
  if (q.metadataPluginId && !(m.meta && Object.keys(m.meta).length)) return false;
  if (q.search && !searchMatches(q.search, thread, m)) return false;
  return !q.filter || matches(data, q.filter, thread, m);
}

function page<T>(items: T[], q: MailQuery) {
  const offset = q.offset || 0;
  const slice = items.slice(offset, offset + q.limit);
  return { items: slice, hasMore: items.length > offset + q.limit };
}

export function findThreads(data: MockData, q: MailQuery) {
  const sortKey = (t: MockThread) => {
    const s = threadSummary(t);
    return Date.parse(s.lastReceivedAt || s.lastSentAt || s.firstMessageAt || '') || 0;
  };
  const found = data.threads
    .filter((t) => threadMatches(data, q, t))
    .sort((a, b) => (q.order === 'oldest' ? sortKey(a) - sortKey(b) : sortKey(b) - sortKey(a)));
  const { items, hasMore } = page(found, q);
  return { items: items.map(threadSummary), hasMore };
}

export function matchingMessages(data: MockData, q: MailQuery) {
  const found = data.threads.flatMap((t) => t.messages).filter((m) => messageMatches(data, q, m));
  const time = (m: MockMessage) => Date.parse(m.summary.date);
  return found.sort((a, b) => (q.order === 'oldest' ? time(a) - time(b) : time(b) - time(a)));
}

export function findMessages(data: MockData, q: MailQuery) {
  const { items, hasMore } = page(matchingMessages(data, q), q);
  return { items: items.map((m) => m.summary), hasMore };
}

const pad = (n: number) => String(n).padStart(2, '0');

// Matches SQLite's strftime('%W'): the Monday-based week of the year, 00–53.
function sqliteWeek(d: Date) {
  const yday = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(d.getFullYear(), 0, 1).getTime()) /
      864e5
  );
  return pad(Math.floor((yday + 7 - ((d.getDay() + 6) % 7)) / 7));
}

function dimValues(dim: Dim, m: MockMessage): { key: any; label?: string; isMe?: boolean }[] {
  const s = m.summary;
  const d = new Date(s.date);
  switch (dim) {
    case 'sender':
      return s.from ? [{ key: s.from.email, label: s.from.name, isMe: s.from.isMe }] : [];
    case 'recipient':
      return s.to.map((c) => ({ key: c.email, label: c.name, isMe: c.isMe }));
    case 'category':
      return m.thread.categories.map((c) => ({ key: c.id, label: c.name }));
    case 'account':
      return [{ key: s.accountId }];
    case 'thread':
      return [{ key: m.thread.id }];
    case 'year':
      return [{ key: `${d.getFullYear()}` }];
    case 'month':
      return [{ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }];
    case 'week':
      return [{ key: `${d.getFullYear()}-W${sqliteWeek(d)}` }];
    case 'day':
      return [{ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }];
    case 'weekday':
      return [{ key: d.getDay() }];
    case 'hour':
      return [{ key: d.getHours() }];
    default:
      return [];
  }
}

/** The rows `counts.find` returns: one per combination of dimension values, by count. */
export function countMockMessages(data: MockData, q: MailQuery, dims: Dim[]) {
  const all = matchingMessages(data, { ...q, limit: undefined, offset: undefined });
  const accountLabels = new Map(data.accounts.map((a) => [a.id, a.label]));
  const rows = new Map<string, any>();
  for (const m of all) {
    let combos: { key: any; labels: any; isMe: any }[] = [{ key: {}, labels: {}, isMe: {} }];
    for (const dim of dims) {
      const next = [];
      for (const combo of combos) {
        for (const v of dimValues(dim, m)) {
          const label = dim === 'account' ? accountLabels.get(v.key) : v.label;
          next.push({
            key: { ...combo.key, [dim]: v.key },
            labels: label ? { ...combo.labels, [dim]: label } : combo.labels,
            isMe: v.isMe !== undefined ? { ...combo.isMe, [dim]: v.isMe } : combo.isMe,
          });
        }
      }
      combos = next;
    }
    const at = Date.parse(m.summary.date);
    for (const combo of combos) {
      const id = JSON.stringify(combo.key);
      const row = rows.get(id) || { ...combo, ids: new Set(), first: at, last: at };
      row.ids.add(m.summary.id);
      row.first = Math.min(row.first, at);
      row.last = Math.max(row.last, at);
      rows.set(id, row);
    }
  }
  return [...rows.values()]
    .map((r) => ({
      key: r.key,
      labels: r.labels,
      isMe: r.isMe,
      count: r.ids.size,
      first: new Date(r.first).toISOString(),
      last: new Date(r.last).toISOString(),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5000);
}
