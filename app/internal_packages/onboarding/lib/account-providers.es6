import { React } from 'mailspring-exports';
const twoStep = (<div className="two-step">
  <span>Use two-step verification on your account? make sure to enter your
app-specific password or check with your mail provider about your
app-specific password. </span>
  <br /><br />
  <span>POP accounts are not supported in this version. </span>
</div>);
const AccountProviders = [
  {
    provider: 'gmail',
    displayName: 'Gmail',
    icon: 'account-logo-gmail.png',
    headerIcon: 'setup-icon-provider-gmail.png',
    color: '#e99999',
  },
  {
    provider: 'yahoo',
    displayName: 'Yahoo',
    icon: 'account-logo-yahoo.png',
    headerIcon: 'setup-icon-provider-yahoo.png',
    color: '#a76ead',
  },
  {
    provider: 'icloud',
    displayName: 'iCloud',
    note: (
      <span>
        Apple requires all third-party apps that access iCloud information to utilize app-specific passwords, this includes our Email app.
        <br /><br />
        <a href="https://support.apple.com/en-us/HT204397"><strong>iCloud App-Specific Passwords Help</strong></a>
      </span>
    ),
    icon: 'account-logo-icloud.png',
    headerIcon: 'setup-icon-provider-icloud.png',
    color: '#61bfe9',
    defaultDomain: 'icloud.com',
    incorrectEmail: 'Make sure to use your "@icloud.com" address, not your icloud Id.',
  },
  {
    provider: 'outlook',
    displayName: 'Outlook',
    displayNameShort: 'Outlook',
    icon: 'account-logo-outlook.png',
    headerIcon: 'setup-icon-provider-outlook.png',
    color: '#0078d7',
    twoStep
  },
  {
    provider: 'office365',
    displayName: 'Office365',
    icon: 'account-logo-office365.png',
    headerIcon: 'setup-icon-provider-office365.png',
    color: '#D83B01',
    twoStep
  },
  // {
  //   provider: 'fastmail',
  //   displayName: 'FastMail',
  //   icon: 'account-logo-fastmail.png',
  //   headerIcon: 'setup-icon-provider-fastmail.png',
  //   color: '#24345a',
  // },
  {
    provider: 'aol',
    displayName: 'Aol',
    icon: 'account-logo-aol.png',
    headerIcon: 'setup-icon-provider-yahoo.png',
    color: '#a76ead',
    twoStep,
    defaultDomain: 'aol.com',
  },
  {
    provider: 'hotmail',
    displayName: 'Hotmail',
    icon: 'account-logo-hotmail.png',
    headerIcon: 'setup-icon-provider-yahoo.png',
    color: '#a76ead',
    twoStep,
    defaultDomain: 'hotmail.com',
  },
  {
    provider: 'att',
    displayName: 'AT&T',
    icon: 'account-logo-att.png',
    headerIcon: 'setup-icon-provider-yahoo.png',
    color: '#a76ead',
    twoStep,
    defaultDomain: 'att.net',
  },
  // {
  //   provider: 'yandex',
  //   displayName: 'Yandex',
  //   note: (
  //     <span>
  //       <strong>Important:</strong> You may need to{' '}
  //       <a href="https://phone-passport.yandex.com/phones">link a phone number</a> to your Yandex
  //       account before connecting email apps. If you use two-factor auth, you need to create an{' '}
  //       <a href="https://yandex.com/support/passport/authorization/app-passwords.html">
  //         App Password
  //       </a>{' '}
  //       for EdisonMail.
  //     </span>
  //   ),
  //   icon: 'account-logo-yandex.png',
  //   headerIcon: 'setup-icon-provider-yandex.png',
  //   color: '#fff',
  // },
  // {
  //   provider: 'exchange',
  //   displayName: 'EXCHANGE',
  //   displayNameShort: 'EXCHANGE',
  //   icon: 'account-logo-exchange.png',
  //   headerIcon: 'setup-icon-provider-exchange.png',
  //   color: '#0078d7',
  // },
  {
    provider: 'imap',
    displayName: 'Other/IMAP',
    displayNameShort: 'IMAP',
    icon: 'account-logo-other.png',
    headerIcon: 'setup-icon-provider-imap.png',
    color: '#aaa',
    twoStep
  },
];

export default AccountProviders;
