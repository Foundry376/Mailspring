import Sqlite3 from 'better-sqlite3';
import { SearchQueryParser } from 'mailspring-exports';
import LocalSearchQueryBackend from '../../../src/services/search/search-query-backend-local';

describe('LocalSearchQueryBackend', function () {
  let db;

  beforeEach(function () {
    db = new Sqlite3(':memory:');
    db.exec(`
      CREATE TABLE Thread (id TEXT PRIMARY KEY, unread INTEGER);
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
  });

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
