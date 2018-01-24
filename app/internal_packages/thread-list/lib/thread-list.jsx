const _ = require('underscore');
const React = require('react');
const ReactDOM = require('react-dom');
const classnames = require('classnames');

const {
  MultiselectList,
  FocusContainer,
  EmptyListState,
  FluxContainer,
  SyncingListState,
} = require('mailspring-component-kit');

const {
  Actions,
  Utils,
  CanvasUtils,
  TaskFactory,
  ChangeStarredTask,
  ChangeFolderTask,
  ChangeLabelsTask,
  CategoryStore,
  ExtensionRegistry,
  FocusedContentStore,
  FocusedPerspectiveStore,
  FolderSyncProgressStore,
} = require('mailspring-exports');

const ThreadListColumns = require('./thread-list-columns');
const ThreadListScrollTooltip = require('./thread-list-scroll-tooltip');
const ThreadListStore = require('./thread-list-store');
const ThreadListContextMenu = require('./thread-list-context-menu').default;

class ThreadList extends React.Component {
  static displayName = 'ThreadList';

  static containerRequired = false;
  static containerStyles = {
    minWidth: 300,
    maxWidth: 3000,
  };

  constructor(props) {
    super(props);
    this.state = {
      style: 'unknown',
      syncing: false,
    };
  }

  componentDidMount() {
    this.unsub = FolderSyncProgressStore.listen(() =>
      this.setState({
        syncing: FocusedPerspectiveStore.current().hasSyncingCategories(),
      })
    );
    window.addEventListener('resize', this._onResize, true);
    ReactDOM.findDOMNode(this).addEventListener('contextmenu', this._onShowContextMenu);
    this._onResize();
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(this.props, nextProps) || !Utils.isEqualReact(this.state, nextState);
  }

  componentWillUnmount() {
    this.unsub();
    window.removeEventListener('resize', this._onResize, true);
    ReactDOM.findDOMNode(this).removeEventListener('contextmenu', this._onShowContextMenu);
  }

  _shift = ({ offset, afterRunning }) => {
    const dataSource = ThreadListStore.dataSource();
    const focusedId = FocusedContentStore.focusedId('thread');
    const focusedIdx = Math.min(
      dataSource.count() - 1,
      Math.max(0, dataSource.indexOfId(focusedId) + offset)
    );
    const item = dataSource.get(focusedIdx);
    afterRunning();
    Actions.setFocus({ collection: 'thread', item });
  };

  _keymapHandlers() {
    return {
      'core:remove-from-view': () => {
        return this._onRemoveFromView();
      },
      'core:gmail-remove-from-view': () => {
        this._onRemoveFromView();
      }, // todo bg
      'core:archive-item': this._onArchiveItem,
      'core:delete-item': this._onDeleteItem,
      'core:star-item': this._onStarItem,
      'core:snooze-item': this._onSnoozeItem,
      'core:mark-important': () => this._onSetImportant(true),
      'core:mark-unimportant': () => this._onSetImportant(false),
      'core:mark-as-unread': () => this._onSetUnread(true),
      'core:mark-as-read': () => this._onSetUnread(false),
      'core:report-as-spam': () => this._onMarkAsSpam(false),
      'core:remove-and-previous': () => {
        this._shift({ offset: -1, afterRunning: this._onRemoveFromView });
      },
      'core:remove-and-next': () => {
        this._shift({ offset: 1, afterRunning: this._onRemoveFromView });
      },
      'thread-list:select-read': this._onSelectRead,
      'thread-list:select-unread': this._onSelectUnread,
      'thread-list:select-starred': this._onSelectStarred,
      'thread-list:select-unstarred': this._onSelectUnstarred,
    };
  }

  _getFooter() {
    if (!this.state.syncing) {
      return null;
    }
    if (ThreadListStore.dataSource().count() <= 0) {
      return null;
    }
    return <SyncingListState />;
  }

  render() {
    let columns, itemHeight;
    if (this.state.style === 'wide') {
      columns = ThreadListColumns.Wide;
      itemHeight = 36;
    } else {
      columns = ThreadListColumns.Narrow;
      itemHeight = 85;
    }

    return (
      <FluxContainer
        footer={this._getFooter()}
        stores={[ThreadListStore]}
        getStateFromStores={() => {
          return { dataSource: ThreadListStore.dataSource() };
        }}
      >
        <FocusContainer collection="thread">
          <MultiselectList
            ref="list"
            draggable
            columns={columns}
            itemPropsProvider={this._threadPropsProvider}
            itemHeight={itemHeight}
            className={`thread-list thread-list-${this.state.style}`}
            scrollTooltipComponent={ThreadListScrollTooltip}
            EmptyComponent={EmptyListState}
            keymapHandlers={this._keymapHandlers()}
            onDoubleClick={thread => Actions.popoutThread(thread)}
            onDragStart={this._onDragStart}
            onDragEnd={this._onDragEnd}
          />
        </FocusContainer>
      </FluxContainer>
    );
  }

