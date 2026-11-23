import Sqlite3 from 'better-sqlite3';
import { SearchQueryParser } from 'mailspring-exports';
import LocalSearchQueryBackend from '../../../src/services/search/search-query-backend-local';

describe('LocalSearchQueryBackend', function () {
  let db;

  beforeEach(function () {
    db = new Sqlite3(':memory:');
    db.exec(`
      CREATE TABLE Thread (id TEXT PRIMARY KEY, unread INTEGER);
      CREATE TABLE Message (id TEXT PRIMARY KEY, threadId TEXT, data TEXT);
      CREATE VIRTUAL TABLE ThreadSearch USING fts5(tokenize = 'porter unicode61',
        content_id UNINDEXED, subject, to_, from_, categories, body);
    `);
    db.prepare('INSERT INTO Thread VALUES (?, ?)').run('t1', 1);
    db.prepare('INSERT INTO ThreadSearch VALUES (?, ?, ?, ?, ?, ?)').run(
      't1',
      'Hello',
      'me@example.com',
      'p39@example.invalid',
      'inbox',
      'body'
    );
    addMessage('t1', { from: ['p39@example.invalid'], to: ['me@example.com'] });
  });

  // Rows shaped as the sync engine writes them: Message.data holds from/to/cc/bcc as
  // [{name, email}], and ThreadSearch's to_/from_ hold each address and name after a space.
  const addMessage = (threadId: string, fields: { [field: string]: string[] }) => {
    const data = { from: [], to: [], cc: [], bcc: [] };
    for (const [field, emails] of Object.entries(fields)) {
      data[field] = emails.map((email) => ({ name: 'Someone', email }));
    }
    const id = `${threadId}-${db.prepare('SELECT count(*) AS n FROM Message').get().n}`;
    db.prepare('INSERT INTO Message VALUES (?, ?, ?)').run(id, threadId, JSON.stringify(data));
  };

  afterEach(function () {
    db.close();
  });

  const run = (query: string) => {
    const where = new LocalSearchQueryBackend('Thread').compile(SearchQueryParser.parse(query));
    return db
      .prepare(`SELECT id FROM Thread WHERE ${where}`)
      .all()
      .map((r) => r.id);
  };

  it('emits long OR chains flat so FTS5 does not overflow its parser stack', function () {
    const terms = Array.from(
      { length: 40 },
      (_, i) => `from:p${i}@example.invalid OR to:p${i}@x.test`
    );
    expect(run(terms.join(' OR '))).toEqual(['t1']);
  });

  it('emits long AND chains flat', function () {
    const words = Array.from({ length: 60 }, () => 'hello');
    expect(run(words.join(' '))).toEqual(['t1']);
  });

  it('keeps grouping when operators mix', function () {
    expect(run('(hello OR nothing) AND from:p39@example.invalid')).toEqual(['t1']);
    expect(run('(nothing OR missing) AND hello')).toEqual([]);
  });

  it('leaves out a date term it cannot read instead of emitting invalid SQL', function () {
    expect(run('before:foo')).toEqual(['t1']);
    expect(run('hello after:sometime-ish')).toEqual(['t1']);
    expect(run('nothing before:foo')).toEqual([]);
    expect(run('nothing OR before:foo')).toEqual([]);
    expect(run('hello OR before:foo')).toEqual(['t1']);
    expect(run('hello NOT before:foo')).toEqual(['t1']);
  });

  describe('from: and to: with a whole address', function () {
    const thread = (id: string, from: string[], to: string[], indexedFrom = from) => {
      db.prepare('INSERT INTO Thread VALUES (?, ?)').run(id, 0);
      db.prepare('INSERT INTO ThreadSearch VALUES (?, ?, ?, ?, ?, ?)').run(
        id,
        'Hello',
        ` ${to.join(' ')} Someone`,
        ` ${indexedFrom.join(' ')} Someone`,
        'inbox',
        'body'
      );
      addMessage(id, { from, to });
    };

    beforeEach(function () {
      thread('bob', ['bob@example.com'], ['me@example.com']);
      thread('alice.bob', ['alice.bob@example.com'], ['me@example.com']);
      thread('community', ['bob@example.community'], ['me@example.com']);
      thread('upper', ['Bob@Example.COM'], ['me@example.com']);
      thread('to-bob', ['alice.bob@example.com'], ['bob@example.com']);
      thread('to-alice.bob', ['me@example.com'], ['alice.bob@example.com']);
      thread('quoted', ["o'brien@example.com"], ['me@example.com']);
      // The sync engine leaves an address out of ThreadSearch when one it already indexed for
      // the thread starts with it (stringByAppendingOrSkipping in MailProcessor.cpp).
      thread(
        'skipped',
        ['bob@example.community', 'bob@example.com'],
        ['me@example.com'],
        ['bob@example.community']
      );
      addMessage('cc-bob', { to: ['me@example.com'], cc: ['bob@example.com'] });
      db.prepare('INSERT INTO Thread VALUES (?, ?)').run('cc-bob', 0);
      db.prepare('INSERT INTO ThreadSearch VALUES (?, ?, ?, ?, ?, ?)').run(
        'cc-bob',
        'Hello',
        ' me@example.com bob@example.com',
        ' alice@example.com',
        'inbox',
        'body'
      );
    });

    const sorted = (query: string) => run(query).sort();

    it('matches only that address, ignoring case', function () {
      expect(sorted('from:bob@example.com')).toEqual(['bob', 'skipped', 'upper']);
      expect(sorted('from:BOB@Example.com')).toEqual(['bob', 'skipped', 'upper']);
      expect(sorted(`from:o'brien@example.com`)).toEqual(['quoted']);
    });

    it('ignores ASCII case only, as SQLite lower() does', function () {
      thread('umlaut', ['JÖRG@example.de'], ['me@example.com']);
      expect(sorted('from:jÖrg@EXAMPLE.de')).toEqual(['umlaut']);
      expect(sorted('from:jörg@example.de')).toEqual([]);
    });

    it('keeps prefix matching for a value with brackets, separators or wildcards', function () {
      const prefixMatches = ['alice.bob', 'bob', 'community', 'skipped', 'to-bob', 'upper'];
      for (const value of ['<bob@example.com>', 'bob@example.com,', 'bob@example.com;']) {
        expect(sorted(`from:${value}`)).toEqual(prefixMatches);
      }
      expect(sorted('from:*@example.com')).toEqual(sorted('from:example.com'));
    });

    it('matches to: against the To, Cc and Bcc addresses', function () {
      expect(sorted('to:bob@example.com')).toEqual(['cc-bob', 'to-bob']);
    });

    it('keeps prefix matching for a partial address or a name', function () {
      expect(sorted('from:bob')).toEqual([
        'alice.bob',
        'bob',
        'community',
        'skipped',
        'to-bob',
        'upper',
      ]);
      expect(run('from:example.com')).toContain('community');
      expect(run('from:someone')).toContain('bob');
      expect(sorted('to:bob@example')).toEqual(['cc-bob', 'to-alice.bob', 'to-bob']);
    });

    it('combines with other terms', function () {
      expect(sorted('from:bob@example.com hello')).toEqual(['bob', 'skipped', 'upper']);
      expect(sorted('from:bob@example.com nothing')).toEqual([]);
      expect(sorted('from:bob@example.com OR from:alice.bob@example.com')).toEqual([
        'alice.bob',
        'bob',
        'skipped',
        'to-bob',
        'upper',
      ]);
      expect(sorted('from:alice.bob@example.com NOT to:bob@example.com')).toEqual(['alice.bob']);
      expect(sorted('hello NOT from:bob@example.com')).toEqual([
        'alice.bob',
        'cc-bob',
        'community',
        'quoted',
        't1',
        'to-alice.bob',
        'to-bob',
      ]);
      expect(sorted('from:bob@example.com is:unread')).toEqual([]);
      expect(sorted('(from:bob@example.com OR to:bob@example.com) AND from:bob')).toEqual([
        'bob',
        'skipped',
        'to-bob',
        'upper',
      ]);
    });

    it('compiles the terms MATCH can express around a whole address as one MATCH', function () {
      const where = new LocalSearchQueryBackend('Thread').compile(
        SearchQueryParser.parse('hello OR subject:hello OR from:bob OR from:bob@example.com')
      );
      expect(where.match(/ MATCH /g).length).toBe(2);
      expect(sorted('hello OR subject:hello OR from:bob OR from:bob@example.com')).toEqual(
        sorted('hello')
      );
    });

    it('compiles a long chain mixing whole and partial addresses', function () {
      const terms = Array.from({ length: 200 }, (_, i) =>
        i % 2 ? `from:p${i}@example.invalid` : `to:p${i}`
      );
      expect(run(terms.join(' OR '))).toEqual(['t1']);
      expect(sorted(`${terms.join(' OR ')} OR from:bob@example.com`)).toEqual([
        'bob',
        'skipped',
        't1',
        'upper',
      ]);
    });
  });

  describe('in:', function () {
    beforeEach(function () {
      db.exec(`
        CREATE TABLE Folder (id TEXT PRIMARY KEY, path TEXT, role TEXT);
        CREATE TABLE Label (id TEXT PRIMARY KEY, path TEXT, role TEXT);
        CREATE TABLE ThreadCategory (id TEXT, value TEXT);
      `);
      const folder = db.prepare('INSERT INTO Folder VALUES (?, ?, ?)');
      folder.run('f-inbox', 'INBOX', 'inbox');
      folder.run('f-spam', '[Gmail]/Spam', 'spam');
      folder.run('f-archive', "Bob's Archive", null);
      folder.run('f-work', 'INBOX/Work', null);
      folder.run('f-dotted', 'INBOX.Dotted', null);
      folder.run('f-snoozed', 'Mailspring/Snoozed', null);
      folder.run('f-utf7', 'INBOX/&AMk-t&AOk-', null);
      folder.run('f-under', 'INBOX/a_b', null);
      db.prepare('INSERT INTO Label VALUES (?, ?, ?)').run('l-political', 'Political Spam', null);

      const thread = db.prepare('INSERT INTO Thread VALUES (?, ?)');
      const search = db.prepare('INSERT INTO ThreadSearch VALUES (?, ?, ?, ?, ?, ?)');
      const category = db.prepare('INSERT INTO ThreadCategory VALUES (?, ?)');
      search.run('t1', 'Hello', '', '', 'inbox ', 'body');
      category.run('t1', 'f-inbox');
      for (const [id, categoryId, categories, subject] of [
        ['t2', 'f-spam', 'spam '],
        ['t3', 'l-political', 'Political Spam '],
        ['t4', 'f-archive', "Bob's Archive "],
        ['t5', 'f-work', 'INBOX/Work ', 'Other'],
        ['t6', 'f-dotted', 'INBOX.Dotted ', 'Other'],
        ['t7', 'f-snoozed', 'Mailspring/Snoozed ', 'Other'],
        ['t8', 'f-utf7', 'INBOX/&AMk-t&AOk- ', 'Other'],
        ['t9', 'f-under', 'INBOX/a_b ', 'Other'],
      ]) {
        thread.run(id, 0);
        search.run(id, subject || 'Hello', '', '', categories, 'body');
        category.run(id, categoryId);
      }
    });

    it('matches a category by its role or full path, not by a word of its name', function () {
      expect(run('in:spam')).toEqual(['t2']);
      expect(run('in:"Political Spam"')).toEqual(['t3']);
      expect(run('in:political')).toEqual([]);
    });

    it('ignores case', function () {
      expect(run('in:Inbox')).toEqual(['t1']);
      expect(run('in:"[gmail]/spam"')).toEqual(['t2']);
    });

    it('matches the name shown without a prefix such as INBOX/ (Category.displayName)', function () {
      expect(run('in:work')).toEqual(['t5']);
      expect(run('in:Dotted')).toEqual(['t6']);
      expect(run('in:Snoozed')).toEqual(['t7']);
      expect(run('in:"INBOX/Work"')).toEqual(['t5']);
      expect(run('in:ork')).toEqual([]);
    });

    it('matches a name with non-ASCII characters against its IMAP UTF-7 path', function () {
      expect(run('in:Été')).toEqual(['t8']);
      expect(run('in:"INBOX/&AMk-t&AOk-"')).toEqual(['t8']);
    });

    it('escapes quotes and LIKE wildcards in the name', function () {
      expect(run(`in:"Bob's Archive"`)).toEqual(['t4']);
      expect(run('in:a_b')).toEqual(['t9']);
      expect(run('in:a%')).toEqual([]);
    });

    it('combines with text and status terms', function () {
      expect(run('hello NOT (in:trash OR in:spam)').sort()).toEqual(['t1', 't3', 't4']);
      expect(run('in:(inbox OR spam) is:unread')).toEqual(['t1']);
      expect(run('hello OR in:spam').sort()).toEqual(['t1', 't2', 't3', 't4']);
      expect(run('in:spam OR in:work').sort()).toEqual(['t2', 't5']);
    });
  });
});
