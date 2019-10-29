/* eslint global-require: 0 */

import crypto from 'crypto';
import { Account, IdentityStore, MailsyncProcess, Actions } from 'mailspring-exports';
import MailspringProviderSettings from './mailspring-provider-settings';
import MailcoreProviderSettings from './mailcore-provider-settings';
import dns from 'dns';

const queryStringify = (data, encoded = false) => {
  const queryString = Object.keys(data)
    .map(key => {
      if (encoded === true) {
        return encodeURIComponent(`${key}`) + '=' + encodeURIComponent(`${data[key]}`);
      } else {
        return `${key}=${data[key]}`;
      }
    })
    .join('&');
  return queryString;
};

const EDISON_OAUTH_KEYWORD = 'edison_desktop';
const EDISON_REDIRECT_URI = 'http://email.easilydo.com';

export const LOCAL_SERVER_PORT = 12141;
export const LOCAL_REDIRECT_URI = `http://127.0.0.1:${LOCAL_SERVER_PORT}`;
const GMAIL_CLIENT_ID = '533632962939-3kp63blvln9j1pjmqrtfsv9pc66nsfqn.apps.googleusercontent.com';
const GMAIL_SCOPES = [
  // Edison
  'https://mail.google.com/',
  'email',
  'https://www.google.com/m8/feeds',
];

const YAHOO_CLIENT_ID =
  'dj0yJmk9c3IxR3h4VG5GTXBYJmQ9WVdrOVlVeHZNVXh1TkhVbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD02OQ--';
const YAHOO_CLIENT_SECRET = '8a267b9f897da839465ff07a712f9735550ed412';

const OFFICE365_CLIENT_ID = '000000004818114B';
const OFFICE365_CLIENT_SECRET = 'jXRAIb5CxLHI5MsVy9kb5okP9mGDZaqw';
const OFFICE365_SCOPES = ['user.read', 'mail.read'];

const OUTLOOK_CLIENT_ID = '000000004818114B';
const OUTLOOK_CLIENT_SECRET = 'jXRAIb5CxLHI5MsVy9kb5okP9mGDZaqw';
const OUTLOOK_SCOPES = ['wl.basic', 'wl.emails', 'wl.imap', 'wl.offline_access'];

const EDISON_CHAT_REST_URL = 'https://restxmpp.stag.easilydo.cc';
const EDISON_CHAT_REST_PORT = 443;
const EDISON_CHAT_REST_BASE_URL = `${EDISON_CHAT_REST_URL}:${EDISON_CHAT_REST_PORT}`;
const EDISON_CHAT_REST_ENDPOINTS = {
  config: 'config',
  register: 'client/register',
  unregister: 'client/unregister',
  unregisterV2: 'client/unregisterV2',

  login: 'client/login',
  logout: 'client/logout',

  updateToken: 'client/updateToken',
  uploadContacts: 'client/uploadContacts',
  queryProfile: 'client/queryProfile',

  autoLogin: 'user/login/auto',
  outTime: 'user/outtime',
  userSearch: 'user/query',
  userGet: 'user/get',
  userUpdate: 'user/update',
  updatePushToken: 'user/uploadinfo',

  badgeSetting: 'client/badgeSetting',
};

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

export function validateEmailAddressForProvider(emailAddress = '', provider = null) {
  if (!provider) {
    return { ret: false, message: 'Email entered is not valid.' };
  }
  if (provider.provider === 'imap') {
    return { ret: true };
  }
  const domain = emailAddress
    .split('@')
    .pop()
    .toLowerCase();
  let template = MailcoreProviderSettings[provider.provider];
  mxRecordsForDomain(domain).then(mxRecords => {
    if (template) {
      for (const test of template['mx-match'] || []) {
        const reg = new RegExp(`^${test}$`);
        if (mxRecords.some(record => reg.test(record))) {
          return { ret: true };
        }
      }
    }
  });
  if (template) {
    for (const test of template['domain-match'] || []) {
      if (new RegExp(`^${test}$`).test(domain)) {
        return { ret: true };
      }
    }
  }
  template = MailspringProviderSettings[provider.defaultDomain];
  let provideAlias = '';
  let fromAlias = false;
  if (template && template.alias) {
    provideAlias = template.alias;
    fromAlias = true;
    template = MailspringProviderSettings[template.alias];
  }
  if (template) {
    let tmp = MailspringProviderSettings[domain];
    if (tmp && tmp.imap_host && tmp.imap_host === template.imap_host && !fromAlias) {
      return { ret: true };
    }
    if (
      tmp &&
      !tmp.imap_host &&
      (tmp.alias === provider.defaultDomain || tmp.alias === provideAlias)
    ) {
      return { ret: true };
    }
    if (provider.incorrectEmail) {
      return { ret: false, message: provider.incorrectEmail };
    }
  }
  return { ret: false, message: `Entered email is not a valid ${provider.displayName} address.` };
}

