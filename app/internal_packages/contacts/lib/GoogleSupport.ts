import { AccountStore, localized } from 'mailspring-exports';


const CONTACTS_OAUTH_SCOPE_ADDED = new Date(1581867440474);

export const showGPeopleReadonlyNotice = (accountId: string) => {
  const acct = AccountStore.accountForId(accountId);
  if (
    acct &&
    acct.provider === 'gmail' &&
    (!acct.authedAt || acct.authedAt < CONTACTS_OAUTH_SCOPE_ADDED)
  ) {
    require('@electron/remote').dialog.showMessageBoxSync({
      message: localized(`Please re-authenticate with Google`),
      detail: localized(
        `To make changes to contacts in this account, you'll need to re-authorize Mailspring to access your data.\n\n` +
        `In Mailspring's main window, go to Preferences > Accounts, select this account, and click "Re-authenticate". ` +
        `You'll be prompted to give Mailspring additional permission to update and delete your contacts.`
      ),
    });
    return true;
  }
  return false;
};
