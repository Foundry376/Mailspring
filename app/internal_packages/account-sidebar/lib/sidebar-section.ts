/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from 'underscore';
import React from 'react';
import {
  Actions,
  Account,
  SyncbackCategoryTask,
  CategoryStore,
  AccountGroupStore,
  AccountGroup,
  Label,
  ExtensionRegistry,
  RegExpUtils,
  localized,
} from 'mailspring-exports';

import SidebarItem from './sidebar-item';
import * as SidebarActions from './sidebar-actions';
import { ISidebarSection, ISidebarItem } from './types';

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
  static empty(title): ISidebarSection {
    return {
      title,
      items: [],
    };
  }

  static standardSectionForAccount(account): ISidebarSection {
    if (!account) {
      throw new Error('standardSectionForAccount: You must pass an account.');
    }

    const cats = CategoryStore.standardCategories(account);
    if (cats.length === 0) {
      return this.empty(account.label);
    }

    const items = _.reject(cats, cat => ['drafts', 'snoozed'].includes(cat.role)).map(cat =>
      SidebarItem.forCategories([cat], { editable: false, deletable: false })
    );

    const unreadItem = SidebarItem.forUnread([account.id]);
    const starredItem = SidebarItem.forStarred([account.id]);
    const draftsItem = SidebarItem.forDrafts([account.id]);

    // Order correctly: Inbox, Unread, Starred, rest... , Drafts
    items.splice(1, 0, unreadItem, starredItem);
    items.push(draftsItem);

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
      title: account.label,
      items,
    };
  }

  static _nameStyleForGroup(group: AccountGroup): React.CSSProperties | undefined {
    const style: React.CSSProperties = {};
    if (group.color) {
      style.color = group.color;
    }
    const ds = group.displayStyle || 'normal';
    if (ds === 'bold' || ds === 'bold-italic') {
      style.fontWeight = 700;
    }
    if (ds === 'italic' || ds === 'bold-italic') {
      style.fontStyle = 'italic';
    }
    if (Object.keys(style).length === 0) return undefined;
    return style;
  }

  static _buildGroupedCategoryChildren(
    accounts: Account[],
    names: string[],
    groups: AccountGroup[]
  ): ISidebarItem[] {
    const children: ISidebarItem[] = [];
    const groupedAccountIds = new Set<string>();

    for (const group of groups) {
      const groupAccounts = accounts.filter(acc => group.accountIds.includes(acc.id));
      if (groupAccounts.length === 0) continue;

      groupAccounts.forEach(acc => groupedAccountIds.add(acc.id));

      const groupCats = _.compact(
        groupAccounts.map(acc =>
          _.first(_.compact(names.map(name => CategoryStore.getCategoryByRole(acc, name))))
        )
      );
      if (groupCats.length === 0) continue;

      const groupChildren = groupAccounts
        .map(acc => {
          const cat = _.first(
            _.compact(names.map(name => CategoryStore.getCategoryByRole(acc, name)))
          );
          if (!cat) return null;
          return SidebarItem.forCategories([cat], {
            name: acc.label,
            editable: false,
            deletable: false,
          });
        })
        .filter(Boolean);

      children.push(
        SidebarItem.forCategories(groupCats, {
          name: group.name,
          children: groupChildren,
          editable: false,
          deletable: false,
          nameStyle: this._nameStyleForGroup(group),
        })
      );
    }

    // Add ungrouped accounts as individual children
    accounts.forEach(acc => {
      if (groupedAccountIds.has(acc.id)) return;
      const cat = _.first(
        _.compact(names.map(name => CategoryStore.getCategoryByRole(acc, name)))
      );
      if (!cat) return;
      children.push(
        SidebarItem.forCategories([cat], { name: acc.label, editable: false, deletable: false })
      );
    });

    return children;
  }

  static _buildGroupedPseudoChildren(
    accounts: Account[],
    groups: AccountGroup[],
    itemFactory: (accountIds: string[], opts?: Partial<ISidebarItem>) => ISidebarItem
  ): ISidebarItem[] {
    const children: ISidebarItem[] = [];
    const groupedAccountIds = new Set<string>();

    for (const group of groups) {
      const groupAccounts = accounts.filter(acc => group.accountIds.includes(acc.id));
      if (groupAccounts.length === 0) continue;

      groupAccounts.forEach(acc => groupedAccountIds.add(acc.id));

      const groupIds = groupAccounts.map(acc => acc.id);
      const groupChildren = groupAccounts.map(acc =>
        itemFactory([acc.id], { name: acc.label })
      );

      children.push(
        itemFactory(groupIds, {
          name: group.name,
          children: groupChildren,
          nameStyle: this._nameStyleForGroup(group),
        })
      );
    }

    // Add ungrouped accounts as individual children
    accounts.forEach(acc => {
      if (groupedAccountIds.has(acc.id)) return;
      children.push(itemFactory([acc.id], { name: acc.label }));
    });

    return children;
  }

  static standardSectionForAccounts(accounts?: Account[]): ISidebarSection {
    let children;
    if (!accounts || accounts.length === 0) {
      return this.empty(localized('All Accounts'));
    }
    if (CategoryStore.categories().length === 0) {
      return this.empty(localized('All Accounts'));
    }
    if (accounts.length === 1) {
      return this.standardSectionForAccount(accounts[0]);
    }

    const groups = AccountGroupStore.groups();
    const hasGroups = groups.length > 0;

    const standardNames = ['inbox', 'important', 'sent', ['archive', 'all'], 'spam', 'trash'];
    const items = [];

    for (const nameOrNames of standardNames) {
      const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
      const categories = CategoryStore.getCategoriesWithRoles(accounts, ...names);
      if (categories.length === 0) {
        continue;
      }

      if (hasGroups) {
        children = this._buildGroupedCategoryChildren(accounts, names, groups);
      } else {
        children = [];
        // eslint-disable-next-line
        accounts.forEach(acc => {
          const cat = _.first(
            _.compact((names as string[]).map(name => CategoryStore.getCategoryByRole(acc, name)))
          );
          if (!cat) {
            return;
          }
          children.push(
            SidebarItem.forCategories([cat], { name: acc.label, editable: false, deletable: false })
          );
        });
      }

      items.push(
        SidebarItem.forCategories(categories, { children, editable: false, deletable: false })
      );
    }

    const accountIds = _.pluck(accounts, 'id');

    let starredChildren, unreadChildren, draftsChildren;
    if (hasGroups) {
      starredChildren = this._buildGroupedPseudoChildren(
        accounts,
        groups,
        SidebarItem.forStarred.bind(SidebarItem)
      );
      unreadChildren = this._buildGroupedPseudoChildren(
        accounts,
        groups,
        SidebarItem.forUnread.bind(SidebarItem)
      );
      draftsChildren = this._buildGroupedPseudoChildren(
        accounts,
        groups,
        SidebarItem.forDrafts.bind(SidebarItem)
      );
    } else {
      starredChildren = accounts.map(acc =>
        SidebarItem.forStarred([acc.id], { name: acc.label })
      );
      unreadChildren = accounts.map(acc =>
        SidebarItem.forUnread([acc.id], { name: acc.label })
      );
      draftsChildren = accounts.map(acc =>
        SidebarItem.forDrafts([acc.id], { name: acc.label })
      );
    }

    const starredItem = SidebarItem.forStarred(accountIds, { children: starredChildren });
    const unreadItem = SidebarItem.forUnread(accountIds, { children: unreadChildren });
    const draftsItem = SidebarItem.forDrafts(accountIds, { children: draftsChildren });

    // Order correctly: Inbox, Unread, Starred, rest... , Drafts
    items.splice(1, 0, unreadItem, starredItem);
    items.push(draftsItem);

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
      title: localized('All Accounts'),
      items,
    };
  }

  static forUserCategories(
    account: Account,
    { title, collapsible }: { title?: string; collapsible?: boolean } = {}
  ): ISidebarSection {
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
    const items: ISidebarItem[] = [];
    const seenItems: { [key: string]: ISidebarItem } = {};
    for (const category of CategoryStore.userCategories(account)) {
      // https://regex101.com/r/jK8cC2/1
      let item: ISidebarItem = null;
      const re = RegExpUtils.subcategorySplitRegex();
      const itemKey = category.displayName.replace(re, '/');

      let parent = null;
      let parentKey: string = null;
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
        title = localized('Labels');
      }
      iconName = 'tag.png';
    } else {
      if (title == null) {
        title = localized('Folders');
      }
      iconName = 'folder.png';
    }
    const collapsed = isSectionCollapsed(title);
    if (collapsible) {
      onCollapseToggled = toggleSectionCollapsed;
    }
    const titleColor = account.color;

    return {
      title,
      iconName,
      items,
      collapsed,
      titleColor,
      onCollapseToggled,
      onItemCreated(displayName) {
        if (!displayName) {
          return;
        }
        Actions.queueTask(
          SyncbackCategoryTask.forCreating({
            name: displayName,
            accountId: account.id,
          })
        );
      },
    };
  }
}

export default SidebarSection;
