/* eslint global-require: 0 */

import crypto from 'crypto';
import { Account, IdentityStore, MailsyncProcess } from 'mailspring-exports';
import MailspringProviderSettings from './mailspring-provider-settings.json';
import MailcoreProviderSettings from './mailcore-provider-settings.json';
import dns from 'dns';

export const LOCAL_SERVER_PORT = 12141;
export const LOCAL_REDIRECT_URI = `http://127.0.0.1:${LOCAL_SERVER_PORT}`;
const GMAIL_CLIENT_ID = '662287800555-0a5h4ii0e9hsbpq0mqtul7fja0jhf9uf.apps.googleusercontent.com';
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email', // email address
  'https://www.googleapis.com/auth/userinfo.profile', // G+ profile
  'https://mail.google.com/', // email
  'https://www.googleapis.com/auth/contacts.readonly', // contacts
  'https://www.googleapis.com/auth/calendar', // calendar
];

function idForAccount(emailAddress: string, connectionSettings) {
  // changing your connection security settings / ports shouldn't blow
  // away everything and trash your metadata. Just look at critiical fields.
  // (Me adding more connection settings fields shouldn't break account Ids either!)
  const settingsThatCouldChangeMailContents = {
    imap_username: connectionSettings.imap_username,
    imap_host: connectionSettings.imap_host,
    smtp_username: connectionSettings.smtp_username,
    smtp_host: connectionSettings.smtp_host,
  };

  const idString = `${emailAddress}${JSON.stringify(settingsThatCouldChangeMailContents)}`;
  return crypto
    .createHash('sha256')
    .update(idString, 'utf8')
    .digest('hex')
    .substr(0, 8);
}

function mxRecordsForDomain(domain) {
  return new Promise<string[]>((resolve, reject) => {
    // timeout here is annoyingly long - 30s?
    dns.resolveMx(domain, (err, addresses) => {
      if (err) {
        resolve([]);
      } else {
        resolve(addresses.map(a => a.exchange.toLowerCase()));
      }
    });
  });
}

export async function expandAccountWithCommonSettings(account: Account) {
  const domain = account.emailAddress
    .split('@')
    .pop()
    .toLowerCase();
  const mxRecords = await mxRecordsForDomain(domain);
  const populated = account.clone();

  const usernameWithFormat = format => {
    if (format === 'email') return account.emailAddress;
    if (format === 'email-without-domain') return account.emailAddress.split('@').shift();
    return undefined;
  };

  // find matching template using new Mailcore lookup tables. These match against the
  // email's domain and the mx records for the domain, which means it will identify that
  // "foundry376.com" uses Google Apps, for example.
  const template = Object.values(MailcoreProviderSettings).find(p => {
    for (const test of p['domain-match'] || []) {
      if (new RegExp(`^${test}$`).test(domain)) {
        return true;
      }
    }
    for (const test of p['mx-match'] || []) {
      const reg = new RegExp(`^${test}$`);
      if (mxRecords.some(record => reg.test(record))) {
        return true;
      }
    }
    return false;
  });

  if (template) {
    console.log(`Using Mailcore Template: ${JSON.stringify(template, null, 2)}`);
    const imap = (template.servers.imap || [])[0] || ({} as any);
    const smtp = (template.servers.smtp || [])[0] || ({} as any);
    const defaults = {
      imap_host: imap.hostname.replace('{domain}', domain),
      imap_port: imap.port,
      imap_username: usernameWithFormat('email'),
      imap_password: populated.settings.imap_password,
      imap_security: imap.starttls ? 'STARTTLS' : imap.ssl ? 'SSL / TLS' : 'none',
      imap_allow_insecure_ssl: false,

      smtp_host: smtp.hostname.replace('{domain}', domain),
      smtp_port: smtp.port,
      smtp_username: usernameWithFormat('email'),
      smtp_password: populated.settings.smtp_password || populated.settings.imap_password,
      smtp_security: smtp.starttls ? 'STARTTLS' : smtp.ssl ? 'SSL / TLS' : 'none',
      smtp_allow_insecure_ssl: false,
    };
    populated.settings = Object.assign(defaults, populated.settings);
    return populated;
  }

  // find matching template by domain or provider in the old lookup tables
  // this matches the acccount type presets ("yahoo") and common domains against
  // data derived from Thunderbirds ISPDB.
  let mstemplate =
    MailspringProviderSettings[domain] || MailspringProviderSettings[account.provider];
  if (mstemplate) {
    if (mstemplate.alias) {
      mstemplate = MailspringProviderSettings[mstemplate.alias];
    }
    console.log(`Using Mailspring Template: ${JSON.stringify(mstemplate, null, 2)}`);
  } else {
    console.log(`Using Empty Template`);
    mstemplate = {};
  }

  const defaults = {
    imap_host: mstemplate.imap_host,
    imap_port: mstemplate.imap_port || 993,
    imap_username: usernameWithFormat(mstemplate.imap_user_format),
    imap_password: populated.settings.imap_password,
    imap_security: mstemplate.imap_security || 'SSL / TLS',
    imap_allow_insecure_ssl: mstemplate.imap_allow_insecure_ssl || false,
    smtp_host: mstemplate.smtp_host,
    smtp_port: mstemplate.smtp_port || 587,
    smtp_username: usernameWithFormat(mstemplate.smtp_user_format),
    smtp_password: populated.settings.smtp_password || populated.settings.imap_password,
    smtp_security: mstemplate.smtp_security || 'STARTTLS',
    smtp_allow_insecure_ssl: mstemplate.smtp_allow_insecure_ssl || false,
  };
  populated.settings = Object.assign(defaults, populated.settings);
  return populated;
}

