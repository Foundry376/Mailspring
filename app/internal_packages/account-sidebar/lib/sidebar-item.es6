const _ = require('underscore');
const _str = require('underscore.string');
const { OutlineViewItem, RetinaImg } = require('mailspring-component-kit');
const {
  MailboxPerspective,
  FocusedPerspectiveStore,
  SyncbackCategoryTask,
  DestroyCategoryTask,
  CategoryStore,
  WorkspaceStore,
  Actions,
  RegExpUtils,
  AccountStore
} = require('mailspring-exports');

const SidebarActions = require('./sidebar-actions');

const idForCategories = categories => _.pluck(categories, 'id').join('-');

const countForItem = function (perspective) {
  const unreadCountEnabled = AppEnv.config.get('core.workspace.showUnreadForAllCategories');
  if (perspective.isInbox() || perspective.isDrafts() || unreadCountEnabled) {
    return perspective.unreadCount();
  }
  return 0;
};

const isChildrenSelected = (children = [], currentPerspective) => {
  if (!children || children.length === 0) {
    return false;
  }
  for (let p of children) {
    if (p.perspective && p.perspective.isEqual(currentPerspective)) {
      return true;
    }
    if (p.children && p.children.length > 0) {
      if (isChildrenSelected(p.children, currentPerspective)) {
        return true;
      }
    }
  }
  return false;
};

