import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import ConversationsPanel from './conversations/ConversationsPanel';
import MessagesPanel from './messages/MessagesPanel';

export default class ChatPage extends PureComponent {
  static propTypes = {
    fetchRoster: PropTypes.func.isRequired,
    retrieveContacts: PropTypes.func.isRequired,
    sendMessage: PropTypes.func.isRequired,
    setReferenceTime: PropTypes.func.isRequired,
    availableUsers: PropTypes.arrayOf(PropTypes.string),
    currentUserId: PropTypes.string,
    referenceTime: PropTypes.number
  }

  static defaultProps = {
    availableUsers: [],
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
      availableUsers,
      currentUserId,
      groupedMessages,
      referenceTime,
      isLeft,
      resetHeight,
      onDragStart,
      online,
      isAuthenticating
    } = this.props;

    const conversationsPanelProps = {
      referenceTime,
    };
    const messagesPanelProps = {
      sendMessage,
      availableUsers,
      currentUserId,
      groupedMessages,
      referenceTime,
      chat_online: online,
      isAuthenticating
    };

    const rightPanelStyles = ['rightPanel'];
    const rightPanelClasses = rightPanelStyles.join(' ');

    return (
      <div className="chatPageContainer">
        <div className="leftPanel" style={{ display: isLeft ? 'block' : 'none' }}>
          <div onDoubleClick={resetHeight} onMouseDown={onDragStart} className="resizeBar"></div>
          <ConversationsPanel {...conversationsPanelProps} />
        </div>
        {
          !isLeft ? (
            <div className={rightPanelClasses}>
              <MessagesPanel {...messagesPanelProps} />
            </div>
          ) : null
        }
      </div>
    );
  }
}
