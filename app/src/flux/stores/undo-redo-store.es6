import MailspringStore from 'mailspring-store';
import Actions from '../actions';
import {
  SyncbackMetadataTask,
  TaskFactory,
} from 'mailspring-exports';
import { ipcRenderer } from 'electron';

class UndoRedoStore extends MailspringStore {
  priority = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  constructor() {
    super();
    this._undo = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };
    this._redo = [];
    this._timeouts = {};

    this._mostRecentBlock = null;
    this._queueingTasks = false;

    this.listenTo(Actions.queueTask, this._onQueue);
    this.listenTo(Actions.queueTasks, this._onQueue);
    this.listenTo(Actions.queueUndoOnlyTask, this._onQueue);
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
        id: tasks.map(t=>t.id).join('-'),
        ids: tasks.map(t => t.id),
        tasks: tasks,
        description: tasks.map(t => t.description()).join(', '),
        do: () => {
          // no-op, tasks queued separately
        },
        undo: () => {
          this._queueingTasks = true;
          Actions.queueTasks(tasks.map(t => {
            // undo send mail
            if (t instanceof SyncbackMetadataTask && t.pluginId === 'send-later') {
              ipcRenderer.send('send-later-manager', 'undo', t.modelHeaderMessageId, null, null, t.modelThreadId);
              return null;
            }else{
              return TaskFactory.taskForUndo({ task: t });
            }
          }));
          this._queueingTasks = false;
        },
        delayDuration: this.getDelayDuration(tasks),
        delayTimeoutCallbacks: () => {
          tasks.forEach(t => {
            if (t.delayTimeoutCallback) {
              t.delayTimeoutCallback();
            }
          });
        },
        queueTimeoutTasks: () => {
          tasks.forEach(t => {
            if (t.delayedTasks) {
              Actions.queueTasks(t.delayedTasks());
            }
          });
        },
        lingerAfterTimeout: !!tasks.find(t => !!t.lingerAfterTimeout),
        redo: () => {
          this._queueingTasks = true;
          Actions.queueTasks(tasks.map(t => t.createIdenticalTask()));
          this._queueingTasks = false;
        },
        priority: this._findHighestPriority({ tasks }),
        timestamp: Date.now(),
        due: 0,
      };
      this._onQueueBlock(block);
    }
  };

  _onQueueBlock = block => {
    this._redo = [];
    this._mostRecentBlock = block;
    this._pushToUndo({ block });
    this.trigger();
  };
  _pushToUndo = ({ block }) => {
    switch (block.priority) {
      case this.priority.critical:
        this._undo.critical.push(block);
        break;
      case this.priority.high:
        this._undo.high.push(block);
        break;
      case this.priority.medium:
        this._undo.medium.push(block);
        break;
      default:
        this._undo.low.push(block);
    }
    this._timeouts[block.id] = setTimeout(
      this._onBlockTimedOut.bind(this, { block }),
      block.delayDuration
    );
  };
  _onBlockTimedOut = ({ block }) => {
    const currentBlock = this.findBlock({ block });
    if (!currentBlock) {
      delete this._timeouts[block.id];
      return;
    }
    currentBlock.delayTimeoutCallbacks();
    currentBlock.queueTimeoutTasks();
    if (!currentBlock.lingerAfterTimeout) {
      this.removeTaskFromUndo({ block: currentBlock });
    } else {
      currentBlock.due = Date.now();
      this.findAndReplace({ block: currentBlock });
    }
    delete this._timeouts[block.id];
    this.trigger();
  };
  findBlock = ({ block }) => {
    let priority = 'low';
    switch (block.priority) {
      case this.priority.critical:
        priority = 'critical';
        break;
      case this.priority.high:
        priority = 'high';
        break;
      case this.priority.medium:
        priority = 'medium';
        break;
      default:
        priority = 'low';
    }
    for (let i = 0; i < this._undo[priority].length; i++) {
      if (this._undo[priority][i].id === block.id) {
        return this._undo[priority][i];
      }
    }
    return null;
  };
  findAndReplace = ({ block }) => {
    let priority = 'low';
    switch (block.priority) {
      case this.priority.critical:
        priority = 'critical';
        break;
      case this.priority.high:
        priority = 'high';
        break;
      case this.priority.medium:
        priority = 'medium';
        break;
      default:
        priority = 'low';
    }
    for (let i = 0; i < this._undo[priority].length; i++) {
      if (this._undo[priority][i].id === block.id) {
        this._undo[priority][i] = block;
        return;
      }
    }
    this.trigger();
  };

  undo = ({ block } = {}) => {
    if (!block) {
      console.warn('can not undo when block is not defined');
      return;
    }
    block.undo();
    this._mostRecentBlock = null;
    this._redo.push(block);
    this.removeTaskFromUndo({ block, noTrigger: true });
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
  getUndos = ({ critical = 0, high = 3, medium = 2, low = 5 } = {}) => {
    return {
      critical:
        critical === 0 ? this._undo.critical.slice() : this._undo.critical.slice(critical * -1),
      high: high === 0 ? this._undo.high.slice() : this._undo.high.slice(high * -1),
      medium: medium === 0 ? this._undo.medium.slice() : this._undo.medium.slice(medium * -1),
      low: low === 0 ? this._undo.low.slice() : this._undo.low.slice(low * -1),
    };
  };
  removeTaskFromUndo = ({ block, noTrigger = false }) => {
    let priority = 'low';
    switch (block.priority) {
      case this.priority.critical:
        priority = 'critical';
        break;
      case this.priority.high:
        priority = 'high';
        break;
      case this.priority.medium:
        priority = 'medium';
        break;
      default:
        priority = 'low';
    }
    this._undo[priority] = this._undo[priority].filter(b => {
      return b.id !== block.id;
    });
    clearTimeout(this._timeouts[block.id]);
    if (!noTrigger) {
      this.trigger();
    }
  };
  _findHighestPriority = ({ tasks }) => {
    let priority = this.priority.low;
    for (let task of tasks) {
      if (task.hasOwnProperty('priority')) {
        if (task.priority === this.priority.critical) {
          return this.priority.critical;
        }
        if (task.priority < priority) {
          priority = task.priority;
        }
      }
    }
    return priority;
  };

  isUndoSend(task) {
    return (
      task instanceof SyncbackMetadataTask &&
      task.value.isUndoSend
    );
  }

  getUndoSendExpiration(task) {
    return task.value.expiration * 1000;
  }

  getDelayDuration(tasks) {
    let timeouts = tasks.map(task => {
      return this.isUndoSend(task) ? Math.max(400, this.getUndoSendExpiration(task) - Date.now()) : 3000;
    });
    return Math.min(...timeouts);
  }

  print() {
    console.log('Undo Stack');
    console.log(this._undo);
    console.log('Redo Stack');
    console.log(this._redo);
  }
}

export default new UndoRedoStore();
