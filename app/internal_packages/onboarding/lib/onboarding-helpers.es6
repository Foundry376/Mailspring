/* eslint global-require: 0 */

import crypto from 'crypto';
import { CommonProviderSettings } from 'imap-provider-settings';
import { Account, IdentityStore, MailsyncProcess } from 'mailspring-exports';

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

export function expandAccountWithCommonSettings(account) {
  const domain = account.emailAddress
    .split('@')
    .pop()
    .toLowerCase();
  let template = CommonProviderSettings[domain] || CommonProviderSettings[account.provider] || {};
  if (template.alias) {
    template = CommonProviderSettings[template.alias];
  }

  const usernameWithFormat = format => {
    if (format === 'email') {
      return account.emailAddress;
    }
    if (format === 'email-without-domain') {
      return account.emailAddress.split('@').shift();
    }
    return undefined;
  };

  const populated = account.clone();

  populated.settings = Object.assign(
    {
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
    },
    populated.settings
  );

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

  ///get the user's email address
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
  const account = expandAccountWithCommonSettings(
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
  const proc = new MailsyncProcess(AppEnv.getLoadSettings(), IdentityStore.identity(), account);
  const { response } = await proc.test();
  return new Account(response.account);
}
