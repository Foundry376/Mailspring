import dns from 'dns';
import { Account, AccountStore } from 'mailspring-exports';
import { expandAccountForSetup, expandAccountWithCommonSettings } from '../lib/onboarding-helpers';

const AUTOCONFIG_IMAP_HOST = 'imap.autoconfig.example';
const AUTOCONFIG_SMTP_HOST = 'smtp.autoconfig.example';

function autoconfigXML(domain: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="${domain}">
    <domain>${domain}</domain>
    <displayName>${domain}</displayName>
    <incomingServer type="imap">
      <hostname>${AUTOCONFIG_IMAP_HOST}</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <username>%EMAILADDRESS%</username>
      <authentication>password-cleartext</authentication>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>${AUTOCONFIG_SMTP_HOST}</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
      <username>%EMAILADDRESS%</username>
      <authentication>password-cleartext</authentication>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;
}

// Responds to the two URLs TryThunderbirdAutoconfig probes for the domains listed in
// `servingDomains`, and 404s everything else.
function stubAutoconfig(servingDomains: string[]) {
  spyOn(window as any, 'fetch').andCallFake((url: string) => {
    const domain = servingDomains.find(
      (d) => url === `https://autoconfig.${d}/mail/config-v1.1.xml`
    );
    if (domain) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(autoconfigXML(domain)) });
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
  });
}

function accountFor(emailAddress: string, provider = 'imap', settings = {}) {
  return new Account({ name: 'Test', emailAddress, provider, settings } as any);
}

// Answers dns.resolveSrv from `records`, keyed by the full query name, and fails the rest.
function stubSrv(records: { [name: string]: [number, number, number, string][] }) {
  (dns.resolveSrv as unknown as jasmine.Spy).andCallFake((name, callback) => {
    if (!records[name]) return callback(new Error('ENOTFOUND'));
    callback(
      null,
      records[name].map(([priority, weight, port, target]) => ({
        priority,
        weight,
        port,
        name: target,
      }))
    );
  });
}

