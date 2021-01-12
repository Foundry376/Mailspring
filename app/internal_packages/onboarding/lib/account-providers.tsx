import { localized, localizedReactFragment, React } from 'mailspring-exports';

const AccountProviders = [
  {
    provider: 'gmail',
    displayName: 'Gmail or G Suite',
    icon: 'ic-settings-account-gmail.png',
    headerIcon: 'setup-icon-provider-gmail.png',
    color: '#FFFFFF00',
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
          <a
            style={{ fontWeight: 600 }}
            href="https://help.yahoo.com/kb/SLN15241.html?guccounter=1"
          >
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
          <a style={{ fontWeight: 600 }} href="https://support.apple.com/en-us/HT204397">
            {localized('these instructions')}
          </a>
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
    note: (
      <span>
        <strong>{localized('Important')}:</strong>{' '}
        {localizedReactFragment(
          'FastMail requires that you create a unique app password of type IMAP for email apps like Mailspring. Follow %@ to create one and then paste it below.',
          <a
            style={{ fontWeight: 600 }}
            href="https://www.fastmail.com/help/clients/apppassword.html"
          >
            {localized('these instructions')}
          </a>
        )}
      </span>
    ),
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
          <a style={{ fontWeight: 600 }} href="https://support.gmx.com/pop-imap/toggle.html">
            {localized('enable IMAP')}
          </a>
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
        <strong>{localized('Important')}:</strong>{' '}
        {localizedReactFragment(
          'You must %@ and you may need to %@ to connect to your Yandex account. If you use two-factor auth, you must create an %@ for Mailspring.',
          <a style={{ fontWeight: 600 }} href="https://mail.yandex.com/#setup/client">
            {localized('enable IMAP')}
          </a>,
          <a style={{ fontWeight: 600 }} href="https://phone-passport.yandex.com/phones">
            {localized('link a phone number')}
          </a>,
          <a
            style={{ fontWeight: 600 }}
            href="https://yandex.com/support/passport/authorization/app-passwords.html"
          >
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
