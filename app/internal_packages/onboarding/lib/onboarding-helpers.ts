/* eslint global-require: 0 */

import qs from 'querystring';
import crypto from 'crypto';
import {
  Account,
  AccountStore,
  IdentityStore,
  MailsyncProcess,
  localized,
} from 'mailspring-exports';
import MailspringProviderSettings from './mailspring-provider-settings.json';
import MailcoreProviderSettings from './mailcore-provider-settings.json';
import dns from 'dns';
import fetch from 'node-fetch';
import {
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  LOCAL_SERVER_PORT,
  O365_SCOPES,
  O365_CLIENT_ID,
  CODE_VERIFIER,
  GMAIL_SCOPES,
  CODE_CHALLENGE,
} from './onboarding-constants';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token: string;
  id_token: string;
}

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

async function fetchPostWithFormBody<T>(url: string, body: { [key: string]: string }) {
  const resp = await fetch(url, {
    method: 'POST',
    body: Object.entries(body)
      .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value))
      .join('&'),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
  });
  const json = ((await resp.json()) || {}) as T;
  if (!resp.ok) {
    throw new Error(
      `OAuth Code exchange returned ${resp.status} ${resp.statusText}: ${JSON.stringify(json)}`
    );
  }
  return json;
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
      imap_host: (imap.hostname || '').replace('{domain}', domain),
      imap_port: imap.port,
      imap_username: usernameWithFormat('email'),
      imap_password: populated.settings.imap_password,
      imap_security: imap.starttls ? 'STARTTLS' : imap.ssl ? 'SSL / TLS' : 'none',
      imap_allow_insecure_ssl: false,

      smtp_host: (smtp.hostname || '').replace('{domain}', domain),
      smtp_port: smtp.port,
      smtp_username: usernameWithFormat('email'),
      smtp_password: populated.settings.smtp_password || populated.settings.imap_password,
      smtp_security: smtp.starttls ? 'STARTTLS' : smtp.ssl ? 'SSL / TLS' : 'none',
      smtp_allow_insecure_ssl: false,

      container_folder: '',
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
    smtp_port: mstemplate.smtp_port || 465,
    smtp_username: usernameWithFormat(mstemplate.smtp_user_format),
    smtp_password: populated.settings.smtp_password || populated.settings.imap_password,
    smtp_security: mstemplate.smtp_security || 'SSL / TLS',
    smtp_allow_insecure_ssl: mstemplate.smtp_allow_insecure_ssl || false,
    container_folder: mstemplate.container_folder,
  };
  populated.settings = Object.assign(defaults, populated.settings);

  // because protonmail do not support nested folders for now, returning escaped delimiters
  // https://protonmail.com/support/knowledge-base/creating-folders/#comment-10460
  // on protonmail by default Folders set as container folder
  const containerFolderDefault = AccountStore.containerFolderDefaultGetter();
  if (
    containerFolderDefault !== 'Mailspring' &&
    (populated.settings.container_folder === '' ||
      populated.settings.container_folder === undefined)
  ) {
    populated.settings.container_folder = containerFolderDefault;
  }
  return populated;
}

export async function buildGmailAccountFromAuthResponse(code: string) {
  /// Exchange code for an access token
  const { access_token, refresh_token } = await fetchPostWithFormBody<TokenResponse>(
    'https://www.googleapis.com/oauth2/v4/token',
    {
      code: code,
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      redirect_uri: `http://127.0.0.1:${LOCAL_SERVER_PORT}`,
      grant_type: 'authorization_code',
    }
  );

  // get the user's email address
  const meResp = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const me = await meResp.json();
  if (!meResp.ok) {
    throw new Error(
      `Gmail profile request returned ${meResp.status} ${meResp.statusText}: ${JSON.stringify(me)}`
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

export async function buildO365AccountFromAuthResponse(code: string) {
  /// Exchange code for an access token
  const { access_token, refresh_token } = await fetchPostWithFormBody<TokenResponse>(
    `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
    {
      code: code,
      scope: O365_SCOPES.filter(f => !f.startsWith('https://outlook.office.com')).join(' '),
      client_id: O365_CLIENT_ID,
      code_verifier: CODE_VERIFIER,
      grant_type: `authorization_code`,
      redirect_uri: `http://localhost:${LOCAL_SERVER_PORT}/desktop`,
    }
  );

  // get the user's email address
  const meResp = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const me = await meResp.json();
  if (!meResp.ok) {
    throw new Error(
      `O365 profile request returned ${meResp.status} ${meResp.statusText}: ${JSON.stringify(me)}`
    );
  }
  if (!me.mail) {
    throw new Error(localized(`There is no email mailbox associated with this account.`));
  }

  const account = await expandAccountWithCommonSettings(
    new Account({
      name: me.displayName,
      emailAddress: me.mail,
      provider: 'office365',
      settings: {
        refresh_client_id: O365_CLIENT_ID,
        refresh_token: refresh_token,
      },
    })
  );

  account.id = idForAccount(me.email, account.settings);

  // test the account locally to ensure the refresh token can be exchanged for an account token.
  await finalizeAndValidateAccount(account);

  return account;
}

export function buildGmailAuthURL() {
  return `https://accounts.google.com/o/oauth2/auth?${qs.stringify({
    client_id: GMAIL_CLIENT_ID,
    redirect_uri: `http://127.0.0.1:${LOCAL_SERVER_PORT}`,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'select_account consent',
  })}`;
}

export function buildO365AuthURL() {
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${qs.stringify({
    client_id: O365_CLIENT_ID,
    redirect_uri: `http://localhost:${LOCAL_SERVER_PORT}/desktop`,
    response_type: 'code',
    scope: O365_SCOPES.join(' '),
    response_mode: 'query',
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })}`;
}

export async function finalizeAndValidateAccount(account: Account) {
  if (account.settings.imap_host) {
    account.settings.imap_host = account.settings.imap_host.trim();
  }
  if (account.settings.smtp_host) {
    account.settings.smtp_host = account.settings.smtp_host.trim();
  }

  account.id = idForAccount(account.emailAddress, account.settings);

  // handle special case for exchange/outlook/hotmail username field
  // TODO BG: I don't think this line is in use but not 100% sure
  (account.settings as any).username =
    (account.settings as any).username || (account.settings as any).email;

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
  await proc.test();

  // Record the date of successful auth
  account.authedAt = new Date();
  return account;
}
