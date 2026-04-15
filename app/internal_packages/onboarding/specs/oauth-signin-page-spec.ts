import { extractOAuthCodeFromUrl } from '../lib/oauth-signin-page';

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
