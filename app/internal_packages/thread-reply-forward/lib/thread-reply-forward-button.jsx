import { React, PropTypes, Actions } from 'mailspring-exports';
import { RetinaImg, BindGlobalCommands } from 'mailspring-component-kit';

const buttonTimeout = 700;
export default class ThreadReplyForwardButton extends React.Component {
  static displayName = 'ThreadReplyForwardButton';

  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array,
    thread: PropTypes.object,
  };


  constructor(props) {
    super(props);
    this.state = {};
    this.state.isReplyAlling = false;
    this.state.isReplying = false;
    this.state.isForwarding = false;
    this._replyTimer = null;
    this._replyAllTimer = null;
    this._forwardTimer = null;
    this._mounted = false;
  }

  componentDidMount() {
    this._mounted = true;
    this._unlisten = [
      Actions.draftReplyForwardCreated.listen(this._onDraftCreated, this),
      Actions.composeReply.listen(this._onCreatingDraft, this),
    ];
  }

  componentWillUnmount() {
    this._mounted = false;
    for (const unlisten of this._unlisten) {
      unlisten();
    }
    clearTimeout(this._forwardTimer);
    clearTimeout(this._replyAllTimer);
    clearTimeout(this._replyTimer);
  }

  _timeoutButton = (type) => {
    if (type === 'reply') {
      if (!this._replyTimer) {
        this._replyTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isReplying: false });
            this._replyTimer = null;
          }
        }, buttonTimeout);
      }
    } else if (type === 'reply-all') {
      if (!this._replyAllTimer) {
        this._replyAllTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isReplyAlling: false });
            this._replyAllTimer = null;
          }
        }, buttonTimeout);
      }
    } else {
      if (!this._forwardTimer) {
        this._forwardTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isForwarding: false });
            this._forwardTimer = null;
          }
        }, buttonTimeout);
      }
    }
  };

  _onCreatingDraft = ({ message, type = '' }) => {
    if (this._mounted) {
      if (type === 'reply') {
        this.setState({ isReplying: true }, this._timeoutButton.bind(this, 'reply'));
      } else if (type === 'reply-all') {
        this.setState({ isReplyAlling: true }, this._timeoutButton.bind(this, 'reply-all'));
      } else {
        this.setState({ isForwarding: true }, this._timeoutButton.bind(this, 'forwart'));
      }
    }
  };

  _onDraftCreated = ({ messageId, type = '' }) => {
    if (this._mounted) {
      if (type === 'reply') {
        if (this._replyTimer) {
          return;
        }
        this._replyTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isReplying: false });
            this._replyTimer = null;
          }
        }, buttonTimeout);
      } else if (type === 'reply-all') {
        if (this._replyAllTimer) {
          return;
        }
        this._replyAllTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isReplyAlling: false });
            this._replyAllTimer = null;
          }
        }, buttonTimeout);
      } else {
        if (this._forwardTimer) {
          return;
        }
        this._forwardTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isForwarding: false });
            this._forwardTimer = null;
          }
        }, buttonTimeout);
      }
    }
  };

  _lastMessage = () => {
    return (this.props.thread.__messages || []).filter(m => !m.draft).pop();
  };

  canReplyAll = () => {
    const lastMessage = this._lastMessage();
    return lastMessage && lastMessage.canReplyAll();
  };

  _reply = () => {
    if (!this.state.isReplying && !this._replyTimer) {
      this._timeoutButton('reply');
      this.setState({ isReplying: true });
      AppEnv.commands.dispatch('core:reply');
    }
  };

  _replyAll = () => {
    if (!this.state.isReplyAlling && !this._replyAllTimer) {
      this._timeoutButton('reply-all');
      this.setState({ isReplyAlling: true });
      AppEnv.commands.dispatch('core:reply-all');
    }
  };

  _forward = () => {
    if (!this.state.isForwarding && !this._forwardTimer) {
      this._timeoutButton('forward');
      this.setState({ isForwarding: true });
      AppEnv.commands.dispatch('core:forward');
    }
  };

  render() {
    if (this.props.items && this.props.items.length > 1) {
      return <span/>;
    }

    return (
      <div className="button-group">
        <button
          className={`btn btn-toolbar thread-reply-button`}
          title="Reply"
          style={{ marginRight: 0 }}
          onClick={this._reply}
        >
          <RetinaImg name={this.state.isReplying ? 'sending-spinner.gif' : 'reply.svg'}
                     style={{ width: 26, height: 26 }}
                     isIcon={!this.state.isReplying}
                     mode={RetinaImg.Mode.ContentIsMask}/>
        </button>
        {
          this.canReplyAll() && (
            <button
              className={`btn btn-toolbar thread-reply-all-button`}
              title="Reply All"
              style={{ marginRight: 0 }}
              onClick={this._replyAll}
            >
              <RetinaImg name={this.state.isReplyAlling ? 'sending-spinner.gif' : 'reply-all.svg'}
                         style={{ width: 26, height: 26 }}
                         isIcon={!this.state.isReplyAlling}
                         mode={RetinaImg.Mode.ContentIsMask}/>
            </button>
          )
        }
        <button
          className={`btn btn-toolbar thread-forward-button`}
          title="Forward"
          style={{ marginRight: 0 }}
          onClick={this._forward}
        >
          <RetinaImg name={this.state.isForwarding ? 'sending-spinner.gif' : 'forward.svg'}
                     style={{ width: 26, height: 26 }}
                     isIcon={!this.state.isForwarding}
                     mode={RetinaImg.Mode.ContentIsMask}/>
        </button>
      </div>
    );
  }
}
