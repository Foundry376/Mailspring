import classNames from 'classnames';
import { React, PropTypes, Utils, Message } from 'mailspring-exports';

import MessageItem from './message-item';

export default class OutboxItemContainer extends React.Component {
  static displayName = 'OutboxItemContainer';

  static propTypes = {
    message: PropTypes.object.isRequired,
  };

  constructor(props, context) {
    super(props, context);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  focus = () => {
    this._messageComponent.focus();
  };

  _classNames() {
    return classNames({
      sending: Message.compareMessageState(this.props.message.state, Message.messageState.failing),
      'message-item-wrap': true,
      'before-reply-area': true,
    });
  }

  render() {
    return (
      <MessageItem
        ref={cm => {
          this._messageComponent = cm;
        }}
        message={this.props.message}
        isOutboxDraft={true}
        className={this._classNames()}
        collapsed={false}
        isMostRecent={true}
      />
    );
  }
}