const isItemSelected = (perspective, children = []) => {
  const sheet = WorkspaceStore.topSheet();
  if (sheet && !['Threads', 'Thread', 'Drafts', 'Outbox', 'Preference'].includes(sheet.id)) {
    return false;
  }
  const isCurrent = FocusedPerspectiveStore.current().isEqual(perspective);
  if (isCurrent) {
    return true;
  }
  return isChildrenSelected(children, FocusedPerspectiveStore.current());
};

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
  if (item.deleted === true) {
    return;
  }
  if (item.children.length > 0) {
    _.defer(() => {
      AppEnv.showErrorDialog({
        title: `Cannot delete ${(item.contextMenuLabel || item.name).toLocaleLowerCase()}`,
        message: `Must delete sub-${(
          item.contextMenuLabel || item.name
        ).toLocaleLowerCase()} first`,
      });
    });
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
    if (opts) {
      perspective = Object.assign(perspective, opts);
    }

    const collapsed = isItemCollapsed(id);

    return Object.assign(
      {
        id,
        // As we are not sure if 'Drafts-' as id have any special meaning, we are adding categoryIds
        categoryIds: opts.categoryIds ? opts.categoryIds : undefined,
        accountIds: perspective.accountIds,
        name: perspective.name,
        path: perspective.getPath(),
        displayName: perspective.displayName,
        threadTitleName: perspective.threadTitleName,
        contextMenuLabel: perspective.displayName,
        count: countForItem(perspective),
        iconName: perspective.iconName,
        bgColor: perspective.bgColor,
        children: [],
        perspective,
        selected: isItemSelected(perspective, opts.children),
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
            AppEnv.reportError(new Error(`JSON parse error: ${err}`));
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
          if (target && target.isEqual(current)) {
            return false;
          }

          // We can't inspect the drag payload until drop, so we use a dataTransfer
          // type to encode the account IDs of threads currently being dragged.
          const accountsType = event.dataTransfer.types.find(t => t.startsWith('nylas-accounts='));
          const accountIds = (accountsType || '').replace('nylas-accounts=', '').split(',');
          return target.canReceiveThreadsFromAccountIds(accountIds);
        },

        onSelect(item) {
          // FocusedPerspectiveStore.refreshPerspectiveMessages({perspective: item});
          Actions.focusMailboxPerspective(item.perspective);
        },
      },
      opts,
    );
  }

  static forCategories(categories = [], opts = {}) {
    const id = idForCategories(categories);
    const accountIds = new Set(categories.map(c => c.accountId));
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
    return SidebarItem.appendSubPathByAccounts(
      accountIds,
      this.forPerspective(id, perspective, opts),
    );
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
    if (cats.length === 0) {
      return null;
    }
    const perspective = MailboxPerspective.forCategories(cats);
    const id = _.pluck(cats, 'id').join('-');
    opts.categoryIds = this.getCategoryIds(accountIds, 'sent');
    return SidebarItem.appendSubPathByAccounts(accountIds, this.forPerspective(id, perspective, opts));
  }

  static forSpam(accountIds, opts = {}) {
    let cats = [];
    for (let accountId of accountIds) {
      let tmp = CategoryStore.getCategoryByRole(accountId, 'spam');
      if (tmp) {
        cats.push(tmp);
      }
    }
    if (cats.length === 0) {
      return null;
    }
    const perspective = MailboxPerspective.forCategories(cats);
    const id = _.pluck(cats, 'id').join('-');
    opts.categoryIds = this.getCategoryIds(accountIds, 'spam');
    return SidebarItem.appendSubPathByAccounts(accountIds, this.forPerspective(id, perspective, opts));
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
    if (cats.length === 0) {
      return null;
    }
    const perspective = MailboxPerspective.forCategories(cats);
    const id = _.pluck(cats, 'id').join('-');
    opts.categoryIds = this.getCategoryIds(accountIds, 'archive');
    return SidebarItem.appendSubPathByAccounts(
      accountIds,
      this.forPerspective(id, perspective, opts),
    );
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
    if (cats.length === 0) {
      return null;
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

  static forSingleInbox(accountId, opts = {}) {
    opts.iconName = 'inbox.svg';
    const perspective = MailboxPerspective.forInbox(accountId);
    opts.categoryIds = this.getCategoryIds(accountId, 'inbox');
    const id = [accountId].join('-');
    const account = AccountStore.accountForId(accountId);
    if (account) {
      opts.iconName = `account-logo-${account.provider}.png`;
      opts.fallback = `account-logo-other.png`;
      opts.mode = RetinaImg.Mode.ContentPreserve;
    }
    return this.forPerspective(id, perspective, opts);
  }
  static forOutbox(accountIds, opts = {}) {
    opts.iconName = 'outbox.svg';
    const perspective = MailboxPerspective.forOutbox(accountIds);
    const id = 'outbox';
    return this.forPerspective(id, perspective, opts);
  }

  static forInbox(accountId, opts = {}) {
    opts.iconName = 'inbox.svg';
    const perspective = MailboxPerspective.forInbox(accountId);
    opts.categoryIds = this.getCategoryIds(accountId, 'inbox');
    const id = [accountId].join('-');
    return SidebarItem.appendSubPathByAccounts(
      accountId,
      this.forPerspective(id, perspective, opts),
    );
  }

  static forAllMail(allMailCategory, opts = {}) {
    const contextMenuLabel = _str.capitalize(allMailCategory.displayType() || undefined);
    const perspective = MailboxPerspective.forAllMail(allMailCategory);
    const id = `${allMailCategory.accountId}-allMail`;
    opts.contextMenuLabel = contextMenuLabel;
    return this.forPerspective(id, perspective, opts);
  }

  static forAllInbox(accountIds, opts = {}) {
    const perspective = MailboxPerspective.forInbox(accountIds);
    opts.categoryIds = this.getCategoryIds(accountIds, 'inbox');
    opts.mode = RetinaImg.Mode.ContentPreserve;
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
    if (!Array.isArray(opts.categoryIds) || opts.categoryIds.length === 0) {
      return null;
    }
    const id = `Drafts-${opts.name}`;
    // return this.forPerspective(id, perspective, opts);
    return SidebarItem.appendSubPathByAccounts(
      accountIds,
      this.forPerspective(id, perspective, opts),
    );
  }

  static forAllTrash(accountIds, opts = {}) {
    opts.iconName = 'trash.svg';
    const perspective = MailboxPerspective.forAllTrash(accountIds);
    opts.categoryIds = this.getCategoryIds(accountIds, 'trash');
    if (!Array.isArray(opts.categoryIds) || opts.categoryIds.length === 0) {
      return null;
    }
    const id = `AllTrash-${opts.name}`;
    // return this.forPerspective(id, perspective, opts);
    return SidebarItem.appendSubPathByAccounts(
      accountIds,
      this.forPerspective(id, perspective, opts)
    );
  }

  static appendSubPathByAccounts(accountIds, parentPerspective) {
    for (const accountId of accountIds) {
      const paths = parentPerspective.path.filter(p => p.accountId === accountId);
      if (paths.length === 1) {
        SidebarItem.appendSubPathByAccount(accountId, parentPerspective, paths[0].path);
      }
    }
    return parentPerspective;
  }

  static appendSubPathByAccount(accountId, parentItem, path) {
    if (!path) {
      throw new Error('path must not be empty');
    }
    if (!parentItem) {
      throw new Error('parentItem must not be empty');
    }
    const seenItems = {};
    seenItems[path.toLocaleLowerCase()] = parentItem;
    for (let category of CategoryStore.userCategories(accountId)) {
      // https://regex101.com/r/jK8cC2/1
      var item, parentKey;
      const re = RegExpUtils.subcategorySplitRegex();
      const itemKey = category.displayName.replace(re, '/');

      let parent = null;
      const parentComponents = itemKey.split('/');
      if (
        parentComponents[0].toLocaleLowerCase() !== path.toLocaleLowerCase() ||
        parentComponents.length === 1
      ) {
        continue;
      }
      for (let i = parentComponents.length; i >= 1; i--) {
        parentKey = parentComponents.slice(0, i).join('/');
        parent = seenItems[parentKey.toLocaleLowerCase()];
        if (parent) {
          break;
        }
      }

      if (parent) {
        const itemDisplayName = category.displayName.substr(parentKey.length + 1);
        item = SidebarItem.forCategories([category], { name: itemDisplayName });
        parent.children.push(item);
        if (item.selected) {
          parent.selected = true;
          for (let key of Object.keys(seenItems)) {
            if (parentKey.includes(key)) {
              seenItems[key].selected = true;
            }
          }
        }
      } else {
        item = SidebarItem.forCategories([category]);
      }
      seenItems[itemKey.toLocaleLowerCase()] = item;
    }
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
