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

export class ArchiveButton extends React.Component {
  static displayName = 'ArchiveButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
    currentPerspective: PropTypes.object
  };

  _onArchive = event => {
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    const tasks = TaskFactory.tasksForArchiving({
      threads: threads,
      source: 'Toolbar Button: Thread List',
      currentPerspective: FocusedPerspectiveStore.current()
    });
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:ThreadList:archive' });
    if (event) {
      event.stopPropagation();
    }
    if (this.props.selection) {
      this.props.selection.clear();
    }
    return;
  };

  render() {
    const allowed = FocusedPerspectiveStore.current().canArchiveThreads(this.props.items);
    if (!allowed) {
      return false;
    }

    return (
      <BindGlobalCommands commands={{ 'core:archive-item': event => commandCb(event, this._onArchive) }}>
        <button tabIndex={-1} className="btn btn-toolbar" title="Archive" onClick={this._onArchive}>
          <RetinaImg name={'archive.svg'}
            style={{ width: 24, height: 24 }}
            isIcon
            mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

export class TrashButton extends React.Component {
  static displayName = 'TrashButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
    currentPerspective: PropTypes.object,
  };

  _onRemove = event => {
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    const tasks = TaskFactory.tasksForMovingToTrash({
      threads: threads,
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
                threads: JSON.stringify(this.props.items),
              },
            });
          } catch (e) {

          }
        }
      });
    }
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:ThreadList:remove' });
    if (event) {
      event.stopPropagation();
    }
    if (this.props.selection) {
      this.props.selection.clear();
    }
    return;
  };
  _onExpunge = event => {
    let messages = [];
    this.props.items.forEach(thread => {
      if (Array.isArray(thread.__messages) && thread.__messages.length > 0) {
        messages = messages.concat(thread.__messages)
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
          } catch (e) {

          }
        }
      });
    }
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:ThreadList:expunge' });
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const canMove = FocusedPerspectiveStore.current().canMoveThreadsTo(this.props.items, 'trash');
    const canExpunge = FocusedPerspectiveStore.current().canExpungeThreads(this.props.items);
    if (!canMove && !canExpunge) {
      return false;
    }
    let actionCallBack = null;
    if (canMove) {
      actionCallBack = this._onRemove;
    } else if (canExpunge) {
      actionCallBack = this._onExpunge;
    }

    return (
      <BindGlobalCommands commands={{ 'core:delete-item': event => commandCb(event, actionCallBack) }}>
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title={canMove ? 'Move to Trash' : 'Expunge Thread'}
          onClick={actionCallBack}
        >
          <RetinaImg name={'trash.svg'} style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

class HiddenGenericRemoveButton extends React.Component {
  static displayName = 'HiddenGenericRemoveButton';

  _onRemoveAndShift = ({ offset }) => {
    this._onShift({ offset });
    this._onRemoveFromView();
  };
  _onShift = ({ offset }) => {
    const dataSource = ThreadListStore.dataSource();
    const focusedId = FocusedContentStore.focusedId('thread');
    const focusedIdx = Math.min(
      dataSource.count() - 1,
      Math.max(0, dataSource.indexOfId(focusedId) + offset),
    );
    const item = dataSource.get(focusedIdx);
    Actions.setFocus({ collection: 'thread', item });
  };

  _onRemoveFromView = ruleset => {
    const current = FocusedPerspectiveStore.current();
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    const tasks = current.tasksForRemovingItems(threads, 'Keyboard Shortcut');
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:HiddenGenericRemoveButton:removeFromView' });
  };

  render() {
    return (
      <BindGlobalCommands
        commands={{
          'core:gmail-remove-from-view': event => commandCb(event, this._onRemoveFromView),
          'core:remove-from-view': event => commandCb(event, this._onRemoveFromView),
          'core:remove-and-previous': event => commandCb(event, this._onRemoveAndShift, { offset: -1 }),
          'core:remove-and-next': event => commandCb(event, this._onRemoveAndShift, { offset: 1 }),
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

  _onSetImportant = important => {
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    Actions.queueTasks(
      TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
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
            labelsToAdd: important ? [CategoryStore.getCategoryByRole(accountId, 'important')] : [],
            labelsToRemove: [],
          }),
        ];
      }),
    );
  };

  render() {
    if (!AppEnv.config.get('core.workspace.showImportant')) {
      return false;
    }
    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(
      this.props.items,
      'important',
    );
    if (!allowed) {
      return false;
    }

    const allImportant = this.props.items.every(item =>
      item.labels.find(c => c.role === 'important'),
    );

    return (
      <BindGlobalCommands
        key={allImportant ? 'unimportant' : 'important'}
        commands={
          allImportant
            ? {
              'core:mark-unimportant': event => commandCb(event, this._onSetImportant, false)
            }
            : {
              'core:mark-important': event => commandCb(event, this._onSetImportant, true)
            }
        }
      >
        <span />
      </BindGlobalCommands>
    );
  }
}

