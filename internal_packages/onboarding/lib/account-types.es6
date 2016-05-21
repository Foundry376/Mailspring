import {RegExpUtils} from 'nylas-exports';

class AccountType {
  constructor({type, title, displayName, icon, headerIcon, color, settings}) {
    this.type = type;
    this.title = title;
    this.displayName = displayName;
    this.icon = icon;
    this.headerIcon = headerIcon;
    this.color = color;
    this.settings = settings;
  }
}

const AccountTypes = [
  new AccountType({
    type: 'gmail',
    displayName: 'Gmail or Google Apps',
    icon: 'ic-settings-account-gmail.png',
    headerIcon: 'setup-icon-provider-gmail.png',
    color: '#e99999',
    settings: [],
  }),
  new AccountType({
    type: 'exchange',
    title: 'Add your Exchange account',
    displayName: 'Microsoft Exchange',
    icon: 'ic-settings-account-eas.png',
    headerIcon: 'setup-icon-provider-exchange.png',
    color: '#1ea2a3',
    settings: [
      {
        name: 'username',
        type: 'text',
        placeholder: 'MYCORP\\bob (if known)',
        label: 'Username (optional)',
      }, {
        name: 'password',
        type: 'password',
        placeholder: 'Password',
        label: 'Password',
        required: true,
      }, {
        name: 'eas_server_host',
        type: 'text',
        placeholder: 'mail.company.com',
        label: 'Exchange server (optional)',
        page: 1,
      },
    ],
  }),
  new AccountType({
    type: 'icloud',
    displayName: 'iCloud',
    icon: 'ic-settings-account-icloud.png',
    headerIcon: 'setup-icon-provider-icloud.png',
    color: '#61bfe9',
  }),
  new AccountType({
    type: 'outlook',
    displayName: 'Outlook.com',
    icon: 'ic-settings-account-outlook.png',
    headerIcon: 'setup-icon-provider-outlook.png',
    color: '#1174c3',
  }),
  new AccountType({
    type: 'yahoo',
    displayName: 'Yahoo',
    icon: 'ic-settings-account-yahoo.png',
    headerIcon: 'setup-icon-provider-yahoo.png',
    color: '#a76ead',
    settings: [{
      name: 'password',
      type: 'password',
      placeholder: 'Password',
      label: 'Password',
      required: true,
    }],
  }),
  new AccountType({
    type: 'imap',
    displayName: 'IMAP / SMTP Setup',
    title: 'Setup your account',
    icon: 'ic-settings-account-imap.png',
    headerIcon: 'setup-icon-provider-imap.png',
    color: '#aaa',
    settings: [
      {
        name: 'imap_host',
        type: 'text',
        placeholder: 'imap.domain.com',
        label: 'IMAP Server',
        required: true,
      }, {
        name: 'imap_port',
        type: 'text',
        placeholder: '993',
        label: 'Port (optional)',
        className: 'half',
        initial: 993,
        format: 'integer',
      }, {
        name: 'ssl_required',
        type: 'checkbox',
        label: 'Require SSL',
        className: 'half',
        initial: true,
      }, {
        name: 'imap_username',
        type: 'text',
        placeholder: 'Username',
        label: 'Username',
        required: true,
      }, {
        name: 'imap_password',
        type: 'password',
        placeholder: 'Password',
        label: 'Password',
        required: true,
      }, {
        name: 'smtp_host',
        type: 'text',
        placeholder: 'smtp.domain.com',
        label: 'SMTP Server',
        required: true,
      }, {
        name: 'smtp_port',
        type: 'text',
        placeholder: '587',
        label: 'Port (optional)',
        className: 'half',
        format: 'integer',
        initial: 587,
      }, {
        name: 'ssl_required',
        type: 'checkbox',
        label: 'Require SSL',
        className: 'half',
        initial: true,
      }, {
        name: 'smtp_username',
        type: 'text',
        placeholder: 'Username',
        label: 'Username',
        required: true,
      }, {
        name: 'smtp_password',
        type: 'password',
        placeholder: 'Password',
        label: 'Password',
        required: true,
      },
    ],
  }),
]

export default AccountTypes;
