import {
  Actions,
  React,
  PropTypes,
  FocusedPerspectiveStore,
  TaskFactory,
  ThreadStore,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

const findThread = message => {
  return ThreadStore.findBy({ threadId: message.threadId });
};

class SiftTrashQuickAction extends React.Component {
  static displayName = 'SiftTrashQuickAction';
  static propTypes = { message: PropTypes.object };

  render() {
    return (
      <div
        key="remove"
        title="Trash"
        style={{ order: 110 }}
        className="action action-trash"
        onClick={this._onRemove}
      >
        <RetinaImg
          name="trash.svg"
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    );
  }

  shouldComponentUpdate(newProps, newState) {
    return newProps.message.id !== (this.props != null ? this.props.message.id : undefined);
  }

  _onRemove = event => {
    findThread(this.props.message).then(thread => {
      const tasks = TaskFactory.tasksForMovingToTrash({
        source: 'Quick Actions: Sift List: Trash',
        threads: [thread],
        currentPerspective: FocusedPerspectiveStore.current(),
      });
      if (Array.isArray(tasks) && tasks.length > 0) {
        tasks.forEach(task => {
          if (task && !task.accountId) {
            try {
              AppEnv.reportError(new Error(`Trash Task no accountId`), {
                errorData: {
                  task: task.toJSON(),
                  thread: JSON.stringify(thread),
                },
              });
            } catch (e) {

            }
          }
        });
      }
      Actions.queueTasks(tasks);
    });
    // Don't trigger the thread row click
    event.stopPropagation();
  };
}

class SiftStarQuickAction extends React.Component {
  static displayName = 'SiftStarQuickAction';
  static propTypes = { message: PropTypes.object };

  render() {
    const className = this.props.message.starred ? 'flagged' : 'flag-not-selected';
    const title = this.props.message.starred ? 'Unflag' : 'Flag';
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
    findThread(this.props.message).then(thread => {
      const tasks = TaskFactory.taskForInvertingStarred({
        threads: [thread],
        source: 'Quick Actions: Sift List: ToggleStar',
      });
      if (Array.isArray(tasks) && tasks.length > 0) {
        tasks.forEach(task => {
          if (task && !task.accountId) {
            try {
              AppEnv.reportError(new Error(`Sift Toggle Star Task no accountId`), {
                errorData: {
                  task: task.toJSON(),
                  thread: JSON.stringify(thread),
                },
              });
            } catch (e) {

            }
          }
        });
      }
      Actions.queueTasks(tasks);
    });
    // Don't trigger the thread row click
    return event.stopPropagation();
  };
}

class SiftUnreadQuickAction extends React.Component {
  static displayName = 'SiftUnreadQuickAction';
  static propTypes = { message: PropTypes.object };

  render() {
    const imgName = this.props.message.unread ? 'unread.svg' : 'read.svg';
    const title = this.props.message.unread ? 'Read' : 'Unread';
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
    findThread(this.props.message).then(thread=>{
      const task = TaskFactory.taskForInvertingUnread({
        threads: [thread],
        source: 'Quick Actions: Sift List',
      });
      if (task && !task.accountId) {
        try {
          AppEnv.reportError(new Error(`Sift Unread Task no accountId`), {
            errorData: {
              task: task.toJSON(),
              thread: JSON.stringify(thread),
            },
          });
        } catch (e) {

        }
      }
      Actions.queueTasks([task]);
    });
    // Don't trigger the thread row click
    return event.stopPropagation();
  };
}

module.exports = { SiftStarQuickAction, SiftTrashQuickAction, SiftUnreadQuickAction };
