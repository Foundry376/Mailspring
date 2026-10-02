import { AccountStore, CategoryStore, DatabaseStore } from 'mailspring-exports';
import { messageQuery, MailQuery } from './queries';
import { Grant } from './grant';
import { identityReady, isMyAddress } from './identity';

export type Dim =
  | 'sender'
  | 'recipient'
  | 'category'
  | 'account'
  | 'thread'
  | 'year'
  | 'month'
  | 'week'
  | 'day'
  | 'weekday'
  | 'hour';

export const DIMS: Dim[] = [
  'sender',
  'recipient',
  'category',
  'account',
  'thread',
  'year',
  'month',
  'week',
  'day',
  'weekday',
  'hour',
];

const MAX_ROWS = 5000;

const localTime = (format: string) =>
  `strftime('${format}', \`Message\`.\`date\`, 'unixepoch', 'localtime')`;

// Each dimension is a SQL expression over the Message row, plus a join for the ones that fan
// out (a message with three recipients counts once per recipient). Person dimensions also
// carry a display name. `week` is SQLite's %W (Monday-based week of year), not a strict ISO
// 8601 week.
const DIM_SQL: { [dim in Dim]: { expr: string; join?: string; name?: string } } = {
  sender: {
    expr: `lower(json_extract(\`Message\`.\`data\`, '$.from[0].email'))`,
    name: `json_extract(\`Message\`.\`data\`, '$.from[0].name')`,
  },
  recipient: {
    expr: `lower(json_extract(\`r\`.\`value\`, '$.email'))`,
    join: `JOIN json_each(\`Message\`.\`data\`, '$.to') AS \`r\``,
    name: `json_extract(\`r\`.\`value\`, '$.name')`,
  },
  category: {
    expr: `\`tc\`.\`value\``,
    join: `JOIN \`ThreadCategory\` AS \`tc\` ON \`tc\`.\`id\` = \`Message\`.\`threadId\``,
  },
  account: { expr: `\`Message\`.\`accountId\`` },
  thread: { expr: `\`Message\`.\`threadId\`` },
  year: { expr: localTime('%Y') },
  month: { expr: localTime('%Y-%m') },
  week: { expr: localTime('%Y-W%W') },
  day: { expr: localTime('%Y-%m-%d') },
  weekday: { expr: `CAST(${localTime('%w')} AS INTEGER)` },
  hour: { expr: `CAST(${localTime('%H')} AS INTEGER)` },
};

/**
 * Message counts grouped by one or two dimensions, aggregated in SQL so callers don't pull
 * thousands of rows to count them. The WHERE clause comes from the same query builder as
 * message finds, so grants, filters and search behave identically.
 */
export async function countMessages(grant: Grant, q: MailQuery, dims: Dim[]) {
  await identityReady();
  const query = messageQuery(grant, { ...q, limit: undefined, offset: undefined });
  const where = (query as any)._whereClause();
  const joins = dims.map((d) => DIM_SQL[d].join).filter(Boolean);
  const selects = dims.map((d, i) => `${DIM_SQL[d].expr} AS k${i}`);
  dims.forEach((d, i) => {
    if (DIM_SQL[d].name) selects.push(`MAX(${DIM_SQL[d].name}) AS n${i}`);
  });
  const groups = dims.map((d, i) => `k${i}`);

  const sql =
    `SELECT ${selects.join(', ')}, COUNT(DISTINCT \`Message\`.\`id\`) AS count, ` +
    `MIN(\`Message\`.\`date\`) AS first, MAX(\`Message\`.\`date\`) AS last ` +
    `FROM \`Message\` ${joins.join(' ')} ${where} ` +
    `GROUP BY ${groups.join(', ')} ORDER BY count DESC LIMIT ${MAX_ROWS}`;

  const rows = await (DatabaseStore as any)._query(sql, [], q.background);
  const labelFor = labelLookup(dims);
  return rows.map((row) => {
    const key = {};
    const labels = {};
    const isMe = {};
    dims.forEach((d, i) => {
      key[d] = row[`k${i}`];
      const label = DIM_SQL[d].name ? row[`n${i}`] : labelFor[d] && labelFor[d](key[d]);
      if (label) labels[d] = label;
      if (DIM_SQL[d].name) isMe[d] = isMyAddress(key[d]);
    });
    return {
      key,
      labels,
      isMe,
      count: row.count,
      first: new Date(row.first * 1000).toISOString(),
      last: new Date(row.last * 1000).toISOString(),
    };
  });
}

// Readable names for id-valued dimensions, so a View can render "Receipts" rather than a
// category id without a second lookup.
function labelLookup(dims: Dim[]): { [dim: string]: (id: string) => string | undefined } {
  const lookups = {};
  if (dims.includes('category')) {
    const names = new Map<string, string>();
    for (const account of AccountStore.accounts()) {
      for (const c of CategoryStore.categories(account)) names.set(c.id, c.displayName || c.name);
    }
    lookups['category'] = (id: string) => names.get(id);
  }
  if (dims.includes('account')) {
    lookups['account'] = (id: string) => {
      const account = AccountStore.accountForId(id);
      return account ? account.label : undefined;
    };
  }
  return lookups;
}
