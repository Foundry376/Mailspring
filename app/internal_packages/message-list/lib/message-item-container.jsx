import classNames from 'classnames';
import { React, PropTypes, Utils, DraftStore, ComponentRegistry } from 'mailspring-exports';

import MessageItem from './message-item';

export default class MessageItemContainer extends React.Component {
  static displayName = 'MessageItemContainer';

  static propTypes = {
    thread: PropTypes.object.isRequired,
    message: PropTypes.object.isRequired,
    messages: PropTypes.array.isRequired,
    collapsed: PropTypes.bool,
    isMostRecent: PropTypes.bool,
    isBeforeReplyArea: PropTypes.bool,
    scrollTo: PropTypes.func,
  };

  constructor(props, context) {
    super(props, context);
    this.state = this._getStateFromStores();
    this.state.maxWidth = AppEnv.config.get('core.reading.restrictMaxWidth');
  }

  componentDidMount() {
    if (this.props.message.draft) {
      this._unlisten = DraftStore.listen(this._onSendingStateChanged);
    }

    this._disposable = [];
    this._disposable.push(
      AppEnv.config.onDidChange('core.reading.restrictMaxWidth', this._onMaxWidthChange)
    );
  }

  componentWillReceiveProps(newProps) {
    this.setState(this._getStateFromStores(newProps));
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }

    for (const dispose of this._disposable) {
      dispose.dispose();
    }
  }

  focus = () => {
    this._messageComponent.focus();
  };

  _classNames() {
    return classNames({
      draft: this.props.message.draft,
      unread: this.props.message.unread,
      collapsed: this.props.collapsed,
      'message-item-wrap': true,
      'message-restrict-width': this.state.maxWidth,
      'before-reply-area': this.props.isBeforeReplyArea,
    });
  }

  _onSendingStateChanged = ({ headerMessageId }) => {
    if (headerMessageId === this.props.message.headerMessageId) {
      this.setState(this._getStateFromStores());
    }
  };

  _onMaxWidthChange = () => {
    let newState = this._getStateFromStores();
    newState.maxWidth = AppEnv.config.get('core.reading.restrictMaxWidth');
    this.setState(newState);
  };

  _getStateFromStores(props = this.props) {
    return {
      isSending: DraftStore.isSendingDraft(props.message.headerMessageId),
    };
  }

  _renderMessage({ pending }) {
    return (
      <MessageItem
        ref={cm => {
          this._messageComponent = cm;
        }}
        pending={pending}
        thread={this.props.thread}
        message={this.props.message}
        messages={this.props.messages}
        className={this._classNames()}
        collapsed={this.props.collapsed}
        isMostRecent={this.props.isMostRecent}
      />
    );
  }

  _renderComposer() {
    const Composer = ComponentRegistry.findComponentsMatching({ role: 'Composer' })[0];
    if (!Composer) {
      return <span>No Composer Component Present</span>;
    }
    return (
      <Composer
        ref={cm => {
          this._messageComponent = cm;
        }}
        headerMessageId={this.props.message.headerMessageId}
        className={this._classNames()}
        mode={'inline'}
        threadId={this.props.thread.id}
        scrollTo={this.props.scrollTo}
      />
    );
  }

  render() {
    if (this.state.isSending) {
      return this._renderMessage({ pending: true });
    }
    if (this.props.message.draft && !this.props.collapsed) {
      return this._renderComposer();
    }
    return this._renderMessage({ pending: false });
  }
}
