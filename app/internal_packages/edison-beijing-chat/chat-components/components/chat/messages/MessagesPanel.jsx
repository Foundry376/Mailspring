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
import FilePlusIcon from '../../common/icons/FilePlusIcon';
import { uploadFile } from '../../../utils/awss3';
import uuid from 'uuid/v4';


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

  onUpdateGroup = async (contacts) => {
    this.setState(Object.assign({}, this.state, { inviting: false }));
    const { selectedConversation } = this.props;
    if (contacts && contacts.length > 0) {
      await Promise.all(contacts.map(contact => (
        xmpp.addMember(selectedConversation.jid, contact.jid)
      )))
      this.getRoomMembers();
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
      xmpp.getRoomMembers(conversation.jid, null, conversation.curJid).then((result) => {
        const members = result.mucAdmin.items;
        this.setState({ members });
      });
    }
  }

  toggleInvite = () => {
    // let { showConversationInfo } = this.state;
    // if (!this.inviting) showConversationInfo = false;
    this.setState({ inviting: !this.state.inviting });

  }

  onDragOver = (event) => {
    const state = Object.assign({}, this.state, { dragover: true });
    this.setState(state);
  }

  onDragEnd = (event) => {
    const state = Object.assign({}, this.state, { dragover: false });
    this.setState(state);
  }

  onDrop = (event) => {
    let tranFiles = event.dataTransfer.files,
      files = [];
    for (let i = 0; i < tranFiles.length; i++) {
      files.push(tranFiles[i].path);
    }
    const state = Object.assign({}, this.state, { dragover: false });
    this.setState(state);
    this.sendFile(files);
  }

  sendFile(files) {
    const { selectedConversation } = this.props;
    const onMessageSubmitted = this.props.sendMessage;
    const atIndex = selectedConversation.jid.indexOf('@');

    let jidLocal = selectedConversation.jid.slice(0, atIndex);

    files.map((file, index) => {
      let message = 'file received';
      let body = {
        type: 1,
        timeSend: new Date().getTime(),
        content: 'sending...',
        email: selectedConversation.email,
        name: selectedConversation.name,
        mediaObjectId: '',
      };
      const messageId = uuid();
      onMessageSubmitted(selectedConversation, JSON.stringify(body), messageId, true);
      uploadFile(jidLocal, null, file, (err, filename, myKey, size) => {
        if (err) {
          alert(`upload files failed because error: ${err}, filename: ${filename}`);
          return;
        }
        if (filename.match(/.gif$/)) {
          body.type = 5;
        } else if (filename.match(/(\.bmp|\.png|\.jpg\.jpeg)$/)) {
          body.type = 2;
        } else {
          body.type = 9;
        }
        body.content = " ";
        body.mediaObjectId = myKey;
        body.occupants = [];
        body.atJids = [];
        body.localFile = file;
        onMessageSubmitted(selectedConversation, JSON.stringify(body), messageId, false);
      });
    })
  }

  removeMember = member => {
    const conversation = this.props.selectedConversation;
    console.log('removeMember conversation:', conversation);
    if (member.affiliation === 'owner') {
      alert('you can not remove the owner of the group chat!');
      return;
    }
    xmpp.leaveRoom(conversation.jid, member.jid.bare);
    if (member.jid.bare == chatModel.currentUser.jid) {
      (getDb()).then(db => {
        db.conversations.findOne(conversation.jid).exec().then(conv => {
          conv.remove()}).catch((error) => {})
      });
      this.props.deselectConversation();
    } else {
      debugger;
      let index = this.state.members.indexOf(member);
      this.state.members.splice(index, 1);
      let members = this.state.members.slice();
      const state = Object.assign({}, this.state, {members});
      this.setState(state);
    }
  };

  render() {
    const { showConversationInfo, members, inviting } = this.state;
    const {
      deselectConversation,
      sendMessage,
      availableUsers,
      groupedMessages,
      selectedConversation,
      referenceTime,
    } = this.props;
    const currentUserId = selectedConversation ? selectedConversation.curJid : '';

    const topBarProps = {
      onBackPressed: () => {
        deselectConversation();
        this.setState({ showConversationInfo: false });
      },
      onInfoPressed: () =>
        this.setState({ showConversationInfo: !this.state.showConversationInfo }),
      toggleInvite: this.toggleInvite,
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
    const infoProps = {
      conversation: selectedConversation,
      deselectConversation: this.props.deselectConversation,
      members,
      toggleInvite: this.toggleInvite,
      getRoomMembers: this.getRoomMembers,
      removeMember: this.removeMember
    };

    return (
      <div className="panel"
        onDragOverCapture={this.onDragOver}
        onDragEnd={this.onDragEnd}
        onMouseLeave={this.onDragEnd}
        onDrop={this.onDrop}
      >
        {selectedConversation ?
          <div className="chat">
            <div className="splitPanel">
              <div className="chatPanel">
                <MessagesTopBar {...topBarProps} />
                {/* <Divider type="horizontal" /> */}
                <Messages {...messagesProps} />
                {this.state.dragover && (
                  <div id="message-dragdrop-override"></div>
                )}
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
                    <ConversationInfo {...infoProps} />
                  </div>
                )}
              </CSSTransitionGroup>
              <CSSTransitionGroup
                transitionName="transition-slide"
                transitionLeaveTimeout={250}
                transitionEnterTimeout={250}
              >
                {inviting && <InviteGroupChatList groupMode={true} onUpdateGroup={this.onUpdateGroup}></InviteGroupChatList>}
              </CSSTransitionGroup>
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
