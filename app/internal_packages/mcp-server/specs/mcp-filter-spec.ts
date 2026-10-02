import Sqlite3 from 'better-sqlite3';
import { AccountStore, CategoryStore } from 'mailspring-exports';
import {
  compileFilter,
  validateFilter,
  FilterError,
  FILTER_LIMITS,
} from '../lib/capabilities/filter';

// The compiled SQL runs against an in-memory copy of the tables it touches, so these specs
// check real SQLite semantics (json_each, LIKE escaping, FTS5) rather than string shapes.
const SCHEMA = `
  CREATE TABLE Thread (id TEXT PRIMARY KEY, accountId TEXT, subject TEXT, unread INTEGER,
    starred INTEGER, lastMessageTimestamp INTEGER);
  CREATE TABLE Message (id TEXT PRIMARY KEY, accountId TEXT, threadId TEXT, subject TEXT,
    unread INTEGER, starred INTEGER, draft INTEGER, date INTEGER, data TEXT);
  CREATE TABLE ThreadCategory (id TEXT, value TEXT);
  CREATE TABLE ModelPluginMetadata (id TEXT, value TEXT);
  CREATE VIRTUAL TABLE ThreadSearch USING fts5(tokenize = 'porter unicode61',
    content_id UNINDEXED, subject, to_, from_, categories, body);
`;

const ME = 'me@example.com';

function seed(db) {
  const thread = db.prepare('INSERT INTO Thread VALUES (?, ?, ?, ?, ?, ?)');
  const message = db.prepare('INSERT INTO Message VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)');
  const day = (d: string) => Math.floor(new Date(d).getTime() / 1000);
  const data = (o) => JSON.stringify({ from: [], to: [], cc: [], bcc: [], files: [], ...o });

  thread.run('t-uber', 'a1', 'Your Tuesday trip with Uber', 1, 0, day('2026-03-02'));
  message.run(
    'm-uber',
    'a1',
    't-uber',
    'Your Tuesday trip with Uber',
    1,
    0,
    day('2026-03-02'),
    data({ from: [{ email: 'noreply@uber.com', name: 'Uber' }], to: [{ email: ME }] })
  );

  thread.run('t-lyft', 'a1', 'Lyft ride receipt 100%_off', 0, 1, day('2025-06-01'));
  message.run(
    'm-lyft',
    'a1',
    't-lyft',
    'Lyft ride receipt 100%_off',
    0,
    1,
    day('2025-06-01'),
    data({
      from: [{ email: 'receipts@mail.lyft.com' }],
      to: [{ email: ME }],
      files: [{ id: 'f1', contentId: null }],
      hListUnsub: 'https://lyft.com/u',
    })
  );

  thread.run('t-bob', 'a2', 'Lunch?', 0, 0, day('2026-01-10'));
  message.run(
    'm-bob-1',
    'a2',
    't-bob',
    'Lunch?',
    0,
    0,
    day('2026-01-09'),
    data({
      from: [{ email: 'Bob@Example.net' }],
      to: [{ email: ME }],
      files: [{ id: 'f2', contentId: 'inline-logo' }],
    })
  );
  message.run(
    'm-bob-2',
    'a2',
    't-bob',
    'Re: Lunch?',
    0,
    0,
    day('2026-01-10'),
    data({
      from: [{ email: ME }],
      to: [{ email: 'bob@example.net' }],
      cc: [{ email: 'carol@x.org' }],
    })
  );

  db.prepare('INSERT INTO ThreadCategory VALUES (?, ?)').run('t-uber', 'cat-inbox');
  db.prepare('INSERT INTO ThreadCategory VALUES (?, ?)').run('t-bob', 'cat-receipts');
  db.prepare('INSERT INTO ModelPluginMetadata VALUES (?, ?)').run('t-bob', 'view:spec');
  db.prepare('INSERT INTO ThreadSearch VALUES (?, ?, ?, ?, ?, ?)').run(
    't-uber',
    'Your Tuesday trip with Uber',
    ME,
    'noreply@uber.com',
    'inbox',
    'Thanks for riding'
  );
  db.prepare('INSERT INTO ThreadSearch VALUES (?, ?, ?, ?, ?, ?)').run(
    't-lyft',
    'Lyft ride receipt',
    ME,
    'receipts@mail.lyft.com',
    '',
    'Rides and trips'
  );
}

