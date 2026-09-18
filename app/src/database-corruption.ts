/*
SQLite reports a handful of distinct problems with an `edgehill.db` that cannot be
repaired in place. Deleting and re-syncing the cache is the only recovery, so these
are the only messages that should trigger one - everything else SQLite reports
(`database is locked`, `database schema has changed`, `database or disk is full`)
is transient or resolves on retry.

- SQLITE_CORRUPT, the common case:      "database disk image is malformed"
- SQLITE_CORRUPT on the schema btree:   "malformed database schema (...)"
- SQLITE_NOTADB, a truncated or
  overwritten file header:              "file is not a database"
                                        "file is encrypted or is not a database"
*/
const UNRECOVERABLE_SQLITE_ERRORS = [
  /database disk image is malformed/i,
  /malformed database schema/i,
  /file is (?:encrypted or is )?not a database/i,
];

/*
Accepts anything that might carry a SQLite message: an Error from better-sqlite3,
the crash log mailsync wrote to stderr before aborting, or a mailsync JSON `error`
string. mailsync surfaces SQLite failures only as text, so matching the message is
the only signal available on that path. `rawLog` is checked because mailsync errors
built by MailsyncProcess carry the process output there rather than in the message.
*/
export function isUnrecoverableDatabaseError(err: unknown): boolean {
  if (err === null || err === undefined) return false;

  const candidates =
    typeof err === 'string'
      ? [err]
      : [`${err}`, (err as any).message, (err as any).rawLog].filter(
          (v): v is string => typeof v === 'string' && v.length > 0
        );

  return candidates.some((text) => UNRECOVERABLE_SQLITE_ERRORS.some((re) => re.test(text)));
}
