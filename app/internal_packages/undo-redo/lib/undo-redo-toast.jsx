import {
  React,
  UndoRedoStore,
  SyncbackMetadataTask,
  ChangeUnreadTask,
  ChangeStarredTask,
  ChangeFolderTask,
  Actions,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { CSSTransitionGroup } from 'react-transition-group';
import SendDraftTask from '../../../src/flux/tasks/send-draft-task';

function isUndoSend(block) {
  return (
    block.tasks.length === 1 &&
    (block.tasks[0] instanceof SyncbackMetadataTask &&
      block.tasks[0].value.isUndoSend) ||
    block.tasks[0] instanceof SendDraftTask
  );
}

function getUndoSendExpiration(block) {
  return block.tasks[0].value.expiration * 1000;
}

function getDisplayDuration(block) {
  return isUndoSend(block) ? Math.max(400, getUndoSendExpiration(block) - Date.now()) : 3000;
}

class Countdown extends React.Component {
  constructor(props) {
    super(props);
    this.animationDuration = `${props.expiration - Date.now()}ms`;
    this.state = { x: 0 };
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.expiration !== this.props.expiration) {
      this.animationDuration = `${nextProps.expiration - Date.now()}ms`;
    }
  }

  componentDidMount() {
    this._tickStart = setTimeout(() => {
      this.setState({ x: this.state.x + 1 });
      this._tick = setInterval(() => {
        this.setState({ x: this.state.x + 1 });
      }, 1000);
    }, this.props.expiration % 1000);
  }

  componentWillUnmount() {
    clearTimeout(this._tickStart);
    clearInterval(this._tick);
  }

  render() {
    // subtract a few ms so we never round up to start time + 1 by accident
    let diff = Math.min(
      Math.max(0, this.props.expiration - Date.now()),
      AppEnv.config.get('core.sending.undoSend'),
    );

    return (
      <div className="countdown">
        <div className="countdown-number">{Math.ceil(diff / 1000)}</div>
        {diff > 0 && (
          <svg>
            <circle r="14" cx="15" cy="15" style={{ animationDuration: this.animationDuration }}/>
          </svg>
        )}
      </div>
    );
  }
}

class BasicContent extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { block, onMouseEnter, onMouseLeave, onClose } = this.props;
    let description = block.description;
    if (block.tasks.length >= 2) {
      const tasks = block.tasks;
      // if all ChangeUnreadTask
      if (tasks[0] instanceof ChangeUnreadTask && tasks[tasks.length - 1] instanceof ChangeUnreadTask) {
        let total = 0;
        tasks.forEach(item => (total += item.threadIds.length));
        const newState = tasks[0].unread ? 'unread' : 'read';
        description = `Marked ${total} threads as ${newState}`;
      }
      // if all ChangeStarredTask
      else if (tasks[0] instanceof ChangeStarredTask && tasks[tasks.length - 1] instanceof ChangeStarredTask) {
        let total = 0;
        tasks.forEach(item => (total += item.threadIds.length));
        const verb = tasks[0].starred ? 'Flagged' : 'Unflagged';
        description = `${verb} ${total} threads`;
      }
      // if all ChangeFolderTask
      else if (tasks[0] instanceof ChangeFolderTask && tasks[tasks.length - 1] instanceof ChangeFolderTask) {
        let total = 0;
        tasks.forEach(item => (total += item.threadIds.length));
        const folderText = ` to ${tasks[0].folder.displayName}`;
        description = `Moved ${total} threads${folderText}`;
      }
    }
    return (
      <div className="content" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        <div className="message">{description}</div>
        <div className="action">
          <RetinaImg name="close_1.svg" isIcon mode={RetinaImg.Mode.ContentIsMask}
                     onClick={onClose}/>
          <div className="undo-action-text" onClick={() => UndoRedoStore.undo({ block })}>Undo</div>
        </div>
      </div>
    );
  }
}

class UndoSendContent extends BasicContent {
  constructor(props) {
    super(props);
    this.state = { sendStatus: 'sending' };
    this.unlisten = [
      Actions.draftDeliverySucceeded.listen(this.onSendSuccess, this),
      Actions.draftDeliveryFailed.listen(this.onSendFailed, this),
    ];
    this.timer = null;
    this.mounted = false;
  }

