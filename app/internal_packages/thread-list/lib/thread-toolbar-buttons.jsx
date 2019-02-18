import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { RetinaImg, CreateButtonGroup, BindGlobalCommands } from 'mailspring-component-kit';
import {
  Actions,
  TaskFactory,
  ChangeLabelsTask,
  CategoryStore,
  FocusedContentStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';

import ThreadListStore from './thread-list-store';

export class ArchiveButton extends React.Component {
  static displayName = 'ArchiveButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onArchive = event => {
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
        <button tabIndex={-1} className="btn btn-toolbar" title="Archive" onClick={this._onArchive}>
          <RetinaImg name="toolbar-archive.png" mode={RetinaImg.Mode.ContentIsMask} />
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
  };

  _onRemove = event => {
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
          title="Move to Trash"
          onClick={this._onRemove}
        >
          <RetinaImg name={'trash.svg'} style={{ width: 22, height: 22 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
    );
  }
}

class HiddenGenericRemoveButton extends React.Component {
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

  _onRemoveFromView = ruleset => {
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

class HiddenToggleImportantButton extends React.Component {
  static displayName = 'HiddenToggleImportantButton';

  _onSetImportant = important => {
    Actions.queueTasks(
      TaskFactory.tasksForThreadsByAccountId(this.props.items, (accountThreads, accountId) => {
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
      item.labels.find(c => c.role === 'important')
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

export class MarkAsSpamButton extends React.Component {
  static displayName = 'MarkAsSpamButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _onNotSpam = event => {
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

  _onMarkAsSpam = event => {
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
    const allInSpam = this.props.items.every(item => item.folders.find(c => c.role === 'spam'));

    if (allInSpam) {
      return (
        <BindGlobalCommands
          key="not-spam"
          commands={{ 'core:report-not-spam': () => this._onNotSpam() }}
        >
          <button
            tabIndex={-1}
            className="btn btn-toolbar"
            title="Not Junk"
            onClick={this._onNotSpam}
          >
            <RetinaImg name="not-junk.svg" style={{ width: 22, height: 22 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
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
          title="Mark as Spam"
          onClick={this._onMarkAsSpam}
        >
          <RetinaImg name={'junk.svg'} style={{ width: 22, height: 22 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
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
    Actions.queueTasks(
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
    const title = postClickStarredState ? 'Star' : 'Unstar';
    const imageName = postClickStarredState ? 'flag-not-selected.svg' : 'flag.svg';

    return (
      <BindGlobalCommands commands={{ 'core:star-item': () => this._onStar() }}>
        <button tabIndex={-1} className="btn btn-toolbar" title={title} onClick={this._onStar}>
          <RetinaImg name={imageName} style={{ width: 22, height: 22 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
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
    const targetUnread = this.props.items.every(t => t.unread === false);
    this._onChangeUnread(targetUnread);
    event.stopPropagation();
    return;
  };

  _onChangeUnread = targetUnread => {
    Actions.queueTasks(
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
    const fragment = targetUnread ? 'unread' : 'read';

    return (
      <BindGlobalCommands
        key={fragment}
        commands={
          targetUnread
            ? { 'core:mark-as-unread': () => this._onChangeUnread(true) }
            : { 'core:mark-as-read': () => this._onChangeUnread(false) }
        }
      >
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title={`Mark as ${fragment}`}
          onClick={this._onClick}
        >
          <RetinaImg name={`${fragment}.svg`} style={{ width: 22, height: 22 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </BindGlobalCommands>
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
      'btn-icon': true,
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
      title={'Next thread'}
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
      title={'Previous thread'}
      command={'core:previous-item'}
    />
  );
};
UpButton.displayName = 'UpButton';
UpButton.containerRequired = false;
