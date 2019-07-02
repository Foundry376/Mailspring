import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import InfoMember from './InfoMember';
import { remote } from 'electron';
import { ChatActions, MessageStore, RoomStore, ConversationStore, ContactStore, UserCacheStore, AppStore, LocalStorage } from 'chat-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { FixedPopover } from 'mailspring-component-kit';
import { NEW_CONVERSATION } from '../../../actions/chat';
import InviteGroupChatList from '../new/InviteGroupChatList';
import uuid from 'uuid/v4';
import { name } from '../../../../utils/name';
import { alert } from '../../../../utils/electron';

const GROUP_CHAT_DOMAIN = '@muc.im.edison.tech';

export default class ConversationInfo extends Component {
  constructor(props) {
    super();
    this.state = {
      inviting: false,
      members: [],
      loadingMembers: false,
      visible: false,
      isHiddenNotifi: props.selectedConversation && !!props.selectedConversation.isHiddenNotification,
    };
  }

  _listenToStore = () => {
    this._unsubs = [];
    this._unsubs.push(RoomStore.listen(this.refreshRoomMembers));
    this._unsubs.push(LocalStorage.listen(this.refreshRoomMembers));
  };

  componentWillUnmount() {
    for (const unsub of this._unsubs) {
      unsub();
    }
  }

  removeMember = async member => {
    const conversation = this.props.selectedConversation;
    if (member.affiliation === 'owner') {
      alert('you can not remove the owner of the group chat!');
      return;
    }
    const jid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
    await xmpp.leaveRoom(conversation.jid, jid, conversation.curJid);
  };

