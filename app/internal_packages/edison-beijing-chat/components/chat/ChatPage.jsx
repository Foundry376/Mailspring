import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import MessagesPanel from './messages/MessagesPanel';

export default class ChatPage extends PureComponent {
  static propTypes = {
    currentUserId: PropTypes.string,
    referenceTime: PropTypes.number
  }

  static defaultProps = {
    currentUserId: null,
    groupedMessages: [],
    referenceTime: new Date().getTime()
  }

  componentDidMount() {
    if (this.props.currentUserId) {
      this.props.setReferenceTime();
    }
  }

  render() {
    const {
      sendMessage,
      currentUserId,
      groupedMessages,
      referenceTime,
      isAuthenticating
    } = this.props;

    const messagesPanelProps = {
      sendMessage,
      currentUserId,
      groupedMessages,
      referenceTime,
      isAuthenticating
    };

    const rightPanelStyles = ['rightPanel'];
    const rightPanelClasses = rightPanelStyles.join(' ');

    return (
      <div className="chatPageContainer">
        <div className={rightPanelClasses}>
          <MessagesPanel {...messagesPanelProps} />
        </div>
      </div>
    );
  }
}
