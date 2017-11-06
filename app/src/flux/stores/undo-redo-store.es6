import MailspringStore from 'mailspring-store';
import Actions from '../actions';

class UndoRedoStore extends MailspringStore {
  constructor() {
    super();
    this._undo = [];
    this._redo = [];

    this._mostRecentBlock = null;
    this._queueingTasks = false;

    this.listenTo(Actions.queueTask, this._onQueue);
    this.listenTo(Actions.queueTasks, this._onQueue);
    this.listenTo(Actions.queueUndoableBlock, this._onQueueBlock);

    AppEnv.commands.add(document.body, { 'core:undo': this.undo });
    AppEnv.commands.add(document.body, { 'core:redo': this.redo });
  }

  _onQueue = taskOrTasks => {
    if (this._queueingTasks) {
      return;
    }

    const tasks = taskOrTasks instanceof Array ? taskOrTasks : [taskOrTasks];
    if (tasks.length === 0) {
      return;
    }

    if (tasks.every(t => t.canBeUndone)) {
      const block = {
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

  _onQueueBlock = block => {
    this._redo = [];
    this._mostRecentBlock = block;
    this._undo.push(block);
    this.trigger();
  };

  undo = () => {
    const block = this._undo.pop();
    if (!block) {
      return;
    }
    block.undo();

    this._mostRecentBlock = null;
    this._redo.push(block);
    this.trigger();
  };

  redo = () => {
    const block = this._redo.pop();
    if (!block) {
      return;
    }
    block.redo ? block.redo() : block.do();
    this._mostRecentBlock = block;
    this._undo.push(block);
    this.trigger();
  };

  getMostRecent = () => {
    return this._mostRecentBlock;
  };

  print() {
    console.log('Undo Stack');
    console.log(this._undo);
    console.log('Redo Stack');
    console.log(this._redo);
  }
}

export default new UndoRedoStore();
