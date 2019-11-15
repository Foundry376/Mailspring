import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { RetinaImg, CreateButtonGroup, BindGlobalCommands } from 'mailspring-component-kit';
import {
  AccountStore,
  Actions,
  TaskFactory,
  ChangeLabelsTask,
  CategoryStore,
  FocusedContentStore,
  FocusedPerspectiveStore,
  WorkspaceStore,
  MessageStore,
} from 'mailspring-exports';
import { remote } from 'electron';
import ThreadListStore from './thread-list-store';
import ToolbarCategoryPicker from '../../category-picker/lib/toolbar-category-picker';

const { Menu, MenuItem } = remote;
const commandCb = (event, cb, cbArgs) => {
  if (event) {
    if (event.propagationStopped) {
      return;
    }
    event.stopPropagation();
  }
  cb(cbArgs);
};
const threadSelectionScope = (props, selection) => {
  let threads = props.items;
  if (selection && WorkspaceStore.layoutMode() !== 'list') {
    const selectionThreads = selection.items();
    if (selectionThreads && selectionThreads.length > 0) {
      threads = selectionThreads;
    }
  }
  return threads;
};

const isSameAccount = items => {
  if (!Array.isArray(items)) {
    return true;
  }
  let accountId = '';
  for (let item of items) {
    if (!accountId) {
      accountId = item.accountId;
    } else if (accountId !== item.accountId) {
      return false;
    }
  }
  return true;
};

export function ArchiveButton(props) {
  const _onShortCut = event => {
    _onArchive(event, threadSelectionScope(props, props.selection));
  };
  const _onArchive = (event, threads) => {
    const tasks = TaskFactory.tasksForArchiving({
      threads: Array.isArray(threads) ? threads : props.items,
      source: 'Toolbar Button: Thread List',
      currentPerspective: FocusedPerspectiveStore.current(),
    });
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:ThreadList:archive' });
    if (event) {
      event.stopPropagation();
    }
    if (props.selection) {
      props.selection.clear();
    }
    if (AppEnv.isThreadWindow()) {
      AppEnv.debugLog(`Archive closing window because in ThreadWindow`);
      AppEnv.close();
    }
    return;
  };

  const allowed = FocusedPerspectiveStore.current().canArchiveThreads(props.items);
  if (!allowed) {
    return false;
  }

  const title = 'Archive';

  if (props.isMenuItem) {
    return new MenuItem({
      label: title,
      click: () => _onArchive(),
    });
  }

  return (
    <BindGlobalCommands commands={{ 'core:archive-item': event => commandCb(event, _onShortCut) }}>
      <button tabIndex={-1} className="btn btn-toolbar" title={title} onClick={_onArchive}>
        <RetinaImg
          name={'archive.svg'}
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    </BindGlobalCommands>
  );
}
ArchiveButton.displayName = 'ArchiveButton';
ArchiveButton.containerRequired = false;

