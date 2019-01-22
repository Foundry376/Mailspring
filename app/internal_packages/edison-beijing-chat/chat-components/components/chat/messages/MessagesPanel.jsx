import React, { PureComponent } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';
import MessagesTopBar from './MessagesTopBar';
import NewConversationTopBar from './NewConversationTopBar';
import MessagesSendBar from './MessagesSendBar';
import Messages from './Messages';
import ConversationInfo from '../conversations/ConversationInfo';
import Divider from '../../common/Divider';
import InviteGroupChatList from '../new/InviteGroupChatList';
import xmpp from '../../../xmpp/index';
import chatModel from '../../../store/model';
import getDb from '../../../db';
import { uploadFile } from '../../../utils/awss3';
import uuid from 'uuid/v4';
import { NEW_CONVERSATION } from '../../../actions/chat';
import { FILE_TYPE } from './messageModel';
import registerLoginChatAccounts from '../../../utils/registerLoginChatAccounts';
import Button from '../../common/Button';
import FixedPopover from '../../../../../../src/components/fixed-popover';
const GROUP_CHAT_DOMAIN = '@muc.im.edison.tech';

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
    members: [],
    membersTemp: null,
    online: true,
    connecting: false,
    moreBtnEl: null
  }

  onUpdateGroup = async (contacts) => {
    this.setState(Object.assign({}, this.state, { inviting: false }));
    const { selectedConversation } = this.props;
    if (contacts && contacts.length > 0) {
      if (selectedConversation.isGroup) {
        await Promise.all(contacts.map(contact => (
          xmpp.addMember(selectedConversation.jid, contact.jid, selectedConversation.curJid)
        )));
        this.refreshRoomMembers();
      } else {
        const roomId = uuid() + GROUP_CHAT_DOMAIN;
        const db = await getDb();
        if (!contacts.filter(item => item.jid === selectedConversation.jid).length) {
          const other = await db.contacts.findOne().where('jid').eq(selectedConversation.jid).exec();
          contacts.unshift(other);
        }
        if (!contacts.filter(item => item.jid === selectedConversation.curJid).length) {
          const owner = await db.contacts.findOne().where('jid').eq(selectedConversation.curJid).exec();
          contacts.unshift(owner);
        }
        const names = contacts.map(item => item.name);
        const chatName = names.slice(0, names.length - 1).join(' , ') + ' & ' + names[names.length - 1];
        const { onGroupConversationCompleted } = this.props;
        onGroupConversationCompleted({ contacts, roomId, name: chatName });
      }
    }
  }

  componentDidMount() {
    this.refreshRoomMembers();
    window.addEventListener("online", this.onLine);
    window.addEventListener("offline", this.offLine);
  }
  componentWillUnmount() {
    window.removeEventListener("online", this.onLine);
    window.removeEventListener("offline", this.offLine);
  }

  onLine = () => {
    // connect to chat server
    if (!this.props.chat_online) {
      this.reconnect();
    }
    this.setState({
      online: true
    })
  }

  offLine = () => {
    this.setState({
      online: false
    })
  }

  componentWillReceiveProps = (nextProps) => {
    if (nextProps.selectedConversation
      && this.props.selectedConversation
      && nextProps.selectedConversation.jid !== this.props.selectedConversation.jid) {
      this.refreshRoomMembers(nextProps);
    }
  }

  refreshRoomMembers = async (nextProps) => {
    const { selectedConversation: conversation } = (nextProps || this.props);
    if (conversation && conversation.isGroup) {
      const members = await this.getRoomMembers(nextProps);
      if (conversation.update) {
        conversation.update({
          $set: {
            roomMembers: members
          }
        })
      }
      this.setState({ members });
    }
  }

  getRoomMembers = async (nextProps) => {
    const { selectedConversation: conversation } = (nextProps || this.props);
    if (conversation && conversation.isGroup) {
      const result = await xmpp.getRoomMembers(conversation.jid, null, conversation.curJid);
      const members = result.mucAdmin.items;
      return members;
    }
    return [];
  }

  saveRoomMembersForTemp = (members) => {
    this.setState({ membersTemp: members })
  }

  toggleInvite = (moreBtnEl) => {
    this.setState({ inviting: !this.state.inviting, moreBtnEl });
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
        isUploading: true,
        mediaObjectId: '',
      };
      if (file.match(/.gif$/)) {
        body.type = FILE_TYPE.GIF;
      } else if (file.match(/(\.bmp|\.png|\.jpg\.jpeg)$/)) {
        body.type = FILE_TYPE.IMAGE;
      } else {
        body.type = FILE_TYPE.OTHER_FILE;
      }
      const messageId = uuid();
      onMessageSubmitted(selectedConversation, JSON.stringify(body), messageId, true);
      uploadFile(jidLocal, null, file, (err, filename, myKey, size) => {
        if (err) {
          alert(`upload files failed because error: ${err}, filename: ${filename}`);
          return;
        }
        body.content = " ";
        body.isUploading = false;
        body.mediaObjectId = myKey;
        body.occupants = [];
        body.atJids = [];
        body.localFile = file;
        onMessageSubmitted(selectedConversation, JSON.stringify(body), messageId, false);
      });
    })
  }

  createRoom = () => {
    const members = this.state.membersTemp;
    if (members && members.length) {
      const { onGroupConversationCompleted, onPrivateConversationCompleted } = this.props;
      if (members.length > 1 && onGroupConversationCompleted) {
        const roomId = uuid() + GROUP_CHAT_DOMAIN;
        const names = members.map(item => item.name);
        const chatName = names.slice(0, names.length - 1).join(' , ') + ' & ' + names[names.length - 1];
        onGroupConversationCompleted({ contacts: members, roomId, name: chatName });
      }
      else if (members.length == 1 && onPrivateConversationCompleted) {
        onPrivateConversationCompleted(members[0]);
      }
    }
  }

  removeMember = member => {
    const conversation = this.props.selectedConversation;
    if (member.affiliation === 'owner') {
      alert('you can not remove the owner of the group chat!');
      return;
    }
    const jid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
    xmpp.leaveRoom(conversation.jid, jid);
    if (jid == conversation.curJid) {
      (getDb()).then(db => {
        db.conversations.findOne(conversation.jid).exec().then(conv => {
          conv.remove()
        }).catch((error) => { })
      });
      this.props.deselectConversation();
    } else {
      this.refreshRoomMembers();
    }
  };

  reconnect = () => {
    registerLoginChatAccounts();
    this.setState({
      connecting: true
    });
    // connect timeout 30s
    setTimeout(() => {
      this.setState({
        connecting: false
      });
    }, 30000)
  }

  render() {
    const { showConversationInfo, inviting } = this.state;
    const {
      deselectConversation,
      sendMessage,
      availableUsers,
      groupedMessages,
      selectedConversation,
      referenceTime,
      contacts
    } = this.props;
    const currentUserId = selectedConversation && selectedConversation.curJid ? selectedConversation.curJid : NEW_CONVERSATION;

    const topBarProps = {
      onBackPressed: () => {
        deselectConversation();
        this.setState({ showConversationInfo: false });
      },
      onInfoPressed: () =>
        this.setState({ showConversationInfo: !this.state.showConversationInfo }),
      toggleInvite: this.toggleInvite,
      exitGroup: () => {
        xmpp.leaveRoom(selectedConversation.jid, chatModel.currentUser.jid);
        (getDb()).then(db => {
          db.conversations.findOne(selectedConversation.jid).exec().then(conv => {
            conv.remove()
          }).catch((error) => {
          })
        });
        deselectConversation();
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
      onMessageSubmitted: sendMessage,
    };
    const sendBarProps = {
      onMessageSubmitted: sendMessage,
      selectedConversation,
    };
    const infoProps = {
      selectedConversation,
      deselectConversation: this.props.deselectConversation,
      toggleInvite: this.toggleInvite,
      members: this.state.members,
      removeMember: this.removeMember
    };
    const newConversationProps = {
      contacts,
      saveRoomMembersForTemp: this.saveRoomMembersForTemp,
      deselectConversation,
      createRoom: this.createRoom
    }

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
              {
                selectedConversation.jid === NEW_CONVERSATION ? (
                  <div className="chatPanel">
                    <NewConversationTopBar {...newConversationProps} />
                  </div>
                ) : (
                    <div className="chatPanel">
                      <MessagesTopBar {...topBarProps} />
                      <Messages {...messagesProps} sendBarProps={sendBarProps} />
                      {this.state.dragover && (
                        <div id="message-dragdrop-override"></div>
                      )}
                      <div>
                        <MessagesSendBar {...sendBarProps} />
                      </div>
                    </div>
                  )
              }
              <Divider type="vertical" />
              <CSSTransitionGroup
                transitionName="transition-slide"
                transitionLeaveTimeout={250}
                transitionEnterTimeout={250}
              >
                {showConversationInfo && selectedConversation.jid !== NEW_CONVERSATION && (
                  <div className="infoPanel">
                    <ConversationInfo {...infoProps} />
                  </div>
                )}
              </CSSTransitionGroup>
            </div>
          </div> :
          <div className="unselectedHint">
            <span>Select a conversation to start messaging</span>
          </div>
        }
        {(!this.state.online || !this.props.chat_online) && (
          <div className="network-offline">
            {this.state.online ? (
              this.state.connecting ? (
                <div className="reconnect">connecting...</div>
              ) : (
                  <Button className="reconnect" onClick={this.reconnect}>Reconnect</Button>
                )
            ) : null}
          </div>
        )}
        {inviting && selectedConversation.jid !== NEW_CONVERSATION && (
          <FixedPopover {...{
            direction: 'down',
            originRect: {
              width: 350,
              height: 430,
              top: this.state.moreBtnEl.getBoundingClientRect().top,
              left: this.state.moreBtnEl.getBoundingClientRect().left,
            },
            closeOnAppBlur: false,
            onClose: () => {
              this.setState({ inviting: false });
            },
          }}>
            <InviteGroupChatList groupMode={true} onUpdateGroup={this.onUpdateGroup} />
          </FixedPopover>
        )}
      </div>
    );
  }
}
