import React, { PureComponent } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';
import MessagesTopBar from './MessagesTopBar';
import MessagesSendBar from './MessagesSendBar';
import Messages from './Messages';
import ConversationInfo from '../conversations/ConversationInfo';
import Divider from '../../common/Divider';
import InviteGroupChatList from '../new/InviteGroupChatList';
import xmpp from '../../../xmpp/index';
import chatModel from '../../../store/model';
import getDb from '../../../db';

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
    inviting: false,
    members: []
  }

  onUpdateGroup = (contacts) => {
    this.setState(Object.assign({}, this.state, { inviting: false }));
    const { selectedConversation } = this.props;
    for (const i in contacts) {
      xmpp.addMember(selectedConversation.jid, contacts[i].jid);
    }
  }

  componentDidMount() {
    this.getRoomMembers();
  }

  componentWillReceiveProps() {
    this.getRoomMembers();
  }

  getRoomMembers = () => {
    const { selectedConversation: conversation } = this.props;
    if (conversation && conversation.isGroup) {
      xmpp.getRoomMembers(conversation.jid).then((result) => {
        const members = result.mucAdmin.items;
        this.setState({ members });
      });
    }
  }

  render() {
    const { showConversationInfo, members } = this.state;
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
      toggleInvite: () => {
        let { showConversationInfo } = this.state;
        if (!this.inviting) showConversationInfo = false;
        this.setState({ inviting: !this.state.inviting, showConversationInfo });

      },
      exitGroup: () => {
        let { showConversationInfo } = this.state;
        xmpp.leaveRoom(selectedConversation.jid, chatModel.currentUser.jid);
        (getDb()).then(db => {
          db.conversations.findOne(selectedConversation.jid).exec().then(conv => {
            conv.remove()
          }).catch((error) => {
          })
        });
        this.props.deselectConversation();
      },
      availableUsers,
      infoActive: showConversationInfo,
      selectedConversation,
      inviting: this.state.inviting
    };
    const messagesProps = {
      currentUserId,
      groupedMessages,
      referenceTime,
      selectedConversation,
      members
    };
    const sendBarProps = {
      onMessageSubmitted: sendMessage,
      selectedConversation,
    };
    const { inviting } = this.state;

    return (
      <div className="panel">
        {selectedConversation ?
          <div className="chat">
            <div className="splitPanel">
              <div className="chatPanel">
                <MessagesTopBar {...topBarProps} />
                {/* <Divider type="horizontal" /> */}
                <Messages {...messagesProps} />
                <div>
                  {/* <Divider type="horizontal" /> */}
                  <MessagesSendBar {...sendBarProps} />
                </div>
              </div>
              <Divider type="vertical" />
              <CSSTransitionGroup
                transitionName="transition-slide"
                transitionLeaveTimeout={250}
                transitionEnterTimeout={250}
              >
                {showConversationInfo && (
                  <div className="infoPanel">
                    <ConversationInfo conversation={selectedConversation} />
                  </div>
                )}
              </CSSTransitionGroup>
              {inviting && <InviteGroupChatList groupMode={true} onUpdateGroup={this.onUpdateGroup}></InviteGroupChatList>}
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
