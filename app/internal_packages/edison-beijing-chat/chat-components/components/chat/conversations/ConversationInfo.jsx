import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import getDb from '../../../db';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../utils/colors';
import { remote } from 'electron';
import { clearMessages } from '../../../utils/message';
import _ from 'lodash';
import RetinaImg from '../../../../../../src/components/retina-img';
import chatModel, { saveToLocalStorage } from '../../../store/model';

const { primaryColor } = theme;


export default class ConversationInfo extends Component {
  currentUserIsOwner = false;
  constructor(props) {
    super();
    this.state = {
      visible: false,
      isHiddenNotifi: props.selectedConversation && !!props.selectedConversation.isHiddenNotification
    }
  }

  componentDidMount() {
    if (this.props.selectedConversation.isGroup && (
      !this.props.members ||
      this.props.members.length === 0
    )) {
      this.props.refreshRoomMembers();
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
    this.props.selectedConversation.update({
      $set: {
        isHiddenNotification: isHidden
      }
    })
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
    (getDb()).then(db => {
      db.conversations.findOne(conversation.jid).exec().then(conv => {
        conv.remove()
      }).catch((error) => { })
    });
    this.props.deselectConversation();
  }

  showMenu = (e) => {
    const menus = [
      {
        label: `Add to Group...`,
        click: () => {
          const moreBtnEl = document.querySelector('.more');
          this.props.toggleInvite(moreBtnEl);
        },
      },
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
                  <ContactAvatar jid={privateChatMember.jid} name={privateChatMember.name}
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
              const onClickRemove = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.props.removeMember(member);
              };
              const jid = typeof member.jid === 'object' ? member.jid.bare : member.jid;

              const onEditMemberProfile = () => {
                const fn = _.debounce(() => {
                  setTimeout(() => {
                    if (this.editingMember && member !== this.editingMember) {
                      this.props.exitMemberProfile(this.editingMember);
                    }
                    setTimeout(() => {
                      this.props.editMemberProfile(member);
                      this.editingMember = member;
                    }, 30);
                  }, 30);

                }, 300);
                fn();
                return;
              }
              return (
                <div className="row" key={jid} onClick={onEditMemberProfile}>
                  <div className="avatar">
                    <ContactAvatar jid={jid} name={member.name}
                      email={member.email} avatar={member.avatar} size={30} />
                  </div>
                  <div className="info">
                    <div className="name">
                      {member.name}
                      {member.affiliation === 'owner' ? <span> (owner)</span> : null}
                    </div>
                    <div className="email">{member.email}</div>
                  </div>
                  {this.currentUserIsOwner && member.affiliation !== 'owner' &&
                    <span className="remove-member" onClick={onClickRemove}>
                      <CancelIcon color={primaryColor} />
                    </span>
                  }
                </div>
              )
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
