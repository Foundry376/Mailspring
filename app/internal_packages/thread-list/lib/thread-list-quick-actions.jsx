const {
  Actions,
  React,
  PropTypes,
  TaskFactory,
  FocusedPerspectiveStore,
} = require('mailspring-exports');
import { RetinaImg } from 'mailspring-component-kit';

class ThreadArchiveQuickAction extends React.Component {
  static displayName = 'ThreadArchiveQuickAction';
  static propTypes = { thread: PropTypes.object };

  render() {
    const allowed = FocusedPerspectiveStore.current().canArchiveThreads([this.props.thread]);
    if (!allowed) {
      // DC-570 [Actions] The actions on last email cannot be active in special steps
      // Don't know why, but if we render a <span/>, the hover will not work as intended
      return null;
    }

    return (
      <div
        key="archive"
        title="Archive"
        style={{ order: 100 }}
        className="action action-archive"
        onClick={this._onArchive}
      >
        <RetinaImg name="archive.svg" style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  shouldComponentUpdate(newProps, newState) {
    return newProps.thread.id !== (this.props != null ? this.props.thread.id : undefined);
  }

  _onArchive = event => {
    const tasks = TaskFactory.tasksForArchiving({
      source: 'Quick Actions: Thread List',
      threads: [this.props.thread],
    });
    Actions.queueTasks(tasks);

    // Don't trigger the thread row click
    event.stopPropagation();
  };
}

class ThreadTrashQuickAction extends React.Component {
  static displayName = 'ThreadTrashQuickAction';
  static propTypes = { thread: PropTypes.object };

  render() {
    const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo(
      [this.props.thread],
      'trash'
    );
    if (!allowed) {
      return <span />;
    }

    return (
      <div
        key="remove"
        title="Trash"
        style={{ order: 110 }}
        className="action action-trash"
        onClick={this._onRemove}
      >
        <RetinaImg name="trash.svg" style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  shouldComponentUpdate(newProps, newState) {
    return newProps.thread.id !== (this.props != null ? this.props.thread.id : undefined);
  }

  _onRemove = event => {
    const tasks = TaskFactory.tasksForMovingToTrash({
      source: 'Quick Actions: Thread List',
      threads: [this.props.thread],
    });
    Actions.queueTasks(tasks);

    // Don't trigger the thread row click
    event.stopPropagation();
  };
}

class ThreadStarQuickAction extends React.Component {
  static displayName = 'ThreadStarQuickAction';
  static propTypes = { thread: PropTypes.object };

  render() {
    const className = this.props.thread.starred ? 'flagged' : 'flag-not-selected';
    const title = this.props.thread.starred ? 'UnFlag' : 'Flag';
    return (
      <div
        key="remove"
        title={title}
        style={{ order: 109 }}
        className={"action action-flag " + className}
        onClick={this._onToggleStar}
      >
        <RetinaImg
          name="flag.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  _onToggleStar = event => {
    Actions.queueTasks(
      TaskFactory.taskForInvertingStarred({
        threads: [this.props.thread],
        source: 'Quick Actions: Thread List',
      })
    );
    // Don't trigger the thread row click
    return event.stopPropagation();
  };
}

class ThreadUnreadQuickAction extends React.Component {
  static displayName = 'ThreadUnreadQuickAction';
  static propTypes = { thread: PropTypes.object };

  render() {
    const imgName = this.props.thread.unread ? 'read.svg' : 'unread.svg';
    const title = this.props.thread.unread ? 'Read' : 'Unread';
    return (
      <div
        key="remove"
        title={'Mark as ' + title}
        style={{ order: 112 }}
        className="action action-flag"
        onClick={this._onToggleUnread}
      >
        <RetinaImg name={imgName} style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }

  _onToggleUnread = event => {
    Actions.queueTasks([
      TaskFactory.taskForInvertingUnread({
        threads: [this.props.thread],
        source: 'Quick Actions: Thread List',
      })
    ]);
    // Don't trigger the thread row click
    return event.stopPropagation();
  };
}

module.exports = { ThreadUnreadQuickAction, ThreadStarQuickAction, ThreadArchiveQuickAction, ThreadTrashQuickAction };
