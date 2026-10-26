import { CrashTracker } from '../src/flux/mailsync-bridge';
import { Account } from '../src/flux/models/account';

const ACCOUNT = { id: 'acct-1', settings: { imap_host: 'outlook.office365.com' }, authedAt: 1 };
const CRASH = { code: null, signal: 'SIGABRT', error: new Error('Segmentation fault') };
const AUTH_FAILURE = {
  code: null,
  signal: 'SIGABRT',
  error: new Error('{"key":"ErrorAuthentication","debuginfo":"loginIfNeeded"}'),
};
const CERTIFICATE_FAILURE = {
  code: null,
  signal: 'SIGABRT',
  error: new Error(
    '{"key":"ErrorCertificate","debuginfo":"syncFoldersAndLabels - fetchAllFolders"}'
  ),
};

describe('CrashTracker', () => {
  let now: number;
  let tracker: CrashTracker;

  beforeEach(() => {
    now = 1_000_000_000;
    spyOn(Date, 'now').andCallFake(() => now);
    spyOn(console, 'log');
    tracker = new CrashTracker();
  });

  it('gives up after five exits within five minutes', () => {
    for (let i = 0; i < 4; i++) {
      tracker.recordClientCrash(ACCOUNT, CRASH);
      now += 30 * 1000;
    }
    expect(tracker.tooManyFailures(ACCOUNT)).toBeFalsy();
    tracker.recordClientCrash(ACCOUNT, CRASH);
    expect(tracker.tooManyFailures(ACCOUNT)).toBe(true);
  });

  it('keeps relaunching when the exits are spread out', () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordClientCrash(ACCOUNT, CRASH);
      now += 2 * 60 * 1000;
    }
    expect(tracker.tooManyFailures(ACCOUNT)).toBeFalsy();
  });

  it('gives up after two authentication failures, which mailsync has already retried', () => {
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    expect(tracker.tooManyFailures(ACCOUNT)).toBeFalsy();
    now += 3 * 60 * 1000;
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    expect(tracker.tooManyFailures(ACCOUNT)).toBe(true);
  });

  it('gives up after two certificate failures, which only reconnecting can resolve', () => {
    tracker.recordClientCrash(ACCOUNT, CERTIFICATE_FAILURE);
    tracker.recordClientCrash(ACCOUNT, CERTIFICATE_FAILURE);
    expect(tracker.tooManyFailures(ACCOUNT)).toBe(true);
  });

  it('forgets authentication failures older than thirty minutes', () => {
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    now += 31 * 60 * 1000;
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    expect(tracker.tooManyFailures(ACCOUNT)).toBeFalsy();
  });

  it('starts over when the account is reconnected with the same secrets', () => {
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    expect(tracker.tooManyFailures({ ...ACCOUNT, authedAt: 2 })).toBeFalsy();
  });

  it('keys on the authedAt that Account.toJSON produces', () => {
    const account = new Account({ id: 'acct-1', settings: {}, authedAt: new Date(1000) });
    tracker.recordClientCrash(account.toJSON(), AUTH_FAILURE);
    tracker.recordClientCrash(account.toJSON(), AUTH_FAILURE);
    expect(tracker.tooManyFailures(account.toJSON())).toBe(true);
    account.authedAt = new Date(2000);
    expect(tracker.tooManyFailures(account.toJSON())).toBeFalsy();
  });
});
