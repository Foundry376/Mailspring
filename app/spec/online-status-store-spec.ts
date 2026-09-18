import OnlineStatusStore from '../src/flux/stores/online-status-store';

const ACCT_A = 'account-a';
const ACCT_B = 'account-b';

describe('OnlineStatusStore', () => {
  beforeEach(() => {
    (OnlineStatusStore as any)._offlineProcesses = {};
    spyOn(OnlineStatusStore, 'onMayBeOnline');
  });

  it('is online until a sync process reports a connection error', () => {
    expect(OnlineStatusStore.isOnline()).toBe(true);

    OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_A, connectionError: true });
    expect(OnlineStatusStore.isOnline()).toBe(false);
    expect(OnlineStatusStore.offlineAccountIds()).toEqual([ACCT_A]);

    OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_A, connectionError: false });
    expect(OnlineStatusStore.isOnline()).toBe(true);
    expect(OnlineStatusStore.offlineAccountIds()).toEqual([]);
  });

  it('stays offline while any one account is still failing', () => {
    OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_A, connectionError: true });
    OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_B, connectionError: true });
    OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_A, connectionError: false });

    expect(OnlineStatusStore.isOnline()).toBe(false);
    expect(OnlineStatusStore.offlineAccountIds()).toEqual([ACCT_B]);
  });

  it('notifies listeners whenever the set of offline accounts changes', () => {
    spyOn(OnlineStatusStore, 'trigger');

    OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_A, connectionError: true });
    expect((OnlineStatusStore.trigger as any).callCount).toBe(1);

    // A repeat of the state we already hold is not a change.
    OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_A, connectionError: true });
    expect((OnlineStatusStore.trigger as any).callCount).toBe(1);

    // Still offline overall, but the banner names the accounts so it must re-render.
    OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_B, connectionError: true });
    expect((OnlineStatusStore.trigger as any).callCount).toBe(2);
  });

  describe('when a sync process stops', () => {
    // A replacement process starts out believing it is online and only emits
    // ProcessState when its connection state changes, so it never sends the
    // `connectionError: false` that would clear the account. Holding onto the dead
    // process's state left the app showing "connection issues" until it restarted.
    it('forgets what that process last reported', () => {
      OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_A, connectionError: true });
      expect(OnlineStatusStore.isOnline()).toBe(false);

      OnlineStatusStore.onSyncProcessStopped(ACCT_A);
      expect(OnlineStatusStore.isOnline()).toBe(true);
      expect(OnlineStatusStore.offlineAccountIds()).toEqual([]);
    });

    it('leaves the other accounts alone', () => {
      OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_A, connectionError: true });
      OnlineStatusStore.onSyncProcessStateReceived({ accountId: ACCT_B, connectionError: true });

      OnlineStatusStore.onSyncProcessStopped(ACCT_A);
      expect(OnlineStatusStore.isOnline()).toBe(false);
      expect(OnlineStatusStore.offlineAccountIds()).toEqual([ACCT_B]);
    });

    it('does nothing when that account was not marked offline', () => {
      spyOn(OnlineStatusStore, 'trigger');
      OnlineStatusStore.onSyncProcessStopped(ACCT_A);
      expect((OnlineStatusStore.trigger as any).callCount).toBe(0);
      expect(OnlineStatusStore.isOnline()).toBe(true);
    });
  });
});
