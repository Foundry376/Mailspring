import { AccountStore } from 'mailspring-exports';
import { remote } from 'electron';

export const showGPeopleReadonlyNotice = (accountId: string) => {
  const acct = AccountStore.accountForId(accountId);
  if (acct && acct.provider === 'gmail') {
    remote.dialog.showMessageBox({
      message: 'Coming Soon for Google Accounts',
      detail:
        "We've added support for creating, updating and deleting contacts in Google accounts, but Google is still reviewing Mailspring's use of the Google People API so we're unable to sync these changes back to their servers. Stay tuned!",
    });
    return true;
  }
  return false;
};