  _threadPropsProvider(item) {
    let classes = classnames({
      unread: item.unread,
    });
    classes += ExtensionRegistry.ThreadList.extensions()
      .filter(ext => ext.cssClassNamesForThreadListItem != null)
      .reduce((prev, ext) => prev + ' ' + ext.cssClassNamesForThreadListItem(item), ' ');

    const props = { className: classes };

    props.shouldEnableSwipe = () => {
      const perspective = FocusedPerspectiveStore.current();
      const tasks = perspective.tasksForRemovingItems([item], 'Swipe');
      return tasks.length > 0;
    };

    props.onSwipeRightClass = () => {
      const perspective = FocusedPerspectiveStore.current();
      const tasks = perspective.tasksForRemovingItems([item], 'Swipe');
      if (tasks.length === 0) {
        return null;
      }

      // TODO this logic is brittle
      const task = tasks[0];
      const name =
        task instanceof ChangeStarredTask
          ? 'unstar'
          : task instanceof ChangeFolderTask
            ? task.folder.name
            : task instanceof ChangeLabelsTask ? 'archive' : 'remove';

      return `swipe-${name}`;
    };

    props.onSwipeRight = function(callback) {
      const perspective = FocusedPerspectiveStore.current();
      const tasks = perspective.tasksForRemovingItems([item], 'Swipe');
      if (tasks.length === 0) {
        callback(false);
      }
      Actions.closePopover();
      Actions.queueTasks(tasks);
      callback(true);
    };

    const disabledPackages = AppEnv.config.get('core.disabledPackages') || [];
    if (disabledPackages.includes('thread-snooze')) {
      return props;
    }

    if (FocusedPerspectiveStore.current().isInbox()) {
      props.onSwipeLeftClass = 'swipe-snooze';
      props.onSwipeCenter = () => {
        Actions.closePopover();
      };
      props.onSwipeLeft = callback => {
        // TODO this should be grabbed from elsewhere
        const SnoozePopover = require('../../thread-snooze/lib/snooze-popover').default;

        const element = document.querySelector(`[data-item-id="${item.id}"]`);
        const originRect = element.getBoundingClientRect();
        Actions.openPopover(<SnoozePopover threads={[item]} swipeCallback={callback} />, {
          originRect,
          direction: 'right',
          fallbackDirection: 'down',
        });
      };
    }

    return props;
  }

  _targetItemsForMouseEvent(event) {
    const itemThreadId = this.refs.list.itemIdAtPoint(event.clientX, event.clientY);
    if (!itemThreadId) {
      return null;
    }

    const dataSource = ThreadListStore.dataSource();
    if (itemThreadId && dataSource.selection.ids().includes(itemThreadId)) {
      return {
        threadIds: dataSource.selection.ids(),
        accountIds: _.uniq(_.pluck(dataSource.selection.items(), 'accountId')),
      };
    } else {
      const thread = dataSource.getById(itemThreadId);
      if (!thread) {
        return null;
      }
      return {
        threadIds: [thread.id],
        accountIds: [thread.accountId],
      };
    }
  }

  _onSyncStatusChanged = () => {
    const syncing = FocusedPerspectiveStore.current().hasSyncingCategories();
    this.setState({ syncing });
  };

  _onShowContextMenu = event => {
    const data = this._targetItemsForMouseEvent(event);
    if (!data) {
      event.preventDefault();
      return;
    }
    new ThreadListContextMenu(data).displayMenu();
  };

  _onDragStart = event => {
    const data = this._targetItemsForMouseEvent(event);
    if (!data) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.dragEffect = 'move';

    const canvas = CanvasUtils.canvasWithThreadDragImage(data.threadIds.length);
    event.dataTransfer.setDragImage(canvas, 10, 10);
    event.dataTransfer.setData('nylas-threads-data', JSON.stringify(data));
    event.dataTransfer.setData(`nylas-accounts=${data.accountIds.join(',')}`, '1');
  };

  _onDragEnd = event => {};

  _onResize = event => {
    const current = this.state.style;
    const desired = ReactDOM.findDOMNode(this).offsetWidth < 540 ? 'narrow' : 'wide';
    if (current !== desired) {
      this.setState({ style: desired });
    }
  };

