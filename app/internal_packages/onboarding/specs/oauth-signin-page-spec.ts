import { Account } from 'mailspring-exports';
import * as OnboardingActions from '../lib/onboarding-actions';
import OAuthSignInPage, {
  extractOAuthCodeFromUrl,
  extractOAuthStateFromUrl,
  oauthStateIsValid,
} from '../lib/oauth-signin-page';
import { createOAuthState } from '../lib/onboarding-constants';

describe('extractOAuthCodeFromUrl', function extractOAuthCodeTests() {
  it('extracts a standard Google OAuth code with a slash', () => {
    // Google codes typically look like 4/0AX4XfWi... with the slash percent-encoded
    expect(extractOAuthCodeFromUrl('/?code=4%2F0AX4XfWiTest')).toEqual('4/0AX4XfWiTest');
  });

  it('preserves a literal + in the authorization code', () => {
    // This is the key regression test: querystring.parse (used by url.parse with
    // parseQueryString=true) decodes + as space per application/x-www-form-urlencoded,
    // but in a URL query string + is a valid literal character per RFC 3986.
    expect(extractOAuthCodeFromUrl('/?code=4%2F0AeanS0m+test123')).toEqual('4/0AeanS0m+test123');
  });

  it('decodes %2B as + (percent-encoded plus)', () => {
    expect(extractOAuthCodeFromUrl('/?code=4%2F0AeanS0m%2Btest123')).toEqual('4/0AeanS0m+test123');
  });

  it('handles code with other query parameters present', () => {
    expect(extractOAuthCodeFromUrl('/?state=xyz&code=4%2F0AX4XfWi&scope=email')).toEqual(
      '4/0AX4XfWi'
    );
  });

  it('returns null when no code parameter is present', () => {
    expect(extractOAuthCodeFromUrl('/?error=access_denied')).toEqual(null);
  });

  it('returns null for a bare path with no query string', () => {
    expect(extractOAuthCodeFromUrl('/')).toEqual(null);
  });

  it('returns null for a malformed percent-encoded code instead of throwing', () => {
    expect(extractOAuthCodeFromUrl('/?code=4%2F0AeanS0m%ZZbad')).toEqual(null);
  });
});

describe('OAuth state validation', function oauthStateTests() {
  it('extracts the state from a Google redirect at the root path', () => {
    expect(extractOAuthStateFromUrl('/?code=4%2F0AX4XfWi&state=abc123&scope=email')).toEqual(
      'abc123'
    );
  });

  it('extracts the state from an O365 redirect at the /desktop path', () => {
    expect(extractOAuthStateFromUrl('/desktop?code=M.R3_BAY.abc&state=abc123')).toEqual('abc123');
  });

  it('returns null when no state parameter is present', () => {
    expect(extractOAuthStateFromUrl('/?code=4%2F0AX4XfWi')).toEqual(null);
  });

  it('accepts a callback whose state matches the value that was sent', () => {
    const state = createOAuthState();
    const requestUrl = `/?code=4%2F0AX4XfWi&state=${encodeURIComponent(state)}`;
    expect(oauthStateIsValid(extractOAuthStateFromUrl(requestUrl))).toBe(true);
    expect(extractOAuthCodeFromUrl(requestUrl)).toEqual('4/0AX4XfWi');
  });

  it('rejects a callback with no state parameter', () => {
    expect(oauthStateIsValid(extractOAuthStateFromUrl('/?code=4%2F0AX4XfWi'))).toBe(false);
  });

  it('rejects a callback whose state does not match', () => {
    const state = createOAuthState();
    const requestUrl = `/desktop?code=M.R3_BAY.abc&state=${encodeURIComponent(state)}x`;
    expect(oauthStateIsValid(extractOAuthStateFromUrl(requestUrl))).toBe(false);
  });

  it('rejects a state that is the same length as the expected value', () => {
    const state = createOAuthState();
    expect(oauthStateIsValid('a'.repeat(state.length))).toBe(false);
  });

  it('rejects a callback carrying the state from an earlier authorization URL', () => {
    const earlier = createOAuthState();
    const latest = createOAuthState();
    expect(oauthStateIsValid(earlier)).toBe(false);
    expect(oauthStateIsValid(latest)).toBe(true);
  });
});

describe('OAuthSignInPage when the server certificate is rejected', function oauthCertificateTests() {
  it('shows the certificate review with the account it built', async () => {
    spyOn(OnboardingActions, 'setAccount');
    spyOn(OnboardingActions, 'moveToPage');
    spyOn(AppEnv, 'focus');
    spyOn(AppEnv, 'reportError');
    const account = new Account({ provider: 'gmail', settings: { refresh_token: 'rt' } } as any);
    const certificates = [
      { service: 'imap', host: 'imap.gmail.com', port: 993, sha256: 'aa', chain: [] },
    ];
    const err = Object.assign(new Error('Certificate Error (IMAP)'), { certificates, account });
    const page = new OAuthSignInPage({
      buildAccountFromAuthResponse: () => Promise.reject(err),
      onSuccess: jasmine.createSpy('onSuccess'),
    } as any);
    page._mounted = true;
    page.setState = () => {};

    await page._onReceivedCode('code');

    expect(OnboardingActions.setAccount).toHaveBeenCalledWith(account, {
      rejectedCertificates: certificates,
    });
    expect(OnboardingActions.moveToPage).toHaveBeenCalledWith('account-certificate');
    expect(AppEnv.reportError).not.toHaveBeenCalled();
  });
});
