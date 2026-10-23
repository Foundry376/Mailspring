import _ from 'underscore';
import { Account, AccountStore } from 'mailspring-exports';
import MailsyncBridge from '../src/flux/mailsync-bridge';
import { MailsyncProcess } from '../src/mailsync-process';
import KeyManager from '../src/key-manager';
import { IdentityStore } from '../src/flux/stores/identity-store';

describe('MailsyncBridge account clients', function () {
  let accounts: Account[];
  let bridge: MailsyncBridge;

  const account = (settings: object) =>
    new Account({
      id: 'acct-1',
      emailAddress: 'ben@contoso.com',
      provider: 'office365',
      syncState: Account.SYNC_STATE_OK,
      settings,
    } as any);

  beforeEach(function () {
    accounts = [account({ imap_host: 'outlook.office365.com' })];
    spyOn(AccountStore, 'accounts').andCallFake(() => accounts);
    spyOn(KeyManager, '_getKeyHash').andReturn(Promise.resolve({}));
    spyOn(KeyManager, 'insertAccountSecrets').andCallFake((a) => Promise.resolve(a));
    spyOn(MailsyncProcess.prototype, 'sync');
    spyOn(MailsyncProcess.prototype, 'kill');
    // ensureClients is throttled at construction; run each call straight through.
    spyOn(_, 'throttle').andCallFake((fn) => fn);
    bridge = new MailsyncBridge();
  });

  it('leaves a running client alone when the account settings change', async function () {
    await bridge.ensureClients();
    const first = bridge.clients()['acct-1'];
    expect(first).toBeDefined();

    accounts = [account({ imap_host: 'outlook.office365.com', graph_send: true })];
    await bridge.ensureClients();
    expect(bridge.clients()['acct-1']).toBe(first);
    expect(MailsyncProcess.prototype.kill).not.toHaveBeenCalled();
  });

  it('relaunches a running client with the settings onboarding saved', async function () {
    await bridge.ensureClients();
    const first = bridge.clients()['acct-1'];

    await bridge._onRestartAccountSync(
      account({ imap_host: 'outlook.office365.com', graph_send: true })
    );
    const second = bridge.clients()['acct-1'];
    expect(second).not.toBe(first);
    expect((second.account as any).settings.graph_send).toBe(true);
    expect((MailsyncProcess.prototype.kill as jasmine.Spy).calls.length).toBe(1);
  });

  it('does not launch a client for an account it is not running', async function () {
    await bridge._onRestartAccountSync(account({ imap_host: 'outlook.office365.com' }));
    expect(bridge.clients()['acct-1']).toBeUndefined();
  });

  it('leaves an account alone while its cache is being reset', async function () {
    spyOn(IdentityStore, 'identity').andReturn(null);
    let finishReset: () => void;
    spyOn(MailsyncProcess.prototype, 'resetCache').andCallFake(
      () => new Promise<void>((resolve) => (finishReset = resolve))
    );
    await bridge.ensureClients();
    const resetting = bridge.resetCacheForAccount(accounts[0], { silent: true });
    await new Promise((resolve) => process.nextTick(resolve));
    const resetClient = bridge.clients()['acct-1'];

    await bridge._onRestartAccountSync(
      account({ imap_host: 'outlook.office365.com', graph_send: true })
    );
    expect(bridge.clients()['acct-1']).toBe(resetClient);

    finishReset();
    await resetting;
    expect(bridge.clients()['acct-1']).not.toBe(resetClient);
  });
});
