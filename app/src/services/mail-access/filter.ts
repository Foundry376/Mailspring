import { z } from 'zod';
import { AccountStore, CategoryStore, Matcher, SearchQueryParser } from 'mailspring-exports';
import { knownAddresses } from './identity';

/**
 * A JSON mail filter, compiled straight to SQL on the host. It is the structured alternative
 * to the search-bar grammar: no string parsing, explicit semantics per field, and limits that
 * fail with an error instead of a slow query.
 */
export type Filter =
  | { and: Filter[] }
  | { or: Filter[] }
  | { not: Filter }
  | { from: string | string[] }
  | { to: string | string[] }
  | { participant: string | string[] }
  | { subject: string }
  | { text: string }
  | { in: string | string[] }
  | { account: string | string[] }
  | { unread: boolean }
  | { starred: boolean }
  | { hasAttachment: boolean }
  | { date: { after?: string; before?: string } }
  | { direction: 'sent' | 'received' }
  | { listUnsubscribe: boolean }
  | { tagged: boolean }
  | { search: string };

export const FILTER_LIMITS = { depth: 8, nodes: 200, values: 500, stringLength: 500, words: 16 };

export class FilterError extends Error {
  code: 'invalid' | 'limit';
  constructor(code: 'invalid' | 'limit', message: string) {
    super(message);
    this.code = code;
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

const str = z.string().min(1).max(FILTER_LIMITS.stringLength);
const strOrList = z.union([str, z.array(str).min(1)]);
const isoDate = z.string().refine((s) => !isNaN(Date.parse(s)), 'expected an ISO date');

const LEAVES: { [key: string]: z.ZodTypeAny } = {
  from: strOrList,
  to: strOrList,
  participant: strOrList,
  subject: str,
  text: str,
  in: strOrList,
  account: strOrList,
  unread: z.boolean(),
  starred: z.boolean(),
  hasAttachment: z.boolean(),
  date: z
    .object({ after: isoDate.optional(), before: isoDate.optional() })
    .strict()
    .refine((d) => d.after || d.before, 'date needs "after" and/or "before"'),
  direction: z.enum(['sent', 'received']),
  listUnsubscribe: z.boolean(),
  tagged: z.boolean(),
  search: str,
};
const KEYS = ['and', 'or', 'not', ...Object.keys(LEAVES)];

/** Validates shape and limits. Throws FilterError with a path-qualified message. */
export function validateFilter(filter: any): Filter {
  let nodes = 0;
  let values = 0;
  const visit = (f: any, path: string, depth: number) => {
    if (depth > FILTER_LIMITS.depth) {
      throw new FilterError('limit', `${path}: filters nest at most ${FILTER_LIMITS.depth} deep`);
    }
    if (++nodes > FILTER_LIMITS.nodes) {
      throw new FilterError('limit', `filters have at most ${FILTER_LIMITS.nodes} terms`);
    }
    if (!f || typeof f !== 'object' || Array.isArray(f)) {
      throw new FilterError('invalid', `${path}: expected an object like { from: "a@b.com" }`);
    }
    const keys = Object.keys(f);
    if (keys.length !== 1) {
      throw new FilterError(
        'invalid',
        `${path}: each filter object has exactly one key; combine terms with { and: [...] }`
      );
    }
    const [key] = keys;
    const value = f[key];
    if (key === 'and' || key === 'or') {
      if (!Array.isArray(value) || value.length === 0) {
        throw new FilterError('invalid', `${path}.${key}: expected a non-empty array`);
      }
      value.forEach((child, i) => visit(child, `${path}.${key}[${i}]`, depth + 1));
      return;
    }
    if (key === 'not') {
      visit(value, `${path}.not`, depth + 1);
      return;
    }
    const schema = LEAVES[key];
    if (!schema) {
      throw new FilterError(
        'invalid',
        `${path}: unknown filter "${key}"; use one of ${KEYS.join(', ')}`
      );
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new FilterError('invalid', `${path}.${key}: ${result.error.issues[0].message}`);
    }
    values += Array.isArray(value) ? value.length : 1;
    if (values > FILTER_LIMITS.values) {
      throw new FilterError('limit', `filters have at most ${FILTER_LIMITS.values} values`);
    }
  };
  visit(filter, 'where', 1);
  return filter as Filter;
}

// ── SQL helpers ─────────────────────────────────────────────────────────────

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const list = (v: string | string[]) => (Array.isArray(v) ? v : [v]);

const EXACT = /^[^\s@]+@[^\s@]+$/;
const DOMAIN = /^@?(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/i;

// `a@b.com` matches that address; `b.com` or `@b.com` matches the domain and its subdomains.
function addressMatchSQL(column: string, values: string[]) {
  const exact: string[] = [];
  const clauses: string[] = [];
  for (const raw of values) {
    const v = raw.trim().toLowerCase();
    if (EXACT.test(v)) {
      exact.push(v);
    } else if (DOMAIN.test(v)) {
      const domain = likeEscape(v.replace(/^@/, ''));
      clauses.push(`${column} LIKE ${sqlString(`%@${domain}`)} ESCAPE '\\'`);
      clauses.push(`${column} LIKE ${sqlString(`%.${domain}`)} ESCAPE '\\'`);
    } else {
      throw new FilterError('invalid', `"${raw}" is not an email address or domain`);
    }
  }
  if (exact.length) clauses.unshift(`${column} IN (${exact.map(sqlString).join(', ')})`);
  return `(${clauses.join(' OR ')})`;
}

function contactsMatchSQL(fields: string[], values: string[]) {
  const email = "lower(json_extract(`c`.`value`, '$.email'))";
  const match = addressMatchSQL(email, values);
  return `(${fields
    .map(
      (f) =>
        `EXISTS (SELECT 1 FROM json_each(\`Message\`.\`data\`, '$.${f}') AS \`c\` WHERE ${match})`
    )
    .join(' OR ')})`;
}

const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function dateSQL(column: string, { after, before }: { after?: string; before?: string }) {
  const parts = [];
  if (after) parts.push(`${column} >= ${seconds(after)}`);
  if (before) parts.push(`${column} < ${seconds(before)}`);
  return `(${parts.join(' AND ')})`;
}

// Words, porter-stemmed by the FTS index, all of which must appear. Quoting each word keeps
// FTS operators and punctuation in user text from changing the query.
function ftsQuery(text: string) {
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length === 0) throw new FilterError('invalid', '"text" needs at least one word');
  if (words.length > FILTER_LIMITS.words) {
    throw new FilterError('limit', `"text" accepts at most ${FILTER_LIMITS.words} words`);
  }
  return words.map((w) => `"${w}"`).join(' ');
}

const ROLES = [
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

/** Category ids for a role ("inbox"), a category id, or a folder/label name. */
function categoryIdsFor(value: string, accountIds: string[]): string[] {
  const categories = accountIds
    .map((id) => AccountStore.accountForId(id))
    .filter(Boolean)
    .flatMap((a) => CategoryStore.categories(a));
  const lower = value.toLowerCase();
  if (ROLES.includes(lower)) {
    return categories.filter((c) => c.role === lower).map((c) => c.id);
  }
  const byId = categories.filter((c) => c.id === value);
  if (byId.length) return byId.map((c) => c.id);
  const byName = categories.filter(
    (c) =>
      (c.displayName || c.name || '').toLowerCase() === lower ||
      (c.path || '').toLowerCase() === lower
  );
  if (byName.length) return byName.map((c) => c.id);
  throw new FilterError(
    'invalid',
    `"in": no folder or label "${value}"; use a role (${ROLES.join(', ')}), an id, or a name`
  );
}

// ── Compilation ─────────────────────────────────────────────────────────────

export type FilterTarget = 'Thread' | 'Message';

export interface CompileContext {
  /** Accounts the query is already scoped to; folder names and roles resolve within them. */
  accountIds: string[];
  /** Plugin id that `{ tagged: true }` refers to. */
  metadataPluginId?: string;
}

// Leaves are evaluated on messages or on threads. A message leaf in a thread query means "the
// thread has a message matching it"; a thread leaf in a message query means "the message's
// thread matches it".
const MESSAGE_LEAVES = new Set([
  'from',
  'to',
  'participant',
  'direction',
  'listUnsubscribe',
  'hasAttachment',
]);

function messageLeafSQL(key: string, value: any, ctx: CompileContext): string {
  switch (key) {
    case 'from':
      return contactsMatchSQL(['from'], list(value));
    case 'to':
      return contactsMatchSQL(['to', 'cc', 'bcc'], list(value));
    case 'participant':
      return contactsMatchSQL(['from', 'to', 'cc', 'bcc'], list(value));
    case 'direction': {
      const mine = knownAddresses();
      const sent = mine.length
        ? `lower(json_extract(\`Message\`.\`data\`, '$.from[0].email')) IN (${mine
            .map(sqlString)
            .join(', ')})`
        : '0';
      return value === 'sent' ? `(${sent})` : `(NOT ${sent})`;
    }
    case 'listUnsubscribe':
      return `(json_extract(\`Message\`.\`data\`, '$.hListUnsub') IS ${value ? 'NOT ' : ''}NULL)`;
    case 'hasAttachment': {
      const has =
        "EXISTS (SELECT 1 FROM json_each(`Message`.`data`, '$.files') AS `f` " +
        "WHERE json_extract(`f`.`value`, '$.contentId') IS NULL)";
      return value ? `(${has})` : `(NOT ${has})`;
    }
    default:
      throw new Error(`not a message leaf: ${key}`);
  }
}

function sharedLeafSQL(target: FilterTarget, key: string, value: any, ctx: CompileContext) {
  const t = `\`${target}\``;
  switch (key) {
    case 'subject':
      return `(lower(${t}.\`subject\`) LIKE ${sqlString(
        `%${likeEscape(value.toLowerCase())}%`
      )} ESCAPE '\\')`;
    case 'account':
      return `(${t}.\`accountId\` IN (${list(value).map(sqlString).join(', ')}))`;
    case 'unread':
    case 'starred':
      return `(${t}.\`${key}\` ${value ? '>' : '='} 0)`;
    case 'date':
      return dateSQL(
        target === 'Thread' ? '`Thread`.`lastMessageTimestamp`' : '`Message`.`date`',
        value
      );
    case 'tagged': {
      if (!ctx.metadataPluginId) throw new FilterError('invalid', '"tagged" is not available here');
      const ids = `SELECT \`id\` FROM \`ModelPluginMetadata\` WHERE \`value\` = ${sqlString(
        ctx.metadataPluginId
      )}`;
      return `(${t}.\`id\` ${value ? '' : 'NOT '}IN (${ids}))`;
    }
    default:
      return null;
  }
}

function threadLeafSQL(key: string, value: any, ctx: CompileContext): string {
  switch (key) {
    case 'in': {
      const ids = [...new Set(list(value).flatMap((v) => categoryIdsFor(v, ctx.accountIds)))];
      if (ids.length === 0) return '(0)';
      return `(\`Thread\`.\`id\` IN (SELECT \`id\` FROM \`ThreadCategory\` WHERE \`value\` IN (${ids
        .map(sqlString)
        .join(', ')})))`;
    }
    case 'text':
      return `(\`Thread\`.\`id\` IN (SELECT \`content_id\` FROM \`ThreadSearch\` WHERE \`ThreadSearch\` MATCH ${sqlString(
        ftsQuery(value)
      )}))`;
    case 'search': {
      try {
        return new (Matcher as any).StructuredSearch(SearchQueryParser.parse(value)).whereSQL({
          name: 'Thread',
        });
      } catch (err) {
        throw new FilterError('invalid', `"search": ${(err as Error).message}`);
      }
    }
    default:
      throw new Error(`not a thread leaf: ${key}`);
  }
}

const isMessageLeaf = (f: any) => MESSAGE_LEAVES.has(Object.keys(f)[0]);

function compileNode(target: FilterTarget, f: any, ctx: CompileContext): string {
  const [key] = Object.keys(f);
  const value = f[key];

  if (key === 'and') return `(${value.map((c) => compileNode(target, c, ctx)).join(' AND ')})`;
  if (key === 'not') return `(NOT ${compileNode(target, value, ctx)})`;
  if (key === 'or') {
    // "Thread has a message matching A, or one matching B" is the same as "thread has a message
    // matching A or B", so message leaves under an OR share one subquery.
    if (target === 'Thread') {
      const msg = value.filter(isMessageLeaf);
      const rest = value.filter((c) => !isMessageLeaf(c));
      const parts = rest.map((c) => compileNode(target, c, ctx));
      if (msg.length) {
        const inner = msg.map((c) => compileNode('Message', c, ctx)).join(' OR ');
        parts.push(threadHasMessage(inner));
      }
      return `(${parts.join(' OR ')})`;
    }
    return `(${value.map((c) => compileNode(target, c, ctx)).join(' OR ')})`;
  }

  const shared = sharedLeafSQL(target, key, value, ctx);
  if (shared) return shared;

  if (MESSAGE_LEAVES.has(key)) {
    const sql = messageLeafSQL(key, value, ctx);
    return target === 'Message' ? sql : threadHasMessage(sql);
  }
  const sql = threadLeafSQL(key, value, ctx);
  return target === 'Thread'
    ? sql
    : `(\`Message\`.\`threadId\` IN (SELECT \`Thread\`.\`id\` FROM \`Thread\` WHERE ${sql}))`;
}

const threadHasMessage = (messageSQL: string) =>
  `(\`Thread\`.\`id\` IN (SELECT \`Message\`.\`threadId\` FROM \`Message\` WHERE ${messageSQL}))`;

/** Compiles a validated filter to a WHERE fragment over `Thread` or `Message`. */
export function compileFilter(target: FilterTarget, filter: Filter, ctx: CompileContext): string {
  return compileNode(target, filter, ctx);
}

/**
 * A Matcher wrapping a compiled filter, so it composes with DatabaseStore queries and
 * QuerySubscription. `evaluate` returns true: QuerySubscription then treats every persisted
 * model as a possible match and refetches the range from SQL, which is the authority.
 */
export class FilterMatcher extends (Matcher as any) {
  private _sql: string;

  constructor(sql: string) {
    super(null, null, null);
    this._sql = sql;
  }
  attribute() {
    return null;
  }
  value() {
    return null;
  }
  evaluate() {
    return true;
  }
  whereSQL() {
    return this._sql;
  }
}
