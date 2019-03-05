import { localized, localizedReactFragment, React } from 'mailspring-exports';

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
    note: (
      <span>
        <strong>{localized('Important')}:</strong>{' '}
        {localizedReactFragment(
          'Yahoo requires that you create a unique app password for email apps like Mailspring. Follow %@ to create one and then paste it below.',
          <a href="https://help.yahoo.com/kb/SLN15241.html?guccounter=1">
            {localized('these instructions')}
          </a>
        )}
      </span>
    ),
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
        <strong>{localized('Important')}:</strong>{' '}
        {localizedReactFragment(
          'iCloud requires that you create a unique app password for email apps like Mailspring. Follow %@ to create one and then paste it below.',
          <a href="https://support.apple.com/en-us/HT204397">{localized('these instructions')}</a>
        )}
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
        {localized('Enter your email account credentials to get started.')}
        <br />
        <strong>{localized('Important')}:</strong>{' '}
        {localizedReactFragment(
          'GMX requires that you %@ before using email clients like Mailspring.',
          <a href="https://support.gmx.com/pop-imap/toggle.html">{localized('enable IMAP')}</a>
        )}
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
        <strong>{localized('Important')}:</strong>
        {localizedReactFragment(
          'You may need to %@ to your Yandex account before connecting email apps. If you use two-factor auth, you need to create an %@ for Mailspring.',
          <a href="https://phone-passport.yandex.com/phones">{localized('link a phone number')}</a>,
          <a href="https://yandex.com/support/passport/authorization/app-passwords.html">
            {localized('App Password')}
          </a>
        )}
      </span>
    ),
    icon: 'ic-settings-account-yandex.png',
    headerIcon: 'setup-icon-provider-yandex.png',
    color: '#fff',
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
