/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const _ = require('underscore');
const {
  Actions,
  SyncbackCategoryTask,
  CategoryStore,
  Label,
  ExtensionRegistry,
  RegExpUtils,
} = require('mailspring-exports');

const SidebarItem = require('./sidebar-item');
const SidebarActions = require('./sidebar-actions');

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

    const items = _.reject(cats, cat => cat.role === 'drafts').map(cat =>
      SidebarItem.forCategories([cat], { editable: false, deletable: false }),
    );

    const unreadItem = SidebarItem.forUnread([account.id]);
    const starredItem = SidebarItem.forStarred([account.id]);
    const draftsItem = SidebarItem.forDrafts([account.id]);
    const attachmentsMail = SidebarItem.forAttachments([account.id]);

    // Order correctly: Inbox, Unread, Starred, rest... , Drafts
    items.splice(1, 0, unreadItem, starredItem);
    items.push(attachmentsMail, draftsItem);
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
    let children;
    const items = [];
    if (!accounts || accounts.length === 0) {
      return this.empty('All Accounts');
    }
    if (CategoryStore.categories().length === 0) {
      return this.empty('All Accounts');
    }
    if (accounts.length === 1) {
      return this.standardSectionForAccount(accounts[0]);
    } else {
      accounts.forEach(acc => {
        items.push(
          SidebarItem.forInbox([acc.id], {
            name: acc.label,
            children: this.standardSectionForAccount(acc).items,
          })
        );
      });
    }
    // const standardNames = [
    //   // 'inbox',
    //   // 'important',
    //   'snoozed',
    //   // 'sent',
    //   // ['archive', 'all'],
    //   // 'spam',
    //   // 'trash',
    // ];
    //
    // for (var names of standardNames) {
    //   names = Array.isArray(names) ? names : [names];
    //   const categories = CategoryStore.getCategoriesWithRoles(accounts, ...names);
    //   if (categories.length === 0) {
    //     continue;
    //   }
    //   //
    //   // children = [];
    //   // // eslint-disable-next-line
    //   // accounts.forEach(acc => {
    //   //   const cat = _.first(
    //   //     _.compact(names.map(role => CategoryStore.getCategoryByRole(acc, role)))
    //   //   );
    //   //   if (!cat) {
    //   //     return;
    //   //   }
    //   //   children.push(
    //   //     SidebarItem.forCategories([cat], { name: acc.label, editable: false, deletable: false })
    //   //   );
    //   // });
    //
    //   items.push(SidebarItem.forCategories(categories, {editable: false, deletable: false }));
    // }

    const accountIds = _.pluck(accounts, 'id');

    // const starredItem = SidebarItem.forStarred(accountIds, {
    //   children: accounts.map(acc => SidebarItem.forStarred([acc.id], { name: acc.label })),
    // });
    // const unreadItem = SidebarItem.forUnread(accountIds, {
    //   children: accounts.map(acc => SidebarItem.forUnread([acc.id], { name: acc.label })),
    // });
    // const draftsItem = SidebarItem.forDrafts(accountIds, {
    //   children: accounts.map(acc => SidebarItem.forDrafts([acc.id], { name: acc.label })),
    // });
    const attchmentsMail = SidebarItem.forAttachments(accountIds);
    const snoozedMail = SidebarItem.forSnoozed(accountIds, {displayName: 'Snoozed'});
    const archiveMail = SidebarItem.forArchived(accountIds, {displayName: 'All Archive'});
    const spamMail = SidebarItem.forSpam(accountIds, {dispalyName: 'Spam'});
    const sentMail = SidebarItem.forSentMails(accountIds, {dispalyName: 'All Sent'});
    const allInboxes = SidebarItem.forAllInbox(accountIds, {displayName: 'All Inboxes'});
    const starredItem = SidebarItem.forStarred(accountIds, {displayName: 'Flagged'});
    const unreadItem = SidebarItem.forUnread(accountIds, {displayName: 'Unread'});
    const draftsItem = SidebarItem.forDrafts(accountIds, {displayName: 'All Drafts'});
    //
    // // Order correctly: Inbox, Unread, Starred, rest... , Drafts
    items.unshift(allInboxes);
    items.push(
      starredItem,
      unreadItem,
      snoozedMail,
      attchmentsMail,
      spamMail,
      archiveMail,
      draftsItem,
      sentMail
    );

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

  static accountUserCategories(account, {title, collapsible } = {}){
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
}

module.exports = SidebarSection;
