const {
  Actions,
  React,
  PropTypes,
  TaskFactory,
  FocusedPerspectiveStore,
} = require('mailspring-exports');

class ThreadArchiveQuickAction extends React.Component {
  static displayName = 'ThreadArchiveQuickAction';
  static propTypes = { thread: PropTypes.object };

  render() {
    const allowed = FocusedPerspectiveStore.current().canArchiveThreads([this.props.thread]);
    if (!allowed) {
      return <span />;
    }

    return (
      <div
        key="archive"
        title="Archive"
        style={{ order: 100 }}
        className="btn action action-archive"
        onClick={this._onArchive}
      />
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
        className="btn action action-trash"
        onClick={this._onRemove}
      />
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

module.exports = { ThreadArchiveQuickAction, ThreadTrashQuickAction };
