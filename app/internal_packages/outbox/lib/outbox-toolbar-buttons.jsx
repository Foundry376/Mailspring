import { RetinaImg } from 'mailspring-component-kit';
import { React, PropTypes, Actions, Message} from 'mailspring-exports';

const buttonTimer = 500;

class OutboxDeleteButton extends React.Component {
  static displayName = 'OutboxDeleteButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      isDeleting: false,
    };
    this._mounted = false;
    this._deletingTimer = false;
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._deletingTimer);
  }

  _changeBackToNotDeleting = () => {
    if (this._deletingTimer) {
      return;
    }
    this._deletingTimer = setTimeout(() => {
      if (this._mounted) {
        this.setState({ isDeleting: false });
      }
      this._deletingTimer = null;
    }, buttonTimer);
  };

  render() {
    if(!this.props.selection.items().every(selection => {
      return Message.compareMessageState(selection.state, Message.messageState.failed);
    })){
      return null;
    }
    return (
      <button
        style={{ order: -100 }}
        className="btn btn-toolbar"
        title="Delete"
        onClick={this._onDestroySelected}
      >
        <RetinaImg name={'trash.svg'}
                   style={{ width: 24, height: 24 }}
                   isIcon
                   mode={RetinaImg.Mode.ContentIsMask}/>
      </button>
    );
  }

  _onDestroySelected = () => {
    if (!this.state.isDeleting && !this._deletingTimer) {
      this._changeBackToNotDeleting();
      this.setState({ isDeleting: true });
      Actions.cancelOutboxDrafts({
        messages: this.props.selection.items(),
        source: 'OutboxToolbar:ResendDraft',
      });
      this.props.selection.clear();
    }
    return;
  };
}
class ReSendButton extends React.Component {
  static displayName = 'ReSendButton';
  static containerRequired = false;

  static propTypes = {
    items: PropTypes.array.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      isDeleting: false,
    };
    this._mounted = false;
    this._deletingTimer = false;
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._deletingTimer);
  }

  _changeBackToNotDeleting = () => {
    if (this._deletingTimer) {
      return;
    }
    this._deletingTimer = setTimeout(() => {
      if (this._mounted) {
        this.setState({ isDeleting: false });
      }
      this._deletingTimer = null;
    }, buttonTimer);
  };

  render() {
    const items = this.props.selection.items();
    if(!items.every(selection => {
      return Message.compareMessageState(selection.state, Message.messageState.failed);
    })){
      return null;
    }
    return (
      <button
        style={{ order: -100 }}
        className="btn btn-toolbar"
        title="Resend"
        onClick={this._onResendDrafts}
      >
        <RetinaImg name={'refresh.svg'}
                   style={{ width: 24, height: 24 }}
                   isIcon
                   mode={RetinaImg.Mode.ContentIsMask}/>
      </button>
    );
  }

  _onResendDrafts = () => {
    if (!this.state.isDeleting && !this._deletingTimer) {
      this._changeBackToNotDeleting();
      this.setState({ isDeleting: true });
      Actions.resendDrafts({ messages: this.props.selection.items(), source: 'OutboxToolbar:ResendDraft' });
      this.props.selection.clear();
    }
    return;
  };
}
module.exports = { OutboxDeleteButton, ReSendButton };