export function TrashButton(props) {
  const _onShortCutRemove = event => {
    _onRemove(event, threadSelectionScope(props, props.selection));
  };
  const _onShortCutExpunge = event => {
    _onExpunge(event, threadSelectionScope(props, props.selection));
  };
  const _onRemove = (event, threads) => {
    const tasks = TaskFactory.tasksForMovingToTrash({
      threads: Array.isArray(threads) ? threads : props.items,
      currentPerspective: FocusedPerspectiveStore.current(),
      source: 'Toolbar Button: Thread List',
    });
    if (Array.isArray(tasks) && tasks.length > 0) {
      tasks.forEach(task => {
        if (!task.accountId) {
          try {
            AppEnv.reportError(new Error(`Trash Task no accountId`), {
              errorData: {
                task: task.toJSON(),
                threads: JSON.stringify(props.items),
              },
            });
          } catch (e) {}
        }
      });
    }
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:ThreadList:remove' });
    if (event) {
      event.stopPropagation();
    }
    if (props.selection) {
      props.selection.clear();
    }
    if (AppEnv.isThreadWindow()) {
      AppEnv.debugLog(`Remove Closing window because in ThreadWindow`);
      AppEnv.close();
    }
    return;
  };
  const _onExpunge = (event, threads) => {
    let messages = [];
    if (!Array.isArray(threads)) {
      threads = props.items;
    }
    threads.forEach(thread => {
      if (Array.isArray(thread.__messages) && thread.__messages.length > 0) {
        messages = messages.concat(thread.__messages);
      }
    });
    const tasks = TaskFactory.tasksForExpungingThreadsOrMessages({
      messages: messages,
      source: 'Toolbar Button: Thread List',
    });
    if (Array.isArray(tasks) && tasks.length > 0) {
      tasks.forEach(task => {
        if (!task.accountId) {
          try {
            AppEnv.reportError(new Error(`Trash Task no accountId`), {
              errorData: {
                task: task.toJSON(),
                messages: JSON.stringify(messages),
              },
            });
          } catch (e) {}
        }
      });
    }
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:ThreadList:expunge' });
    if (event) {
      event.stopPropagation();
    }
    if (AppEnv.isThreadWindow()) {
      AppEnv.debugLog(`Closing window because in ThreadWindow`);
      AppEnv.close();
    }
    return;
  };

  const canMove = FocusedPerspectiveStore.current().canMoveThreadsTo(props.items, 'trash');
  const canExpunge = FocusedPerspectiveStore.current().canExpungeThreads(props.items);
  if (!canMove && !canExpunge) {
    return false;
  }
  let actionCallBack = null;
  let title;
  if (canMove) {
    actionCallBack = _onShortCutRemove;
    title = 'Move to Trash';
  } else if (canExpunge) {
    actionCallBack = _onShortCutExpunge;
    title = 'Expunge Thread';
  }

  if (props.isMenuItem) {
    return new MenuItem({
      label: title,
      click: () => actionCallBack(),
    });
  }

  return (
    <BindGlobalCommands
      commands={{ 'core:delete-item': event => commandCb(event, actionCallBack) }}
    >
      <button tabIndex={-1} className="btn btn-toolbar" title={title} onClick={actionCallBack}>
        <RetinaImg
          name={'trash.svg'}
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    </BindGlobalCommands>
  );
}
TrashButton.displayName = 'TrashButton';
TrashButton.containerRequired = false;

