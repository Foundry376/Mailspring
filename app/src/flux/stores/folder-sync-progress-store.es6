import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import AccountStore from './account-store';
import CategoryStore from './category-store';
import Folder from '../models/folder';

/**
 * FolderSyncProgressStore keeps track of the sync state per account, and will
 * trigger whenever it changes.
 *
 * The sync state for any given account has the following shape:
 *
 *   {
 *     [Gmail]/Inbox: {
 *       scanProgress: 0.5,
 *       bodyProgress: 0,
 *       total: 100,
 *     }
 *     MyFunLabel: {
 *       scanProgress: 1,
 *       bodyProgress: 0.2,
 *       total: 600,
 *     },
 *     ...
 *   }
 *
 */
class FolderSyncProgressStore extends MailspringStore {
  constructor() {
    super();
    this._statesByAccount = {};
    this._stateSummary = {
      phrase: null,
      percent: 100,
    };
    this._triggerDebounced = _.debounce(this.trigger, 100);

    this.listenTo(AccountStore, () => this._onRefresh());
    this.listenTo(CategoryStore, () => this._onRefresh());
    this._onRefresh();
  }

  _onRefresh() {
    this._statesByAccount = {};

    let totalProgress = 0;
    let totalWeight = 0;

    for (const accountId of AccountStore.accountIds()) {
      const folders = CategoryStore.categories(accountId).filter(cat => cat instanceof Folder);
      const state = {};

      /*
      `localStatus` is populated by C++ mailsync. We translate it to a simpler
      representation that the JS side can rely on as the underlying
      implementation changes.
      */
      for (const folder of folders) {
        const { uidnext = 1, busy = true, syncedMinUID, bodiesPresent, bodiesWanted, messagesPresent, messagesWanted } =
          folder.localStatus || {};

        state[folder.path] = {
          busy: busy,
          // scanProgress: syncedMinUID > 0 ? 1.0 - (syncedMinUID - 1) / uidnext : 0,
          scanProgress: messagesWanted > 0 ? messagesPresent / messagesWanted : 1,
          bodyProgress: bodiesWanted > 0 ? bodiesPresent / bodiesWanted : 1,
        };

        // assume index will take 40% of time, body sync will take 60%.
        // weight the "importance" of these percents based on a rough guess
        // of the size of the folder (via uidnext, which is more a measure
        // of mailbox activity than size)
        // const weight = uidnext / 10000;
        const weight = messagesWanted / 1000;
        const scanPercent = ['spam', 'trash'].includes(folder.role) ? 1 : 0.4;
        totalProgress += state[folder.path].scanProgress * weight * scanPercent;
        totalProgress += state[folder.path].bodyProgress * weight * (1 - scanPercent);
        totalWeight += weight;
      }

      this._statesByAccount[accountId] = state;
    }

    this._stateSummary = {
      progress: totalProgress / (totalWeight || 1),
      phrase: this._determineSummaryPhrase(),
    };

    this._triggerDebounced();
  }

  getSyncState() {
    return this._statesByAccount;
  }

  getSummary() {
    return this._stateSummary;
  }

  _determineSummaryPhrase() {
    // if any folder scan is in progress we show "Syncing your Mailbox".
    // if any body scan is in progress we show "Indexing Recent Mail"
    // if busy we show "Checking for Mail"
    // else null
    let result = 0;
    for (const aid of Object.keys(this._statesByAccount)) {
      for (const folderState of Object.values(this._statesByAccount[aid])) {
        if (!folderState.busy) {
          continue;
        }

        if (folderState.scanProgress < 1) {
          result = Math.max(result, 3);
        } else if (folderState.bodyProgress < 1) {
          result = Math.max(result, 2);
        } else {
          result = Math.max(result, 1);
        }
      }
      if (result > 1) break;
    }
    return [null, 'Checking for mail', 'Caching recent mail', 'Scanning messages'][result];
  }

  /**
   * Returns true if Mailspring's local cache contains the entire list of available
   * folders and labels.
   *
   * This will be true if any of the available folders have started syncing,
   * since mailsync doesn't start folder sync until it has fetched the whole list
   * of folders and labels.
   */
  isCategoryListSynced(accountId) {
    const state = this._statesByAccount[accountId];
    if (!state) {
      return false;
    }
    return Object.values(state).some(i => i.scanProgress > 0);
  }

  whenCategoryListSynced(accountId) {
    if (this.isCategoryListSynced(accountId)) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const unsubscribe = this.listen(() => {
        if (this.isCategoryListSynced(accountId)) {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  isSyncingAccount(accountId, folderPath) {
    const state = this._statesByAccount[accountId];

    if (!state || !this.isCategoryListSynced(accountId)) {
      return true;
    }

    if (folderPath) {
      return state[folderPath] && state[folderPath].busy;
    }

    const folderPaths = Object.keys(state);
    return folderPaths.some(p => state[p].busy);
  }

  isSyncing() {
    return Object.keys(this._statesByAccount).some(aid => this.isSyncingAccount(aid));
  }

  whenSyncComplete() {
    if (!this.isSyncing()) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const unsubscribe = this.listen(() => {
        if (!this.isSyncing()) {
          unsubscribe();
          resolve();
        }
      });
    });
  }
}

export default new FolderSyncProgressStore();
