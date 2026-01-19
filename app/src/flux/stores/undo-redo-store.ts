import MailspringStore from 'mailspring-store';
import * as Actions from '../actions';
import { Task } from '../tasks/task';

/**
 * Represents an undo/redo block that can be queued to the UndoRedoStore.
 * This interface allows external components to register custom undo actions.
 */
export interface UndoBlock {
  /** Human-readable description of the action (shown in undo toast) */
  description: string;
  /** The tasks associated with this block (optional for custom undo blocks) */
  tasks?: Task[];
  /** Called when the action is first performed (often a no-op if action already happened) */
  do: () => void | Promise<void>;
  /** Called when the user triggers undo */
  undo: () => void | Promise<void>;
  /** Called when the user triggers redo (falls back to `do` if not provided) */
  redo?: () => void | Promise<void>;
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

    if (tasks.every(t => t.canBeUndone)) {
      const block = {
        tasks: tasks,
        description: tasks.map(t => t.description()).join(', '),
        do: () => {
          // no-op, tasks queued separately
        },
        undo: () => {
          this._queueingTasks = true;
          Actions.queueTasks(tasks.map(t => t.createUndoTask()));
          this._queueingTasks = false;
        },
        redo: () => {
          this._queueingTasks = true;
          Actions.queueTasks(tasks.map(t => t.createIdenticalTask()));
          this._queueingTasks = false;
        },
      };
      this._onQueueBlock(block);
    }
  };

  /**
   * Queue a custom undo block. This allows external components to register
   * undo/redo actions that aren't tied to Task objects.
   */
  queueUndoBlock = (block: UndoBlock): void => {
    this._redo = [];
    this._mostRecentBlock = block;
    this._undo.push(block);
    this.trigger();
  };

  // Alias for backwards compatibility (internal use)
  _onQueueBlock = (block: UndoBlock): void => {
    this.queueUndoBlock(block);
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
