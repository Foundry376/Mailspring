import dns from 'dns';
import { AccountStore, MailsyncProcess } from 'mailspring-exports';
import { O365_SCOPES } from '../lib/onboarding-constants';
import {
  buildO365AccountFromAuthResponse,
  buildOutlookAccountFromAuthResponse,
  grantsGraphSend,
} from '../lib/onboarding-helpers';

const GRAPH_SEND_SCOPE =
  'openid profile email https://graph.microsoft.com/Contacts.ReadWrite ' +
  'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send ' +
  'https://graph.microsoft.com/User.Read';

// Answers the code exchange with `tokenScope` and Graph /me with a mailbox user.
function stubMicrosoft(tokenScope: string) {
  spyOn(window as any, 'fetch').andCallFake((url: string) => {
    if (url.startsWith('https://login.microsoftonline.com/')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access',
            refresh_token: 'refresh',
            id_token: '',
            scope: tokenScope,
          }),
      });
    }
    if (url === 'https://graph.microsoft.com/v1.0/me') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ displayName: 'Ada', mail: 'ada@contoso.com' }),
      });
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', text: () => '' });
  });
}

describe('Microsoft Graph sending', () => {
  beforeEach(() => {
    spyOn(dns, 'resolveMx').andCallFake((domain, callback) => callback(new Error('ENOTFOUND')));
    spyOn(dns.Resolver.prototype, 'resolveSrv').andCallFake((name, callback) =>
      callback(new Error('ENOTFOUND'))
    );
    spyOn(AccountStore, 'containerFolderDefaultGetter').andReturn('');
    spyOn(MailsyncProcess.prototype, 'test').andReturn(Promise.resolve());
  });

  it('requests the Graph mail scopes alongside IMAP and SMTP', () => {
    expect(O365_SCOPES).toContain('Mail.ReadWrite');
    expect(O365_SCOPES).toContain('Mail.Send');
    // Accounts that cannot send through Graph still sync over IMAP and send over SMTP.
    expect(O365_SCOPES).toContain('https://outlook.office.com/IMAP.AccessAsUser.All');
    expect(O365_SCOPES).toContain('https://outlook.office.com/SMTP.Send');
  });

  describe('grantsGraphSend', () => {
    it('requires both Mail.Send and Mail.ReadWrite', () => {
      expect(grantsGraphSend(GRAPH_SEND_SCOPE)).toBe(true);
      expect(grantsGraphSend('https://graph.microsoft.com/Mail.Send')).toBe(false);
      expect(grantsGraphSend('https://graph.microsoft.com/Mail.ReadWrite')).toBe(false);
      expect(grantsGraphSend('')).toBe(false);
      expect(grantsGraphSend(undefined)).toBe(false);
    });

    it('accepts scopes returned without the Graph resource prefix', () => {
      expect(grantsGraphSend('openid Mail.Send mail.readwrite User.Read')).toBe(true);
    });

    it('does not count the Outlook SMTP scope as Graph Mail.Send', () => {
      expect(
        grantsGraphSend(
          'https://outlook.office.com/SMTP.Send https://graph.microsoft.com/Mail.ReadWrite'
        )
      ).toBe(false);
    });
  });

  it('marks an Office 365 account to send through Graph when Mail.Send was granted', async () => {
    stubMicrosoft(GRAPH_SEND_SCOPE);
    const account = await buildO365AccountFromAuthResponse('code');
    expect(account.settings.graph_send).toBe(true);
    expect(account.sendsViaGraph()).toBe(true);
    // SMTP settings stay in place, the engine requires them and they document the account.
    expect(account.settings.smtp_host).toBeTruthy();
  });

  it('marks an Outlook.com account to send through Graph when Mail.Send was granted', async () => {
    stubMicrosoft(GRAPH_SEND_SCOPE);
    const account = await buildOutlookAccountFromAuthResponse('code');
    expect(account.sendsViaGraph()).toBe(true);
  });

  it('keeps SMTP when the user did not grant the Graph mail scopes', async () => {
    stubMicrosoft('openid profile email https://graph.microsoft.com/User.Read');
    const account = await buildO365AccountFromAuthResponse('code');
    expect(account.sendsViaGraph()).toBe(false);
  });

  it('keeps SMTP for a shared mailbox', async () => {
    stubMicrosoft(GRAPH_SEND_SCOPE);
    const account = await buildO365AccountFromAuthResponse('code', 'team@contoso.com');
    expect(account.emailAddress).toEqual('team@contoso.com');
    expect(account.sendsViaGraph()).toBe(false);
  });
});
