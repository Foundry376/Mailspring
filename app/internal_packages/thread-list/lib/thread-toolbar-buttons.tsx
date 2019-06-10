import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { RetinaImg, CreateButtonGroup, BindGlobalCommands } from 'mailspring-component-kit';
import {
  localized,
  Actions,
  Thread,
  TaskFactory,
  ChangeLabelsTask,
  CategoryStore,
  FocusedContentStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';

import ThreadListStore from './thread-list-store';

export class ArchiveButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'ArchiveButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onArchive = (event?: React.MouseEvent) => {
    const tasks = TaskFactory.tasksForArchiving({
      threads: this.props.items,
      source: 'Toolbar Button: Thread List',
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const allowed = FocusedPerspectiveStore.current().canArchiveThreads(this.props.items);
    if (!allowed) {
      return false;
    }

    return (
      <BindGlobalCommands commands={{ 'core:archive-item': () => this._onArchive() }}>
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title={localized('Archive')}
          onClick={this._onArchive}
        >
          <RetinaImg name="toolbar-archive.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

export class TrashButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'TrashButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onRemove = (event?: React.MouseEvent) => {
    const tasks = TaskFactory.tasksForMovingToTrash({
      threads: this.props.items,
      source: 'Toolbar Button: Thread List',
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(this.props.items, 'trash');
    if (!allowed) {
      return false;
    }

    return (
      <BindGlobalCommands commands={{ 'core:delete-item': () => this._onRemove() }}>
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title={localized('Move to Trash')}
          onClick={this._onRemove}
        >
          <RetinaImg name="toolbar-trash.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

class HiddenGenericRemoveButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'HiddenGenericRemoveButton';

  _onRemoveAndShift = ({ offset }) => {
    const dataSource = ThreadListStore.dataSource();
    const focusedId = FocusedContentStore.focusedId('thread');
    const focusedIdx = Math.min(
      dataSource.count() - 1,
      Math.max(0, dataSource.indexOfId(focusedId) + offset)
    );
    const item = dataSource.get(focusedIdx);
    this._onRemoveFromView();
    Actions.setFocus({ collection: 'thread', item });
  };

  _onRemoveFromView = () => {
    const current = FocusedPerspectiveStore.current();
    const tasks = current.tasksForRemovingItems(this.props.items, 'Keyboard Shortcut');
    Actions.queueTasks(tasks);
    Actions.popSheet();
  };

  render() {
    return (
      <BindGlobalCommands
        commands={{
          'core:gmail-remove-from-view': this._onRemoveFromView,
          'core:remove-from-view': this._onRemoveFromView,
          'core:remove-and-previous': () => this._onRemoveAndShift({ offset: -1 }),
          'core:remove-and-next': () => this._onRemoveAndShift({ offset: 1 }),
        }}
      >
        <span />
      </BindGlobalCommands>
    );
  }
}

class HiddenToggleImportantButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'HiddenToggleImportantButton';

  _onSetImportant = important => {
    Actions.queueTasks(
      TaskFactory.tasksForThreadsByAccountId(this.props.items, (accountThreads, accountId) => {
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
      item.labels.some(c => c.role === 'important')
    );

    return (
      <BindGlobalCommands
        key={allImportant ? 'unimportant' : 'important'}
        commands={
          allImportant
            ? { 'core:mark-unimportant': () => this._onSetImportant(false) }
            : { 'core:mark-important': () => this._onSetImportant(true) }
        }
      >
        <span />
      </BindGlobalCommands>
    );
  }
}

export class MarkAsSpamButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'MarkAsSpamButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onNotSpam = (event?: React.MouseEvent) => {
    // TODO BG REPLACE TASK FACTORY
    const tasks = TaskFactory.tasksForMarkingNotSpam({
      source: 'Toolbar Button: Thread List',
      threads: this.props.items,
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  _onMarkAsSpam = (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    const tasks = TaskFactory.tasksForMarkingAsSpam({
      threads: this.props.items,
      source: 'Toolbar Button: Thread List',
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const allInSpam = this.props.items.every(item => item.folders.some(c => c.role === 'spam'));

    if (allInSpam) {
      return (
        <BindGlobalCommands
          key="not-spam"
          commands={{ 'core:report-not-spam': () => this._onNotSpam() }}
        >
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            title={localized('Not Spam')}
            onClick={this._onNotSpam}
          >
            <RetinaImg name="toolbar-not-spam.png" mode={RetinaImg.Mode.ContentIsMask} />
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
        commands={{ 'core:report-as-spam': () => this._onMarkAsSpam() }}
      >
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title={localized('Mark as Spam')}
          onClick={this._onMarkAsSpam}
        >
          <RetinaImg name="toolbar-spam.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

export class ToggleStarredButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'ToggleStarredButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onStar = (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    Actions.queueTask(
      TaskFactory.taskForInvertingStarred({
        threads: this.props.items,
        source: 'Toolbar Button: Thread List',
      })
    );
    if (event) {
      event.stopPropagation();
    }
    return;
  };

  render() {
    const postClickStarredState = this.props.items.every(t => t.starred === false);
    const title = postClickStarredState ? localized('Star') : localized('Unstar');
    const imageName = postClickStarredState ? 'toolbar-star.png' : 'toolbar-star-selected.png';

    return (
      <BindGlobalCommands commands={{ 'core:star-item': () => this._onStar() }}>
        <button tabIndex={-1} className="btn btn-toolbar" title={title} onClick={this._onStar}>
          <RetinaImg name={imageName} mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

export class ToggleUnreadButton extends React.Component<{ items: Thread[] }> {
  static displayName = 'ToggleUnreadButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onClick = event => {
    const targetUnread = this.props.items.every(t => t.unread === false);
    this._onChangeUnread(targetUnread);
    event.stopPropagation();
    return;
  };

  _onChangeUnread = targetUnread => {
    Actions.queueTask(
      TaskFactory.taskForSettingUnread({
        threads: this.props.items,
        unread: targetUnread,
        source: 'Toolbar Button: Thread List',
      })
    );
    Actions.popSheet();
  };

  render() {
    const targetUnread = this.props.items.every(t => t.unread === false);
    const fragment = targetUnread ? localized('Unread') : localized('Read');
    const key = targetUnread ? 'unread' : 'read';

    return (
      <BindGlobalCommands
        key={key}
        commands={
          targetUnread
            ? { 'core:mark-as-unread': () => this._onChangeUnread(true) }
            : { 'core:mark-as-read': () => this._onChangeUnread(false) }
        }
      >
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title={localized(`Mark as %@`, fragment)}
          onClick={this._onClick}
        >
          <RetinaImg name={`toolbar-markas${key}.png`} mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

interface ThreadArrowButtonState {
  disabled: boolean;
}
class ThreadArrowButton extends React.Component<
  {
    command: string;
    direction: string;
    title: string;
    getStateFromStores: () => ThreadArrowButtonState;
  },
  ThreadArrowButtonState
> {
  static propTypes = {
    getStateFromStores: PropTypes.func,
    direction: PropTypes.string,
    command: PropTypes.string,
    title: PropTypes.string,
  };

  _unsubscribe?: () => void;
  _unsubscribe_focus?: () => void;

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
      'btn-icon': true,
      'message-toolbar-arrow': true,
      disabled: this.state.disabled,
    });

    return (
      <div className={`${classes} ${direction}`} onClick={this._onClick} title={title}>
        <RetinaImg name={`toolbar-${direction}-arrow.png`} mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }
}

export const FlagButtons = CreateButtonGroup(
  'FlagButtons',
  [ToggleStarredButton, HiddenToggleImportantButton, ToggleUnreadButton],
  { order: -103 }
);

export const MoveButtons = CreateButtonGroup(
  'MoveButtons',
  [ArchiveButton, MarkAsSpamButton, HiddenGenericRemoveButton, TrashButton],
  { order: -107 }
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

  return (
    <ThreadArrowButton
      getStateFromStores={getStateFromStores}
      direction={'down'}
      title={localized('Next thread')}
      command={'core:next-item'}
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

  return (
    <ThreadArrowButton
      getStateFromStores={getStateFromStores}
      direction={'up'}
      title={localized('Previous thread')}
      command={'core:previous-item'}
    />
  );
};
UpButton.displayName = 'UpButton';
UpButton.containerRequired = false;
