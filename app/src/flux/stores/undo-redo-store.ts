import MailspringStore from 'mailspring-store';
import * as Actions from '../actions';
import { Task } from '../tasks/task';
import TaskQueue from './task-queue';

// Some tasks can only be reversed with data the sync engine writes onto them while
// running their local phase (ChangeFolderTask.undoPlacements). Undo therefore builds
// the undo task from the version streamed back from the engine, waiting at most this
// long for it before falling back to the version the client queued (engine offline or
// crashed, where an approximate undo beats none).
const LOCAL_PHASE_WAIT_MS = 2000;

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
    this.listenTo(Actions.queueUndoOnlyTask, this._onQueue);
  }

  _onQueue = (taskOrTasks: Task | Task[]): void => {
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
          Promise.all(tasks.map((t) => this._latestVersionOf(t))).then((latest) => {
            let undoTasks: Task[];
            try {
              undoTasks = latest.map((t) => t.createUndoTask());
            } catch (err) {
              AppEnv.reportError(err);
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

  _latestVersionOf<T extends Task>(task: T): Promise<T> {
    const fallback = new Promise<T>((resolve) => {
      setTimeout(() => resolve(task), LOCAL_PHASE_WAIT_MS);
    });
    return Promise.race([TaskQueue.waitForPerformLocal(task), fallback]);
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