export function MarkAsSpamButton(props) {
  const _onShortcutNotSpam = event => {
    _onNotSpam(event, threadSelectionScope(props, props.selection));
  };
  const _onNotSpam = (event, threads) => {
    const tasks = TaskFactory.tasksForMarkingNotSpam({
      source: 'Toolbar Button: Thread List',
      threads: Array.isArray(threads) ? threads : props.items,
      currentPerspective: FocusedPerspectiveStore.current(),
    });
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:MarkAsSpamButton:NotSpam' });
    if (event) {
      event.stopPropagation();
    }
    if (props.selection) {
      props.selection.clear();
    }
    if (AppEnv.isThreadWindow()) {
      AppEnv.debugLog(`Not Spam closing window because in ThreadWindow`);
      AppEnv.close();
    }
    return;
  };

  const _onShortcutMarkAsSpam = event => {
    _onMarkAsSpam(event, threadSelectionScope(props, props.selection));
  };
  const _onMarkAsSpam = (event, threads) => {
    const tasks = TaskFactory.tasksForMarkingAsSpam({
      threads: Array.isArray(threads) ? threads : props.items,
      source: 'Toolbar Button: Thread List',
      currentPerspective: FocusedPerspectiveStore.current(),
    });
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:MarkAsSpamButton:Spam' });
    if (event) {
      event.stopPropagation();
    }
    if (props.selection) {
      props.selection.clear();
    }
    if (AppEnv.isThreadWindow()) {
      AppEnv.debugLog(`Closing window because in ThreadWindow`);
      AppEnv.close();
    }
    return;
  };

  const allInSpam = props.items.every(item => item.folders.find(c => c.role === 'spam'));

  if (allInSpam) {
    const title = 'Not Junk';
    if (props.isMenuItem) {
      return new MenuItem({
        label: title,
        click: () => _onShortcutNotSpam(),
      });
    }

    return (
      <BindGlobalCommands
        key="not-spam"
        commands={{
          'core:report-not-spam': event => commandCb(event, _onShortcutNotSpam),
        }}
      >
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title={title}
          onClick={_onShortcutNotSpam}
        >
          <RetinaImg
            name="not-junk.svg"
            style={{ width: 24, height: 24 }}
            isIcon
            mode={RetinaImg.Mode.ContentIsMask}
          />
        </button>
      </BindGlobalCommands>
    );
  }

  const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(props.items, 'spam');
  if (!allowed) {
    return false;
  }
  const title = 'Mark as Spam';
  if (props.isMenuItem) {
    return new MenuItem({
      label: title,
      click: () => _onShortcutMarkAsSpam(),
    });
  }
  return (
    <BindGlobalCommands
      key="spam"
      commands={{
        'core:report-as-spam': event => commandCb(event, _onShortcutMarkAsSpam),
      }}
    >
      <button
        tabIndex={-1}
        className="btn btn-toolbar"
        title={title}
        onClick={_onShortcutMarkAsSpam}
      >
        <RetinaImg
          name={'junk.svg'}
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    </BindGlobalCommands>
  );
}
MarkAsSpamButton.displayName = 'MarkAsSpamButton';
MarkAsSpamButton.containerRequired = false;

export function PrintThreadButton(props) {
  const _onPrintThread = () => {
    const node = document.querySelector('#message-list');
    const currentThread = MessageStore.thread();
    Actions.printThread(currentThread, node.outerHTML);
  };

  const title = 'Print Thread';

  if (props.isMenuItem) {
    return new MenuItem({
      label: title,
      click: () => _onPrintThread(),
    });
  }

  return (
    <button tabIndex={-1} className="btn btn-toolbar" title={title} onClick={_onPrintThread}>
      <RetinaImg
        name={'print.svg'}
        style={{ width: 24, height: 24 }}
        isIcon
        mode={RetinaImg.Mode.ContentIsMask}
      />
    </button>
  );
}
PrintThreadButton.displayName = 'PrintThreadButton';

export function ToggleStarredButton(props) {
  const _onShortcutStar = event => {
    _onStar(event, threadSelectionScope(props, props.selection));
  };
  const _onStar = (event, threads) => {
    Actions.queueTasks(
      TaskFactory.taskForInvertingStarred({
        threads: Array.isArray(threads) ? threads : props.items,
        source: 'Toolbar Button: Thread List',
      })
    );
    if (event) {
      event.stopPropagation();
    }
    if (props.selection) {
      props.selection.clear();
    }
    return;
  };
  const postClickStarredState = props.items.every(t => t.starred === false);
  const title = postClickStarredState ? 'Flag' : 'Unflag';
  const className = postClickStarredState ? 'flag-not-selected' : 'flagged';

  if (props.isMenuItem) {
    return new MenuItem({
      label: title,
      click: () => _onStar(),
    });
  }

  return (
    <BindGlobalCommands commands={{ 'core:star-item': event => commandCb(event, _onShortcutStar) }}>
      <button
        tabIndex={-1}
        className={'btn btn-toolbar ' + className}
        title={title}
        onClick={_onStar}
      >
        <RetinaImg
          name="flag.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    </BindGlobalCommands>
  );
}
ToggleStarredButton.displayName = 'ToggleStarredButton';
ToggleStarredButton.containerRequired = false;

