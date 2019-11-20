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
  ExtensionRegistry,
  FocusedContentStore,
  FocusedPerspectiveStore,
  FolderSyncProgressStore,
  AccountStore,
  CategoryStore,
  WorkspaceStore,
  TaskFactory
} = require('mailspring-exports');
const ToolbarCategoryPicker = require('../../category-picker/lib/toolbar-category-picker');

const ThreadListColumns = require('./thread-list-columns');
const ThreadListScrollTooltip = require('./thread-list-scroll-tooltip');
const ThreadListStore = require('./thread-list-store');
const ThreadListContextMenu = require('./thread-list-context-menu').default;

class ThreadList extends React.Component {
  static displayName = 'ThreadList';

  static containerStyles = {
    minWidth: 375,
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

  _getFooter() {
    if (!this.state.syncing) {
      return null;
    }
    if (ThreadListStore.dataSource().count() <= 0) {
      return null;
    }
    // DC-1141: do not display syncing status
    // return <SyncingListState />;
    return null;
  }

  _calcScrollPosition = _.throttle(scrollTop => {
    const toolbar = document.querySelector('.thread-list .thread-list-toolbar');
    if (toolbar) {
      if (scrollTop > 0) {
        if (toolbar.className.indexOf('has-shadow') === -1) {
          toolbar.className += ' has-shadow';
        }
      } else {
        toolbar.className = toolbar.className.replace(' has-shadow', '');
      }
    }
  }, 100);

  _onScroll = e => {
    if (e.target) {
      this._calcScrollPosition(e.target.scrollTop);
    }
  };

  render() {
    let columns, itemHeight;
    const layoutMode = WorkspaceStore.layoutMode();
    if (this.state.style === 'wide' || layoutMode === 'list') {
      columns = ThreadListColumns.Wide;
      itemHeight = 55;
    } else {
      columns = ThreadListColumns.Narrow;
      itemHeight = 108;
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
            keymapHandlers={{
              'thread-list:select-read': this._onSelectRead,
              'thread-list:select-unread': this._onSelectUnread,
              'thread-list:select-starred': this._onSelectStarred,
              'thread-list:select-unstarred': this._onSelectUnstarred,
              'thread-list:select-important': this._onSelectImportant,
            }}
            onDoubleClick={thread => Actions.popoutThread(thread)}
            onDragStart={this._onDragStart}
            onDragEnd={this._onDragEnd}
            onScroll={this._onScroll}
          />
        </FocusContainer>
      </FluxContainer>
    );
  }
  _onCloseMoveFolderPopout = () => {
    Actions.closePopover();
  };
  _getTasks(swipeKey, step, threads, needTask, container) {
    const swipeLeftActions = [];
    const swipeRightActions = [];
    let action;
    action = AppEnv.config.get(`core.swipeActions.leftShortAction`);
    if (action) {
      swipeLeftActions.push({ action });
    }
    action = AppEnv.config.get(`core.swipeActions.leftLongAction`);
    if (action) {
      swipeLeftActions.push({ action });
    }
    action = AppEnv.config.get(`core.swipeActions.rightShortAction`);
    if (action) {
      swipeRightActions.push({ action });
    }
    action = AppEnv.config.get(`core.swipeActions.rightLongAction`);
    if (action) {
      swipeRightActions.push({ action });
    }
    const swipeOptions = {
      'swipeLeft': swipeLeftActions,
      'swipeRight': swipeRightActions
    }
    if (!swipeOptions[swipeKey] ||
      !swipeOptions[swipeKey].length) {
      return;
    }
    const actions = [];
    const perspective = FocusedPerspectiveStore.current();
    for (const swipeAction of swipeOptions[swipeKey]) {
      if (swipeAction.action === 'archive' && !perspective.canArchiveThreads(threads)) {
        continue;
      }
      if (swipeAction.action === 'trash' && !perspective.canTrashThreads(threads)) {
        continue;
      }
      actions.push(swipeAction);
    }
    let taskOption = actions[step - 1];
    if (!taskOption) {
      taskOption = actions[0];
    }
    if (needTask && taskOption) {
      let tasks = [];
      switch (taskOption.action) {
        case 'flag':
          tasks = TaskFactory.taskForInvertingStarred({
            threads,
            source: 'Swipe',
          });
          break;
        case 'archive':
          tasks = TaskFactory.tasksForArchiving({
            threads,
            source: 'Swipe',
          });
          break;
        case 'trash':
          tasks = TaskFactory.tasksForMovingToTrash({
            threads,
            source: 'Swipe',
          });
          break;
        case 'read':
          tasks.push(TaskFactory.taskForInvertingUnread({
            threads,
            source: 'Swipe',
          }));
          break;
        case 'folder':
          AppEnv.commands.dispatch('core:change-folders', container);
          break;
        default:
      }
      taskOption.tasks = tasks;
    }

    if (taskOption) {
      switch (taskOption.action) {
        case 'flag':
          const starred = threads.every(t => t.starred === false);
          if (!starred) {
            taskOption.action = 'unflag';
          }
          break;
        case 'read':
          const unread = threads.every(t => t.unread === false);
          if (unread) {
            taskOption.action = 'unread';
          }
          break;
        default:
      }
    }
    return taskOption;
  }

  _onSwipe = (callback, step = 0, item, direction, container) => {
    let tasks = [];
    const taskOption = this._getTasks(direction, step, [item], true, container);
    if (taskOption) {
      tasks = taskOption.tasks;
    }
    if (tasks.length === 0) {
      callback(false);
      return;
    }
    Actions.closePopover();
    Actions.queueTasks(tasks);
    callback(true);
  };

  _onSwipeClass = (step = 0, item, direction) => {
    const taskOption = this._getTasks(direction, step, [item]);
    if (!taskOption) {
      return;
    }
    let name = taskOption.action;
    return `swipe-${name}`;
  };

  _threadPropsProvider = (item) => {
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

    props.onSwipeRightClass = (step = 0) => this._onSwipeClass(step, item, 'swipeRight');

    props.onSwipeRight = (callback, step = 0, container) => this._onSwipe(callback, step, item, 'swipeRight', container);

    props.onSwipeLeftClass = (step = 0) => this._onSwipeClass(step, item, 'swipeLeft');

    props.onSwipeLeft = (callback, step = 0, container) => this._onSwipe(callback, step, item, 'swipeLeft', container);

    props.move_folder_el = <ToolbarCategoryPicker items={[item]} currentPerspective={FocusedPerspectiveStore.current()} />
    // const disabledPackages = AppEnv.config.get('core.disabledPackages') || [];
    // if (disabledPackages.includes('thread-snooze')) {
    //   return props;
    // }

    // if (FocusedPerspectiveStore.current().isInbox()) {
    //   props.onSwipeLeftClass = 'swipe-snooze';
    //   props.onSwipeCenter = () => {
    //     Actions.closePopover();
    //   };
    //   // edison feature disabled
    //   props.onSwipeLeft = callback => {
    //     // TODO this should be grabbed from elsewhere
    //     const SnoozePopover = require('../../thread-snooze/lib/snooze-popover').default;

    //     const element = document.querySelector(`[data-item-id="${item.id}"]`);
    //     const originRect = element.getBoundingClientRect();
    //     Actions.openPopover(<SnoozePopover threads={[item]} swipeCallback={callback} />, {
    //       originRect,
    //       direction: 'right',
    //       fallbackDirection: 'down',
    //     });
    //   };
    // }

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
        threads: dataSource.selection.items(),
      };
    } else {
      const thread = dataSource.getById(itemThreadId);
      if (!thread) {
        return null;
      }
      return {
        threadIds: [thread.id],
        accountIds: [thread.accountId],
        threads: [thread],
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

  _onDragEnd = event => { };

  _onResize = event => {
    const current = this.state.style;
    const layoutMode = WorkspaceStore.layoutMode();
    // const desired = ReactDOM.findDOMNode(this).offsetWidth < 540 ? 'narrow' : 'wide';
    const desired =
      ReactDOM.findDOMNode(this).offsetWidth < 3900 && layoutMode === 'split' ? 'narrow' : 'wide';
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

  _onSelectRead = () => {
    const dataSource = ThreadListStore.dataSource();
    const items = dataSource.itemsCurrentlyInViewMatching(item => !item.unread);
    this.refs.list.handler().onSelect(items);
  };

  _onSelectUnread = () => {
    const dataSource = ThreadListStore.dataSource();
    const items = dataSource.itemsCurrentlyInViewMatching(item => item.unread);
    this.refs.list.handler().onSelect(items, false);
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

  _onSelectImportant = () => {
    const dataSource = ThreadListStore.dataSource();
    const items = dataSource.itemsCurrentlyInViewMatching(item => {
      const account = AccountStore.accountForId(item.accountId);
      const category = CategoryStore.getCategoryByRole(account, 'important');
      const isImportant = category && _.findWhere(item.labels, { id: category.id }) != null;
      return isImportant;
    });
    this.refs.list.handler().onSelect(items);
  };
}

module.exports = ThreadList;
