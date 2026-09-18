import dns from 'dns';
import { Account, AccountStore } from 'mailspring-exports';
import { expandAccountWithCommonSettings } from '../lib/onboarding-helpers';

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

describe('expandAccountWithCommonSettings', function onboardingHelpersTests() {
  beforeEach(() => {
    // The MX lookup only feeds the Mailcore table's mx-match rules, and it is a real
    // network call - stub it so specs don't depend on DNS.
    spyOn(dns, 'resolveMx').andCallFake((domain, callback) => callback(new Error('ENOTFOUND')));
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
  });

  it('uses the account type preset when the domain is not in either table', async () => {
    stubAutoconfig([]);
    const account = await expandAccountWithCommonSettings(
      accountFor('user@unknown-domain.example', 'yahoo')
    );

    expect(account.settings.imap_host).toEqual('imap.mail.yahoo.com');
    expect(account.settings.smtp_host).toEqual('smtp.mail.yahoo.com');
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