export async function expandAccountWithCommonSettings(account, forceDomain = null) {
  const domain = account.emailAddress
    .split('@')
    .pop()
    .toLowerCase();
  const mxRecords = await mxRecordsForDomain(forceDomain || domain);
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
      if (new RegExp(`^${test}$`).test(forceDomain || domain)) {
        // domain-exclude
        for (const testExclude of p['domain-exclude'] || []) {
          if (new RegExp(`^${testExclude}$`).test(forceDomain || domain)) {
            return false;
          }
        }
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
    populated.mailsync = Object.assign(AppEnv.config.get('core.mailsync'), populated.mailsync);
    return populated;
  }

  // find matching template by domain or provider in the old lookup tables
  // this matches the account type presets ("yahoo") and common domains against
  // data derived from Thunderbirds ISPDB.
  template =
    MailspringProviderSettings[forceDomain || domain] ||
    MailspringProviderSettings[account.provider];
  if (template) {
    if (template.alias) {
      template = MailspringProviderSettings[template.alias];
    }
    console.log(`Using EdisonMail Template: ${JSON.stringify(template, null, 2)}`);
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
  populated.mailsync = Object.assign(AppEnv.config.get('core.mailsync'), populated.mailsync);
  return populated;
}

export async function buildOffice365AccountFromAuthResponse(code) {
  /// Exchange code for an access token
  const body = [];
  body.push(`code=${encodeURIComponent(code)}`);
  body.push(`client_id=${encodeURIComponent(OFFICE365_CLIENT_ID)}`);
  body.push(`client_secret=${encodeURIComponent(OFFICE365_CLIENT_SECRET)}`);
  body.push(`redirect_uri=${encodeURIComponent(EDISON_REDIRECT_URI)}`);
  body.push(`grant_type=${encodeURIComponent('authorization_code')}`);

  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    body: body.join('&'),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
  });

  const json = (await resp.json()) || {};
  if (!resp.ok) {
    throw new Error(
      `Office365 OAuth Code exchange returned ${resp.status} ${resp.statusText}: ${JSON.stringify(
        json
      )}`
    );
  }
  const { access_token, refresh_token } = json;

  // get the user's email address
  const meResp = await fetch('https://graph.microsoft.com/v1.0/me', {
    method: 'GET',
    headers: {
      Authorization: `${access_token}`,
      'Content-Type': 'application/json',
    },
  });
  const me = await meResp.json();
  if (!meResp.ok) {
    throw new Error(
      `Office365 profile request returned ${resp.status} ${resp.statusText}: ${JSON.stringify(me)}`
    );
  }
  const account = await expandAccountWithCommonSettings(
    new Account({
      name: me.name,
      emailAddress: me.email,
      provider: 'office365',
      settings: {
        refresh_client_id: OFFICE365_CLIENT_ID,
        refresh_token: refresh_token,
      },
    })
  );

  account.id = idForAccount(me.email, account.settings);

  // test the account locally to ensure the All Mail folder is enabled
  // and the refresh token can be exchanged for an account token.
  return await finalizeAndValidateAccount(account);
}

export async function buildOutlookAccountFromAuthResponse(code) {
  /// Exchange code for an access token
  const body = [];
  body.push(`code=${encodeURIComponent(code)}`);
  body.push(`client_id=${encodeURIComponent(OUTLOOK_CLIENT_ID)}`);
  body.push(`client_secret=${encodeURIComponent(OUTLOOK_CLIENT_SECRET)}`);
  body.push(`redirect_uri=${encodeURIComponent(EDISON_REDIRECT_URI)}`);
  body.push(`grant_type=${encodeURIComponent('authorization_code')}`);

  const resp = await fetch('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    body: body.join('&'),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
  });

  const json = (await resp.json()) || {};
  if (!resp.ok) {
    throw new Error(
      `Office365 OAuth Code exchange returned ${resp.status} ${resp.statusText}: ${JSON.stringify(
        json
      )}`
    );
  }
  const { access_token, refresh_token } = json;

  // get the user's email address
  const meResp = await fetch('https://apis.live.net/v5.0/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });
  const me = await meResp.json();
  if (!meResp.ok) {
    throw new Error(
      `Outlook profile request returned ${resp.status} ${resp.statusText}: ${JSON.stringify(me)}`
    );
  }
  const account = await expandAccountWithCommonSettings(
    new Account({
      name: me.name,
      emailAddress: me.emails.account,
      provider: 'outlook',
      settings: {
        refresh_client_id: OUTLOOK_CLIENT_ID,
        refresh_token: refresh_token,
      },
    })
  );

  account.id = idForAccount(me.email, account.settings);

  // test the account locally to ensure the All Mail folder is enabled
  // and the refresh token can be exchanged for an account token.
  return await finalizeAndValidateAccount(account);
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
  return await finalizeAndValidateAccount(account);
}

