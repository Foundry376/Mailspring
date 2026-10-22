import MailsyncBridge, { CrashTracker } from '../src/flux/mailsync-bridge';
import { Account } from '../src/flux/models/account';
import { AccountStore } from '../src/flux/stores/account-store';
import KeyManager from '../src/key-manager';

const ACCOUNT = { id: 'acct-1', settings: { imap_host: 'outlook.office365.com' } };
const CRASH = { code: null, signal: 'SIGABRT', error: new Error('Segmentation fault') };
const AUTH_FAILURE = {
  code: null,
  signal: 'SIGABRT',
  error: new Error('{"key":"ErrorAuthentication","debuginfo":"loginIfNeeded"}'),
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

  it('relaunches with a delay that doubles with each recent exit', () => {
    expect(tracker.relaunchDelay(ACCOUNT)).toBe(0);
    const delays = [];
    for (let i = 0; i < 4; i++) {
      tracker.recordClientCrash(ACCOUNT, CRASH);
      delays.push(tracker.relaunchDelay(ACCOUNT));
      now += delays[i];
    }
    expect(delays).toEqual([5000, 10000, 20000, 40000]);
    expect(tracker.tooManyFailures(ACCOUNT)).toBeFalsy();
  });

  it('gives up after five exits within the window', () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordClientCrash(ACCOUNT, CRASH);
      now += 60 * 1000;
    }
    expect(tracker.tooManyFailures(ACCOUNT)).toBe(true);
  });

  it('forgets exits older than the window', () => {
    for (let i = 0; i < 4; i++) {
      tracker.recordClientCrash(ACCOUNT, CRASH);
    }
    now += 31 * 60 * 1000;
    expect(tracker.relaunchDelay(ACCOUNT)).toBe(0);
    tracker.recordClientCrash(ACCOUNT, CRASH);
    expect(tracker.tooManyFailures(ACCOUNT)).toBeFalsy();
  });

  it('gives up after two authentication failures, which mailsync has already retried', () => {
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    expect(tracker.tooManyFailures(ACCOUNT)).toBeFalsy();
    now += 3 * 60 * 1000;
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    expect(tracker.tooManyFailures(ACCOUNT)).toBe(true);
  });

  it('starts over when the crashes are forgotten', () => {
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    tracker.recordClientCrash(ACCOUNT, AUTH_FAILURE);
    tracker.forgetCrashes(ACCOUNT);
    expect(tracker.tooManyFailures(ACCOUNT)).toBeFalsy();
    expect(tracker.relaunchDelay(ACCOUNT)).toBe(0);
  });
});

describe('MailsyncBridge pending relaunches', () => {
  let bridge: MailsyncBridge;
  let account: Account;

  beforeEach(() => {
    bridge = new MailsyncBridge();
    account = new Account({ id: 'acct-1', settings: { imap_host: 'outlook.office365.com' } });
    spyOn(AccountStore, 'accounts').andCallFake(() => [account]);
    spyOn(KeyManager, '_getKeyHash').andReturn(Promise.resolve({}));
    spyOn(bridge, '_launchClient');
    bridge._pendingRelaunches[account.id] = {
      timer: setTimeout(() => {}, 60 * 1000),
      credentials: bridge._credentialsKey(account),
    };
  });

  afterEach(() => bridge._cancelPendingRelaunch(account.id));

  it('waits for the pending relaunch while the account is unchanged', async () => {
    await bridge.ensureClients();
    expect(bridge._launchClient).not.toHaveBeenCalled();
  });

  it('launches at once when the account was reconnected', async () => {
    account.authedAt = new Date(Date.now() + 1000);
    await bridge.ensureClients();
    expect(bridge._launchClient).toHaveBeenCalled();
    expect(bridge._pendingRelaunches[account.id]).toBeUndefined();
  });
});
