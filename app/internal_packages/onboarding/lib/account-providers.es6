import { React } from 'mailspring-exports';

const AccountProviders = [
  {
    provider: 'gmail',
    displayName: 'Gmail or G Suite',
    icon: 'ic-settings-account-gmail.png',
    headerIcon: 'setup-icon-provider-gmail.png',
    color: '#e99999',
  },
  {
    provider: 'office365',
    displayName: 'Office 365',
    icon: 'ic-settings-account-office365.png',
    headerIcon: 'setup-icon-provider-office365.png',
    color: '#D83B01',
  },
  {
    provider: 'yahoo',
    displayName: 'Yahoo',
    icon: 'ic-settings-account-yahoo.png',
    headerIcon: 'setup-icon-provider-yahoo.png',
    color: '#a76ead',
  },
  {
    provider: 'outlook',
    displayName: 'Outlook.com / Hotmail',
    displayNameShort: 'Outlook',
    icon: 'ic-settings-account-outlook.png',
    headerIcon: 'setup-icon-provider-outlook.png',
    color: '#0078d7',
  },
  {
    provider: 'icloud',
    displayName: 'iCloud',
    note: (
      <span>
        <strong>Important:</strong> iCloud requires that you create a unique app password for email
        apps like Mailspring. Follow{' '}
        <a href="https://support.apple.com/en-us/HT204397">these instructions</a> to create one and
        then paste it below.
      </span>
    ),
    icon: 'ic-settings-account-icloud.png',
    headerIcon: 'setup-icon-provider-icloud.png',
    color: '#61bfe9',
  },
  {
    provider: 'fastmail',
    displayName: 'FastMail',
    icon: 'ic-settings-account-fastmail.png',
    headerIcon: 'setup-icon-provider-fastmail.png',
    color: '#24345a',
  },
  {
    provider: 'gmx',
    displayName: 'GMX',
    note: (
      <span>
        Enter your email account credentials to get started.<br />
        <strong>Important:</strong> GMX requires that you{' '}
        <a href="https://support.gmx.com/pop-imap/toggle.html">enable IMAP</a> before using email
        clients like Mailspring.
      </span>
    ),
    icon: 'ic-settings-account-gmx.png',
    headerIcon: 'setup-icon-provider-gmx.png',
    color: '#1D387F',
  },
  {
    provider: 'yandex',
    displayName: 'Yandex',
    note: (
      <span>
        <strong>Important:</strong> You may need to{' '}
        <a href="https://phone-passport.yandex.com/phones">link a phone number</a> to your Yandex
        account before connecting email apps. If you use two-factor auth, you need to create an{' '}
        <a href="https://yandex.com/support/passport/authorization/app-passwords.html">
          App Password
        </a>{' '}
        for Mailspring.
      </span>
    ),
    icon: 'ic-settings-account-yandex.png',
    headerIcon: 'setup-icon-provider-yandex.png',
    color: '#fff',
  },
  {
    provider: 'exchange',
    displayName: 'EXCHANGE',
    displayNameShort: 'EXCHANGE',
    icon: 'ic-settings-account-exchange.png',
    headerIcon: 'setup-icon-provider-exchange.png',
    color: '#0078d7',
  },
  {
    provider: 'imap',
    displayName: 'IMAP / SMTP',
    displayNameShort: 'IMAP',
    icon: 'ic-settings-account-imap.png',
    headerIcon: 'setup-icon-provider-imap.png',
    color: '#aaa',
  },
];

export default AccountProviders;
