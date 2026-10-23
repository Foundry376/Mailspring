import dns from 'dns';
import { AccountStore, MailsyncProcess } from 'mailspring-exports';
import { O365_SCOPES } from '../lib/onboarding-constants';
import { extractOAuthErrorFromUrl } from '../lib/oauth-signin-page';
import {
  buildO365AuthURL,
  buildO365AccountFromAuthResponse,
  buildOutlookAccountFromAuthResponse,
  grantsGraphSend,
} from '../lib/onboarding-helpers';

const GRAPH_SEND_SCOPE =
  'openid profile email https://graph.microsoft.com/Contacts.ReadWrite ' +
  'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send ' +
  'https://graph.microsoft.com/User.Read';

const scopesOf = (authURL: string) => (new URL(authURL).searchParams.get('scope') || '').split(' ');

// Answers the code exchange with `tokenScope` and Graph /me with a mailbox user. Returns the
// form bodies sent to the token endpoint.
function stubMicrosoft(tokenScope: string) {
  const tokenRequests: URLSearchParams[] = [];
  spyOn(window as any, 'fetch').andCallFake((url: string, init: any) => {
    if (url.startsWith('https://login.microsoftonline.com/')) {
      tokenRequests.push(new URLSearchParams(init.body));
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
  return tokenRequests;
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
    const scopes = scopesOf(buildO365AuthURL());
    expect(scopes).toContain('Mail.ReadWrite');
    expect(scopes).toContain('Mail.Send');
    // Accounts that cannot send through Graph still sync over IMAP and send over SMTP.
    expect(scopes).toContain('https://outlook.office.com/IMAP.AccessAsUser.All');
    expect(scopes).toContain('https://outlook.office.com/SMTP.Send');
  });

  it('can sign in with only the permissions Mailspring asked for before Graph sending', () => {
    const scopes = scopesOf(buildO365AuthURL({ withGraphSend: false }));
    expect(scopes).not.toContain('Mail.ReadWrite');
    expect(scopes).not.toContain('Mail.Send');
    expect(scopes.sort()).toEqual([...O365_SCOPES].sort());
  });

  it('exchanges the code for the Graph mail scopes it asked the user to approve', async () => {
    const tokenRequests = stubMicrosoft(GRAPH_SEND_SCOPE);
    const account = await buildO365AccountFromAuthResponse('code');
    expect(tokenRequests[0].get('scope')).toContain('Mail.Send');
    expect(tokenRequests[0].get('scope')).not.toContain('outlook.office.com');
    expect(account.sendsViaGraph()).toBe(true);
  });

  it('exchanges the code without them after signing in without Graph sending', async () => {
    const tokenRequests = stubMicrosoft('openid https://graph.microsoft.com/User.Read');
    const account = await buildO365AccountFromAuthResponse('code', { withGraphSend: false });
    expect(tokenRequests[0].get('scope')).not.toContain('Mail.Send');
    expect(tokenRequests[0].get('scope')).not.toContain('Mail.ReadWrite');
    expect(account.sendsViaGraph()).toBe(false);
  });

  describe('extractOAuthErrorFromUrl', () => {
    it("reads Microsoft's reason without the trace ids", () => {
      expect(
        extractOAuthErrorFromUrl(
          '/desktop?error=access_denied&error_description=AADSTS65004%3a+User+declined+to+consent+to+access+the+app.%0d%0aTrace+ID%3a+abc&state=x'
        )
      ).toEqual('AADSTS65004: User declined to consent to access the app.');
    });

    it('falls back to the error code, and ignores a successful redirect', () => {
      expect(extractOAuthErrorFromUrl('/desktop?error=access_denied&state=x')).toEqual(
        'access_denied'
      );
      expect(extractOAuthErrorFromUrl('/desktop?code=abc&state=x')).toBe(null);
    });
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
    const account = await buildO365AccountFromAuthResponse('code', {
      sharedMailboxAddress: 'team@contoso.com',
    });
    expect(account.emailAddress).toEqual('team@contoso.com');
    expect(account.sendsViaGraph()).toBe(false);
  });
});
