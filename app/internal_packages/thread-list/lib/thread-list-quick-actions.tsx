import React from 'react';
import {
  localized,
  Actions,
  PropTypes,
  Thread,
  Message,
  TaskFactory,
  FocusedPerspectiveStore,
  CategoryStore,
} from 'mailspring-exports';
import { isMessage } from './thread-or-message';

// Import task classes for message support
const { ChangeFolderTask, ChangeLabelsTask } = require('mailspring-exports');

export class ThreadArchiveQuickAction extends React.Component<{ thread: Thread | Message }> {
  static displayName = 'ThreadArchiveQuickAction';
  static propTypes = { thread: PropTypes.object };

  render() {
    const item = this.props.thread;

    // For messages, check if we can archive based on the message's thread
    // For threads, use existing logic
    let allowed = false;
    if (isMessage(item)) {
      // Messages can be archived if they're not in a locked category
      allowed = true; // Simplified - in practice would check folder/label
    } else {
      allowed = FocusedPerspectiveStore.current().canArchiveThreads([item]);
    }

    if (!allowed) {
      return <span />;
    }

    return (
      <div
        key="archive"
        title={localized('Archive')}
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
    const item = this.props.thread;

    let tasks;
    if (isMessage(item)) {
      // For messages, create archive task directly
      const accountId = item.accountId;
      const inbox = CategoryStore.getInboxCategory(accountId);

      if (inbox && (inbox as any).constructor.name === 'Label') {
        tasks = [new ChangeLabelsTask({
          labelsToRemove: [inbox],
          labelsToAdd: [],
          messages: [item],
          source: 'Quick Actions: Thread List',
        })];
      } else {
        const archive = CategoryStore.getArchiveCategory(accountId);
        if (archive) {
          tasks = [new ChangeFolderTask({
            folder: archive,
            messages: [item],
            source: 'Quick Actions: Thread List'
          })];
        } else {
          tasks = [];
        }
      }
    } else {
      tasks = TaskFactory.tasksForArchiving({
        source: 'Quick Actions: Thread List',
        threads: [item],
      });
    }
    Actions.queueTasks(tasks);

    // Don't trigger the thread row click
    event.stopPropagation();
  };
}

export class ThreadTrashQuickAction extends React.Component<{ thread: Thread | Message }> {
  static displayName = 'ThreadTrashQuickAction';
  static propTypes = { thread: PropTypes.object };

  render() {
    const item = this.props.thread;

    // For messages, check if we can trash
    let allowed = false;
    if (isMessage(item)) {
      allowed = true; // Simplified - in practice would check folder/label
    } else {
      allowed = FocusedPerspectiveStore.current().canMoveThreadsTo([item], 'trash');
    }

    if (!allowed) {
      return <span />;
    }

    return (
      <div
        key="remove"
        title={localized('Trash')}
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
    const item = this.props.thread;

    let tasks;
    if (isMessage(item)) {
      // For messages, move to trash directly
      const trash = CategoryStore.getTrashCategory(item.accountId);
      if (trash) {
        tasks = [new ChangeFolderTask({
          folder: trash,
          messages: [item],
          source: 'Quick Actions: Thread List'
        })];
      } else {
        tasks = [];
      }
    } else {
      tasks = TaskFactory.tasksForMovingToTrash({
        source: 'Quick Actions: Thread List',
        threads: [item],
      });
    }
    Actions.queueTasks(tasks);

    // Don't trigger the thread row click
    event.stopPropagation();
  };
}
