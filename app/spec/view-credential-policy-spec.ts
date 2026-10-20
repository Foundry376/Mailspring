import {
  ViewCredential,
  RateLimiter,
  credentialBinding,
  credentialsFromManifest,
  headerValue,
  isCredentialURLAllowed,
  isTextualContentType,
  scrubBuffer,
  scrubString,
  secretVariants,
} from '../src/browser/view-credential-policy';

const SECRET = 'ghp_s3cretT0kenValue1234567890';

const manifest = (credentials: any[], network = ['api.github.com', '*.example.com']) => ({
  network,
  credentials,
});

const github: ViewCredential = credentialsFromManifest(
  manifest([{ id: 'github', label: 'GitHub token', hosts: ['api.github.com'] }])
)[0];

describe('view-credential-policy', () => {
  describe('credentialsFromManifest', () => {
    it('accepts a credential bound to granted hosts, with defaults', () => {
      expect(github).toEqual({
        id: 'github',
        label: 'GitHub token',
        hosts: ['api.github.com'],
        header: 'Authorization',
        format: 'Bearer {secret}',
        help: null,
        helpUrl: null,
      });
    });

    it('drops credentials bound to hosts outside the network grants', () => {
      expect(credentialsFromManifest(manifest([{ id: 'x', hosts: ['evil.example.org'] }]))).toEqual(
        []
      );
      // A wildcard credential host must match a wildcard grant exactly, not be covered by it.
      expect(credentialsFromManifest(manifest([{ id: 'x', hosts: ['*.github.com'] }]))).toEqual([]);
      const wildcard = credentialsFromManifest(manifest([{ id: 'x', hosts: ['*.example.com'] }]));
      expect(wildcard.map((c) => c.hosts)).toEqual([['*.example.com']]);
    });

    it('never binds to hosts that cannot be granted, even if listed in network', () => {
      const m = manifest([{ id: 'x', hosts: ['127.0.0.1'] }], ['127.0.0.1', 'localhost']);
      expect(credentialsFromManifest(m)).toEqual([]);
    });

    it('rejects denylisted and malformed headers', () => {
      for (const header of [
        'Cookie',
        'host',
        'Proxy-Authorization',
        'Sec-Fetch-Mode',
        'Origin',
        'X Bad',
      ]) {
        expect(
          credentialsFromManifest(manifest([{ id: 'x', hosts: ['api.github.com'], header }]))
        ).toEqual([]);
      }
      expect(
        credentialsFromManifest(
          manifest([
            { id: 'x', hosts: ['api.github.com'], header: 'X-Api-Key', format: '{secret}' },
          ])
        ).length
      ).toBe(1);
    });

    it('requires exactly one {secret} and no line breaks in the format', () => {
      for (const format of ['Bearer', '{secret} {secret}', 'Bearer {secret}\r\nX-Evil: 1']) {
        expect(
          credentialsFromManifest(manifest([{ id: 'x', hosts: ['api.github.com'], format }]))
        ).toEqual([]);
      }
    });

    it('rejects bad ids and duplicate ids, and non-https help links', () => {
      const c = credentialsFromManifest(
        manifest([
          { id: 'Bad Id', hosts: ['api.github.com'] },
          { id: 'ok', hosts: ['api.github.com'], helpUrl: 'javascript:alert(1)' },
          { id: 'ok', hosts: ['api.github.com'] },
        ])
      );
      expect(c.map((x) => x.id)).toEqual(['ok']);
      expect(c[0].helpUrl).toBe(null);
    });
  });

  describe('credentialBinding', () => {
    it('changes when hosts, header or format change, and not for label or help', () => {
      const base = credentialBinding(github);
      expect(credentialBinding({ ...github, label: 'Other', help: 'x' })).toBe(base);
      expect(credentialBinding({ ...github, hosts: ['api.github.com', 'x.example.com'] })).not.toBe(
        base
      );
      expect(credentialBinding({ ...github, header: 'X-Token' })).not.toBe(base);
      expect(credentialBinding({ ...github, format: 'token {secret}' })).not.toBe(base);
    });
  });

  describe('isCredentialURLAllowed', () => {
    it('allows only https on a bound host and the default port, without userinfo', () => {
      expect(isCredentialURLAllowed('https://api.github.com/user', github)).toBe(true);
      expect(isCredentialURLAllowed('https://API.GITHUB.COM/user', github)).toBe(true);
      expect(isCredentialURLAllowed('http://api.github.com/user', github)).toBe(false);
      expect(isCredentialURLAllowed('https://api.github.com:8443/user', github)).toBe(false);
      expect(isCredentialURLAllowed('https://u:p@api.github.com/user', github)).toBe(false);
      expect(isCredentialURLAllowed('https://github.com/user', github)).toBe(false);
      expect(isCredentialURLAllowed('https://api.github.com.evil.com/', github)).toBe(false);
      expect(isCredentialURLAllowed('wss://api.github.com/', github)).toBe(false);
      expect(isCredentialURLAllowed('not a url', github)).toBe(false);
    });
  });

  describe('scrubbing', () => {
    const variants = secretVariants(github, SECRET);
    const contains = (text: string) => text.includes(SECRET);

    it('redacts raw, header-value, URL-encoded and JSON-escaped echoes', () => {
      for (const echo of [
        SECRET,
        headerValue(github, SECRET),
        encodeURIComponent(headerValue(github, SECRET)),
        JSON.stringify({ authorization: `Bearer ${SECRET}` }),
      ]) {
        const { value, found } = scrubString(`before ${echo} after`, variants);
        expect(found).toBe(true);
        expect(contains(value)).toBe(false);
        expect(value.startsWith('before ')).toBe(true);
      }
    });

    it('redacts base64 and base64url echoes at any alignment, e.g. inside Basic auth', () => {
      for (const prefix of ['', 'u', 'us', 'user:', 'x']) {
        const b64 = Buffer.from(`${prefix}${SECRET}`).toString('base64');
        const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_');
        for (const encoded of [b64, b64url]) {
          const { value, found } = scrubString(encoded, variants);
          expect(found).toBe(true);
          // What's left can't be decoded back to the secret.
          expect(Buffer.from(value, 'base64').toString('utf8').includes(SECRET)).toBe(false);
        }
      }
    });

    it('keeps the length and leaves unrelated bytes alone', () => {
      const body = Buffer.from(`{"token":"${SECRET}","ok":true}`);
      const { body: out, found } = scrubBuffer(body, variants);
      expect(found).toBe(true);
      expect(out.length).toBe(body.length);
      expect(JSON.parse(out.toString()).ok).toBe(true);
      expect(scrubBuffer(Buffer.from('nothing to see'), variants).found).toBe(false);
    });

    it('ignores variants short enough to mangle ordinary text', () => {
      expect(secretVariants({ ...github, format: '{secret}' }, 'abc').length).toBe(0);
    });
  });

  it('treats JSON, text and XML as textual and binary types as base64', () => {
    expect(isTextualContentType('application/json; charset=utf-8')).toBe(true);
    expect(isTextualContentType('application/vnd.github+json')).toBe(true);
    expect(isTextualContentType('text/html')).toBe(true);
    expect(isTextualContentType('image/png')).toBe(false);
    expect(isTextualContentType('application/octet-stream')).toBe(false);
  });

  it('rate limits per key with a refilling bucket', () => {
    const limiter = new RateLimiter(60, 2);
    expect(limiter.take('v', 0)).toBe(true);
    expect(limiter.take('v', 0)).toBe(true);
    expect(limiter.take('v', 0)).toBe(false);
    expect(limiter.take('other', 0)).toBe(true);
    expect(limiter.take('v', 1000)).toBe(true);
  });
});
