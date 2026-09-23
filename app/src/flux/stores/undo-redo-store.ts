import MailspringStore from 'mailspring-store';
import * as Actions from '../actions';
import { Task } from '../tasks/task';
import TaskQueue from './task-queue';

// Tasks with `engineWritesUndoData` can only be reversed exactly with data the engine
// writes onto them during their local phase (ChangeFolderTask.undoPlacements), so their
// undo is built from the version streamed back. The local phase of a large move can take
// several seconds, hence the long ceiling; an engine that is down never echoes the task
// into TaskQueue at all, which is detected after the shorter window so the undo falls
// back to the client's version (approximate, but far better than a 10 s stall).
const LOCAL_PHASE_WAIT_MS = 10000;
const TASK_ARRIVAL_WAIT_MS = 2000;

interface UndoBlock {
  tasks?: Task[];
  description: string;
  do: () => void;
  undo: () => void;
  redo?: () => void;
}

class UndoRedoStore extends MailspringStore {
  _undo: UndoBlock[] = [];
  _redo: UndoBlock[] = [];
  _mostRecentBlock: UndoBlock | null = null;
  _queueingTasks = false;

  constructor() {
    super();

    this.listenTo(Actions.queueTask, this._onQueue);
    this.listenTo(Actions.queueTasks, this._onQueue);
    this.listenTo(Actions.queueUndoOnlyTask, this._onQueueUndoOnly);
  }

  // An undo-only task (Undo Send) is registered here but never sent to the engine, so
  // there is never an engine version to wait for.
  _onQueueUndoOnly = (taskOrTasks: Task | Task[]): void => {
    this._onQueue(taskOrTasks, { reachesEngine: false });
  };

  _onQueue = (taskOrTasks: Task | Task[], { reachesEngine = true } = {}): void => {
    if (this._queueingTasks) {
      return;
    }

    const tasks = taskOrTasks instanceof Array ? taskOrTasks : [taskOrTasks];
    if (tasks.length === 0) {
      return;
    }

    if (tasks.every((t) => t.canBeUndone)) {
      const block = {
        tasks: tasks,
        description: tasks.map((t) => t.description()).join(', '),
        do: () => {
          // no-op, tasks queued separately
        },
        undo: () => {
          Promise.all(tasks.map((t) => this._latestVersionOf(t, reachesEngine))).then((latest) => {
            let undoTasks: Task[];
            try {
              undoTasks = latest.flatMap((t) => t.createUndoTasks());
            } catch (err) {
              AppEnv.reportError(err);
              return;
            }
            if (undoTasks.length === 0) {
              console.warn('Undo skipped: no task could be built to reverse', tasks);
              return;
            }
            this._queueingTasks = true;
            Actions.queueTasks(undoTasks);
            this._queueingTasks = false;
          });
        },
        redo: () => {
          this._queueingTasks = true;
          Actions.queueTasks(tasks.map((t) => t.createIdenticalTask()));
          this._queueingTasks = false;
        },
      };
      this._onQueueBlock(block);
    }
  };

  _latestVersionOf<T extends Task>(task: T, reachesEngine: boolean): Promise<T> {
    if (!reachesEngine || !task.engineWritesUndoData) {
      return Promise.resolve(task);
    }
    return new Promise<T>((resolve) => {
      TaskQueue.waitForPerformLocal(task).then(resolve);
      setTimeout(() => resolve(task), LOCAL_PHASE_WAIT_MS);
      setTimeout(() => {
        if (!TaskQueue.allTasks().some((t) => t.id === task.id)) {
          console.warn(
            `Undo: the sync engine never acknowledged ${task.constructor.name} ${task.id}; reversing it from the client's copy`
          );
          resolve(task);
        }
      }, TASK_ARRIVAL_WAIT_MS);
    });
  }

  _onQueueBlock = (block: UndoBlock): void => {
    this._redo = [];
    this._mostRecentBlock = block;
    this._undo.push(block);
    this.trigger();
  };

  undo = (): void => {
    const block = this._undo.pop();
    if (!block) {
      return;
    }
    block.undo();

    this._mostRecentBlock = null;
    this._redo.push(block);
    this.trigger();
  };

  redo = (): void => {
    const block = this._redo.pop();
    if (!block) {
      return;
    }
    block.redo ? block.redo() : block.do();
    this._mostRecentBlock = block;
    this._undo.push(block);
    this.trigger();
  };

  getMostRecent = (): UndoBlock | null => {
    return this._mostRecentBlock;
  };

  print(): void {
    console.log('Undo Stack');
    console.log(this._undo);
    console.log('Redo Stack');
    console.log(this._redo);
  }
}

export default new UndoRedoStore();