export function ToggleUnreadButton(props) {
  const _onClick = event => {
    const targetUnread = props.items.every(t => t.unread === false);
    _onChangeUnread(targetUnread);
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  const _onShortcutChangeUnread = targetUnread => {
    _onChangeUnread(targetUnread, threadSelectionScope(props, props.selection));
  };

  const _onChangeUnread = (targetUnread, threads) => {
    Actions.queueTasks(
      TaskFactory.taskForSettingUnread({
        threads: Array.isArray(threads) ? threads : props.items,
        unread: targetUnread,
        source: 'Toolbar Button: Thread List',
      })
    );
    Actions.popSheet({ reason: 'ToolbarButton:ToggleUnread:changeUnread' });
    if (props.selection) {
      props.selection.clear();
    }
  };

  const targetUnread = props.items.every(t => t.unread === false);
  const fragment = targetUnread ? 'unread' : 'read';
  const title = `Mark as ${fragment}`;

  if (props.isMenuItem) {
    return new MenuItem({
      label: title,
      click: () => _onClick(),
    });
  }

  return (
    <BindGlobalCommands
      key={fragment}
      commands={
        targetUnread
          ? {
              'core:mark-as-unread': event => commandCb(event, _onShortcutChangeUnread, true),
            }
          : {
              'core:mark-as-read': event => commandCb(event, _onShortcutChangeUnread, false),
            }
      }
    >
      <button
        tabIndex={-1}
        className="btn btn-toolbar btn-hide-when-crowded"
        title={title}
        onClick={_onClick}
      >
        <RetinaImg
          name={`${fragment === 'unread' ? 'read' : 'unread'}.svg`}
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    </BindGlobalCommands>
  );
}
ToggleUnreadButton.displayName = 'ToggleUnreadButton';
ToggleUnreadButton.containerRequired = false;

class HiddenGenericRemoveButton extends React.Component {
  static displayName = 'HiddenGenericRemoveButton';

  _onShortcutRemoveAndShift = ({ offset }) => {
    this._onShift({ offset });
    this._onRemoveFromView(threadSelectionScope(this.props, this.props.selection));
  };

  _onRemoveAndShift = ({ offset }) => {
    this._onShift({ offset });
    this._onRemoveFromView();
  };
  _onShift = ({ offset }) => {
    const dataSource = ThreadListStore.dataSource();
    const focusedId = FocusedContentStore.focusedId('thread');
    const focusedIdx = Math.min(
      dataSource.count() - 1,
      Math.max(0, dataSource.indexOfId(focusedId) + offset)
    );
    const item = dataSource.get(focusedIdx);
    Actions.setFocus({ collection: 'thread', item });
  };

  _onShortcutRemoveFromView = event => {
    this._onRemoveFromView(threadSelectionScope(this.props, this.props.selection));
  };

  _onRemoveFromView = threads => {
    const current = FocusedPerspectiveStore.current();
    const tasks = current.tasksForRemovingItems(
      threads ? this.props.items : threads,
      'Keyboard Shortcut'
    );
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:HiddenGenericRemoveButton:removeFromView' });
    if (AppEnv.isThreadWindow()) {
      AppEnv.debugLog(`Closing window because in ThreadWindow`);
      AppEnv.close();
    }
  };

  render() {
    return (
      <BindGlobalCommands
        commands={{
          // 'core:gmail-remove-from-view': event => commandCb(event, this._onShortcutRemoveFromView),
          'core:remove-from-view': event => commandCb(event, this._onShortcutRemoveFromView),
          'core:remove-and-previous': event =>
            commandCb(event, this._onShortcutRemoveAndShift, { offset: -1 }),
          'core:remove-and-next': event =>
            commandCb(event, this._onShortcutRemoveAndShift, { offset: 1 }),
          'core:show-previous': event => commandCb(event, this._onShift, { offset: -1 }),
          'core:show-next': event => commandCb(event, this._onShift, { offset: 1 }),
        }}
      >
        <span />
      </BindGlobalCommands>
    );
  }
}

class HiddenToggleImportantButton extends React.Component {
  static displayName = 'HiddenToggleImportantButton';

  _onShortcutSetImportant = important => {
    this._onSetImportant(important, threadSelectionScope(this.props, this.props.selection));
  };
  _onSetImportant = (important, threads) => {
    Actions.queueTasks(
      TaskFactory.tasksForThreadsByAccountId(
        threads ? threads : this.props.items,
        (accountThreads, accountId) => {
          return [
            new ChangeLabelsTask({
              threads: accountThreads,
              source: 'Keyboard Shortcut',
              labelsToAdd: [],
              labelsToRemove: important
                ? []
                : [CategoryStore.getCategoryByRole(accountId, 'important')],
            }),
            new ChangeLabelsTask({
              threads: accountThreads,
              source: 'Keyboard Shortcut',
              labelsToAdd: important
                ? [CategoryStore.getCategoryByRole(accountId, 'important')]
                : [],
              labelsToRemove: [],
            }),
          ];
        }
      )
    );
  };

  render() {
    if (!AppEnv.config.get('core.workspace.showImportant')) {
      return false;
    }
    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(
      this.props.items,
      'important'
    );
    if (!allowed) {
      return false;
    }

    const allImportant = this.props.items.every(item =>
      item.labels.find(c => c.role === 'important')
    );

    return (
      <BindGlobalCommands
        key={allImportant ? 'unimportant' : 'important'}
        commands={
          allImportant
            ? {
                'core:mark-unimportant': event =>
                  commandCb(event, this._onShortcutSetImportant, false),
              }
            : {
                'core:mark-important': event =>
                  commandCb(event, this._onShortcutSetImportant, true),
              }
        }
      >
        <span />
      </BindGlobalCommands>
    );
  }
}

export class ThreadListMoreButton extends React.Component {
  static displayName = 'ThreadListMoreButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  constructor(props) {
    super(props);
    const current = FocusedPerspectiveStore.current();
    if (current && current.accountIds.length) {
      this._account = AccountStore.accountForId(current.accountIds[0]);
    }
  }

  UNSAFE_componentWillUpdate() {
    const current = FocusedPerspectiveStore.current();
    if (current && current.accountIds.length) {
      this._account = AccountStore.accountForId(current.accountIds[0]);
    }
  }

  _onPrintThread = () => {
    const node = document.querySelector('#message-list');
    const currentThread = MessageStore.thread();
    Actions.printThread(currentThread, node.outerHTML);
  };

  _more = () => {
    const selectionCount = this.props.items ? this.props.items.length : 0;
    const menu = new Menu();
    if (selectionCount > 0) {
      if (isSameAccount(this.props.items)) {
        menu.append(
          new MenuItem({
            label: 'Move to Folder',
            click: () => AppEnv.commands.dispatch('core:change-folders', this._anchorEl),
          })
        );
      }
      const account = AccountStore.accountForItems(this.props.items);
      if (account && account.usesLabels()) {
        menu.append(
          new MenuItem({
            label: 'Apply Labels',
            click: () => AppEnv.commands.dispatch('core:change-labels', this._anchorEl),
          })
        );
      }
      if (this.props.items.every(item => item.unread)) {
        menu.append(
          new MenuItem({
            label: `Mark as read`,
            click: (menuItem, browserWindow) => {
              AppEnv.commands.dispatch('core:mark-as-read');
            },
          })
        );
      } else if (this.props.items.every(item => !item.unread)) {
        menu.append(
          new MenuItem({
            label: `Mark as unread`,
            click: (menuItem, browserWindow) => {
              AppEnv.commands.dispatch('core:mark-as-unread');
            },
          })
        );
      } else {
        menu.append(
          new MenuItem({
            label: `Mark as read`,
            click: (menuItem, browserWindow) => {
              AppEnv.commands.dispatch('core:mark-as-read');
            },
          })
        );
        menu.append(
          new MenuItem({
            label: `Mark as unread`,
            click: (menuItem, browserWindow) => {
              AppEnv.commands.dispatch('core:mark-as-unread');
            },
          })
        );
      }
      const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(
        this.props.items,
        'important'
      );
      if (allowed) {
        menu.append(
          new MenuItem({
            label: `Mark as spam`,
            click: (menuItem, browserWindow) => {
              AppEnv.commands.dispatch('core:report-as-spam');
            },
          })
        );
      }
      if (this._account && this._account.usesLabels()) {
        menu.append(
          new MenuItem({
            label: `Mark important`,
            click: () => AppEnv.commands.dispatch('core:mark-important'),
          })
        );
      }
    } else {
      menu.append(
        new MenuItem({
          label: `Mark all as read`,
          click: (menuItem, browserWindow) => {
            const unreadThreads = this.props.dataSource.itemsCurrentlyInViewMatching(
              item => item.unread
            );
            Actions.queueTasks(
              TaskFactory.taskForSettingUnread({
                threads: unreadThreads,
                unread: false,
                source: 'Toolbar Button: Mark all read',
              })
            );
          },
        })
      );
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: `Select messages for more options.`,
          enabled: false,
        })
      );
    }
    menu.popup({});
  };

  render() {
    return (
      <button
        ref={el => (this._anchorEl = el)}
        tabIndex={-1}
        className="btn btn-toolbar btn-list-more"
        onClick={this._more}
      >
        <RetinaImg
          name="more.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    );
  }
}