  componentDidMount() {
    this.mounted = true;
  }

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.timer);
    for (let unlisten of this.unlisten) {
      unlisten();
    }
  }

  onSendSuccess = ({ headerMessageId }) => {
    if (
      this.mounted &&
      headerMessageId &&
      this.props.block.tasks[0].modelHeaderMessageId === headerMessageId
    ) {
      this.setState({ sendStatus: 'success' });
      clearTimeout(this.timer);
      this.timer = setTimeout(this.props.onClose, 3000);
    }
  };

  onSendFailed = ({ headerMessageId }) => {
    if (
      this.mounted &&
      headerMessageId &&
      this.props.block.tasks[0].modelHeaderMessageId === headerMessageId
    ) {
      this.setState({ sendStatus: 'failed' });
      clearTimeout(this.timer);
      this.timer = setTimeout(this.props.onClose, 10000);
    }
  };

  onActionClicked = () => {
    if (!this.props.block.due) {
      UndoRedoStore.undo({ block: this.props.block });
    } else if (this.state.sendStatus === 'failed') {
      setTimeout(() => {
        AppEnv.reportError(new Error(`Sending email failed, and user clicked view. headerMessageId: ${this.props.block.tasks[0].modelHeaderMessageId}`));
        Actions.composePopoutDraft(this.props.block.tasks[0].modelHeaderMessageId);
      }, 300);
    }
  };

  renderActionArea(block) {
    if (!block.due) {
      return <div className="undo-action-text" onClick={this.onActionClicked}>Undo</div>;
    }
    if (this.state.sendStatus === 'failed') {
      return <div className="undo-action-text" onClick={this.onActionClicked}>View</div>;
    }
    return null;
  }

  onMouseEnter = () => {
    clearTimeout(this.timer);
  };
  onMouseLeave = () => {
    this.timer = setTimeout(this.props.onClose, 400);
  };

  render() {
    const block = this.props.block;
    let messageStatus = 'Sending message...';
    if (this.state.sendStatus === 'success') {
      messageStatus = 'Message sent.';
    } else if (this.state.sendStatus === 'failed') {
      messageStatus = 'Message failed to send.';
    }
    return (
      <div
        className={`content ${this.state.sendStatus === 'failed' ? 'failed' : ''}`}
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.onMouseLeave}
      >
        <div className="message">{messageStatus}</div>
        <div className="action">
          <RetinaImg
            name="close_1.svg"
            isIcon
            mode={RetinaImg.Mode.ContentIsMask}
            onClick={this.props.onClose}
          />
          {this.renderActionArea(block)}
        </div>
      </div>
    );
  }
}

export default class UndoRedoToast extends React.Component {
  static displayName = 'UndoRedoToast';
  static containerRequired = false;

  constructor(props) {
    super(props);

    this._timeout = [];
    this._unlisten = null;

    // Note: we explicitly do /not/ set initial state to the state of
    // the UndoRedoStore here because "getMostRecent" might be more
    // than 3000ms old.
    this.state = {
      block: null,
      blocks: [],
    };
  }

  componentDidMount() {
    this._unlisten = UndoRedoStore.listen(() => {
      const blocks = UndoRedoStore.getUndos();
      this.setState({
        blocks: [...blocks.critical, ...blocks.high, ...blocks.medium, ...blocks.low],
      });
    });
  }

  //
  // componentDidUpdate() {
  //   this._ensureTimeout();
  // }

  componentWillUnmount() {
    // this._clearTimeout();
    if (this._unlisten) {
      this._unlisten();
    }
  }

  _clearTimeout({ block }) {
    const timer = this._timeouts[block.id];
    if (timer) {
      clearTimeout(timer);
    }
  }

  _closeToaster = (block) => {
    block.lingerAfterTimeout = false;
    UndoRedoStore.removeTaskFromUndo({ block });
    // this._clearTimeout();
    // this.setState({ block: null });
  };

  // _ensureTimeout() {
  //   for (const block of this.state.blocks) {
  //     if (!this._timeouts[block.id]) {
  //       this._timeouts[block.id] = setTimeout(() => {
  //         if (block.onDelayTimeout) {
  //           block.onDelayTimeout();
  //         } else {
  //           delete this._timeouts[block.id];
  //         }
  //       }, block.delayDuration);
  //     }
  //   }
  // }

  _onMouseEnter = () => {
    // this._clearTimeout();
  };

  _onMouseLeave = () => {
    // this._ensureTimeout();
  };

  render() {
    const { blocks } = this.state;
    return (
      <div className='undo-redo-toast-container'>
        <CSSTransitionGroup
          className="undo-redo-toast"
          transitionLeaveTimeout={150}
          transitionEnterTimeout={150}
          transitionName="undo-redo-toast-fade"
        >
          {blocks.map(block => {
            const Component = block && (isUndoSend(block) ? UndoSendContent : BasicContent);
            return <Component
              key={block.id}
              block={block}
              onMouseEnter={this._onMouseEnter}
              onMouseLeave={this._onMouseLeave}
              onClose={this._closeToaster.bind(this, block)}
            />;
          })}
        </CSSTransitionGroup>
      </div>
    );
  }
}
