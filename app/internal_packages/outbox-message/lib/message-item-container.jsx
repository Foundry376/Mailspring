import classNames from 'classnames';
import { React, PropTypes, Utils, Message } from 'mailspring-exports';

import MessageItem from './message-item';

export default class MessageItemContainer extends React.Component {
  static displayName = 'MessageItemContainer';

  static propTypes = {
    message: PropTypes.object.isRequired,
    isBeforeReplyArea: PropTypes.bool,
    scrollTo: PropTypes.func,
  };

  constructor(props, context) {
    super(props, context);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }
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
        className={this._classNames()}
        collapsed={false}
        isMostRecent={true}
      />
    );
  }
}
