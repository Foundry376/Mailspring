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
import MemberProfile from './MemberProfile';

const { primaryColor } = theme;


export default class ConversationInfo extends Component {
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
    clearMessages(this.props.selectedConversation);
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
    const { selectedConversation: conversation, members } = this.props;
    // const roomMembers = conversation.roomMembers && conversation.roomMembers.length > 0
    //   ? conversation.roomMembers : members;
    const roomMembers = members;
    // console.log('cxm*** conv info .render ', members, conversation.roomMembers);
    for (const member of roomMembers) {
      const jid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
      if (member.affiliation === 'owner' && jid === conversation.curJid) {
        this.currentUserIsOwner = true;
        break;
      }
    }
    //console.log('cxm*** conv info render members ', members);
    roomMembers.sort((a, b) => a.affiliation + a.jid.bare > b.affiliation + b.jid.bare);
    return (
      <div className="info-panel">
        <div className="member-management">
          <div className="member-count">{conversation.isGroup ? roomMembers.length + "People" : ""}</div>
          <Button className="more" onClick={this.showMenu}></Button>
        </div>
        <div>
          {
            !conversation.isGroup ? (
              <div className="row item">
                <div id="avatar">
                  <ContactAvatar jid={conversation.jid} name={conversation.name}
                    email={conversation.email} avatar={conversation.avatar} size={30} />
                </div>
                <div className="info">
                  <div className="name">
                    {conversation.name}
                  </div>
                  <div className="email">{conversation.email}</div>
                </div>
              </div>
            ) : null
          }
          {
            conversation.isGroup && roomMembers && roomMembers.map(member => {
              const onClickRemove = () => {
                this.props.removeMember(member);
              };
              const jid = typeof member.jid === 'object' ? member.jid.bare : member.jid;

              const onEditMemberProfile = () => {
                const fn = _.debounce(() => {
                  setTimeout(()=>{
                    if (this.editingMember && member !== this.editingMember) {
                      this.props.exitMemberProfile(this.editingMember);
                    }
                    setTimeout(()=>{
                      this.props.editMemberProfile(member);
                      this.editingMember = member;
                    }, 100);
                  }, 100);

                }, 1000);
                fn();
               return;
              }

              return (
                <div className="row item" key={jid} onClick={onEditMemberProfile}>
                  <div id="avatar">
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
                  {this.currentUserIsOwner && member.affiliation !== 'owner' && <span id="remove-button" onClick={onClickRemove}>
                    <CancelIcon color={primaryColor} />
                  </span>
                  }
                </div>
              )
            })
          }
          {
            conversation.isGroup ? (
              !this.currentUserIsOwner && <div className="row add-to-group">
                <Button onClick={this.exitGroup}>
                  Exit from Group
                </Button>
              </div>
            ) : null
          }
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
