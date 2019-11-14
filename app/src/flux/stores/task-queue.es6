import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import { Rx } from 'mailspring-exports';
import Task from '../tasks/task';
import DatabaseStore from './database-store';
import Actions from '../actions';

/**
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
  constructor() {
    super();
    this._queue = [];
    this._completed = [];
    this._currentSequentialId = Date.now();

    this._waitingForLocal = [];
    this._waitingForRemote = [];
    if (AppEnv.isMainWindow()) {
      Rx.Observable.fromQuery(DatabaseStore.findAll(Task)).subscribe(this._onQueueChangedDebounced);
    } else {
      this.listenTo(Actions.rebroadcastTasksQueueResults, this._onQueueChangedDebounced);
    }
  }

  _onQueueChangedDebounced = _.throttle(tasks => {
    if(AppEnv.isMainWindow()){
      Actions.rebroadcastTasksQueueResults(tasks);
    }
    const finished = [Task.Status.Complete, Task.Status.Cancelled];
    this._queue = tasks.filter(t => !finished.includes(t.status));
    this._completed = tasks.filter(t => finished.includes(t.status));
    const all = [].concat(this._queue, this._completed);

    this._waitingForLocal = this._waitingForLocal.filter(({ task, resolve, timer = null }) => {
      const match = all.find(t => task.id === t.id);
      if (match) {
        if (timer) {
          clearTimeout(timer);
        }
        resolve(match);
        return false;
      }
      return true;
    });

    this._waitingForRemote = this._waitingForRemote.filter(({ task, resolve }) => {
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
    return [].concat(this._queue, this._completed);
  }

  findTasks(typeOrClass, matching = {}, { includeCompleted } = {}) {
    const type = typeOrClass instanceof String ? typeOrClass : typeOrClass.name;
    const tasks = includeCompleted ? [].concat(this._queue, this._completed) : this._queue;

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

  waitForPerformLocal = (task, timeout = 2800) => {
    const upToDateTask = [].concat(this._queue, this._completed).find(t => t.id === task.id);
    if (upToDateTask && upToDateTask.status !== Task.Status.Local) {
      return Promise.resolve(upToDateTask);
    }

    return new Promise((resolve, reject) => {
      let timer = null;
      if (timeout > 0) {
        timer = setTimeout(() => {
          const all = [].concat(this._queue, this._completed);
          let matchFound = false;
          this._waitingForLocal = this._waitingForLocal.filter(({ task, resolve }) => {
            const match = all.find(t => task.id === t.id);
            if (match) {
              matchFound = true;
              resolve(match);
              return false;
            }
            return true;
          });
          if (!matchFound) {
            reject(task);
          }
        }, timeout);
      }
      this._waitingForLocal.push({ task, resolve, timer });
    });
  };

  waitForPerformRemote = task => {
    const upToDateTask = [].concat(this._queue, this._completed).find(t => t.id === task.id);
    if (upToDateTask && upToDateTask.status === Task.Status.Complete) {
      return Promise.resolve(upToDateTask);
    }

    return new Promise(resolve => {
      this._waitingForRemote.push({ task, resolve });
    });
  };
}

export default new TaskQueue();
