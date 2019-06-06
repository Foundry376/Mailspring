import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import InfoMember from './InfoMember';
import { remote } from 'electron';
import { clearMessages } from '../../../utils/message';
import _ from 'lodash';
import RetinaImg from '../../../../../../src/components/retina-img';
import chatModel, { saveToLocalStorage } from '../../../store/model';
import { ChatActions } from 'chat-exports';


export default class ConversationInfo extends Component {
  currentUserIsOwner = false;
  constructor(props) {
    super();
    this.state = {
      visible: false,
      isHiddenNotifi: props.selectedConversation && !!props.selectedConversation.isHiddenNotification
    }
  }

  clearMessages = () => {
    let conversation = this.props.selectedConversation;
    let jid = conversation.jid;
    let notifications = chatModel.chatStorage.notifications || (chatModel.chatStorage.notifications = {});
    delete notifications[jid];
    saveToLocalStorage();
    clearMessages(conversation);
    return;
  }

  hiddenNotifi = () => {
    const isHidden = !this.props.selectedConversation.isHiddenNotification;
    safeUpdate(this.props.selectedConversation, { isHiddenNotification: isHidden });
    this.setState({
      isHiddenNotifi: isHidden
    })
  }

  exitGroup = () => {
    if (!confirm('Are you sure to exit from this group?')) {
      return;
    }

    const { selectedConversation: conversation } = this.props;
    xmpp.leaveRoom(conversation.jid, conversation.curJid);
    ChatActions.removeConversation(conversation.jid);
    ChatActions.deselectConversation();
  }

  showMenu = (e) => {
    const menus = [
      {
        label: `Clear Message History`,
        click: () => {
          this.clearMessages();
        },
      },
      { type: 'separator' },
      {
        label: `Hide notifications`,
        type: 'checkbox',
        checked: this.state.isHiddenNotifi,
        click: () => {
          this.hiddenNotifi();
        },
      },
    ]
    const { selectedConversation: conversation } = this.props;
    if (!conversation.jid.match(/@app/)) {
      menus.unshift({
        label: `Add to Group...`,
        click: () => {
          const moreBtnEl = document.querySelector('.more');
          this.props.toggleInvite(moreBtnEl);
        },
      })
    }
    remote.Menu.buildFromTemplate(menus).popup(remote.getCurrentWindow());
  }

  render = () => {
    const { selectedConversation: conversation, members, loadingMembers } = this.props;
    const roomMembers = members;
    for (const member of roomMembers) {
      const jid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
      if (member.affiliation === 'owner' && jid === conversation.curJid) {
        this.currentUserIsOwner = true;
        break;
      }
    }
    roomMembers.sort((a, b) => a.affiliation + a.jid.bare > b.affiliation + b.jid.bare);
    let privateChatMember = {};
    if (!conversation.isGroup) {
      if (conversation.roomMembers && conversation.roomMembers.length > 0) {
        privateChatMember = conversation.roomMembers[0];
      } else {
        privateChatMember = conversation;
      }
    }
    return (
      <div className="info-content">
        <div className="member-management">
          {loadingMembers ?
            <RetinaImg
              name="inline-loading-spinner.gif"
              mode={RetinaImg.Mode.ContentPreserve}
            /> :
            <div className="member-count">{conversation.isGroup ? roomMembers.length + " People" : ""}
            </div>
          }

          <Button className="more" onClick={this.showMenu}></Button>
        </div>
        <div className="members">
          {
            !conversation.isGroup ? (
              <div className="row">
                <div className="avatar-icon">
                  <ContactAvatar conversation={conversation} jid={privateChatMember.jid} name={privateChatMember.name}
                    email={privateChatMember.email} avatar={privateChatMember.avatar} size={30} />
                </div>
                <div className="info">
                  <div className="name">
                    {privateChatMember.name}
                  </div>
                  <div className="email">{privateChatMember.email}</div>
                </div>
              </div>
            ) : null
          }
          {
            conversation.isGroup && !loadingMembers && roomMembers && roomMembers.map(member => {
              return (<InfoMember conversation={conversation}
                member={member}
                editingMember={this.editingMember}
                editProfile={this.props.editProfile}
                exitProfile={this.props.exitProfile}
                key={member.jid}
              />)
            })
          }
          {(conversation.isGroup && !this.currentUserIsOwner) && (
            <div className="add-to-group"
              onClick={this.exitGroup}>
              Exit from Group
          </div>
          )}
        </div>
      </div>
    )
  };
}

ConversationInfo.propTypes = {
  selectedConversation: PropTypes.shape({
    jid: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    email: PropTypes.string,//.isRequired,
    avatar: PropTypes.string,
    isGroup: PropTypes.bool.isRequired,
    roomMembers: PropTypes.array,
  }).isRequired,
};
