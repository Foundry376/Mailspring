/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import Sift from '../../../src/flux/models/sift';
const _ = require('underscore');
const {
  Actions,
  SyncbackCategoryTask,
  CategoryStore,
  Label,
  ExtensionRegistry,
  RegExpUtils,
  OutboxStore,
} = require('mailspring-exports');

const SidebarItem = require('./sidebar-item');
const SidebarActions = require('./sidebar-actions');
const DIVIDER_OBJECT = { id: 'divider' };

function isSectionCollapsed(title) {
  if (AppEnv.savedState.sidebarKeysCollapsed[title] !== undefined) {
    return AppEnv.savedState.sidebarKeysCollapsed[title];
  } else {
    return false;
  }
}

function toggleSectionCollapsed(section) {
  if (!section) {
    return;
  }
  SidebarActions.setKeyCollapsed(section.title, !isSectionCollapsed(section.title));
}

class SidebarSection {
  static empty(title) {
    return {
      title,
      items: [],
    };
  }

  static standardSectionForAccount(account) {
    if (!account) {
      throw new Error('standardSectionForAccount: You must pass an account.');
    }

    const cats = CategoryStore.standardCategories(account);
    if (cats.length === 0) {
      return this.empty(account.label);
    }

    const items = _.reject(cats, cat => (cat.role === 'drafts') || (cat.role === 'archive')).map(cat => {
      if (cat.role === 'all' && account.provider === 'gmail') {
        return SidebarItem.forAllMail(cat, { editable: false, deletable: false });
      } else {
        return SidebarItem.forCategories([cat], { editable: false, deletable: false });
      }
    }
    );
    const unreadItem = SidebarItem.forUnread([account.id]);
    const starredItem = SidebarItem.forStarred([account.id], { displayName: 'Flagged' });
    const draftsItem = SidebarItem.forDrafts([account.id]);
    // const attachmentsMail = SidebarItem.forAttachments([account.id]);

    // Order correctly: Inbox, Unread, Starred, rest... , Drafts
    if (draftsItem) {
      items.splice(1, 0, DIVIDER_OBJECT, unreadItem, starredItem, draftsItem);
    } else {
      items.splice(1, 0, DIVIDER_OBJECT, unreadItem, starredItem);
    }
    if (account.provider !== 'gmail') {
      const archiveMail = SidebarItem.forArchived([account.id]);
      if (archiveMail) {
        items.push(archiveMail);
      }
    }
    items.push(DIVIDER_OBJECT);
    items.push(...this.accountUserCategories(account));
    ExtensionRegistry.AccountSidebar.extensions()
      .filter(ext => ext.sidebarItem != null)
      .forEach(ext => {
        const { id, name, iconName, perspective, insertAtTop } = ext.sidebarItem([account.id]);
        const item = SidebarItem.forPerspective(id, perspective, { name, iconName });
        if (insertAtTop) {
          return items.splice(3, 0, item);
        } else {
          return items.push(item);
        }
      });

    return {
      title: 'MAILBOXES',
      items,
    };
  }

  static standardSectionForAccounts(accounts) {
    const items = [];
    const outboxCount = OutboxStore.count();
    const outboxOpts = {
      counterStyle: outboxCount.failed > 0 ? 'critical' : 'alt',
    };
    let outbox;
    if (accounts.length === 1) {
      outbox = SidebarItem.forOutbox([accounts[0].id], outboxOpts);
    } else {
      outbox = SidebarItem.forOutbox(accounts.map(act => act.id), outboxOpts);
    }
    if (!accounts || accounts.length === 0) {
      return this.empty('All Accounts');
    }
    if (CategoryStore.categories().length === 0) {
      return this.empty('All Accounts');
    }
    if (accounts.length === 1) {
      const ret = this.standardSectionForAccount(accounts[0]);
      if (outboxCount.total > 0) {
        const inbox = ret.items.shift();
        ret.items.unshift(outbox);
        ret.items.unshift(inbox);
      }
      SidebarSection.forSiftCategories([accounts[0]], ret.items);
      return ret;
    } else {
      if (outboxCount.total > 0) {
        items.push(outbox);
      }
      accounts.forEach(acc => {
        let item = SidebarItem.forSingleInbox([acc.id], {
          name: acc.label,
          threadTitleName: 'Inbox',
          children: this.standardSectionForAccount(acc).items,
        });
        items.push(item);
      });
    }

    const accountIds = _.pluck(accounts, 'id');
    let folderItem = SidebarItem.forAllInbox(accountIds, { displayName: 'All Inboxes' });
    if (folderItem) {
      items.unshift(DIVIDER_OBJECT);
      items.unshift(folderItem);
    }
    items.push(DIVIDER_OBJECT);
    folderItem = SidebarItem.forUnread(accountIds, { displayName: 'Unread' });
    if (folderItem) {
      items.push(folderItem);
    }
    folderItem = SidebarItem.forStarred(accountIds, { displayName: 'Flagged' });
    if (folderItem) {
      items.push(folderItem);
    }
    folderItem = SidebarItem.forDrafts(accountIds, { displayName: 'All Drafts' });
    if (folderItem) {
      items.push(folderItem);
    }
    // folderItem = SidebarItem.forSnoozed(accountIds, { displayName: 'Snoozed' });
    // if (folderItem) {
    //   items.push(folderItem);
    // }
    folderItem = SidebarItem.forSpam(accountIds, { dispalyName: 'Spam' });
    if (folderItem) {
      items.push(folderItem);
    }
    folderItem = SidebarItem.forAllTrash(accountIds, { dispalyName: 'Trash' });
    if (folderItem) {
      items.push(folderItem);
    }

    folderItem = SidebarItem.forArchived(accountIds, { displayName: 'All Archive', name: 'allArchive' });
    if (folderItem) {
      items.push(folderItem);
    }
    folderItem = SidebarItem.forSentMails(accountIds, { dispalyName: 'All Sent' });
    if (folderItem) {
      items.push(folderItem);
    }
    SidebarSection.forSiftCategories(accountIds, items);

    ExtensionRegistry.AccountSidebar.extensions()
      .filter(ext => ext.sidebarItem != null)
      .forEach(ext => {
        const { id, name, iconName, perspective, insertAtTop } = ext.sidebarItem(accountIds);
        const item = SidebarItem.forPerspective(id, perspective, {
          name,
          iconName,
          children: accounts.map(acc => {
            const subItem = ext.sidebarItem([acc.id]);
            return SidebarItem.forPerspective(subItem.id + `-${acc.id}`, subItem.perspective, {
              name: acc.label,
              iconName: subItem.iconName,
            });
          }),
        });
        if (insertAtTop) {
          items.splice(3, 0, item);
        } else {
          items.push(item);
        }
      });
    return {
      title: 'MAILBOXES',
      items,
    };
  }