export class MoreButton extends React.Component {
  static displayName = 'MoreButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onPrintThread = () => {
    const node = document.querySelector('#message-list');
    const currentThread = MessageStore.thread();
    Actions.printThread(currentThread, node.outerHTML);
  };

  _more = () => {
    const expandTitle = MessageStore.hasCollapsedItems() ? 'Expand All' : 'Collapse All';
    const menu = new Menu();
    const messageListMoveButtons = WorkspaceStore.hiddenLocations().find(
      loc => loc.id === 'MessageListMoveButtons'
    );
    if (messageListMoveButtons) {
      const targetUnread = this.props.items.every(t => t.unread === false);
      const unreadTitle = targetUnread ? 'Mark as unread' : 'Mark as read';
      menu.append(
        new MenuItem({
          label: unreadTitle,
          click: () => {
            if (targetUnread) {
              AppEnv.commands.dispatch('core:mark-as-unread', targetUnread);
            } else {
              AppEnv.commands.dispatch('core:mark-as-read', targetUnread);
            }
          },
        })
      );
      if (isSameAccount(this.props.items)) {
        menu.append(
          new MenuItem({
            label: 'Move to Folder',
            click: () => AppEnv.commands.dispatch('core:change-folders', this._anchorEl),
          })
        );
      }
      const account = AccountStore.accountForItems(this.props.items);
      if (account && account.usesLabels()) {
        menu.append(
          new MenuItem({
            label: 'Apply Labels',
            click: () => AppEnv.commands.dispatch('core:change-labels', this._anchorEl),
          })
        );
      }
    }
    menu.append(
      new MenuItem({
        label: `Print Thread`,
        click: () => this._onPrintThread(),
      })
    );
    menu.append(
      new MenuItem({
        label: expandTitle,
        click: () => Actions.toggleAllMessagesExpanded(),
      })
    );
    menu.popup({});
  };

  render() {
    return (
      <button
        id={`threadToolbarMoreButton${this.props.position}`}
        tabIndex={-1}
        className="btn btn-toolbar btn-more"
        onClick={this._more}
        ref={el => (this._anchorEl = el)}
      >
        <RetinaImg
          name="more.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    );
  }
}