describe('expandAccountWithCommonSettings', function onboardingHelpersTests() {
  let resolveMxSpy: jasmine.Spy;

  beforeEach(() => {
    // The MX and SRV lookups are real network calls - stub them so specs don't depend on DNS.
    resolveMxSpy = spyOn(dns, 'resolveMx');
    resolveMxSpy.andCallFake((domain, callback) => callback(new Error('ENOTFOUND')));
    spyOn(dns, 'resolveSrv').andCallFake((name, callback) => callback(new Error('ENOTFOUND')));
    spyOn(AccountStore, 'containerFolderDefaultGetter').andReturn('');
  });

  it('uses the Proton template for a proton.me address', async () => {
    stubAutoconfig([]);
    const account = await expandAccountWithCommonSettings(accountFor('user@proton.me'));

    // Proton Bridge listens on localhost, and Proton only allows nested folders inside
    // its Folders/ namespace.
    expect(account.settings.imap_host).toEqual('127.0.0.1');
    expect(account.settings.imap_port).toEqual(1143);
    expect(account.settings.smtp_host).toEqual('127.0.0.1');
    expect(account.settings.container_folder).toEqual('Folders');
  });

  it('uses the Proton template for a protonmail.com address', async () => {
    stubAutoconfig([]);
    const account = await expandAccountWithCommonSettings(accountFor('user@protonmail.com'));

    expect(account.settings.imap_host).toEqual('127.0.0.1');
    expect(account.settings.container_folder).toEqual('Folders');
  });

  it('keeps the template container_folder when the domain also serves autoconfig', async () => {
    stubAutoconfig(['proton.me']);
    const account = await expandAccountWithCommonSettings(accountFor('user@proton.me'));

    // Autoconfig supplies connection settings, but it has no concept of a container
    // folder, so that key still comes from the Mailspring provider table.
    expect(account.settings.imap_host).toEqual(AUTOCONFIG_IMAP_HOST);
    expect(account.settings.smtp_host).toEqual(AUTOCONFIG_SMTP_HOST);
    expect(account.settings.container_folder).toEqual('Folders');
  });

  it('leaves container_folder empty for an autoconfig domain with no template entry', async () => {
    stubAutoconfig(['autoconfig-only.example']);
    const account = await expandAccountWithCommonSettings(
      accountFor('user@autoconfig-only.example')
    );

    expect(account.settings.imap_host).toEqual(AUTOCONFIG_IMAP_HOST);
    expect(account.settings.imap_security).toEqual('SSL / TLS');
    expect(account.settings.smtp_host).toEqual(AUTOCONFIG_SMTP_HOST);
    expect(account.settings.smtp_security).toEqual('STARTTLS');
    expect(account.settings.container_folder).toEqual('');
  });

  it('falls back to imap./smtp. for a domain with no template and no autoconfig', async () => {
    stubAutoconfig([]);
    const account = await expandAccountWithCommonSettings(accountFor('user@plain-imap.example'));

    expect(account.settings.imap_host).toEqual('imap.plain-imap.example');
    expect(account.settings.imap_port).toEqual(993);
    expect(account.settings.imap_security).toEqual('SSL / TLS');
    expect(account.settings.smtp_host).toEqual('smtp.plain-imap.example');
    expect(account.settings.smtp_port).toEqual(465);
    expect(account.settings.container_folder).toEqual('');
  });

  it('uses SRV records before guessing, and asks to confirm servers outside the domain', async () => {
    stubAutoconfig([]);
    stubSrv({
      '_imaps._tcp.hosted.example': [
        [10, 100, 993, 'backup.provider.example'],
        [0, 100, 993, 'mail.provider.example'],
      ],
      '_submission._tcp.hosted.example': [[0, 100, 587, 'mail.provider.example']],
    });
    const { account, confirmServers } = await expandAccountForSetup(
      accountFor('user@hosted.example')
    );

    expect(account.settings.imap_host).toEqual('mail.provider.example');
    expect(account.settings.imap_port).toEqual(993);
    expect(account.settings.imap_security).toEqual('SSL / TLS');
    expect(account.settings.imap_username).toEqual('user@hosted.example');
    expect(account.settings.smtp_host).toEqual('mail.provider.example');
    expect(account.settings.smtp_port).toEqual(587);
    expect(account.settings.smtp_security).toEqual('STARTTLS');
    expect(confirmServers).toBe(true);
  });

  it('prefers implicit TLS SRV services and skips services marked unavailable', async () => {
    stubAutoconfig([]);
    stubSrv({
      '_imaps._tcp.srv.example': [[0, 0, 993, '.']],
      '_imap._tcp.srv.example': [[0, 1, 143, 'imap.srv.example']],
      '_submissions._tcp.srv.example': [[0, 1, 465, 'smtp.srv.example']],
      '_submission._tcp.srv.example': [[0, 1, 587, 'smtp.srv.example']],
    });
    const { account, confirmServers } = await expandAccountForSetup(accountFor('user@srv.example'));

    expect(account.settings.imap_host).toEqual('imap.srv.example');
    expect(account.settings.imap_port).toEqual(143);
    expect(account.settings.imap_security).toEqual('STARTTLS');
    expect(account.settings.smtp_port).toEqual(465);
    expect(account.settings.smtp_security).toEqual('SSL / TLS');
    expect(confirmServers).toBe(false);
  });

  it('guesses the side that has no SRV records and keeps the other side from SRV', async () => {
    stubAutoconfig([]);
    stubSrv({ '_submissions._tcp.hosted.example': [[0, 1, 465, 'smtp.provider.example']] });
    const { account, confirmServers } = await expandAccountForSetup(
      accountFor('user@hosted.example')
    );

    expect(account.settings.imap_host).toEqual('imap.hosted.example');
    expect(account.settings.imap_port).toEqual(993);
    expect(account.settings.imap_security).toEqual('SSL / TLS');
    expect(account.settings.smtp_host).toEqual('smtp.provider.example');
    expect(account.settings.smtp_port).toEqual(465);
    expect(account.settings.smtp_security).toEqual('SSL / TLS');
    expect(confirmServers).toBe(true);
  });

  it('prefers the autoconfig file over SRV records', async () => {
    stubAutoconfig(['hosted.example']);
    stubSrv({ '_imaps._tcp.hosted.example': [[0, 1, 993, 'mail.provider.example']] });
    const { account, confirmServers } = await expandAccountForSetup(
      accountFor('user@hosted.example')
    );

    expect(account.settings.imap_host).toEqual(AUTOCONFIG_IMAP_HOST);
    expect(confirmServers).toBe(false);
    expect(dns.resolveSrv).not.toHaveBeenCalled();
  });

  it('keeps user-entered settings ahead of the autoconfig and template defaults', async () => {
    stubAutoconfig(['proton.me']);
    const account = await expandAccountWithCommonSettings(
      accountFor('user@proton.me', 'imap', {
        imap_host: 'bridge.local',
        container_folder: 'Custom',
      })
    );

    expect(account.settings.imap_host).toEqual('bridge.local');
    expect(account.settings.container_folder).toEqual('Custom');
  });

  it('uses the Mailcore template for gmail without consulting autoconfig', async () => {
    stubAutoconfig(['gmail.com']);
    const account = await expandAccountWithCommonSettings(accountFor('user@gmail.com', 'gmail'));

    expect(account.settings.imap_host).toEqual('imap.gmail.com');
    expect(account.settings.smtp_host).toEqual('smtp.gmail.com');
    expect(window.fetch).not.toHaveBeenCalled();
    expect(dns.resolveSrv).not.toHaveBeenCalled();
  });

  it('uses Google servers for a domain whose MX record is smtp.google.com', async () => {
    resolveMxSpy.andCallFake((domain, callback) =>
      callback(null, [{ exchange: 'SMTP.GOOGLE.COM', priority: 1 }])
    );
    stubAutoconfig(['workspace.example']);
    const account = await expandAccountWithCommonSettings(accountFor('user@workspace.example'));

    expect(account.settings.imap_host).toEqual('imap.gmail.com');
    expect(account.settings.smtp_host).toEqual('smtp.gmail.com');
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it('does not download autoconfig for an account added with Google sign-in', async () => {
    stubAutoconfig(['workspace.example']);
    const account = await expandAccountWithCommonSettings(
      accountFor('user@workspace.example', 'gmail')
    );

    expect(account.settings.imap_host).toEqual('imap.gmail.com');
    expect(account.settings.imap_port).toEqual(993);
    expect(account.settings.smtp_host).toEqual('smtp.gmail.com');
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it('does not download autoconfig for an account added with Microsoft sign-in', async () => {
    stubAutoconfig(['contoso.example']);
    const account = await expandAccountWithCommonSettings(
      accountFor('user@contoso.example', 'office365')
    );

    expect(account.settings.imap_host).toEqual('outlook.office365.com');
    expect(account.settings.smtp_host).toEqual('smtp.office365.com');
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it('uses the account type preset when the domain is not in either table', async () => {
    stubAutoconfig([]);
    const account = await expandAccountWithCommonSettings(
      accountFor('user@unknown-domain.example', 'yahoo')
    );

    expect(account.settings.imap_host).toEqual('imap.mail.yahoo.com');
    expect(account.settings.smtp_host).toEqual('smtp.mail.yahoo.com');
  });

  it('prefers the account type preset over SRV records', async () => {
    stubAutoconfig([]);
    stubSrv({ '_imaps._tcp.unknown-domain.example': [[0, 1, 993, 'mail.provider.example']] });
    const { account, confirmServers } = await expandAccountForSetup(
      accountFor('user@unknown-domain.example', 'yahoo')
    );

    expect(account.settings.imap_host).toEqual('imap.mail.yahoo.com');
    expect(confirmServers).toBe(false);
    expect(dns.resolveSrv).not.toHaveBeenCalled();
  });

  it('applies the configured container folder default when the template has none', async () => {
    (AccountStore.containerFolderDefaultGetter as jasmine.Spy).andReturn('Mail');
    stubAutoconfig(['autoconfig-only.example']);
    const account = await expandAccountWithCommonSettings(
      accountFor('user@autoconfig-only.example')
    );

    expect(account.settings.container_folder).toEqual('Mail');
  });
});