export async function buildGmailAccountFromAuthResponse(code: string) {
  /// Exchange code for an access token
  const body = [];
  body.push(`code=${encodeURIComponent(code)}`);
  body.push(`client_id=${encodeURIComponent(GMAIL_CLIENT_ID)}`);
  body.push(`redirect_uri=${encodeURIComponent(LOCAL_REDIRECT_URI)}`);
  body.push(`grant_type=${encodeURIComponent('authorization_code')}`);

  const resp = await fetch('https://www.googleapis.com/oauth2/v4/token', {
    method: 'POST',
    body: body.join('&'),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
  });

  const json = (await resp.json()) || {};
  if (!resp.ok) {
    throw new Error(
      `Gmail OAuth Code exchange returned ${resp.status} ${resp.statusText}: ${JSON.stringify(
        json
      )}`
    );
  }
  const { access_token, refresh_token } = json;

  // get the user's email address
  const meResp = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    method: 'GET',
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const me = await meResp.json();
  if (!meResp.ok) {
    throw new Error(
      `Gmail profile request returned ${resp.status} ${resp.statusText}: ${JSON.stringify(me)}`
    );
  }
  const account = await expandAccountWithCommonSettings(
    new Account({
      name: me.name,
      emailAddress: me.email,
      provider: 'gmail',
      settings: {
        refresh_client_id: GMAIL_CLIENT_ID,
        refresh_token: refresh_token,
      },
    })
  );

  account.id = idForAccount(me.email, account.settings);

  // test the account locally to ensure the All Mail folder is enabled
  // and the refresh token can be exchanged for an account token.
  await finalizeAndValidateAccount(account);

  return account;
}

export function buildGmailAuthURL() {
  return `https://accounts.google.com/o/oauth2/auth?client_id=${GMAIL_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    LOCAL_REDIRECT_URI
  )}&response_type=code&scope=${encodeURIComponent(
    GMAIL_SCOPES.join(' ')
  )}&access_type=offline&select_account%20consent`;
}

export async function finalizeAndValidateAccount(account) {
  if (account.settings.imap_host) {
    account.settings.imap_host = account.settings.imap_host.trim();
  }
  if (account.settings.smtp_host) {
    account.settings.smtp_host = account.settings.smtp_host.trim();
  }

  account.id = idForAccount(account.emailAddress, account.settings);

  // handle special case for exchange/outlook/hotmail username field
  account.settings.username = account.settings.username || account.settings.email;

  if (account.settings.imap_port) {
    account.settings.imap_port /= 1;
  }
  if (account.settings.smtp_port) {
    account.settings.smtp_port /= 1;
  }
  if (account.label && account.label.includes('@')) {
    account.label = account.emailAddress;
  }

  // Test connections to IMAP and SMTP
  const proc = new MailsyncProcess(AppEnv.getLoadSettings());
  proc.identity = IdentityStore.identity();
  proc.account = account;
  const { response } = await proc.test();
  return new Account(response.account);
}
