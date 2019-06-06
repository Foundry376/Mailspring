import Task from './task';
import Attributes from '../attributes';
import Message from '../models/message';
import Account from '../models/account';

export default class SyncbackDraftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    headerMessageId: Attributes.String({
      modelKey: 'headerMessageId',
    }),
    saveOnRemote: Attributes.Boolean({
      modelKey: 'saveOnRemote',
    }),
    draft: Attributes.Object({
      modelKey: 'draft',
      itemClass: Message,
    }),
  });

  constructor({ draft, ...rest } = {}) {
    super(rest);
    this.draft = draft;
    this.accountId = (draft || {}).accountId;
    this.headerMessageId = (draft || {}).headerMessageId;
  }

  onError({ key, debuginfo, retryable }) {
    if (retryable) {
      console.warn(`retrying task because ${debuginfo}`);
      return;
    }
    if (key === 'no-drafts-folder') {
      AppEnv.showErrorDialog({
        title: 'Drafts folder not found',
        message:
          'Edison Mail can\'t find your Drafts folder. To create and send mail, visit Preferences > Folders and' +
          ' choose a Drafts folder.',
      });
    } else {
      if (key === 'ErrorAccountNotConnected') {
        let accounts = AppEnv.config.get('accounts');
        if (Array.isArray(accounts)) {
          let errorAccount = { emailAddress: '' };
          let newAccounts = accounts.map(account => {
            if (account.id === this.accountId) {
              account.syncState = Account.SYNC_STATE_AUTH_FAILED;
              errorAccount.emailAddress = account.emailAddress;
              return account;
            } else {
              return account;
            }
          });
          AppEnv.config.set('accounts', newAccounts);
          // AppEnv.showErrorDialog(`Cannot authenticate with ${errorAccount.emailAddress}`, { detail: debuginfo });
        }
      } else if (AppEnv.inDevMode()){
        AppEnv.showErrorDialog('Draft processing failed', { detail: debuginfo });
      }
    }
  }
}
