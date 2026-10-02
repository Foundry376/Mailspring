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
});
