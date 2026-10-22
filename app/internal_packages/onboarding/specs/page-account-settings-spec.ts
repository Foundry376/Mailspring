import dns from 'dns';
import { Account, AccountStore } from 'mailspring-exports';
import * as OnboardingActions from '../lib/onboarding-actions';
import { AccountBasicSettingsForm } from '../lib/page-account-settings';

// Answers the implicit-TLS IMAP and submission SRV queries for `domain` with `target`.
function stubSrvTarget(domain: string, target: string) {
  spyOn(dns.Resolver.prototype, 'resolveSrv').andCallFake((name, callback) => {
    if (name === `_imaps._tcp.${domain}`) {
      return callback(null, [{ priority: 0, weight: 1, port: 993, name: target }]);
    }
    if (name === `_submissions._tcp.${domain}`) {
      return callback(null, [{ priority: 0, weight: 1, port: 465, name: target }]);
    }
    callback(new Error('ENOTFOUND'));
  });
}

function formFor(emailAddress: string) {
  const account = new Account({
    name: 'Test',
    emailAddress,
    provider: 'imap',
    settings: { imap_password: 'secret' },
  } as any);
  const onConnect = jasmine.createSpy('onConnect');
  const form = new AccountBasicSettingsForm({
    account,
    errorFieldNames: [],
    submitting: false,
    onConnect,
    onFieldChange: () => {},
    onFieldKeyPress: () => {},
  });
  return { form, onConnect };
}

describe('AccountBasicSettingsForm submit', function basicSettingsSubmitTests() {
  beforeEach(() => {
    spyOn(dns, 'resolveMx').andCallFake((domain, callback) => callback(new Error('ENOTFOUND')));
    spyOn(window as any, 'fetch').andReturn(
      Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' })
    );
    spyOn(AccountStore, 'containerFolderDefaultGetter').andReturn('');
    spyOn(OnboardingActions, 'setAccount');
    spyOn(OnboardingActions, 'moveToPage');
  });

  it('asks the user to confirm out-of-domain SRV servers instead of connecting', async () => {
    stubSrvTarget('hosted.example', 'mail.provider.example');
    const { form, onConnect } = formFor('user@hosted.example');

    await form.submit();

    expect(onConnect).not.toHaveBeenCalled();
    expect(OnboardingActions.moveToPage).toHaveBeenCalledWith('account-settings-imap');
    const [account, options] = (OnboardingActions.setAccount as jasmine.Spy).mostRecentCall.args;
    expect(account.settings.imap_host).toEqual('mail.provider.example');
    expect(options).toEqual({ confirmServers: true });
  });

  it('connects directly to SRV servers within the email domain', async () => {
    stubSrvTarget('hosted.example', 'mail.hosted.example');
    const { form, onConnect } = formFor('user@hosted.example');

    await form.submit();

    expect(OnboardingActions.moveToPage).not.toHaveBeenCalled();
    expect(onConnect).toHaveBeenCalled();
    expect(onConnect.mostRecentCall.args[0].settings.imap_host).toEqual('mail.hosted.example');
    expect((OnboardingActions.setAccount as jasmine.Spy).mostRecentCall.args[1]).toEqual({
      confirmServers: false,
    });
  });
});
