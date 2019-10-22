import MailspringStore from 'mailspring-store';
import Actions from '../actions';
import uuid from 'uuid';
const silentTTL = 300000;
class AppMessageStore extends MailspringStore {
  static priority = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  constructor() {
    super();
    this._messages = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };
    this._timeouts = {};
    this._silentCache = {};
    this._mostRecentBlock = null;
    this._queueingTasks = false;

    if (AppEnv.isMainWindow()) {
      this.listenTo(Actions.pushAppMessage, this._onQueue);
      this.listenTo(Actions.pushAppMessages, this._onQueue);
      this.listenTo(Actions.removeAppMessage, this._onPopMessage);
      this.listenTo(Actions.removeAppMessages, this._onPopMessage);
      // AppEnv.onUpdateAvailable(this._onNewUpdateDownloaded);
    }
  }
  // _onNewUpdateDownloaded = () => {
  //   const message = {
  //     id: 'updateDownloaded',
  //     priority: 3,
  //     description: 'New update available. Restart to update.',
  //     icon: 'alert-2.svg',
  //     allowClose: true,
  //     actions: [
  //       {
  //         text: 'Restart',
  //         onClick: () => {
  //           ipcRenderer.send('command', 'application:install-update');
  //         },
  //       },
  //       {
  //         text: 'Later',
  //         onClick: () => {
  //         },
  //       },
  //     ],
  //   };
  //   Actions.pushAppMessage(message);
  // }

  _onPopMessage = blockOrBlocks => {
    if (!Array.isArray(blockOrBlocks)) {
      blockOrBlocks = [blockOrBlocks];
    }
    if (blockOrBlocks.length === 0) {
      return;
    }
    blockOrBlocks.forEach(block => {
      this.removeBlockFromMessages({ block });
    });
    this.trigger();
  };

  _onQueue = taskOrTasks => {
    if (this._queueingTasks) {
      return;
    }
    const tasks = taskOrTasks instanceof Array ? taskOrTasks : [taskOrTasks];
    if (tasks.length === 0) {
      return;
    }
    tasks.forEach(task => {
      if (!task.hasOwnProperty('allowClose')) {
        task.allowClose = true;
      }
      if (task.id && this._silentCache[task.id]) {
        const now = Date.now();
        if (now - this._silentCache[task.id] < silentTTL) {
          AppEnv.logDebug(`Message ignored because of silent ttl ${task.id}`);
          return;
        }
      }
      const block = {
        id: task.id || uuid(),
        hide: !!task.hide,
        description: task.description || '',
        icon: task.icon || 'alert.svg',
        actions: this._parseActions(task),
        delayDuration: task.delayDuration || 0,
        delayTimeoutCallbacks: () => {
          if (task.delayTimeoutCallback) {
            task.delayTimeoutCallback();
          }
        },
        queueTimeoutTasks: () => {
          if (Array.isArray(task.delayedTasks)) {
            Actions.queueTasks(task.delayedTasks);
          }
        },
        lingerAfterTimeout: !!task.lingerAfterTimeout,
        priority: task.priority,
        timestamp: Date.now(),
        allowClose: task.allowClose,
        due: 0,
      };
      this._onQueueBlock(block);
    });
  };

  _onQueueBlock = block => {
    this._redo = [];
    this._mostRecentBlock = block;
    this._pushToMessages({ block });
    this.trigger();
  };
  _pushToMessages = ({ block }) => {
    switch (block.priority) {
      case AppMessageStore.priority.critical:
        this._messages.critical.push(block);
        break;
      case AppMessageStore.priority.high:
        this._messages.high.push(block);
        break;
      case AppMessageStore.priority.medium:
        this._messages.medium.push(block);
        break;
      default:
        this._messages.low.push(block);
    }
    if (block.delayDuration > 0) {
      this._timeouts[block.id] = setTimeout(
        this._onBlockTimedOut.bind(this, { block }),
        block.delayDuration,
      );
    }
  };
  _onBlockTimedOut = ({ block }) => {
    const currentBlock = this.findBlock({ block });
    if (!currentBlock) {
      clearTimeout(this._timeouts[block.id]);
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
  _parseActions = task => {
    if(!task.actions){
      return [];
    }
    if (!Array.isArray(task.actions)) {
      task.actions = [task.actions];
    }
    if (task.actions.length === 0) {
      return [];
    }
    return task.actions.map(action => {
      return {
        node: action.text || action.render(),
        onClick: currentBlock => {
          action.onClick(currentBlock);
          this.removeBlockFromMessages({ block: currentBlock });
        },
      };
    });
  };
  findBlock = ({ block }) => {
    let priority = 'low';
    switch (block.priority) {
      case AppMessageStore.priority.critical:
        priority = 'critical';
        break;
      case AppMessageStore.priority.high:
        priority = 'high';
        break;
      case AppMessageStore.priority.medium:
        priority = 'medium';
        break;
      default:
        priority = 'low';
    }
    for (let i = 0; i < this._messages[priority].length; i++) {
      if (this._messages[priority][i].id === block.id) {
        return Object.assign({}, this._messages[priority][i]);
      }
    }
    return null;
  };
  findAndReplace = ({ block }) => {
    let priority = 'low';
    switch (block.priority) {
      case AppMessageStore.priority.critical:
        priority = 'critical';
        break;
      case AppMessageStore.priority.high:
        priority = 'high';
        break;
      case AppMessageStore.priority.medium:
        priority = 'medium';
        break;
      default:
        priority = 'low';
    }
    for (let i = 0; i < this._messages[priority].length; i++) {
      if (this._messages[priority][i].id === block.id) {
        this._messages[priority][i] = Object.assign({}, block);
        this.trigger();
        return;
      }
    }
  };

  getMostRecent = () => {
    return this._mostRecentBlock;
  };
  getMessages = ({ critical = 1, high = 1, medium = 1, low = 1 } = {}) => {
    return {
      critical:
        critical === 0
          ? this._messages.critical.slice()
          : this._messages.critical.slice(critical * -1),
      high: high === 0 ? this._messages.high.slice() : this._messages.high.slice(high * -1),
      medium:
        medium === 0 ? this._messages.medium.slice() : this._messages.medium.slice(medium * -1),
      low: low === 0 ? this._messages.low.slice() : this._messages.low.slice(low * -1),
    };
  };
  removeBlockFromMessages = ({ block, noTrigger = false }) => {
    let priority = 'low';
    switch (block.priority) {
      case AppMessageStore.priority.critical:
        priority = 'critical';
        break;
      case AppMessageStore.priority.high:
        priority = 'high';
        break;
      case AppMessageStore.priority.medium:
        priority = 'medium';
        break;
      default:
        priority = 'low';
    }
    this._messages[priority] = this._messages[priority].filter(b => {
      return b.id !== block.id;
    });
    clearTimeout(this._timeouts[block.id]);
    delete this._timeouts[block.id];
    if (!noTrigger) {
      this.trigger();
    }
  };
  setBlockToHide = ({ block }) => {
    block.hide = true;
    this.findAndReplace({ block });
    this.addToSilentCache({ block });
  };
  addToSilentCache = ({ block }) => {
    if(!this._silentCache[block.id]){
      this._silentCache[block.id] = Date.now();
    }
  }
  _findHighestPriority = ({ tasks }) => {
    let priority = AppMessageStore.priority.low;
    for (let task of tasks) {
      if (task.hasOwnProperty('priority')) {
        if (task.priority === AppMessageStore.priority.critical) {
          return AppMessageStore.priority.critical;
        }
        if (task.priority < priority) {
          priority = task.priority;
        }
      }
    }
    return priority;
  };

  print() {
    console.log('App Messages Stack');
    console.log(this._messages);
  }
}

export default new AppMessageStore();
