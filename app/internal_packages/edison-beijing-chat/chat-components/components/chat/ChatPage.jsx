import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import ConversationsPanel from './conversations/ConversationsPanel';
import MessagesPanel from './messages/MessagesPanel';

export default class ChatPage extends PureComponent {
  static propTypes = {
    createGroupConversation: PropTypes.func.isRequired,
    createPrivateConversation: PropTypes.func.isRequired,
    deselectConversation: PropTypes.func.isRequired,
    fetchRoster: PropTypes.func.isRequired,
    retrieveAllConversations: PropTypes.func.isRequired,
    retrieveContacts: PropTypes.func.isRequired,
    selectConversation: PropTypes.func.isRequired,
    newConversation: PropTypes.func.isRequired,
    sendMessage: PropTypes.func.isRequired,
    setReferenceTime: PropTypes.func.isRequired,
    availableUsers: PropTypes.arrayOf(PropTypes.string),
    contacts: PropTypes.arrayOf(PropTypes.shape({
      jid: PropTypes.string.isRequired,
      // Warning: Failed prop type
      name: PropTypes.string.isRequired,
      email: PropTypes.string.isRequired,
      avatar: PropTypes.string
    })),
    groupedMessages: PropTypes.arrayOf(
      PropTypes.shape({
        // sender: PropTypes.string.isRequired,
        time: PropTypes.string.isRequired,
        messages: PropTypes.arrayOf(
          PropTypes.shape({
            id: PropTypes.string.isRequired,
            conversationJid: PropTypes.string.isRequired,
            sender: PropTypes.string.isRequired,
            body: PropTypes.string.isRequired,
            sentTime: PropTypes.number.isRequired
          })
        ).isRequired
      })
    ),
    conversations: PropTypes.arrayOf(PropTypes.object).isRequired,
    currentUserId: PropTypes.string,
    referenceTime: PropTypes.number,
    selectedConversation: PropTypes.shape({
      isGroup: PropTypes.bool.isRequired,
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,//.isRequired,
      avatar: PropTypes.string,
      occupants: PropTypes.arrayOf(PropTypes.string).isRequired,
    }),
  }

  static defaultProps = {
    availableUsers: [],
    contacts: [],
    currentUserId: null,
    groupedMessages: [],
    referenceTime: new Date().getTime(),
    selectedConversation: null,
  }

  componentDidMount() {
    if (this.props.currentUserId) {
      this.props.setReferenceTime();
    }
  }

  render() {
    const {
      createGroupConversation,
      createPrivateConversation,
      deselectConversation,
      retrieveAllConversations,
      selectConversation,
      newConversation,
      sendMessage,
      availableUsers,
      contacts,
      conversations,
      currentUserId,
      groupedMessages,
      referenceTime,
      selectedConversation,
      removeConversation,
      isLeft,
      resetHeight,
      onDragStart,
      online
    } = this.props;
    const selectedConversationJid = selectedConversation ? selectedConversation.jid : null;

    const conversationsPanelProps = {
      retrieveAllConversations,
      selectConversation,
      newConversation,
      conversations,
      selectedConversationJid,
      referenceTime,
      removeConversation,
    };
    const messagesPanelProps = {
      deselectConversation,
      sendMessage,
      availableUsers,
      currentUserId,
      groupedMessages,
      referenceTime,
      selectedConversation,
      contacts,
      onGroupConversationCompleted: createGroupConversation,
      onPrivateConversationCompleted: createPrivateConversation,
      chat_online: online
    };

    const rightPanelStyles = ['rightPanel'];
    if (selectedConversation) {
      rightPanelStyles.push('focused');
    }
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
