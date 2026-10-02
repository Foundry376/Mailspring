import {
  AccountStore,
  DatabaseStore,
  Matcher,
  Message,
  SearchQueryParser,
  Thread,
} from 'mailspring-exports';
import { Grant, allowedAccountIds } from './grant';

/**
 * What a caller may ask for. The host turns this into a DatabaseStore query; callers never
 * supply SQL or Matchers, so they can't reach tables or columns outside their grant.
 */
export interface MailQuery {
  /** Mailspring search grammar, as typed in the search bar. */
  search?: string;
  accountId?: string;
  categoryId?: string;
  /** Messages only. */
  threadId?: string;
  ids?: string[];
  /** Only models carrying metadata under this plugin id. */
  metadataPluginId?: string;
  order?: 'newest' | 'oldest';
  limit: number;
  offset?: number;
}

// Restricts messages to those whose thread id is returned by `threadIdsSQL`. Search compiles
// only against the Thread table and its ThreadSearch FTS index, so message queries match
// messages whose *thread* matches: `from:uber.com` also returns my replies in those threads.
class MessageThreadMatcher extends (Matcher as any) {
  private _threadIdsSQL: string;

  constructor(threadIdsSQL: string) {
    super(null, null, null);
    this._threadIdsSQL = threadIdsSQL;
  }
  attribute() {
    return null;
  }
  value() {
    return null;
  }
  // QuerySubscription treats a persisted model that "matches" as a reason to refetch the
  // range from SQL, which is the authority here.
  evaluate() {
    return true;
  }
  whereSQL() {
    return `(\`Message\`.\`threadId\` IN (${this._threadIdsSQL}))`;
  }
}

function threadSearchWhereSQL(search: string): string {
  try {
    return new (Matcher as any).StructuredSearch(SearchQueryParser.parse(search)).whereSQL(Thread);
  } catch {
    return new (Matcher as any).Search(search).whereSQL(Thread);
  }
}

function scopedAccountIds(grant: Grant, accountId?: string) {
  const all = allowedAccountIds(
    grant,
    AccountStore.accounts().map((a) => a.id)
  );
  return accountId ? all.filter((id) => id === accountId) : all;
}

/**
 * Account scoping is pushed into SQL so `limit` counts allowed rows. Folder exclusion is not
 * (it isn't a simple equality on a thread's categories), so serializers filter afterwards and
 * a page can hold fewer than `limit` results when folders are excluded.
 */
export function threadQuery(grant: Grant, q: MailQuery) {
  let query = DatabaseStore.findAll<Thread>(Thread).where(
    Thread.attributes.accountId.in(scopedAccountIds(grant, q.accountId))
  );
  if (q.ids) query = query.where(Thread.attributes.id.in(q.ids));
  if (q.categoryId) query = query.where(Thread.attributes.categories.contains(q.categoryId));
  if (q.metadataPluginId) {
    query = query.where(Thread.attributes.pluginMetadata.contains(q.metadataPluginId));
  }
  if (q.search && q.search.trim()) {
    try {
      query = query.structuredSearch(SearchQueryParser.parse(q.search));
    } catch {
      query = query.search(q.search);
    }
  }
  const date = Thread.attributes.lastMessageReceivedTimestamp;
  return query
    .order(q.order === 'oldest' ? date.ascending() : date.descending())
    .offset(q.offset || 0)
    .limit(q.limit);
}

export function messageQuery(grant: Grant, q: MailQuery) {
  let query = DatabaseStore.findAll<Message>(Message).where([
    Message.attributes.accountId.in(scopedAccountIds(grant, q.accountId)),
    Message.attributes.draft.equal(false),
  ]);
  if (q.ids) query = query.where(Message.attributes.id.in(q.ids));
  if (q.threadId) query = query.where(Message.attributes.threadId.equal(q.threadId));
  if (q.metadataPluginId) {
    query = query.where(Message.attributes.pluginMetadata.contains(q.metadataPluginId));
  }
  if (q.categoryId) {
    const escaped = q.categoryId.replace(/'/g, "''");
    query = query.where(
      new MessageThreadMatcher(
        `SELECT \`id\` FROM \`ThreadCategory\` WHERE \`value\` = '${escaped}'`
      ) as any
    );
  }
  if (q.search && q.search.trim()) {
    const threadWhere = threadSearchWhereSQL(q.search);
    query = query.where(
      new MessageThreadMatcher(
        `SELECT \`Thread\`.\`id\` FROM \`Thread\` WHERE ${threadWhere}`
      ) as any
    );
  }
  const date = Message.attributes.date;
  return query
    .order(q.order === 'oldest' ? date.ascending() : date.descending())
    .offset(q.offset || 0)
    .limit(q.limit);
}