describe('JSON mail filters', function () {
  let db;
  const ctx = { accountIds: ['a1', 'a2'], metadataPluginId: 'view:spec' };

  const threads = (filter) =>
    db
      .prepare(
        `SELECT id FROM Thread WHERE ${compileFilter('Thread', validateFilter(filter), ctx)} ORDER BY id`
      )
      .all()
      .map((r) => r.id);
  const messages = (filter) =>
    db
      .prepare(
        `SELECT id FROM Message WHERE ${compileFilter('Message', validateFilter(filter), ctx)} ORDER BY id`
      )
      .all()
      .map((r) => r.id);

  beforeEach(function () {
    db = new Sqlite3(':memory:');
    db.exec(SCHEMA);
    seed(db);
    spyOn(AccountStore, 'emailAddresses').andReturn([ME]);
    spyOn(AccountStore, 'accounts').andReturn([]);
    spyOn(AccountStore, 'accountForId').andCallFake((id) => ({ id }));
    spyOn(CategoryStore, 'categories').andCallFake((account) =>
      account.id === 'a1'
        ? [{ id: 'cat-inbox', role: 'inbox', displayName: 'Inbox' }]
        : [{ id: 'cat-receipts', role: null, displayName: 'Receipts', path: 'Receipts' }]
    );
  });

  afterEach(function () {
    db.close();
  });

  describe('addresses', function () {
    it('matches exact addresses case-insensitively', function () {
      expect(messages({ from: 'bob@example.net' })).toEqual(['m-bob-1']);
    });

    it('matches a domain and its subdomains, with or without @', function () {
      expect(messages({ from: 'lyft.com' })).toEqual(['m-lyft']);
      expect(messages({ from: '@uber.com' })).toEqual(['m-uber']);
      expect(messages({ from: ['uber.com', 'lyft.com'] })).toEqual(['m-lyft', 'm-uber']);
    });

    it('matches recipients across to, cc and bcc, and participants across all four', function () {
      expect(messages({ to: 'carol@x.org' })).toEqual(['m-bob-2']);
      expect(messages({ participant: 'bob@example.net' })).toEqual(['m-bob-1', 'm-bob-2']);
    });

    it('rejects domains with characters SQL LIKE would treat as wildcards', function () {
      expect(() => messages({ from: 'ub_r.com' })).toThrow();
      expect(() => messages({ from: 'ub%r.com' })).toThrow();
    });

    it('rejects values that are neither an address nor a domain', function () {
      expect(() => messages({ from: 'uber' })).toThrow();
    });
  });

  describe('message fields', function () {
    it('direction uses the user identity', function () {
      expect(messages({ direction: 'sent' })).toEqual(['m-bob-2']);
      expect(messages({ direction: 'received' })).toEqual(['m-bob-1', 'm-lyft', 'm-uber']);
    });

    it('hasAttachment ignores inline images', function () {
      expect(messages({ hasAttachment: true })).toEqual(['m-lyft']);
    });

    it('listUnsubscribe reads the stored header', function () {
      expect(messages({ listUnsubscribe: true })).toEqual(['m-lyft']);
    });

    it('in a thread query, means "has a message matching"', function () {
      expect(threads({ direction: 'sent' })).toEqual(['t-bob']);
      expect(threads({ or: [{ from: 'uber.com' }, { from: 'lyft.com' }] })).toEqual([
        't-lyft',
        't-uber',
      ]);
    });
  });

  describe('thread fields', function () {
    it('subject is a case-insensitive substring with wildcards escaped', function () {
      expect(threads({ subject: 'TRIP' })).toEqual(['t-uber']);
      expect(threads({ subject: '100%_off' })).toEqual(['t-lyft']);
      expect(threads({ subject: '100%%' })).toEqual([]);
    });

    it('in resolves roles, ids and names', function () {
      expect(threads({ in: 'inbox' })).toEqual(['t-uber']);
      expect(threads({ in: 'cat-receipts' })).toEqual(['t-bob']);
      expect(threads({ in: 'receipts' })).toEqual(['t-bob']);
      expect(threads({ in: 'trash' })).toEqual([]);
      expect(() => threads({ in: 'No Such Folder' })).toThrow();
    });

    it('text is stemmed full-text where every word must appear', function () {
      // Porter stemming: "riding" and "rides" both index as "ride".
      expect(threads({ text: 'riding' })).toEqual(['t-lyft', 't-uber']);
      expect(threads({ text: 'thanks' })).toEqual(['t-uber']);
      expect(threads({ text: 'receipt rides' })).toEqual(['t-lyft']);
      expect(threads({ text: 'ride "OR" NOT' })).toEqual([]);
    });

    it('in a message query, applies to the message thread', function () {
      expect(messages({ in: 'receipts' })).toEqual(['m-bob-1', 'm-bob-2']);
    });

    it('supports flags, accounts, dates and tagged', function () {
      expect(threads({ unread: true })).toEqual(['t-uber']);
      expect(threads({ starred: true })).toEqual(['t-lyft']);
      expect(threads({ account: 'a2' })).toEqual(['t-bob']);
      expect(threads({ date: { after: '2026-01-01' } })).toEqual(['t-bob', 't-uber']);
      expect(messages({ date: { after: '2026-01-01', before: '2026-01-10' } })).toEqual([
        'm-bob-1',
      ]);
      expect(threads({ tagged: true })).toEqual(['t-bob']);
      expect(threads({ tagged: false })).toEqual(['t-lyft', 't-uber']);
    });

    it('accepts search-bar syntax as a leaf', function () {
      expect(threads({ and: [{ search: 'is:unread' }, { account: 'a1' }] })).toEqual(['t-uber']);
    });
  });

  describe('combinators', function () {
    it('combines with and, or and not', function () {
      expect(threads({ and: [{ in: 'inbox' }, { not: { starred: true } }] })).toEqual(['t-uber']);
      expect(messages({ not: { or: [{ from: 'uber.com' }, { direction: 'sent' }] } })).toEqual([
        'm-bob-1',
        'm-lyft',
      ]);
    });

    it('handles large address lists in one subquery', function () {
      const many = Array.from({ length: 300 }, (_, i) => `person${i}@example.com`);
      expect(messages({ participant: [...many, 'bob@example.net'] })).toEqual([
        'm-bob-1',
        'm-bob-2',
      ]);
    });
  });

  describe('validation', function () {
    const code = (filter) => {
      try {
        validateFilter(filter);
      } catch (err) {
        expect(err instanceof FilterError).toBe(true);
        return err.code;
      }
      return null;
    };

    it('rejects malformed filters with a useful message', function () {
      expect(code({ from: 'a@b.com', to: 'c@d.com' })).toBe('invalid');
      expect(code({ fromm: 'a@b.com' })).toBe('invalid');
      expect(code({ and: [] })).toBe('invalid');
      expect(code({ unread: 'yes' })).toBe('invalid');
      expect(code({ date: {} })).toBe('invalid');
      expect(code({ date: { after: 'last tuesday' } })).toBe('invalid');
      expect(code([{ from: 'a@b.com' }])).toBe('invalid');
      expect(code({ direction: 'up' })).toBe('invalid');
    });

    it('enforces depth, term and value limits', function () {
      let deep: any = { unread: true };
      for (let i = 0; i < FILTER_LIMITS.depth; i++) deep = { not: deep };
      expect(code(deep)).toBe('limit');

      const wide = { or: Array.from({ length: FILTER_LIMITS.nodes }, () => ({ unread: true })) };
      expect(code(wide)).toBe('limit');

      const values = {
        from: Array.from({ length: FILTER_LIMITS.values + 1 }, (_, i) => `a${i}@b.com`),
      };
      expect(code(values)).toBe('limit');
    });

    it('rejects random garbage without throwing anything but FilterError', function () {
      const junk = [null, 1, 'x', true, {}, { and: [null] }, { not: [] }, { or: [{}] }, { in: [] }];
      for (const value of junk) {
        expect(code(value)).toBe('invalid');
      }
    });
  });
});
