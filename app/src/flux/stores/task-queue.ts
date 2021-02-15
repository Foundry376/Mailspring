import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import { Rx } from 'mailspring-exports';
import { Task } from '../tasks/task';
import DatabaseStore from './database-store';

/*
Public: The TaskQueue is a Flux-compatible Store that manages a queue of {Task}
objects. Each {Task} represents an individual API action, like sending a draft
or marking a thread as "read". Tasks optimistically make changes to the app's
local cache and encapsulate logic for performing changes on the server, rolling
back in case of failure, and waiting on dependent tasks.

The TaskQueue is essential to offline mode in N1. It automatically pauses
when the user's internet connection is unavailable and resumes when online.

The task queue is persisted to disk, ensuring that tasks are executed later,
even if the user quits N1.

The TaskQueue is only available in the app's main window. Rather than directly
queuing tasks, you should use the {Actions} to interact with the {TaskQueue}.
Tasks queued from secondary windows are serialized and sent to the application's
main window via IPC.

## Queueing a Task

```javascript
if (this._thread && this._thread.unread) {
  Actions.queueTask(new ChangeStarredTask({threads: [this._thread], starred: true}))
}
```

## Dequeueing a Task

```javascript
Actions.dequeueMatchingTask({
  type: 'DestroyCategoryTask',
  matching: {
    categoryId: 'bla',
  }
})
*/

class TaskQueue extends MailspringStore {
  _queue: Task[] = [];
  _completed: Task[] = [];
  _currentSequentialId = Date.now();

  _waitingForLocal: Array<{ task: Task; resolve: (arg: any) => void }> = [];
  _waitingForRemote: Array<{ task: Task; resolve: (arg: any) => void }> = [];

  constructor() {
    super();
    Rx.Observable.fromQuery(DatabaseStore.findAll<Task>(Task)).subscribe(
      this._onQueueChangedDebounced
    );
  }

  _onQueueChangedDebounced = _.throttle(tasks => {
    const finished = [Task.Status.Complete, Task.Status.Cancelled];
    this._queue = tasks.filter(t => !finished.includes(t.status));
    this._completed = tasks.filter(t => finished.includes(t.status));
    const all = [...this._queue, ...this._completed];

    this._waitingForLocal.filter(({ task, resolve }) => {
      const match = all.find(t => task.id === t.id);
      if (match && match.hasRunLocally()) {
        resolve(match);
        return false;
      }
      return true;
    });

    this._waitingForRemote.filter(({ task, resolve }) => {
      const match = this._completed.find(t => task.id === t.id);
      if (match) {
        resolve(match);
        return false;
      }
      return true;
    });

    this.trigger();
  }, 150);

  queue() {
    return this._queue;
  }

  completed() {
    return this._completed;
  }

  allTasks() {
    return [...this._queue, ...this._completed];
  }

  findTasks(
    typeOrClass: string | typeof Task,
    matching = {},
    { includeCompleted }: { includeCompleted?: boolean } = {}
  ) {
    const type = typeof typeOrClass === 'string' ? typeOrClass : typeOrClass.name;
    const tasks = includeCompleted ? [...this._queue, ...this._completed] : this._queue;

    const matches = tasks.filter(task => {
      if (task.constructor.name !== type) {
        return false;
      }
      if (matching instanceof Function) {
        return matching(task);
      }
      return _.isMatch(task, matching);
    });

    return matches;
  }

  waitForPerformLocal = <T extends Task>(task: T) => {
    const upToDateTask = [...this._queue, ...this._completed].find(t => t.id === task.id);
    if (upToDateTask && upToDateTask.hasRunLocally()) {
      return Promise.resolve(upToDateTask as T);
    }

    return new Promise<T>(resolve => {
      this._waitingForLocal.push({ task, resolve });
    });
  };

  waitForPerformRemote = <T extends Task>(task: T) => {
    const upToDateTask = [...this._queue, ...this._completed].find(t => t.id === task.id);
    if (upToDateTask && upToDateTask.status === Task.Status.Complete) {
      return Promise.resolve<T>(upToDateTask as T);
    }

    return new Promise<T>(resolve => {
      this._waitingForRemote.push({ task, resolve });
    });
  };
}

export default new TaskQueue();