class ThreadArrowButton extends React.Component {
  static propTypes = {
    getStateFromStores: PropTypes.func,
    direction: PropTypes.string,
    command: PropTypes.string,
    title: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = this.props.getStateFromStores();
  }

  componentDidMount() {
    this._unsubscribe = ThreadListStore.listen(this._onStoreChange);
    this._unsubscribe_focus = FocusedContentStore.listen(this._onStoreChange);
  }

  componentWillUnmount() {
    this._unsubscribe();
    this._unsubscribe_focus();
  }

  _onClick = () => {
    if (this.state.disabled) {
      return;
    }
    AppEnv.commands.dispatch(this.props.command);
    return;
  };

  _onStoreChange = () => {
    this.setState(this.props.getStateFromStores());
  };

  render() {
    const { direction, title } = this.props;
    const classes = classNames({
      'btn-toolbar': true,
      'message-toolbar-arrow': true,
      disabled: this.state.disabled,
    });

    return (
      <div className={`${classes} ${direction}`} onClick={this._onClick} title={title}>
        <RetinaImg
          name={`${direction === 'up' ? 'back' : 'next'}.svg`}
          isIcon
          style={{ width: 24, height: 24 }}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    );
  }
}

const Divider = (key = 'divider') => <div className="divider" key={key} />;
Divider.displayName = 'Divider';

