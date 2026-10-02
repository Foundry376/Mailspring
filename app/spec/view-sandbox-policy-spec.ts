import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  viewIdForPartition,
  isViewOrigin,
  containedFile,
  networkGrantsFromManifest,
  hostMatchesGrants,
  isRequestAllowed,
  contentSecurityPolicy,
  proxyConfig,
  isProxyableImageURL,
  servableResourceType,
} from '../src/browser/view-sandbox-policy';

describe('view-sandbox-policy', () => {
  describe('viewIdForPartition', () => {
    it('accepts only well-formed View partitions', () => {
      expect(viewIdForPartition('persist:view-hello')).toBe('hello');
      expect(viewIdForPartition('persist:view-a-b-2')).toBe('a-b-2');
      expect(viewIdForPartition('persist:view-')).toBe(null);
      expect(viewIdForPartition('persist:view-../x')).toBe(null);
      expect(viewIdForPartition('persist:view-Hello')).toBe(null);
      expect(viewIdForPartition('view-hello')).toBe(null);
      expect(viewIdForPartition('persist:other')).toBe(null);
      expect(viewIdForPartition(undefined)).toBe(null);
    });
  });

  describe('isViewOrigin', () => {
    it('matches only the same View host on the View scheme', () => {
      expect(isViewOrigin('mailspring-view://hello/', 'hello')).toBe(true);
      expect(isViewOrigin('mailspring-view://hello/a/b.js?x#y', 'hello')).toBe(true);
      expect(isViewOrigin('mailspring-view://other/', 'hello')).toBe(false);
      expect(isViewOrigin('mailspring-view://hello.evil/', 'hello')).toBe(false);
      expect(isViewOrigin('https://hello/', 'hello')).toBe(false);
      expect(isViewOrigin('not a url', 'hello')).toBe(false);
    });
  });

  describe('containedFile', () => {
    let root: string;
    let outside: string;

    beforeEach(() => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), 'view-policy-'));
      root = path.join(base, 'bundle');
      outside = path.join(base, 'outside');
      fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(root, 'sub', 'ok.js'), '1');
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
      fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'));
      fs.symlinkSync(outside, path.join(root, 'linkdir'));
    });

    it('resolves files inside the root', () => {
      expect(containedFile(root, 'sub/ok.js')).toBe(
        fs.realpathSync(path.join(root, 'sub', 'ok.js'))
      );
    });

    it('rejects traversal, absolute paths, directories and missing files', () => {
      expect(containedFile(root, '../outside/secret.txt')).toBe(null);
      expect(containedFile(root, 'sub/../../outside/secret.txt')).toBe(null);
      expect(containedFile(root, path.join(outside, 'secret.txt'))).toBe(null);
      expect(containedFile(root, 'sub')).toBe(null);
      expect(containedFile(root, '')).toBe(null);
      expect(containedFile(root, 'missing.js')).toBe(null);
    });

    it('rejects symlinks that point outside the root', () => {
      expect(containedFile(root, 'link.txt')).toBe(null);
      expect(containedFile(root, 'linkdir/secret.txt')).toBe(null);
    });
  });

  describe('networkGrantsFromManifest', () => {
    it('keeps public DNS names and drops everything else', () => {
      expect(
        networkGrantsFromManifest({
          network: [
            'api.stripe.com',
            'API.GitHub.com',
            '*.example.org',
            'api.stripe.com',
            '127.0.0.1',
            'localhost',
            'printer.local',
            'x.test',
            'https://api.stripe.com',
            'api.stripe.com:443',
            'api.stripe.com/v1',
            '*',
            '*.com',
            'intranet',
            42,
          ],
        })
      ).toEqual(['api.stripe.com', 'api.github.com', '*.example.org']);
    });

    it('grants nothing for a missing or malformed field', () => {
      expect(networkGrantsFromManifest({})).toEqual([]);
      expect(networkGrantsFromManifest({ network: 'api.stripe.com' })).toEqual([]);
      expect(networkGrantsFromManifest(null)).toEqual([]);
    });
  });

  describe('hostMatchesGrants', () => {
    it('matches exact hosts and wildcard subdomains only', () => {
      const grants = ['api.stripe.com', '*.example.org'];
      expect(hostMatchesGrants('api.stripe.com', grants)).toBe(true);
      expect(hostMatchesGrants('API.STRIPE.COM.', grants)).toBe(true);
      expect(hostMatchesGrants('x.api.stripe.com', grants)).toBe(false);
      expect(hostMatchesGrants('api.stripe.com.evil.net', grants)).toBe(false);
      expect(hostMatchesGrants('evilapi.stripe.com', grants)).toBe(false);
      expect(hostMatchesGrants('a.example.org', grants)).toBe(true);
      expect(hostMatchesGrants('example.org', grants)).toBe(false);
      expect(hostMatchesGrants('badexample.org', grants)).toBe(false);
    });
  });

  describe('isRequestAllowed', () => {
    const grants = ['api.stripe.com'];

    it('allows the View origin and inert schemes', () => {
      expect(isRequestAllowed('mailspring-view://hello/view.js', 'hello', [])).toBe(true);
      expect(isRequestAllowed('data:text/plain,hi', 'hello', [])).toBe(true);
      expect(isRequestAllowed('blob:mailspring-view://hello/uuid', 'hello', [])).toBe(true);
    });

    it('refuses everything else when nothing is granted', () => {
      for (const url of [
        'mailspring-view://other/view.js',
        'http://127.0.0.1:2587/mcp',
        'https://example.com/',
        'file:///etc/hosts',
        'mailspring://plugins/',
        'ws://127.0.0.1:47123/',
      ]) {
        expect(isRequestAllowed(url, 'hello', [])).toBe(false);
      }
    });

    it('allows granted hosts only over HTTPS/WSS on the default port', () => {
      expect(isRequestAllowed('https://api.stripe.com/v1/customers', 'hello', grants)).toBe(true);
      expect(isRequestAllowed('wss://api.stripe.com/socket', 'hello', grants)).toBe(true);
      expect(isRequestAllowed('http://api.stripe.com/v1', 'hello', grants)).toBe(false);
      expect(isRequestAllowed('https://api.stripe.com:8443/v1', 'hello', grants)).toBe(false);
      expect(isRequestAllowed('https://u:p@api.stripe.com/v1', 'hello', grants)).toBe(false);
      expect(isRequestAllowed('https://api.stripe.com.evil.net/', 'hello', grants)).toBe(false);
    });
  });

  describe('contentSecurityPolicy', () => {
    it('forbids connections and inline script by default', () => {
      const csp = contentSecurityPolicy([]);
      expect(csp).toContain("connect-src 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toContain('unsafe-eval');
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    });

    it('lists granted hosts for connect-src and img-src', () => {
      const csp = contentSecurityPolicy(['api.stripe.com']);
      expect(csp).toContain('connect-src https://api.stripe.com wss://api.stripe.com');
      expect(csp).toMatch(/img-src [^;]*https:\/\/api\.stripe\.com/);
    });
  });

  describe('proxyConfig', () => {
    it('sends ungranted hosts, including loopback, to a dead proxy', () => {
      const config = proxyConfig(['api.stripe.com']);
      expect(config.mode).toBe('fixed_servers');
      expect(config.proxyBypassRules.split(',')).toEqual(['<-loopback>', 'api.stripe.com']);
      expect(config.proxyRules).toContain('127.0.0.1:9');
    });
  });

  describe('isProxyableImageURL', () => {
    it('allows public http(s) image hosts', () => {
      expect(isProxyableImageURL('https://static.nytimes.com/images/a.png')).toBe(true);
      expect(isProxyableImageURL('http://email.example.com/pixel.gif')).toBe(true);
      expect(isProxyableImageURL('https://93.184.216.34/a.png')).toBe(true);
    });

    it('refuses local, private and non-http targets', () => {
      for (const url of [
        'http://127.0.0.1:2587/mcp',
        'http://localhost/a.png',
        'http://10.0.0.5/a.png',
        'http://192.168.1.1/a.png',
        'http://172.20.0.1/a.png',
        'http://169.254.169.254/latest/meta-data',
        'http://[::1]/a.png',
        'http://[fd00::1]/a.png',
        'http://printer.local/a.png',
        'http://intranet/a.png',
        'file:///etc/passwd',
        'ftp://example.com/a.png',
        'https://user:pass@example.com/a.png',
        'not a url',
      ]) {
        expect(isProxyableImageURL(url)).toBe(false);
      }
    });
  });

  describe('servableResourceType', () => {
    it('passes image types and makes everything else opaque', () => {
      expect(servableResourceType('image/png')).toBe('image/png');
      expect(servableResourceType('IMAGE/JPEG; charset=binary')).toBe('image/jpeg');
      expect(servableResourceType('text/html')).toBe('application/octet-stream');
      expect(servableResourceType('application/pdf')).toBe('application/octet-stream');
      expect(servableResourceType(null)).toBe('application/octet-stream');
    });
  });
});
