import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import MessagesTopBar from './MessagesTopBar';
import MessagesSendBar from './MessagesSendBar';
import Messages from './Messages';
import ConversationInfo from '../conversations/ConversationInfo';
import Divider from '../../common/Divider';

export default class MessagesPanel extends PureComponent {
  static propTypes = {
    deselectConversation: PropTypes.func.isRequired,
    sendMessage: PropTypes.func.isRequired,
    availableUsers: PropTypes.arrayOf(PropTypes.string),
    currentUserId: PropTypes.string,
    groupedMessages: PropTypes.arrayOf(
      PropTypes.shape({
        sender: PropTypes.string.isRequired,
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
    currentUserId: null,
    groupedMessages: [],
    selectedConversation: null,
    referenceTime: new Date().getTime(),
  }

  state = {
    showConversationInfo: false,
  }

  render() {
    const { showConversationInfo } = this.state;
    const {
      deselectConversation,
      sendMessage,
      availableUsers,
      currentUserId,
      groupedMessages,
      selectedConversation,
      referenceTime,
    } = this.props;

    const topBarProps = {
      onBackPressed: () => {
        deselectConversation();
        this.setState({ showConversationInfo: false });
      },
      onInfoPressed: () =>
        this.setState({ showConversationInfo: !this.state.showConversationInfo }),
      availableUsers,
      infoActive: showConversationInfo,
      selectedConversation,
    };
    const messagesProps = {
      currentUserId,
      groupedMessages,
      referenceTime,
      selectedConversation,
    };
    const sendBarProps = {
      onMessageSubmitted: sendMessage,
      selectedConversation,
    };

    return (
      <div className="panel">
        {selectedConversation ?
          <div className="chat">
            <MessagesTopBar {...topBarProps} />
            <Divider type="horizontal" />
            <div className="splitPanel">
              <div className="chatPanel">
                <Messages {...messagesProps} />
                <div>
                  <Divider type="horizontal" />
                  <MessagesSendBar {...sendBarProps} />
                </div>
              </div>
              <Divider type="vertical" />
              {showConversationInfo ?
                <div className="infoPanel">
                  <ConversationInfo conversation={selectedConversation} />
                </div> : null
              }
            </div>
          </div> :
          <div className="unselectedHint">
            <span>Select a conversation to start messaging</span>
          </div>
        }
      </div>
    );
  }
}
