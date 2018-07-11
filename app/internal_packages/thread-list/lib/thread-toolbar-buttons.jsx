import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { RetinaImg, CreateButtonGroup } from 'mailspring-component-kit';
import {
  Actions,
  TaskFactory,
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
    event.stopPropagation();
    return;
  };

  render() {
    const allowed = FocusedPerspectiveStore.current().canArchiveThreads(this.props.items);
    if (!allowed) {
      return false;
    }

    return (
      <button tabIndex={-1} className="btn btn-toolbar" title="Archive" onClick={this._onArchive}>
        <RetinaImg name="toolbar-archive.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
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
    event.stopPropagation();
    return;
  };

  render() {
    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(this.props.items, 'trash');
    if (!allowed) {
      return false;
    }

    return (
      <button
        tabIndex={-1}
        className="btn btn-toolbar"
        title="Move to Trash"
        onClick={this._onRemove}
      >
        <RetinaImg name="toolbar-trash.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}

export class MarkAsSpamButton extends React.Component {
  static displayName = 'MarkAsSpamButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  _allInSpam() {
    return this.props.items.every(item => item.folders.map(c => c.role).includes('spam'));
  }

  _onNotSpam = event => {
    // TODO BG REPLACE TASK FACTORY
    const tasks = TaskFactory.tasksForMarkingNotSpam({
      source: 'Toolbar Button: Thread List',
      threads: this.props.items,
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    event.stopPropagation();
    return;
  };

  _onMarkAsSpam = event => {
    const tasks = TaskFactory.tasksForMarkingAsSpam({
      threads: this.props.items,
      source: 'Toolbar Button: Thread List',
    });
    Actions.queueTasks(tasks);
    Actions.popSheet();
    event.stopPropagation();
    return;
  };

  render() {
    if (this._allInSpam()) {
      return (
        <button
          tabIndex={-1}
          className="btn btn-toolbar"
          title="Not Spam"
          onClick={this._onNotSpam}
        >
          <RetinaImg name="toolbar-not-spam.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      );
    }

    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(this.props.items, 'spam');
    if (!allowed) {
      return false;
    }
    return (
      <button
        tabIndex={-1}
        className="btn btn-toolbar"
        title="Mark as Spam"
        onClick={this._onMarkAsSpam}
      >
        <RetinaImg name="toolbar-spam.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
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
    Actions.queueTask(
      TaskFactory.taskForInvertingStarred({
        threads: this.props.items,
        source: 'Toolbar Button: Thread List',
      })
    );
    event.stopPropagation();
    return;
  };

  render() {
    const postClickStarredState = this.props.items.every(t => t.starred === false);
    const title = postClickStarredState ? 'Star' : 'Unstar';
    const imageName = postClickStarredState ? 'toolbar-star.png' : 'toolbar-star-selected.png';

    return (
      <button tabIndex={-1} className="btn btn-toolbar" title={title} onClick={this._onStar}>
        <RetinaImg name={imageName} mode={RetinaImg.Mode.ContentIsMask} />
      </button>
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
    Actions.queueTask(
      TaskFactory.taskForInvertingUnread({
        threads: this.props.items,
        source: 'Toolbar Button: Thread List',
      })
    );
    Actions.popSheet();
    event.stopPropagation();
    return;
  };

  render() {
    const postClickUnreadState = this.props.items.every(t => t.unread === false);
    const fragment = postClickUnreadState ? 'unread' : 'read';

    return (
      <button
        tabIndex={-1}
        className="btn btn-toolbar"
        title={`Mark as ${fragment}`}
        onClick={this._onClick}
      >
        <RetinaImg name={`toolbar-markas${fragment}.png`} mode={RetinaImg.Mode.ContentIsMask} />
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
  [ToggleStarredButton, ToggleUnreadButton],
  { order: -103 }
);

export const MoveButtons = CreateButtonGroup(
  'MoveButtons',
  [ArchiveButton, MarkAsSpamButton, TrashButton],
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
