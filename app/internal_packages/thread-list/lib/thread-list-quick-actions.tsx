import React from 'react';
import {
  localized,
  Actions,
  Thread,
  TaskFactory,
  FocusedPerspectiveStore,
} from 'mailspring-exports';

const sameThreadId = (prev: { thread: Thread }, next: { thread: Thread }) =>
  prev.thread.id === next.thread.id;

export const ThreadArchiveQuickAction: React.FC<{ thread: Thread }> = React.memo(({ thread }) => {
  const allowed = FocusedPerspectiveStore.current().canArchiveThreads([thread]);
  if (!allowed) {
    return <span />;
  }

  const onArchive = (event: React.MouseEvent | React.KeyboardEvent) => {
    const tasks = TaskFactory.tasksForArchiving({
      source: 'Quick Actions: Thread List',
      threads: [thread],
    });
    Actions.queueTasks(tasks);
    event.stopPropagation();
  };

  return (
    <div
      key="archive"
      role="button"
      tabIndex={0}
      title={localized('Archive')}
      aria-label={localized('Archive')}
      style={{ order: 100 }}
      className="btn action action-archive"
      onClick={onArchive}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onArchive(e);
        }
      }}
    />
  );
}, sameThreadId);
ThreadArchiveQuickAction.displayName = 'ThreadArchiveQuickAction';

export const ThreadTrashQuickAction: React.FC<{ thread: Thread }> = React.memo(({ thread }) => {
  const allowed = FocusedPerspectiveStore.current().canMoveThreadsTo([thread], 'trash');
  if (!allowed) {
    return <span />;
  }

  const onRemove = (event: React.MouseEvent | React.KeyboardEvent) => {
    const tasks = TaskFactory.tasksForMovingToTrash({
      source: 'Quick Actions: Thread List',
      threads: [thread],
    });
    Actions.queueTasks(tasks);
    event.stopPropagation();
  };

  return (
    <div
      key="remove"
      role="button"
      tabIndex={0}
      title={localized('Trash')}
      aria-label={localized('Trash')}
      style={{ order: 110 }}
      className="btn action action-trash"
      onClick={onRemove}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRemove(e);
        }
      }}
    />
  );
}, sameThreadId);
ThreadTrashQuickAction.displayName = 'ThreadTrashQuickAction';
