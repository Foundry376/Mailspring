import { Account } from 'mailspring-exports';
import {
  RejectedCertificate,
  describeRejectedCertificate,
  withAcceptedCertificates,
  forgetCertificateIfServerChanged,
} from '../lib/certificate-review';

// Self-signed, CN and DNS SAN mail.example.test, IP SAN 127.0.0.1, valid 2026-10-23 to 2126-09-29.
const SELF_SIGNED =
  'MIIBszCCAVmgAwIBAgIUFNSYT/wtx+EKJzxskdX2s7Kh2u8wCgYIKoZIzj0EAwIwHDEaMBgGA1UEAwwRbWFpbC5leGFtcGxlLnRlc3QwIBcNMjYxMDIzMTY0MzA4WhgPMjEyNjA5MjkxNjQzMDhaMBwxGjAYBgNVBAMMEW1haWwuZXhhbXBsZS50ZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE8KbAJYwjbLVnUaFfC6ZkOd1JyF0vQaXWvjUJDkpX9chmr4ML6MORZsAoPz2aNPkFj5PSDWVacXZ8r1xuQTkx2qN3MHUwHQYDVR0OBBYEFKImM+p01K1GNwq77f5zC0NelctmMB8GA1UdIwQYMBaAFKImM+p01K1GNwq77f5zC0NelctmMCIGA1UdEQQbMBmCEW1haWwuZXhhbXBsZS50ZXN0hwR/AAABMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhANavyl+L2JcH3Wwj/1aMBlLF2FQToSX1h6YLw6TOcAmpAiAZ5LmK/4sQbJsgsIZcjPAF6uTXwEAAeGil8CvIZFa/JA==';

// Issued by "Example Test Root" to DNS SAN mail.example.test, valid 2026-10-23 to 2126-09-29.
const CA_ISSUED =
  'MIIBsTCCAVegAwIBAgIUe8LOpxsrGe5WRG3WiRVFjAqg5+IwCgYIKoZIzj0EAwIwHDEaMBgGA1UEAwwRRXhhbXBsZSBUZXN0IFJvb3QwIBcNMjYxMDIzMTY0MzA4WhgPMjEyNjA5MjkxNjQzMDhaMBwxGjAYBgNVBAMMEW1haWwuZXhhbXBsZS50ZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqTOdcYOChSpcbiwBnePMuDlrFsj2pYS67WknPR58xw3ul/mhMo60G6AofgJW9fGria1z8iwoFw1pUbmZB1RDp6N1MHMwHAYDVR0RBBUwE4IRbWFpbC5leGFtcGxlLnRlc3QwEwYDVR0lBAwwCgYIKwYBBQUHAwEwHQYDVR0OBBYEFNnaLW0cnMgGuLcEalbyTYJNm4btMB8GA1UdIwQYMBaAFML74PXl3KfeogYGw+hcezDi6W1/MAoGCCqGSM49BAMCA0gAMEUCIHW9d/v2t7sJGKpOIzoV8J5aw61kt6gImJ6/R/gCtK8nAiEAmLFFM1CJ7LDz/hB9h1c1+jIjfH4bk+4Z9/Evb0eJenQ=';

const WHILE_VALID = new Date('2030-01-01T00:00:00Z');

function rejected(chain: string, host: string, service: 'imap' | 'smtp' = 'imap') {
  return { service, host, port: 993, sha256: 'abc', chain: [chain] } as RejectedCertificate;
}

describe('describeRejectedCertificate', () => {
  it('reads the names, issuer and fingerprint from the leaf', () => {
    const d = describeRejectedCertificate(rejected(CA_ISSUED, 'mail.example.test'), WHILE_VALID);
    expect(d.issuedTo).toEqual('mail.example.test');
    expect(d.issuedBy).toEqual('Example Test Root');
    expect(d.names).toEqual(['mail.example.test']);
    expect(d.fingerprint).toEqual(
      '79:68:75:3E:9A:E5:3B:BC:8F:6F:B0:DC:01:B3:17:13:E7:B2:A2:9B:2F:B8:9F:2B:15:8E:77:C1:F4:8B:FA:06'
    );
  });

  it('blames an untrusted issuer when nothing else is wrong', () => {
    const d = describeRejectedCertificate(rejected(CA_ISSUED, 'mail.example.test'), WHILE_VALID);
    expect(d.problems).toEqual([
      'It was issued by Example Test Root, which this computer does not trust.',
    ]);
  });

  it('says a self-signed certificate is self-signed', () => {
    const d = describeRejectedCertificate(rejected(SELF_SIGNED, 'mail.example.test'), WHILE_VALID);
    expect(d.problems).toEqual(['It is self-signed, so no certificate authority vouches for it.']);
  });

  it('matches an IP address against the IP SANs', () => {
    const d = describeRejectedCertificate(rejected(SELF_SIGNED, '127.0.0.1'), WHILE_VALID);
    expect(d.problems.length).toEqual(1);
    expect(d.names).toEqual(['mail.example.test', '127.0.0.1']);
  });

  it('names the hosts a certificate was issued for when they are not the server', () => {
    const d = describeRejectedCertificate(rejected(CA_ISSUED, 'imap.other.test'), WHILE_VALID);
    expect(d.problems).toEqual(['It was issued for mail.example.test, not imap.other.test.']);
  });

  it('reports an expired certificate', () => {
    const d = describeRejectedCertificate(
      rejected(CA_ISSUED, 'mail.example.test'),
      new Date('2127-01-01T00:00:00Z')
    );
    expect(d.problems.length).toEqual(1);
    expect(d.problems[0]).toContain('It expired on');
  });
});

describe('withAcceptedCertificates', () => {
  it('stores each fingerprint under its service without changing the original account', () => {
    const account = new Account({ provider: 'imap', settings: { imap_host: 'mail.example.test' } });
    const accepted = withAcceptedCertificates(account, [
      { ...rejected(SELF_SIGNED, 'mail.example.test', 'imap'), sha256: 'aa' },
      { ...rejected(SELF_SIGNED, 'mail.example.test', 'smtp'), sha256: 'bb' },
    ]);
    expect(accepted.settings.imap_certificate_sha256).toEqual('aa');
    expect(accepted.settings.smtp_certificate_sha256).toEqual('bb');
    expect(accepted.settings.imap_host).toEqual('mail.example.test');
    expect(account.settings.imap_certificate_sha256).toBeUndefined();
  });
});

describe('forgetCertificateIfServerChanged', () => {
  function pinned() {
    return new Account({
      provider: 'imap',
      settings: { imap_certificate_sha256: 'aa', smtp_certificate_sha256: 'bb' },
    } as any);
  }

  it("drops a service's fingerprint when its host or port changes", () => {
    const account = pinned();
    forgetCertificateIfServerChanged(account, 'imap_host');
    expect(account.settings.imap_certificate_sha256).toBeUndefined();
    expect(account.settings.smtp_certificate_sha256).toEqual('bb');
    forgetCertificateIfServerChanged(account, 'smtp_port');
    expect(account.settings.smtp_certificate_sha256).toBeUndefined();
  });

  it('keeps the fingerprints when other settings change', () => {
    const account = pinned();
    forgetCertificateIfServerChanged(account, 'imap_password');
    forgetCertificateIfServerChanged(account, 'smtp_security');
    expect(account.settings.imap_certificate_sha256).toEqual('aa');
    expect(account.settings.smtp_certificate_sha256).toEqual('bb');
  });
});
