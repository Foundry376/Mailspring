import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Account } from 'mailspring-exports';
import * as OnboardingActions from '../lib/onboarding-actions';
import * as OnboardingHelpers from '../lib/onboarding-helpers';
import AccountCertificatePage from '../lib/page-account-certificate';
import { RejectedCertificate } from '../lib/certificate-review';

// Self-signed, issued for mail.example.test and 127.0.0.1.
const LEAF =
  'MIIBszCCAVmgAwIBAgIUFNSYT/wtx+EKJzxskdX2s7Kh2u8wCgYIKoZIzj0EAwIwHDEaMBgGA1UEAwwRbWFpbC5leGFtcGxlLnRlc3QwIBcNMjYxMDIzMTY0MzA4WhgPMjEyNjA5MjkxNjQzMDhaMBwxGjAYBgNVBAMMEW1haWwuZXhhbXBsZS50ZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE8KbAJYwjbLVnUaFfC6ZkOd1JyF0vQaXWvjUJDkpX9chmr4ML6MORZsAoPz2aNPkFj5PSDWVacXZ8r1xuQTkx2qN3MHUwHQYDVR0OBBYEFKImM+p01K1GNwq77f5zC0NelctmMB8GA1UdIwQYMBaAFKImM+p01K1GNwq77f5zC0NelctmMCIGA1UdEQQbMBmCEW1haWwuZXhhbXBsZS50ZXN0hwR/AAABMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhANavyl+L2JcH3Wwj/1aMBlLF2FQToSX1h6YLw6TOcAmpAiAZ5LmK/4sQbJsgsIZcjPAF6uTXwEAAeGil8CvIZFa/JA==';
const LEAF_SHA256 = '375b274a05a9e84141ea411d8516b28028e705c273b3ddacdfc268ac0300b050';

const bridgeCertificates: RejectedCertificate[] = [
  { service: 'imap', host: '127.0.0.1', port: 1143, sha256: LEAF_SHA256, chain: [LEAF] },
  { service: 'smtp', host: '127.0.0.1', port: 1025, sha256: LEAF_SHA256, chain: [LEAF] },
];

function bridgeAccount() {
  return new Account({
    name: 'Test',
    emailAddress: 'user@proton.me',
    provider: 'imap',
    settings: { imap_host: '127.0.0.1', smtp_host: '127.0.0.1', imap_password: 'secret' },
  } as any);
}

function pageFor(account: Account, rejectedCertificates = bridgeCertificates) {
  const page = new AccountCertificatePage({ account, rejectedCertificates });
  page.setState = function setState(next) {
    Object.assign(this.state, next);
  };
  return page;
}

describe('AccountCertificatePage', function accountCertificatePageTests() {
  beforeEach(() => {
    spyOn(OnboardingActions, 'setAccount');
    spyOn(OnboardingActions, 'moveToPage');
    spyOn(OnboardingActions, 'finishAndAddAccount');
  });

  it('shows a certificate both services present once, with every server that presented it', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <AccountCertificatePage account={bridgeAccount()} rejectedCertificates={bridgeCertificates} />
    );
    expect(html.match(/class="certificate"/g).length).toEqual(1);
    expect(html).toContain('127.0.0.1:1143');
    expect(html).toContain('127.0.0.1:1025');
    expect(html).toContain('It is self-signed');
    expect(html.replace(/<wbr\/>/g, '')).toContain('37:5B:27:4A');
  });

  it('says when a certificate replaces the one accepted before', () => {
    const account = bridgeAccount();
    account.settings.imap_certificate_sha256 = 'ff'.repeat(32);
    const html = ReactDOMServer.renderToStaticMarkup(
      <AccountCertificatePage account={account} rejectedCertificates={bridgeCertificates} />
    );
    expect(html).toContain('It is not the certificate you accepted for this server before.');
    expect(
      ReactDOMServer.renderToStaticMarkup(
        <AccountCertificatePage
          account={bridgeAccount()}
          rejectedCertificates={bridgeCertificates}
        />
      )
    ).not.toContain('accepted for this server before');
  });

  it('connects with both fingerprints when the user accepts', async () => {
    const validated = bridgeAccount();
    spyOn(OnboardingHelpers, 'finalizeAndValidateAccount').andReturn(Promise.resolve(validated));
    const account = bridgeAccount();

    await pageFor(account)._onAccept();

    const tried = (OnboardingHelpers.finalizeAndValidateAccount as jasmine.Spy).mostRecentCall
      .args[0];
    expect(tried.settings.imap_certificate_sha256).toEqual(LEAF_SHA256);
    expect(tried.settings.smtp_certificate_sha256).toEqual(LEAF_SHA256);
    expect(account.settings.imap_certificate_sha256).toBeUndefined();
    expect(OnboardingActions.moveToPage).toHaveBeenCalledWith('account-onboarding-success');
    expect(OnboardingActions.finishAndAddAccount).toHaveBeenCalledWith(validated);
  });

  it('shows the new certificate when the server presents another one', async () => {
    const changed = [{ ...bridgeCertificates[0], sha256: 'ff'.repeat(32) }];
    const err = Object.assign(new Error('Certificate Error (IMAP)'), { certificates: changed });
    spyOn(OnboardingHelpers, 'finalizeAndValidateAccount').andReturn(Promise.reject(err));

    await pageFor(bridgeAccount())._onAccept();

    const [account, options] = (OnboardingActions.setAccount as jasmine.Spy).mostRecentCall.args;
    expect(account.settings.imap_certificate_sha256).toEqual(LEAF_SHA256);
    expect(options).toEqual({ rejectedCertificates: changed });
    expect(OnboardingActions.finishAndAddAccount).not.toHaveBeenCalled();
  });

  it('keeps the accepted fingerprints and shows any other error', async () => {
    const err = Object.assign(new Error('Authentication Error (IMAP)'), { rawLog: 'log' });
    spyOn(OnboardingHelpers, 'finalizeAndValidateAccount').andReturn(Promise.reject(err));
    const page = pageFor(bridgeAccount());

    await page._onAccept();

    const [account, options] = (OnboardingActions.setAccount as jasmine.Spy).mostRecentCall.args;
    expect(account.settings.smtp_certificate_sha256).toEqual(LEAF_SHA256);
    expect(options).toEqual({ rejectedCertificates: bridgeCertificates });
    expect(page.state.errorMessage).toEqual('Authentication Error (IMAP)');
    expect(page.state.submitting).toBe(false);
  });
});
