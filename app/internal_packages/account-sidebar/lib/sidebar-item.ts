import _ from 'underscore';
import _str from 'underscore.string';
import { OutlineViewItem } from 'mailspring-component-kit';
import {
  MailboxPerspective,
  FocusedPerspectiveStore,
  SyncbackCategoryTask,
  DestroyCategoryTask,
  CategoryStore,
  Actions,
  RegExpUtils,
} from 'mailspring-exports';

import * as SidebarActions from './sidebar-actions';
import { ISidebarItem } from './types';

const idForCategories = categories => _.pluck(categories, 'id').join('-');

const countForItem = function(perspective) {
  const unreadCountEnabled = AppEnv.config.get('core.workspace.showUnreadForAllCategories');
  if (perspective.isInbox() || unreadCountEnabled) {
    return perspective.unreadCount();
  }
  return 0;
};

const isItemSelected = perspective => FocusedPerspectiveStore.current().isEqual(perspective);

const isItemCollapsed = function(id) {
  if (AppEnv.savedState.sidebarKeysCollapsed[id] !== undefined) {
    return AppEnv.savedState.sidebarKeysCollapsed[id];
  } else {
    return true;
  }
};

const toggleItemCollapsed = function(item) {
  if (!(item.children.length > 0)) {
    return;
  }
  SidebarActions.setKeyCollapsed(item.id, !isItemCollapsed(item.id));
};

const onDeleteItem = function(item) {
  // TODO Delete multiple categories at once
  if (item.deleted === true) {
    return;
  }
  const category = item.perspective.category();
  if (!category) {
    return;
  }

  Actions.queueTask(
    new DestroyCategoryTask({
      path: category.path,
      accountId: category.accountId,
    })
  );
};

const onEditItem = function(item, value) {
  let newDisplayName;
  if (!value) {
    return;
  }
  if (item.deleted === true) {
    return;
  }
  const category = item.perspective.category();
  if (!category) {
    return;
  }
  const re = RegExpUtils.subcategorySplitRegex();
  let match = re.exec(category.displayName);
  let lastMatch = match;
  while (match) {
    lastMatch = match;
    match = re.exec(category.displayName);
  }
  if (lastMatch) {
    newDisplayName = category.displayName.slice(0, lastMatch.index + 1) + value;
  } else {
    newDisplayName = value;
  }
  if (newDisplayName === category.displayName) {
    return;
  }

  Actions.queueTask(
    SyncbackCategoryTask.forRenaming({
      accountId: category.accountId,
      path: category.path,
      newName: newDisplayName,
    })
  );
};

export default class SidebarItem {
  static forPerspective(id, perspective, opts: Partial<ISidebarItem> = {}): ISidebarItem {
    let counterStyle;
    if (perspective.isInbox()) {
      counterStyle = OutlineViewItem.CounterStyles.Alt;
    }

    const collapsed = isItemCollapsed(id);

    return Object.assign(
      {
        id,
        name: perspective.name,
        contextMenuLabel: perspective.name,
        count: countForItem(perspective),
        iconName: perspective.iconName,
        children: [],
        perspective,
        selected: isItemSelected(perspective),
        collapsed: collapsed != null ? collapsed : true,
        counterStyle,
        onDelete: opts.deletable ? onDeleteItem : undefined,
        onEdited: opts.editable ? onEditItem : undefined,
        onCollapseToggled: toggleItemCollapsed,

        onDrop(item, event) {
          const jsonString = event.dataTransfer.getData('mailspring-threads-data');
          let jsonData = null;
          try {
            jsonData = JSON.parse(jsonString);
          } catch (err) {
            console.error(`JSON parse error: ${err}`);
          }
          if (!jsonData) {
            return;
          }
          item.perspective.receiveThreadIds(jsonData.threadIds);
        },

        shouldAcceptDrop(item, event) {
          const target = item.perspective;
          const current = FocusedPerspectiveStore.current();
          if (!event.dataTransfer.types.includes('mailspring-threads-data')) {
            return false;
          }
          if (target.isEqual(current)) {
            return false;
          }

          // We can't inspect the drag payload until drop, so we use a dataTransfer
          // type to encode the account IDs of threads currently being dragged.
          const accountsType = event.dataTransfer.types.find(t => t.startsWith('mailspring-accounts='));
          const accountIds = (accountsType || '').replace('mailspring-accounts=', '').split(',');
          return target.canReceiveThreadsFromAccountIds(accountIds);
        },

        onSelect(item) {
          Actions.focusMailboxPerspective(item.perspective);
        },
      },
      opts
    );
  }

  static forCategories(categories = [], opts: Partial<ISidebarItem> = {}) {
    const id = idForCategories(categories);
    const contextMenuLabel = _str.capitalize(
      categories[0] != null ? categories[0].displayType() : undefined
    );
    const perspective = MailboxPerspective.forCategories(categories);

    if (opts.deletable == null) {
      opts.deletable = true;
    }
    if (opts.editable == null) {
      opts.editable = true;
    }
    opts.contextMenuLabel = contextMenuLabel;
    return this.forPerspective(id, perspective, opts);
  }

  static forStarred(accountIds, opts: Partial<ISidebarItem> = {}) {
    const perspective = MailboxPerspective.forStarred(accountIds);
    let id = 'Starred';
    if (opts.name) {
      id += `-${opts.name}`;
    }
    return this.forPerspective(id, perspective, opts);
  }

  static forUnread(accountIds, opts: Partial<ISidebarItem> = {}) {
    let categories = accountIds.map(accId => {
      return CategoryStore.getCategoryByRole(accId, 'inbox');
    });

    // NOTE: It's possible for an account to not yet have an `inbox`
    // category. Since the `SidebarStore` triggers on `AccountStore`
    // changes, it'll trigger the exact moment an account is added to the
    // config. However, the API has not yet come back with the list of
    // `categories` for that account.
    categories = _.compact(categories);

    const perspective = MailboxPerspective.forUnread(categories);
    let id = 'Unread';
    if (opts.name) {
      id += `-${opts.name}`;
    }
    return this.forPerspective(id, perspective, opts);
  }

  static forDrafts(accountIds, opts: Partial<ISidebarItem> = {}) {
    const perspective = MailboxPerspective.forDrafts(accountIds);
    const id = `Drafts-${opts.name}`;
    return this.forPerspective(id, perspective, opts);
  }
}
