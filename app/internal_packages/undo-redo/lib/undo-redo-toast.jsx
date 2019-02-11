import {
  React,
  UndoRedoStore,
  SyncbackMetadataTask,
  ChangeUnreadTask,
  ChangeStarredTask,
  ChangeFolderTask
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { CSSTransitionGroup } from 'react-transition-group';

function isUndoSend(block) {
  return (
    block.tasks.length === 1 &&
    block.tasks[0] instanceof SyncbackMetadataTask &&
    block.tasks[0].value.isUndoSend
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
      AppEnv.config.get('core.sending.undoSend')
    );

    return (
      <div className="countdown">
        <div className="countdown-number">{Math.ceil(diff / 1000)}</div>
        {diff > 0 && (
          <svg>
            <circle r="14" cx="15" cy="15" style={{ animationDuration: this.animationDuration }} />
          </svg>
        )}
      </div>
    );
  }
}

const UndoSendContent = ({ block, onMouseEnter, onMouseLeave }) => {
  return (
    <div className="content" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <Countdown expiration={getUndoSendExpiration(block)} />
      <div className="message">Sending soon...</div>
      <div className="action" onClick={() => AppEnv.commands.dispatch('core:undo')}>
        <RetinaImg name="undo-icon@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
        <span className="undo-action-text">Undo</span>
      </div>
    </div>
  );
};

const BasicContent = ({ block, onMouseEnter, onMouseLeave }) => {
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
      const verb = tasks[0].starred ? 'Starred' : 'Unstarred';
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
      <div className="action" onClick={() => AppEnv.commands.dispatch('core:undo')}>
        <RetinaImg name="undo-icon@2x.png" mode={RetinaImg.Mode.ContentIsMask} />
        <span className="undo-action-text">Undo</span>
      </div>
    </div>
  );
};

export default class UndoRedoToast extends React.Component {
  static displayName = 'UndoRedoToast';
  static containerRequired = false;

  constructor(props) {
    super(props);

    this._timeout = null;
    this._unlisten = null;

    // Note: we explicitly do /not/ set initial state to the state of
    // the UndoRedoStore here because "getMostRecent" might be more
    // than 3000ms old.
    this.state = {
      block: null,
    };
  }

  componentDidMount() {
    this._unlisten = UndoRedoStore.listen(() => {
      this.setState({
        block: UndoRedoStore.getMostRecent(),
      });
    });
  }

  componentDidUpdate() {
    this._ensureTimeout();
  }

  componentWillUnmount() {
    this._clearTimeout();
    if (this._unlisten) {
      this._unlisten();
    }
  }

  _clearTimeout() {
    clearTimeout(this._timeout);
    this._timeout = null;
  }

  _ensureTimeout() {
    this._clearTimeout();

    if (this.state.block) {
      this._timeout = setTimeout(() => {
        this.setState({ block: null });
      }, getDisplayDuration(this.state.block));
    }
  }

  _onMouseEnter = () => {
    // this._clearTimeout();
  };

  _onMouseLeave = () => {
    this._ensureTimeout();
  };

  render() {
    const { block } = this.state;
    const Component = block && (isUndoSend(block) ? UndoSendContent : BasicContent);

    return (
      <CSSTransitionGroup
        className="undo-redo-toast"
        transitionLeaveTimeout={150}
        transitionEnterTimeout={150}
        transitionName="undo-redo-toast-fade"
      >
        {block ? (
          <Component
            block={block}
            onMouseEnter={this._onMouseEnter}
            onMouseLeave={this._onMouseLeave}
          />
        ) : null}
      </CSSTransitionGroup>
    );
  }
}