export async function connectChat(account) {
  AppEnv.showErrorDialog({
    title: 'debug',
    message: 'test',
  });

  const body = {
    name: account.emailAddress,
    emailType: 0,
    emailProvider: 'gmail',
    emailHost: 'imap.gmail.com',
    emailSSL: true,
    emailPort: 993,
    emailAddress: account.emailAddress,
    emailPassword: account.settings.refresh_token,
    deviceType: 'iPhone', // iPhone, iPad, APhone(AndroidPhone), APad(AndroidPad), MAC, etc
    deviceModel: 'iPhone 7',
  };

  const query = queryStringify(body, true);
  const registerUrl = `${EDISON_CHAT_REST_BASE_URL}/${EDISON_CHAT_REST_ENDPOINTS.register}`;

  console.log(query);
  console.log(registerUrl);

  const resp = await fetch(registerUrl, {
    method: 'POST',
    body: query,
  });
  console.log(resp);
  const json = (await resp.json()) || {};
  console.log(json);
}

export async function buildYahooAccountFromAuthResponse(code) {
  const body = [
    `client_id=${encodeURIComponent(YAHOO_CLIENT_ID)}`,
    `client_secret=${encodeURIComponent(YAHOO_CLIENT_SECRET)}`,
    `code=${encodeURIComponent(code)}`,
    'grant_type=authorization_code',
    `redirect_uri=${encodeURIComponent(EDISON_REDIRECT_URI)}`,
  ].join('&');

  const resp = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    body: body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
  });

  const json = (await resp.json()) || {};
  if (!resp.ok) {
    throw new Error(
      `Yahoo OAuth Code exchange returned ${resp.status} ${resp.statusText}: ${JSON.stringify(
        json
      )}`
    );
  }

  // extracting access and refresh tokens
  const { access_token, refresh_token } = json;

  // get the user's email address
  const meResp = await fetch('https://social.yahooapis.com/v1/user/me/profile?format=json', {
    method: 'GET',
    headers: { Authorization: `Bearer ${access_token}` },
  });

  const me = await meResp.json();
  if (!meResp.ok) {
    throw new Error(
      `Yahoo profile request returned ${resp.status} ${resp.statusText}: ${JSON.stringify(me)}`
    );
  }

  const { givenName, familyName, guid } = me.profile;

  let fullName = givenName;
  if (familyName) {
    fullName += ` ${familyName}`;
  }

  let email = fullName + '/Yahoo';
  if (me.profile.emails[0] && me.profile.emails[0].handle) {
    email = me.profile.emails[0].handle;
  }

  const account = await expandAccountWithCommonSettings(
    new Account({
      name: fullName,
      emailAddress: email,
      provider: 'yahoo',
      settings: {
        refresh_client_id: YAHOO_CLIENT_ID,
        refresh_token: refresh_token,
      },
    })
  );
  account.settings.imap_username = account.settings.smtp_username = guid;

  account.id = idForAccount(email, account.settings);

  // test the account locally to ensure the All Mail folder is enabled
  // and the refresh token can be exchanged for an account token.
  return await finalizeAndValidateAccount(account);
}

export function buildOffice365AuthURL() {
  return (
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
    `?` +
    `client_id=${OFFICE365_CLIENT_ID}` +
    `&scope=${encodeURIComponent(OFFICE365_SCOPES.join(' '))}` +
    `&redirect_uri=${encodeURIComponent(EDISON_REDIRECT_URI)}` +
    `&state=${EDISON_OAUTH_KEYWORD}` +
    `&response_type=code`
  );
}

export function buildOutlookAuthURL() {
  return (
    `https://login.live.com/oauth20_authorize.srf` +
    `?` +
    `client_id=${OUTLOOK_CLIENT_ID}` +
    `&scope=${encodeURIComponent(OUTLOOK_SCOPES.join(' '))}` +
    `&redirect_uri=${encodeURIComponent(EDISON_REDIRECT_URI)}` +
    `&state=${EDISON_OAUTH_KEYWORD}` +
    `&response_type=code`
  );
}

export function buildYahooAuthURL() {
  return (
    `https://api.login.yahoo.com/oauth2/request_auth` +
    `?` +
    `client_id=${YAHOO_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(EDISON_REDIRECT_URI)}` +
    `&state=${EDISON_OAUTH_KEYWORD}` +
    `&response_type=code`
  );
}

export function buildGmailAuthURL() {
  return (
    `https://accounts.google.com/o/oauth2/auth` +
    `?` +
    `client_id=${GMAIL_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(LOCAL_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(GMAIL_SCOPES.join(' '))}` +
    `&access_type=offline` +
    `&select_account%20consent`
  );
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
  const newAccount = response.account;
  if (account.mailsync) {
    newAccount.mailsync = account.mailsync;
    delete newAccount.mailsync.accounts;
  }
  Actions.siftUpdateAccount(newAccount);
  // preload mail data
  proc.sync();
  return new Account(newAccount);
}
