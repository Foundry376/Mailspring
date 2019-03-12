const _ = require('underscore');
const _str = require('underscore.string');
const { OutlineViewItem } = require('mailspring-component-kit');
const {
  MailboxPerspective,
  FocusedPerspectiveStore,
  SyncbackCategoryTask,
  DestroyCategoryTask,
  CategoryStore,
  Actions,
  RegExpUtils,
} = require('mailspring-exports');

const SidebarActions = require('./sidebar-actions');

const idForCategories = categories => _.pluck(categories, 'id').join('-');

const countForItem = function (perspective) {
  const unreadCountEnabled = AppEnv.config.get('core.workspace.showUnreadForAllCategories');
  if (perspective.isInbox() || unreadCountEnabled) {
    return perspective.unreadCount();
  }
  return 0;
};

const isItemSelected = perspective => FocusedPerspectiveStore.current().isEqual(perspective);

const isItemCollapsed = function (id) {
  if (AppEnv.savedState.sidebarKeysCollapsed[id] !== undefined) {
    return AppEnv.savedState.sidebarKeysCollapsed[id];
  } else {
    return true;
  }
};

const toggleItemCollapsed = function (item) {
  if (!(item.children.length > 0)) {
    return;
  }
  SidebarActions.setKeyCollapsed(item.id, !isItemCollapsed(item.id));
};

const onDeleteItem = function (item) {
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
    }),
  );
};

const onEditItem = function (item, value) {
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
    }),
  );
};

class SidebarItem {
  static forPerspective(id, perspective, opts = {}) {
    let counterStyle;
    if (perspective.isInbox()) {
      counterStyle = OutlineViewItem.CounterStyles.Alt;
    }
    if (opts.displayName) {
      perspective.displayName = opts.displayName;
    }

    const collapsed = isItemCollapsed(id);

    return Object.assign(
      {
        id,
        // As we are not sure if 'Drafts-' as id have any special meaning, we are adding categoryIds
        categoryIds: opts.categoryIds ? opts.categoryIds : undefined,
        accountIds: perspective.accountIds,
        name: perspective.name,
        displayName: perspective.displayName,
        contextMenuLabel: perspective.name,
        count: countForItem(perspective),
        iconName: perspective.iconName,
        bgColor: perspective.bgColor,
        children: [],
        perspective,
        selected: isItemSelected(perspective),
        collapsed: collapsed != null ? collapsed : true,
        counterStyle,
        onDelete: opts.deletable ? onDeleteItem : undefined,
        onEdited: opts.editable ? onEditItem : undefined,
        onCollapseToggled: toggleItemCollapsed,

        onDrop(item, event) {
          const jsonString = event.dataTransfer.getData('nylas-threads-data');
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
          if (!event.dataTransfer.types.includes('nylas-threads-data')) {
            return false;
          }
          if (target.isEqual(current)) {
            return false;
          }

          // We can't inspect the drag payload until drop, so we use a dataTransfer
          // type to encode the account IDs of threads currently being dragged.
          const accountsType = event.dataTransfer.types.find(t => t.startsWith('nylas-accounts='));
          const accountIds = (accountsType || '').replace('nylas-accounts=', '').split(',');
          return target.canReceiveThreadsFromAccountIds(accountIds);
        },

        onSelect(item) {
          if (
            item.accountIds.length === 1 &&
            (item.contextMenuLabel === 'Folder' || item.contextMenuLabel === 'Drafts')
          ) {
            Actions.syncFolders(
              item.accountIds[0],
              item.categoryIds ? item.categoryIds : [item.id],
            );
          }
          Actions.focusMailboxPerspective(item.perspective);
        },
      },
      opts,
    );
  }