export class MarkAsSpamButton extends React.Component {
  static displayName = 'MarkAsSpamButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
    currentPerspective: PropTypes.object,
  };

  _onNotSpam = event => {
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    const tasks = TaskFactory.tasksForMarkingNotSpam({
      source: 'Toolbar Button: Thread List',
      threads,
      currentPerspective: FocusedPerspectiveStore.current(),
    });
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:MarkAsSpamButton:NotSpam' });
    if (event) {
      event.stopPropagation();
    }
    if (this.props.selection) {
      this.props.selection.clear();
    }
    return;
  };

  _onMarkAsSpam = event => {
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    const tasks = TaskFactory.tasksForMarkingAsSpam({
      threads,
      source: 'Toolbar Button: Thread List',
      currentPerspective: FocusedPerspectiveStore.current(),
    });
    Actions.queueTasks(tasks);
    Actions.popSheet({ reason: 'ToolbarButton:MarkAsSpamButton:Spam' });
    if (event) {
      event.stopPropagation();
    }
    if (this.props.selection) {
      this.props.selection.clear();
    }
    return;
  };

  render() {
    const allInSpam = this.props.items.every(item => item.folders.find(c => c.role === 'spam'));

    if (allInSpam) {
      return (
        <BindGlobalCommands
          key="not-spam"
          commands={{
            'core:report-not-spam': event => commandCb(event, this._onNotSpam)
          }}
        >
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            title="Not Junk"
            onClick={this._onNotSpam}
          >
            <RetinaImg name="not-junk.svg" style={{ width: 24, height: 24 }} isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </button>
        </BindGlobalCommands>
      );
    }

    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(this.props.items, 'spam');
    if (!allowed) {
      return false;
    }
    return (
      <BindGlobalCommands
        key="spam"
        commands={{
          'core:report-as-spam': event => commandCb(event, this._onMarkAsSpam)
        }}
      >
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title="Mark as Spam"
          onClick={this._onMarkAsSpam}
        >
          <RetinaImg name={'junk.svg'} style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

export class ToggleStarredButton extends React.Component {
  static displayName = 'ToggleStarredButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onStar = event => {
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    Actions.queueTasks(
      TaskFactory.taskForInvertingStarred({
        threads,
        source: 'Toolbar Button: Thread List',
      }),
    );
    if (event) {
      event.stopPropagation();
    }
    if (this.props.selection) {
      this.props.selection.clear();
    }
    return;
  };

  render() {
    const postClickStarredState = this.props.items.every(t => t.starred === false);
    const title = postClickStarredState ? 'Flag' : 'Unflag';
    const className = postClickStarredState ? 'flag-not-selected' : 'flagged';

    return (
      <BindGlobalCommands commands={{ 'core:star-item': event => commandCb(event, this._onStar) }}>
        <button tabIndex={-1} className={'btn btn-toolbar ' + className} title={title} onClick={this._onStar}>
          <RetinaImg
            name="flag.svg"
            style={{ width: 24, height: 24 }}
            isIcon
            mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

export class ToggleUnreadButton extends React.Component {
  static displayName = 'ToggleUnreadButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onClick = event => {
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    const targetUnread = threads.every(t => t.unread === false);
    this._onChangeUnread(targetUnread);
    event.stopPropagation();
    return;
  };

  _onChangeUnread = targetUnread => {
    let threads = this.props.items;
    if (this.selection) {
      const selectionThreads = this.selection.items();
      if (selectionThreads && selectionThreads.length > 0) {
        threads = selectionThreads;
      }
    }
    Actions.queueTasks(
      TaskFactory.taskForSettingUnread({
        threads,
        unread: targetUnread,
        source: 'Toolbar Button: Thread List',
      }),
    );
    Actions.popSheet({ reason: 'ToolbarButton:ToggleUnread:changeUnread' });
    if (this.props.selection) {
      this.props.selection.clear();
    }
  };

  render() {
    const targetUnread = this.props.items.every(t => t.unread === false);
    const fragment = targetUnread ? 'unread' : 'read';

    return (
      <BindGlobalCommands
        key={fragment}
        commands={
          targetUnread
            ? {
              'core:mark-as-unread': event => commandCb(event, this._onChangeUnread, true)
            }
            : {
              'core:mark-as-read': event => commandCb(event, this._onChangeUnread, false)
            }
        }
      >
        <button
          tabIndex={-1}
          className="btn btn-toolbar btn-hide-when-crowded"
          title={`Mark as ${fragment}`}
          onClick={this._onClick}
        >
          <RetinaImg name={`${fragment === 'unread' ? 'read' : 'unread'}.svg`} style={{ width: 24, height: 24 }} isIcon
            mode={RetinaImg.Mode.ContentIsMask} />
        </button>
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
      menu.append(new MenuItem({
        label: `Mark as read`,
        click: (menuItem, browserWindow) => {
          AppEnv.commands.dispatch('core:mark-as-read');
        },
      }),
      );
      const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(
        this.props.items,
        'important',
      );
      if (allowed) {
        menu.append(new MenuItem({
          label: `Mark as spam`,
          click: (menuItem, browserWindow) => {
            AppEnv.commands.dispatch('core:report-as-spam');
          },
        }),
        );
      }
      if (this._account && this._account.usesLabels()) {
        menu.append(new MenuItem({
          label: `Mark important`,
          click: () => AppEnv.commands.dispatch('core:mark-important'),
        }),
        );
      }
    } else {
      menu.append(new MenuItem({
        label: `Mark all as read`,
        click: (menuItem, browserWindow) => {
          const unreadThreads = this.props.dataSource.itemsCurrentlyInViewMatching(item => item.unread);
          Actions.queueTasks(
            TaskFactory.taskForSettingUnread({
              threads: unreadThreads,
              unread: false,
              source: 'Toolbar Button: Mark all read',
            }),
          );
        },
      }),
      );
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: `Select messages for more options.`,
        enabled: false
      }),
      );
    }
    menu.popup({});
  };

  render() {
    return (
      <button tabIndex={-1} className="btn btn-toolbar btn-list-more" onClick={this._more}>
        <RetinaImg
          name="more.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
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
      menu.append(new MenuItem({
        label: unreadTitle,
        click: () => {
          if (targetUnread) {
            AppEnv.commands.dispatch('core:mark-as-unread', targetUnread);
          } else {
            AppEnv.commands.dispatch('core:mark-as-read', targetUnread);
          }
        },
      }),
      );
      menu.append(new MenuItem({
        label: 'Move to Folder',
        click: () => AppEnv.commands.dispatch('core:change-folders', this._anchorEl),
      }),
      );
      const account = AccountStore.accountForItems(this.props.items);
      if (account && account.usesLabels()) {
        menu.append(new MenuItem({
          label: 'Apply Labels',
          click: () => AppEnv.commands.dispatch('core:change-labels', this._anchorEl),
        }),
        );
      }
    }
    menu.append(new MenuItem({
      label: `Print Thread`,
      click: () => this._onPrintThread(),
    })
    );
    menu.append(new MenuItem({
      label: expandTitle,
      click: () => Actions.toggleAllMessagesExpanded(),
    })
    );
    menu.popup({});
  };


  render() {
    return (
      <button tabIndex={-1} className="btn btn-toolbar btn-more" onClick={this._more}
        ref={el => (this._anchorEl = el)}>
        <RetinaImg
          name="more.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
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
          mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }
}

const Divider = (key = 'divider') => (
  <div className="divider" key={key} />
);
Divider.displayName = 'Divider';

export const FlagButtons = CreateButtonGroup(
  'FlagButtons',
  [ToggleStarredButton, HiddenToggleImportantButton, ToggleUnreadButton, MoreButton],
  { order: -103 },
);
export const ThreadMoreButtons = CreateButtonGroup(
  'ThreadMoreButtons',
  [ThreadListMoreButton],
  { order: -100 },
  'thread-more',
);
export const ThreadEmptyMoreButtons = CreateButtonGroup(
  'ThreadEmptyMoreButtons',
  [ThreadListMoreButton],
  { order: -100 },
);

export const MoveButtons = CreateButtonGroup(
  'MoveButtons',
  [ArchiveButton, MarkAsSpamButton, HiddenGenericRemoveButton, TrashButton, Divider],
  { order: -109 },
);

export const DownButton = () => {
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

  return (
    <ThreadArrowButton
      getStateFromStores={getStateFromStores}
      direction={'down'}
      title={'Next thread'}
      command={'core:show-next'}
    />
  );
};
DownButton.displayName = 'DownButton';
DownButton.containerRequired = false;

export const UpButton = () => {
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

  return (
    <ThreadArrowButton
      getStateFromStores={getStateFromStores}
      direction={'up'}
      title={'Previous thread'}
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
        <RetinaImg name={'popout.svg'}
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  return null;
};
PopoutButton.displayName = 'PopoutButton';

export const NavButtons = CreateButtonGroup(
  'NavButtons',
  [Divider, UpButton, DownButton, PopoutButton],
  { order: 205 },
);