export const ThreadEmptyMoreButtons = CreateButtonGroup(
  'ThreadEmptyMoreButtons',
  [ThreadListMoreButton],
  { order: -100 }
);

export const ThreadListToolbarButtons = CreateButtonGroup(
  'ThreadListToolbarButtons',
  [
    ArchiveButton,
    MarkAsSpamButton,
    HiddenGenericRemoveButton,
    TrashButton,
    ToggleStarredButton,
    HiddenToggleImportantButton,
    ToggleUnreadButton,
    ThreadListMoreButton,
    ToolbarCategoryPicker,
  ],
  { order: 1 }
);

export const DownButton = props => {
  const getStateFromStores = () => {
    const selectedId = FocusedContentStore.focusedId('thread');
    const lastIndex = ThreadListStore.dataSource().count() - 1;
    const lastItem = ThreadListStore.dataSource().get(lastIndex);
    return {
      disabled: lastItem && lastItem.id === selectedId,
    };
  };

  if (WorkspaceStore.layoutMode() !== 'list') {
    return null;
  }
  const perspective = FocusedPerspectiveStore.current();
  if (perspective && perspective.sift) {
    return null;
  }

  const title = 'Next thread';
  if (props.isMenuItem) {
    return new MenuItem({
      label: title,
      click: () => AppEnv.commands.dispatch('core:show-next'),
    });
  }

  return (
    <ThreadArrowButton
      getStateFromStores={getStateFromStores}
      direction={'down'}
      title={title}
      command={'core:show-next'}
    />
  );
};
DownButton.displayName = 'DownButton';
DownButton.containerRequired = false;

export const UpButton = props => {
  const getStateFromStores = () => {
    const selectedId = FocusedContentStore.focusedId('thread');
    const item = ThreadListStore.dataSource().get(0);
    return {
      disabled: item && item.id === selectedId,
    };
  };

  if (WorkspaceStore.layoutMode() !== 'list') {
    return null;
  }
  const perspective = FocusedPerspectiveStore.current();
  if (perspective && perspective.sift) {
    return null;
  }
  const title = 'Previous thread';
  if (props.isMenuItem) {
    if (getStateFromStores().disabled) {
      return null;
    }
    return new MenuItem({
      label: title,
      click: () => AppEnv.commands.dispatch('core:show-previous'),
    });
  }

  return (
    <ThreadArrowButton
      getStateFromStores={getStateFromStores}
      direction={'up'}
      title={title}
      command={'core:show-previous'}
    />
  );
};
UpButton.displayName = 'UpButton';
UpButton.containerRequired = false;

export const PopoutButton = () => {
  const _onPopoutComposer = () => {
    const thread = MessageStore.thread();
    if (thread) {
      Actions.popoutThread(thread);
      // This returns the single-pane view to the inbox, and does nothing for
      // double-pane view because we're at the root sheet.
      // Actions.popSheet();
    }
  };

  if (!AppEnv.isComposerWindow()) {
    return (
      <div
        className="btn-toolbar message-toolbar-popout"
        key="popout"
        title="Popout composer…"
        onClick={_onPopoutComposer}
      >
        <RetinaImg
          name={'popout.svg'}
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    );
  }

  return null;
};
PopoutButton.displayName = 'PopoutButton';