  static forCategories(categories = [], opts = {}) {
    const id = idForCategories(categories);
    const contextMenuLabel = _str.capitalize(
      categories[0] != null ? categories[0].displayType() : undefined,
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

  static forSentMails(accountIds, opts = {}) {
    opts.iconName = 'sent.svg';
    let cats = [];
    for (let accountId of accountIds) {
      let tmp = CategoryStore.getCategoryByRole(accountId, 'sent');
      if (tmp) {
        cats.push(tmp);
      }
    }
    const perspective = MailboxPerspective.forCategories(cats);
    const id = _.pluck(cats, 'id').join('-');
    opts.categoryIds = this.getCategoryIds(accountIds, 'sent');
    return this.forPerspective(id, perspective, opts);
  }

  static forSpam(accountIds, opts = {}) {
    opts.iconName = 'junk.svg';
    let cats = [];
    for (let accountId of accountIds) {
      let tmp = CategoryStore.getCategoryByRole(accountId, 'spam');
      if (tmp) {
        cats.push(tmp);
      }
    }
    const perspective = MailboxPerspective.forCategories(cats);
    const id = _.pluck(cats, 'id').join('-');
    opts.categoryIds = this.getCategoryIds(accountIds, 'spam');
    return this.forPerspective(id, perspective, opts);
  }

  static forArchived(accountIds, opts = {}) {
    opts.iconName = 'archive.svg';
    let cats = [];
    for (let accountId of accountIds) {
      let tmp = CategoryStore.getCategoryByRole(accountId, 'archive');
      if (tmp) {
        cats.push(tmp);
      }
    }
    const perspective = MailboxPerspective.forCategories(cats);
    const id = _.pluck(cats, 'id').join('-');
    opts.categoryIds = this.getCategoryIds(accountIds, 'archive');
    return this.forPerspective(id, perspective, opts);
  }

  static forSnoozed(accountIds, opts = {}) {
    opts.iconName = 'snoozed.svg';
    let cats = [];
    for (let accountId of accountIds) {
      let tmp = CategoryStore.getCategoryByRole(accountId, 'snoozed');
      if (tmp) {
        cats.push(tmp);
      }
    }
    const perspective = MailboxPerspective.forCategories(cats);
    const id = _.pluck(cats, 'id').join('-');
    return this.forPerspective(id, perspective, opts);
  }

  static forStarred(accountIds, opts = {}) {
    opts.iconName = 'flag.svg';
    const perspective = MailboxPerspective.forStarred(accountIds);
    let id = 'Starred';
    if (opts.name) {
      id += `-${opts.name}`;
    }
    return this.forPerspective(id, perspective, opts);
  }

  static forUnread(accountIds, opts = {}) {
    let categories = accountIds.map(accId => {
      return CategoryStore.getCategoryByRole(accId, 'inbox');
    });

    // NOTE: It's possible for an account to not yet have an `inbox`
    // category. Since the `SidebarStore` triggers on `AccountStore`
    // changes, it'll trigger the exact moment an account is added to the
    // config. However, the API has not yet come back with the list of
    // `categories` for that account.
    categories = _.compact(categories);
    opts.iconName = 'unread.svg';
    const perspective = MailboxPerspective.forUnread(categories);
    let id = 'Unread';
    if (opts.name) {
      id += `-${opts.name}`;
    }
    return this.forPerspective(id, perspective, opts);
  }

  static forInbox(accountId, opts = {}) {
    opts.iconName = 'inbox.svg';
    const perspective = MailboxPerspective.forInbox([accountId]);
    opts.categoryIds = this.getCategoryIds([accountId], 'inbox');
    const id = [accountId].join('-');
    return this.forPerspective(id, perspective, opts);
  }

  static forAllInbox(accountIds, opts = {}) {
    const perspective = MailboxPerspective.forInbox(accountIds);
    opts.categoryIds = this.getCategoryIds(accountIds, 'inbox');
    const id = accountIds.join('-');
    return this.forPerspective(id, perspective, opts);
  }

  static forSingleAccount(accountId, opts = {}) {
    const perspective = MailboxPerspective.forSingleAccount(accountId);
    const id = accountId;
    return this.forPerspective(id, perspective, opts);
  }

  static forAttachments(accountIds, opts = {}) {
    const perspetive = MailboxPerspective.forAttachments(accountIds);
    const id = accountIds.join('-') + 'attachments';
    return this.forPerspective(id, perspetive, opts);
  }

  static forDrafts(accountIds, opts = {}) {
    opts.iconName = 'drafts.svg';
    const perspective = MailboxPerspective.forDrafts(accountIds);
    opts.categoryIds = this.getCategoryIds(accountIds, 'drafts');
    const id = `Drafts-${opts.name}`;
    return this.forPerspective(id, perspective, opts);
  }

  static getCategoryIds = (accountIds, categoryName) => {
    const categoryIds = [];
    for (let accountId of accountIds) {
      let tmp = CategoryStore.getCategoryByRole(accountId, categoryName);
      if (tmp) {
        categoryIds.push(tmp.id);
      }
    }
    if (categoryIds.length > 0) {
      return categoryIds.slice();
    } else {
      return undefined;
    }
  };
}

module.exports = SidebarItem;