  static accountUserCategories(account, { title, collapsible } = {}) {
    const items = [];
    const seenItems = {};
    for (let category of CategoryStore.userCategories(account)) {
      // https://regex101.com/r/jK8cC2/1
      var item, parentKey;
      const re = RegExpUtils.subcategorySplitRegex();
      const itemKey = category.displayName.replace(re, '/');
      if (itemKey.toLocaleLowerCase().includes('inbox/')) {
        continue;
      }
      let parent = null;
      const parentComponents = itemKey.split('/');
      for (let i = parentComponents.length; i >= 1; i--) {
        parentKey = parentComponents.slice(0, i).join('/');
        parent = seenItems[parentKey.toLocaleLowerCase()];
        if (parent) {
          break;
        }
      }

      if (!parent) {
        if (!category.displayName.match(re)) {
          item = SidebarItem.forCategories([category]);
          items.push(item);
        } else {
          item = null;
        }
      }
      if (item) {
        seenItems[itemKey.toLocaleLowerCase()] = item;
      }
    }
    return items;
  }

  static forUserCategories(account, { title, collapsible } = {}) {
    let onCollapseToggled;
    if (!account) {
      return;
    }
    // Compute hierarchy for user categories using known "path" separators
    // NOTE: This code uses the fact that userCategoryItems is a sorted set, eg:
    //
    // Inbox
    // Inbox.FolderA
    // Inbox.FolderA.FolderB
    // Inbox.FolderB
    //
    const items = [];
    const seenItems = {};
    for (let category of CategoryStore.userCategories(account)) {
      // https://regex101.com/r/jK8cC2/1
      var item, parentKey;
      const re = RegExpUtils.subcategorySplitRegex();
      const itemKey = category.displayName.replace(re, '/');

      let parent = null;
      const parentComponents = itemKey.split('/');
      for (let i = parentComponents.length; i >= 1; i--) {
        parentKey = parentComponents.slice(0, i).join('/');
        parent = seenItems[parentKey];
        if (parent) {
          break;
        }
      }

      if (parent) {
        const itemDisplayName = category.displayName.substr(parentKey.length + 1);
        item = SidebarItem.forCategories([category], { name: itemDisplayName });
        parent.children.push(item);
      } else {
        item = SidebarItem.forCategories([category]);
        items.push(item);
      }
      seenItems[itemKey] = item;
    }

    const inbox = CategoryStore.getInboxCategory(account);
    let iconName = null;

    if (inbox && inbox.constructor === Label) {
      if (title == null) {
        title = 'Labels';
      }
      iconName = 'tag.png';
    } else {
      if (title == null) {
        title = 'Folders';
      }
      iconName = 'folder.png';
    }
    const collapsed = isSectionCollapsed(title);
    if (collapsible) {
      onCollapseToggled = toggleSectionCollapsed;
    }

    return {
      title,
      iconName,
      items,
      collapsed,
      onCollapseToggled,
      onItemCreated(displayName) {
        if (!displayName) {
          return;
        }
        Actions.queueTask(
          SyncbackCategoryTask.forCreating({
            name: displayName,
            accountId: account.id,
          }),
        );
      },
    };
  }

  static forSiftCategories(accountsOrIds, items) {
    if (!Array.isArray(accountsOrIds) || !Array.isArray(items)) {
      return;
    }
    let accountIds = accountsOrIds;
    if (accountsOrIds[0].id) {
      accountIds = accountsOrIds.map(acct => acct.id);
    }
    let folderItem = SidebarItem.forSift(accountIds, Sift.categories.Travel);
    if (folderItem) {
      items.push(folderItem);
    }
    folderItem = SidebarItem.forSift(accountIds, Sift.categories.Packages);
    if (folderItem) {
      items.push(folderItem);
    }
    folderItem = SidebarItem.forSift(accountIds, Sift.categories.Bill);
    if (folderItem) {
      items.push(folderItem);
    }
    folderItem = SidebarItem.forSift(accountIds, Sift.categories.Entertainment);
    if (folderItem) {
      items.push(folderItem);
    }
  }
}

module.exports = SidebarSection;
