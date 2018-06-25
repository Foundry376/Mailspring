/* eslint global-require: 0 */

import crypto from 'crypto';
import { Account, IdentityStore, MailsyncProcess } from 'mailspring-exports';
import MailspringProviderSettings from './mailspring-provider-settings';
import MailcoreProviderSettings from './mailcore-provider-settings';
import dns from 'dns';

export const LOCAL_SERVER_PORT = 12141;
export const LOCAL_REDIRECT_URI = `http://127.0.0.1:${LOCAL_SERVER_PORT}`;
const GMAIL_CLIENT_ID = '533632962939-3kp63blvln9j1pjmqrtfsv9pc66nsfqn.apps.googleusercontent.com';
const GMAIL_SCOPES = [
  // Edison
  'https://mail.google.com/',
  'email',
  'https://www.google.com/m8/feeds'
];

function idForAccount(emailAddress, connectionSettings) {
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
  return new Promise((resolve, reject) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err) {
        resolve([]);
      } else {
        resolve(addresses.map(a => a.exchange.toLowerCase()));
      }
    });
  });
}

export async function expandAccountWithCommonSettings(account) {
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
  let template = Object.values(MailcoreProviderSettings).find(p => {
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
    const imap = (template.servers.imap || [])[0] || {};
    const smtp = (template.servers.smtp || [])[0] || {};
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
  template = MailspringProviderSettings[domain] || MailspringProviderSettings[account.provider];
  if (template) {
    if (template.alias) {
      template = MailspringProviderSettings[template.alias];
    }
    console.log(`Using Mailspring Template: ${JSON.stringify(template, null, 2)}`);
  } else {
    console.log(`Using Empty Template`);
    template = {};
  }

  const defaults = {
    imap_host: template.imap_host,
    imap_port: template.imap_port || 993,
    imap_username: usernameWithFormat(template.imap_user_format),
    imap_password: populated.settings.imap_password,
    imap_security: template.imap_security || 'SSL / TLS',
    imap_allow_insecure_ssl: template.imap_allow_insecure_ssl || false,
    smtp_host: template.smtp_host,
    smtp_port: template.smtp_port || 587,
    smtp_username: usernameWithFormat(template.smtp_user_format),
    smtp_password: populated.settings.smtp_password || populated.settings.imap_password,
    smtp_security: template.smtp_security || 'STARTTLS',
    smtp_allow_insecure_ssl: template.smtp_allow_insecure_ssl || false,
  };
  populated.settings = Object.assign(defaults, populated.settings);
  return populated;
}

export async function buildGmailAccountFromAuthResponse(code) {
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

export function buildGmailAuthURL(sessionKey) {
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