  componentDidMount() {
    this._listenToStore();
    this.refreshRoomMembers();
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.selectedConversation.jid !== this.props.selectedConversation.jid) {
      this.setState({
        members: [],
      });
      this.refreshRoomMembers(nextProps);
    }
  }

  refreshRoomMembers = async (nextProps) => {
    this.setState({ loadingMembers: true });
    const members = await this.getRoomMembers(nextProps);
    for (const member of members) {
      member.name = name(member.jid);
    }
    console.log('refreshRoomMembers: ', members);
    members.sort((a, b) => (a.affiliation + a.name) > (b.affiliation + b.name) ? 1 : -1);
    this.setState({
      members,
      loadingMembers: false,
    });
  };

  getRoomMembers = async (nextProps = {}) => {
    const conversation = nextProps && nextProps.selectedConversation || this.props.selectedConversation;
    if (conversation && conversation.isGroup) {
      return await RoomStore.getRoomMembers(conversation.jid, conversation.curJid, true);
    }
    return [];
  };

  clearMessages = () => {
    const conversation = this.props.selectedConversation;
    const jid = conversation.jid;
    MessageStore.removeMessagesByConversationJid(jid);
    return;
  };

  toggleNotification = (event) => {
    const isHidden = !this.props.selectedConversation.isHiddenNotification;
    this.props.selectedConversation.isHiddenNotification = isHidden;
    ConversationStore.updateConversationByJid({ isHiddenNotification: isHidden }, this.props.selectedConversation.jid);
    this.setState({
      isHiddenNotifi: isHidden,
    });
  };

  exitGroup = async () => {
    if (!confirm('Are you sure to exit from this group?')) {
      return;
    }
    const { selectedConversation: conversation } = this.props;
    await xmpp.leaveRoom(conversation.jid, conversation.curJid, conversation.curJid);
    const isNeedRetain = await RoomStore.updateConversationCurJid(conversation.curJid, conversation.jid);
    if (!isNeedRetain) {
      ChatActions.removeConversation(conversation.jid);
      ChatActions.deselectConversation();
    }
  };

  toggleInvite = (moreBtnEl) => {
    this.setState({ inviting: !this.state.inviting, moreBtnEl });
  };

  onUpdateGroup = async (contacts) => {
    this.setState({ inviting: false });
    const { selectedConversation } = this.props;
    if (contacts.some(contact => contact.jid.match(/@app/))) {
      alert('plugin app should not be added to any group chat as contact.');
      return;
    }
    if (contacts && contacts.length > 0) {
      if (selectedConversation.isGroup) {
        await Promise.all(contacts.map(contact => (
          xmpp.addMember(selectedConversation.jid, contact.jid, selectedConversation.curJid)
        )));
      } else {
        const roomId = uuid() + GROUP_CHAT_DOMAIN;
        if (!contacts.filter(item => item.jid === selectedConversation.jid).length) {
          const other = await ContactStore.findContactByJid(selectedConversation.jid);
          if (other) {
            contacts.unshift(other);
          } else {
            contacts.unshift({ jid: selectedConversation.jid, name: '' });
          }
        }
        if (!contacts.filter(item => item.jid === selectedConversation.curJid).length) {
          const owner = await ContactStore.findContactByJid(selectedConversation.curJid);
          if (owner) {
            contacts.unshift(owner);
          } else {
            contacts.unshift({ jid: selectedConversation.curJid, name: '' });
          }
        }
        const names = contacts.map(item => item.name);
        const chatName = names.slice(0, names.length - 1).join(', ') + ' & ' + names[names.length - 1];
        // const { onGroupConversationCompleted } = this.props;
        ConversationStore.createGroupConversation({
          contacts,
          roomId,
          name: chatName,
          curJid: selectedConversation.curJid,
        });
      }
    }
  };

  showMenu = (e) => {
    const props = this.props;
    const isHidden = props.selectedConversation.isHiddenNotification;
    let menuToggleNotificationLabel;
    if (isHidden) {
      menuToggleNotificationLabel = 'Show notifications';
    } else {
      menuToggleNotificationLabel = 'Hide notifications'
    }
    const menus = [
      {
        label: `Clear Message History`,
        click: () => {
          this.clearMessages();
        },
      },
      { type: 'separator' },
      {
        label: menuToggleNotificationLabel,
        click: (e) => {
          this.toggleNotification(e);
        },
      },
    ];
    const { selectedConversation: conversation } = this.props;
    if (!conversation.jid.match(/@app/)) {
      menus.unshift({
        label: `Add to Group...`,
        click: async () => {
          const moreBtnEl = document.querySelector('.more');
          await AppStore.refreshAppsEmailContacts();
          this.toggleInvite(moreBtnEl);
        },
      });
    }
    this.menu = remote.Menu.buildFromTemplate(menus).popup(remote.getCurrentWindow());
  };
  filterCurrentMemebers = contact => {
    if (this.props.selectedConversation.isGroup) {
      const memberJids = this.state.members.map(c => c.email);
      return !memberJids.includes(contact.email);
    } else {
      if (this.props.selectedConversation.roomMembers && this.props.selectedConversation.roomMembers.length > 0) {
        return [this.props.selectedConversation.roomMembers[0].email];
      } else {
        return [this.props.selectedConversation.email];
      }
    }
  };

  render = () => {
    const { selectedConversation: conversation, contacts } = this.props;
    const { members: roomMembers, loadingMembers, inviting } = this.state;
    let currentUserIsOwner = false;
    for (const member of roomMembers) {
      const jid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
      if (member.affiliation === 'owner' && jid === conversation.curJid) {
        currentUserIsOwner = true;
        break;
      }
    }
    let privateChatMember = {};
    let self;
    if (!conversation.isGroup) {
      privateChatMember = conversation;
      self = UserCacheStore.getUserInfoByJid(conversation.curJid);
    }
    return (
      <div className="info-content">
        <div className="member-management">
          {loadingMembers ?
            <RetinaImg
              name="inline-loading-spinner.gif"
              mode={RetinaImg.Mode.ContentPreserve}
            /> :
            <div className="member-count">
              {conversation.isGroup ? roomMembers.length + ' People' : ''}
            </div>
          }
          <Button className="close" onClick={this.props.onCloseInfoPanel}></Button>
          <Button className="more" onClick={this.showMenu}></Button>
        </div>
        <div className="members">
          {
            !conversation.isGroup ? ([
              <InfoMember
                conversation={conversation}
                member={privateChatMember}
                editingMember={this.editingMember}
                editProfile={this.props.editProfile}
                exitProfile={this.props.exitProfile}
                removeMember={this.removeMember}
                currentUserIsOwner={currentUserIsOwner}
                key={privateChatMember.jid}
              />,
              self && (
                <InfoMember
                  conversation={conversation}
                  member={self}
                  editingMember={this.editingMember}
                  editProfile={this.props.editProfile}
                  exitProfile={this.props.exitProfile}
                  removeMember={this.removeMember}
                  currentUserIsOwner={currentUserIsOwner}
                  key="curJid"
                />
              )
            ]) : null
          }
          {
            conversation.isGroup && ([
              roomMembers && roomMembers.map(member => {
                return (
                  <InfoMember
                    conversation={conversation}
                    member={member}
                    editingMember={this.editingMember}
                    editProfile={this.props.editProfile}
                    exitProfile={this.props.exitProfile}
                    removeMember={this.removeMember}
                    currentUserIsOwner={currentUserIsOwner}
                    key={member.jid}
                  />);
              }),
              <div
                key="exit-group"
                className="exit-group"
                onClick={this.exitGroup}>
                Exit from Group
              </div>
            ])
          }
        </div>
        {inviting && conversation.jid !== NEW_CONVERSATION && (
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
            <InviteGroupChatList contacts={contacts.filter(this.filterCurrentMemebers)} groupMode={true}
              onUpdateGroup={this.onUpdateGroup} />
          </FixedPopover>
        )}
      </div>
    );
  };
}

ConversationInfo.propTypes = {
  selectedConversation: PropTypes.shape({
    jid: PropTypes.string.isRequired,
    name: PropTypes.string,//.isRequired,
    email: PropTypes.string,//.isRequired,
    avatar: PropTypes.string,
    isGroup: PropTypes.bool.isRequired,
    roomMembers: PropTypes.array,
  }).isRequired,
};