function FolderButton(props) {
  if (props.isMenuItem) {
    return new MenuItem({
      label: 'Move to Folder',
      click: () => AppEnv.commands.dispatch('core:change-folders', props.anchorEl),
    });
  }

  return (
    <div>
      <ToolbarCategoryPicker {...props} />
    </div>
  );
}
FolderButton.displayName = 'FolderButton';

const MailActionsMap = {
  archive: ArchiveButton,
  trash: TrashButton,
  flag: ToggleStarredButton,
  read: ToggleUnreadButton,
  folder: FolderButton,
  spam: MarkAsSpamButton,
  print: PrintThreadButton,
};

class MoreActionsButton extends React.Component {
  static displayName = 'MoreActionsButton';
  static propTypes = {
    moreButtonlist: PropTypes.array.isRequired,
    items: PropTypes.array.isRequired,
  };

  constructor(props) {
    super();
  }

  _more = () => {
    const expandTitle = MessageStore.hasCollapsedItems() ? 'Expand All' : 'Collapse All';
    const menu = new Menu();

    const { moreButtonlist } = this.props;
    moreButtonlist.forEach(button => {
      if (button && typeof button === 'function') {
        const menuItem = button({ ...this.props, isMenuItem: true, anchorEl: this._anchorEl });
        if (menuItem) {
          menu.append(menuItem);
        }
      }
    });
    menu.append(
      new MenuItem({
        label: expandTitle,
        click: () => Actions.toggleAllMessagesExpanded(),
      })
    );

    const previousThread = UpButton({ ...this.props, isMenuItem: true });
    const nextThread = DownButton({ ...this.props, isMenuItem: true });
    if (previousThread) {
      menu.append(previousThread);
    }
    if (nextThread) {
      menu.append(nextThread);
    }

    menu.popup({});
  };

  render() {
    return (
      <button
        id={`threadToolbarMoreButton${this.props.position}`}
        tabIndex={-1}
        className="btn btn-toolbar btn-more"
        onClick={this._more}
        ref={el => (this._anchorEl = el)}
      >
        <RetinaImg
          name="more.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </button>
    );
  }
}

export class MailActionsButtons extends React.Component {
  static displayName = 'MailActionsButtons';

  constructor(props) {
    super(props);
    this._configKey = 'core.mailActions';
    this.state = { actionsList: [] };
  }

  componentDidMount() {
    this._getMailActionsConfig();
  }

  _getMailActionsConfig = () => {
    const mailActionsConfig = AppEnv.config.get(this._configKey);
    const actionsList = [];
    for (let i = 1; i < 6; i += 1) {
      const actionValue = mailActionsConfig[`mailAction${i}`];
      if (
        actionValue &&
        typeof actionValue === 'string' &&
        Object.keys(MailActionsMap).indexOf(actionValue) > -1
      ) {
        actionsList.push(actionValue);
      }
    }

    this.setState({ actionsList });
  };

  render() {
    const { actionsList } = this.state;
    const actionsButtonList = actionsList.map(key => MailActionsMap[key]);
    const ActionsButtons = CreateButtonGroup('ActionsButtons', actionsButtonList, { order: -21 });
    const moreButtonlist = [];
    Object.keys(MailActionsMap).forEach(key => {
      if (actionsList.indexOf(key) < 0) {
        moreButtonlist.push(MailActionsMap[key]);
      }
    });

    return (
      <div className="button-group">
        <ActionsButtons {...this.props} />
        <MoreActionsButton {...this.props} moreButtonlist={moreButtonlist} />
        <HiddenGenericRemoveButton />
      </div>
    );
  }
}

export const MailActionsPopoutButtons = CreateButtonGroup(
  'MailActionsPopoutButtons',
  [Divider, PopoutButton],
  { order: 21 }
);
