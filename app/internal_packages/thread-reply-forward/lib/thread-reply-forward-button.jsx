import { React, PropTypes } from 'mailspring-exports';
import { RetinaImg, BindGlobalCommands } from 'mailspring-component-kit';

export default class ThreadReplyForwardButton extends React.Component {
  static displayName = 'ThreadReplyForwardButton';

  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array,
    thread: PropTypes.object,
  };

  _lastMessage = () => {
    return (this.props.thread.__messages || []).filter(m => !m.draft).pop();
  }

  canReplyAll = () => {
    const lastMessage = this._lastMessage();
    return lastMessage && lastMessage.canReplyAll();
  }

  _reply = () => {
    AppEnv.commands.dispatch('core:reply');
  }

  _replyAll = () => {
    AppEnv.commands.dispatch('core:reply-all');
  }

  _forward = () => {
    AppEnv.commands.dispatch('core:forward');
  }

  render() {
    if (this.props.items && this.props.items.length > 1) {
      return <span />;
    }

    return (
      <div className="button-group">
        <button
          className={`btn btn-toolbar thread-reply-button`}
          title="Reply"
          style={{ marginRight: 0 }}
          onClick={this._reply}
        >
          <RetinaImg name={'reply.svg'} style={{ width: 22, height: 22 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
        </button>
        {
          this.canReplyAll() && (
            <button
              className={`btn btn-toolbar thread-reply-all-button`}
              title="Reply All"
              style={{ marginRight: 0 }}
              onClick={this._replyAll}
            >
              <RetinaImg name={'reply-all.svg'} style={{ width: 22, height: 22 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
            </button>
          )
        }
        <button
          className={`btn btn-toolbar thread-forward-button`}
          title="Forward"
          style={{ marginRight: 0 }}
          onClick={this._forward}
        >
          <RetinaImg name={'forward.svg'} style={{ width: 22, height: 22 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </div>
    );
  }
}
