import { isUnrecoverableDatabaseError } from '../src/database-corruption';

// The exact text SQLite produces for a damaged file, as it reaches each of the
// places that has to decide whether to rebuild the database.
const BETTER_SQLITE3_ERROR = new Error('SqliteError: database disk image is malformed');

// What MailsyncProcess.sync() builds from the crash the sync worker wrote to
// stderr before aborting: the Stanford exception logger's banner around what()`.
const MAILSYNC_CRASH_LOG = new Error(
  [
    '***',
    '*** Mailspring Sync ',
    '*** A C++ exception occurred during program execution: ',
    '*** database disk image is malformed',
    '***',
  ].join('\n')
);

// What `--mode reset` reports: runSingleFunctionAndExit puts what() in the JSON
// `error` field, and MailsyncProcess turns that into an Error.
const MAILSYNC_RESET_ERROR = new Error('database disk image is malformed');

describe('isUnrecoverableDatabaseError', () => {
  it('recognizes a corrupt database however the message reaches us', () => {
    expect(isUnrecoverableDatabaseError(BETTER_SQLITE3_ERROR)).toBe(true);
    expect(isUnrecoverableDatabaseError(MAILSYNC_CRASH_LOG)).toBe(true);
    expect(isUnrecoverableDatabaseError(MAILSYNC_RESET_ERROR)).toBe(true);
    expect(isUnrecoverableDatabaseError('database disk image is malformed')).toBe(true);
  });

  it('recognizes the other SQLite errors that a rebuild is the only fix for', () => {
    expect(isUnrecoverableDatabaseError(new Error('malformed database schema (Message)'))).toBe(
      true
    );
    expect(isUnrecoverableDatabaseError(new Error('file is not a database'))).toBe(true);
    expect(isUnrecoverableDatabaseError(new Error('file is encrypted or is not a database'))).toBe(
      true
    );
  });

  it('reads the log a mailsync error carries rather than only its message', () => {
    const error: any = new Error('An unknown error has occurred mailsync: 134.');
    error.rawLog = '*** database disk image is malformed';
    expect(isUnrecoverableDatabaseError(error)).toBe(true);
  });

  it('leaves recoverable and transient SQLite failures alone', () => {
    expect(isUnrecoverableDatabaseError(new Error('database is locked'))).toBe(false);
    expect(isUnrecoverableDatabaseError(new Error('database schema has changed'))).toBe(false);
    expect(isUnrecoverableDatabaseError(new Error('database or disk is full'))).toBe(false);
    expect(isUnrecoverableDatabaseError(new Error('attempt to write a readonly database'))).toBe(
      false
    );
  });

  it('leaves the sync errors that have nothing to do with the database alone', () => {
    expect(isUnrecoverableDatabaseError(new Error('Response Code: 401'))).toBe(false);
    expect(isUnrecoverableDatabaseError(new Error('ErrorAuthentication'))).toBe(false);
    expect(isUnrecoverableDatabaseError(undefined)).toBe(false);
    expect(isUnrecoverableDatabaseError(null)).toBe(false);
    expect(isUnrecoverableDatabaseError('')).toBe(false);
  });
});