  _threadsForKeyboardAction() {
    if (!ThreadListStore.dataSource()) {
      return null;
    }
    const focused = FocusedContentStore.focused('thread');
    if (focused) {
      return [focused];
    } else if (ThreadListStore.dataSource().selection.count() > 0) {
      return ThreadListStore.dataSource().selection.items();
    } else {
      return null;
    }
  }

  _onStarItem = () => {
    const threads = this._threadsForKeyboardAction();
    if (!threads) {
      return;
    }
    Actions.queueTask(
      TaskFactory.taskForInvertingStarred({
        threads,
        source: 'Keyboard Shortcut',
      })
    );
  };

  _onSnoozeItem = () => {
    const disabledPackages = AppEnv.config.get('core.disabledPackages') || [];
    if (disabledPackages.includes('thread-snooze')) {
      return;
    }

    const threads = this._threadsForKeyboardAction();
    if (!threads) {
      return;
    }
    // TODO this should be grabbed from elsewhere
    const SnoozePopover = require('../../thread-snooze/lib/snooze-popover').default;

    const element = document.querySelector('.snooze-button.btn.btn-toolbar');
    if (!element) {
      return;
    }
    const originRect = element.getBoundingClientRect();
    Actions.openPopover(<SnoozePopover threads={threads} />, { originRect, direction: 'down' });
  };

  _onSetImportant = important => {
    const threads = this._threadsForKeyboardAction();
    if (!threads) {
      return;
    }
    if (!AppEnv.config.get('core.workspace.showImportant')) {
      return;
    }

    Actions.queueTasks(
      TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
        return new ChangeLabelsTask({
          threads: accountThreads,
          source: 'Keyboard Shortcut',
          labelsToAdd: important ? [CategoryStore.getCategoryByRole(accountId, 'important')] : [],
          labelsToRemove: important
            ? []
            : [CategoryStore.getCategoryByRole(accountId, 'important')],
        });
      })
    );
  };

  _onSetUnread = unread => {
    const threads = this._threadsForKeyboardAction();
    if (!threads) {
      return;
    }
    Actions.queueTask(
      TaskFactory.taskForInvertingUnread({ threads, unread, source: 'Keyboard Shortcut' })
    );
    Actions.popSheet();
  };

  _onMarkAsSpam = () => {
    const threads = this._threadsForKeyboardAction();
    if (!threads) {
      return;
    }
    const tasks = TaskFactory.tasksForMarkingAsSpam({
      source: 'Keyboard Shortcut',
      threads,
    });
    Actions.queueTasks(tasks);
  };

  _onRemoveFromView = ruleset => {
    const threads = this._threadsForKeyboardAction();
    if (!threads) {
      return;
    }
    const current = FocusedPerspectiveStore.current();
    const tasks = current.tasksForRemovingItems(threads, 'Keyboard Shortcut');
    Actions.queueTasks(tasks);
    Actions.popSheet();
  };

  _onArchiveItem = () => {
    const threads = this._threadsForKeyboardAction();
    if (threads) {
      const tasks = TaskFactory.tasksForArchiving({
        source: 'Keyboard Shortcut',
        threads,
      });
      Actions.queueTasks(tasks);
    }
    Actions.popSheet();
  };

  _onDeleteItem = () => {
    const threads = this._threadsForKeyboardAction();
    if (threads) {
      const tasks = TaskFactory.tasksForMovingToTrash({
        source: 'Keyboard Shortcut',
        threads,
      });
      Actions.queueTasks(tasks);
    }
    Actions.popSheet();
  };

  _onSelectRead = () => {
    const dataSource = ThreadListStore.dataSource();
    const items = dataSource.itemsCurrentlyInViewMatching(item => !item.unread);
    this.refs.list.handler().onSelect(items);
  };

  _onSelectUnread = () => {
    const dataSource = ThreadListStore.dataSource();
    const items = dataSource.itemsCurrentlyInViewMatching(item => item.unread);
    this.refs.list.handler().onSelect(items);
  };

  _onSelectStarred = () => {
    const dataSource = ThreadListStore.dataSource();
    const items = dataSource.itemsCurrentlyInViewMatching(item => item.starred);
    this.refs.list.handler().onSelect(items);
  };

  _onSelectUnstarred = () => {
    const dataSource = ThreadListStore.dataSource();
    const items = dataSource.itemsCurrentlyInViewMatching(item => !item.starred);
    this.refs.list.handler().onSelect(items);
  };
}

module.exports = ThreadList;
