import { Account } from 'mailspring-exports';
import KeyManager from '../src/key-manager';
import { revokeOAuthGrant } from '../src/oauth-revocation';

const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

function accountFor(provider: string) {
  return new Account({ name: 'Test', emailAddress: 'me@example.com', provider, settings: {} });
}

describe('revokeOAuthGrant', function () {
  let fetchSpy: jasmine.Spy;

  beforeEach(function () {
    fetchSpy = spyOn(window as any, 'fetch').andCallFake(() =>
      Promise.resolve({ ok: true, status: 200, statusText: 'OK' })
    );
    spyOn(console, 'warn');
    // The refresh token lives in the OS keychain, which specs cannot reach.
    spyOn(KeyManager, 'insertAccountSecrets').andCallFake((account: Account) => {
      const next = account.clone();
      next.settings.refresh_token = 'stored-refresh-token';
      return Promise.resolve(next);
    });
  });

  it('posts the refresh token to Google for a gmail account', async function () {
    await revokeOAuthGrant(accountFor('gmail'));

    expect(fetchSpy.callCount).toBe(1);
    const [url, options] = fetchSpy.calls[0].args;
    expect(url).toBe(REVOKE_URL);
    expect(options.method).toBe('POST');
    expect(options.body).toBe('token=stored-refresh-token');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded;charset=UTF-8');
  });

  it('does not contact providers without a comparable revocation endpoint', async function () {
    await revokeOAuthGrant(accountFor('office365'));
    await revokeOAuthGrant(accountFor('outlook'));
    await revokeOAuthGrant(accountFor('imap'));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('makes no request when no refresh token was stored', async function () {
    (KeyManager.insertAccountSecrets as jasmine.Spy).andCallFake((account: Account) =>
      Promise.resolve(account)
    );
    await revokeOAuthGrant(accountFor('gmail'));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Account removal awaits this, so a rejection here would strand the account in place.
  it('resolves when the request cannot be made', async function () {
    fetchSpy.andCallFake(() => Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED')));
    await revokeOAuthGrant(accountFor('gmail'));

    expect(console.warn).toHaveBeenCalled();
  });

  it('resolves when the grant was already revoked', async function () {
    fetchSpy.andCallFake(() =>
      Promise.resolve({ ok: false, status: 400, statusText: 'Bad Request' })
    );
    await revokeOAuthGrant(accountFor('gmail'));

    expect(console.warn).toHaveBeenCalled();
  });
});
