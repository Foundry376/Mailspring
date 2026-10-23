import { X509Certificate } from 'crypto';
import net from 'net';
import { localized, Account } from 'mailspring-exports';

// A certificate mailsync's --mode test rejected. Accepting it stores `sha256` in the account's
// settings as `<service>_certificate_sha256`, and mailsync then accepts exactly that certificate.
export interface RejectedCertificate {
  service: 'imap' | 'smtp';
  host: string;
  port: number;
  sha256: string;
  // DER, base64, leaf first
  chain: string[];
}

export interface CertificateDescription {
  issuedTo: string;
  issuedBy: string;
  names: string[];
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  problems: string[];
}

function commonName(distinguishedName: string) {
  const cn = distinguishedName.split('\n').find((part) => part.startsWith('CN='));
  if (cn) return cn.slice(3);
  const o = distinguishedName.split('\n').find((part) => part.startsWith('O='));
  return o ? o.slice(2) : distinguishedName.replace(/\n/g, ', ');
}

// "DNS:mail.example.com, IP Address:127.0.0.1" -> ["mail.example.com", "127.0.0.1"]
function subjectAltNames(cert: X509Certificate) {
  if (!cert.subjectAltName) return [];
  return cert.subjectAltName
    .split(', ')
    .map((entry) => entry.slice(entry.indexOf(':') + 1))
    .filter(Boolean);
}

// mailsync reports only that validation failed, so the reasons a person can act on are read
// from the certificate itself. Anything else is an issuer the platform doesn't trust.
export function describeRejectedCertificate(
  rejected: RejectedCertificate,
  now = new Date()
): CertificateDescription {
  const cert = new X509Certificate(Buffer.from(rejected.chain[0], 'base64'));
  const names = subjectAltNames(cert);
  const validFrom = new Date(cert.validFrom);
  const validTo = new Date(cert.validTo);
  const problems: string[] = [];

  const matchesHost = net.isIP(rejected.host)
    ? cert.checkIP(rejected.host)
    : cert.checkHost(rejected.host);
  if (!matchesHost) {
    problems.push(
      localized(
        'It was issued for %@, not %@.',
        (names.length ? names : [commonName(cert.subject)]).join(', '),
        rejected.host
      )
    );
  }
  if (now > validTo) {
    problems.push(localized('It expired on %@.', validTo.toLocaleDateString()));
  } else if (now < validFrom) {
    problems.push(localized('It is not valid until %@.', validFrom.toLocaleDateString()));
  }
  if (cert.checkIssued(cert)) {
    problems.push(localized('It is self-signed, so no certificate authority vouches for it.'));
  } else if (problems.length === 0) {
    problems.push(
      localized('It was issued by %@, which this computer does not trust.', commonName(cert.issuer))
    );
  }

  return {
    issuedTo: commonName(cert.subject),
    issuedBy: commonName(cert.issuer),
    names,
    validFrom,
    validTo,
    fingerprint: cert.fingerprint256,
    problems,
  };
}

export function withAcceptedCertificates(account: Account, certificates: RejectedCertificate[]) {
  const next = account.clone();
  for (const { service, sha256 } of certificates) {
    next.settings[`${service}_certificate_sha256`] = sha256;
  }
  return next;
}
