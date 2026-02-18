import _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import classnames from 'classnames';

import {
  MultiselectList,
  FocusContainer,
  EmptyListState,
  FluxContainer,
  SyncingListState,
} from 'mailspring-component-kit';

import {
  Actions,
  Utils,
  CanvasUtils,
  ChangeStarredTask,
  ChangeFolderTask,
  ChangeLabelsTask,
  DOMUtils,
  ExtensionRegistry,
  FocusedContentStore,
  FocusedPerspectiveStore,
  FolderSyncProgressStore,
  Thread,
  TaskFactory,
} from 'mailspring-exports';

import * as ThreadListColumns from './thread-list-columns';
import ThreadListScrollTooltip from './thread-list-scroll-tooltip';
import ThreadListStore from './thread-list-store';
import ThreadListContextMenu from './thread-list-context-menu';

class ThreadList extends React.Component<
  Record<string, unknown>,
  { style: string; syncing: boolean }
> {
  static displayName = 'ThreadList';

  static containerStyles = {
    minWidth: DOMUtils.getWorkspaceCssNumberProperty('thread-list-min-width', 100),
    maxWidth: DOMUtils.getWorkspaceCssNumberProperty('thread-list-max-width', 3000),
  };

  refs: {
    list: MultiselectList;
  };

  unsub?: () => void;

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
    return <SyncingListState />;
  }

  render() {
    let columns, itemHeight;
    if (this.state.style === 'wide') {
      columns = ThreadListColumns.Wide;
      itemHeight = DOMUtils.getWorkspaceCssNumberProperty('thread-list-item-height-wide', 36);
    } else {
      columns = ThreadListColumns.Narrow;
      itemHeight = DOMUtils.getWorkspaceCssNumberProperty('thread-list-item-height-narrow', 85);
    }

    return (
      <FluxContainer
        stores={[ThreadListStore]}
        getStateFromStores={() => {
          return { dataSource: ThreadListStore.dataSource() };
        }}
      >
        <FocusContainer collection="thread">
          <MultiselectList
            ref="list"
            footer={this._getFooter()}
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
              'thread-list:mark-all-as-read': this._onMarkAllAsRead,
            }}
            onDoubleClick={thread => Actions.popoutThread(thread)}
            onDragItems={this._onDragItems}
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

    const props: any = { className: classes };

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
            : task instanceof ChangeLabelsTask
              ? 'archive'
              : 'remove';

      return `swipe-${name}`;
    };

    props.onSwipeRight = function (callback) {
      const perspective = FocusedPerspectiveStore.current();
      const tasks = perspective.tasksForRemovingItems([item], 'Swipe');
      if (tasks.length === 0) {
        callback(false);
      }
      Actions.closePopover();
      Actions.queueTasks(tasks);
      callback(true);
    };

    // Technically this should be exposed as an API so thread-snooze can register for this
    // behavior, but for now we just check for it explicitly.
    const snoozePresent = AppEnv.packages.isPackageActive('thread-snooze');

    if (snoozePresent && FocusedPerspectiveStore.current().isInbox()) {
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

  _onSyncStatusChanged = () => {
    const syncing = FocusedPerspectiveStore.current().hasSyncingCategories();
    this.setState({ syncing });
  };

  _onShowContextMenu = event => {
    const items = this.refs.list.itemsForMouseEvent(event);
    if (!items || items.length === 0) {
      event.preventDefault();
      return;
    }
    new ThreadListContextMenu({
      threadIds: items.map(t => t.id),
      accountIds: _.uniq(items.map(t => t.accountId)),
    }).displayMenu();
  };

  _onDragItems = (event, items) => {
    const data = {
      threadIds: items.map(t => t.id),
      accountIds: _.uniq(items.map(t => t.accountId)),
    };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.dragEffect = 'move';

    const canvas = CanvasUtils.canvasForDragging('threads', data.threadIds.length);
    event.dataTransfer.setDragImage(canvas, 10, 10);
    event.dataTransfer.setData('mailspring-threads-data', JSON.stringify(data));
    event.dataTransfer.setData(`mailspring-accounts=${data.accountIds.join(',')}`, '1');
  };

  _onDragEnd = event => { };

  _onResize = (event?: any) => {
    const narrowStyleWidth = DOMUtils.getWorkspaceCssNumberProperty(
      'thread-list-narrow-style-width',
      540
    );
    const current = this.state.style;
    const desired =
      (ReactDOM.findDOMNode(this) as HTMLElement).offsetWidth < narrowStyleWidth
        ? 'narrow'
        : 'wide';
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

  _onMarkAllAsRead = () => {
    const dataSource = ThreadListStore.dataSource();
    const items = dataSource.itemsCurrentlyInViewMatching(item => item.unread) as Thread[];

    if (items.length === 0) {
      return;
    }

    Actions.queueTask(
      TaskFactory.taskForSettingUnread({
        threads: items,
        unread: false,
        source: 'Toolbar Button: Thread List',
      })
    );
    Actions.popSheet();
  };
}

export default ThreadList;
