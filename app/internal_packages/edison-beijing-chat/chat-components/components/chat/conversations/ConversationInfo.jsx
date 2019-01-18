import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import getDb from '../../../db';
import chatModel from '../../../store/model';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../utils/colors';
import { remote } from 'electron';
import { clearMessages } from '../../../utils/message';

const { primaryColor } = theme;


export default class ConversationInfo extends Component {
  static timer;
  constructor(props) {
    super();
    this.state = {
      visible: false,
      isHiddenNotifi: props.conversation && !!props.conversation.isHiddenNotification
    }
  }

  componentDidMount = () => {
    this.props.getRoomMembers();
  }

  componentWillReceiveProps = (nextProps) => {
    if (!this.props.conversation || nextProps.conversation.jid !== this.props.conversation.jid) {
      this.props.getRoomMembers();
      this.setState({
        isHiddenNotifi: nextProps.conversation && !!nextProps.conversation.isHiddenNotification
      })
    }
  }

  clearMessages = () => {
    clearMessages(this.props.conversation);
    return;
  }

  hiddenNotifi = () => {
    const isHidden = !this.props.conversation.isHiddenNotification;
    this.props.conversation.update({
      $set: {
        isHiddenNotification: isHidden
      }
    })
    this.setState({
      isHiddenNotifi: isHidden
    })
  }

  exitGroup = () => {
    const { conversation } = this.props;
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
    const { conversation, members } = this.props;
    for (let member of members) {
      if (member.affiliation === 'owner' && member.jid.bare === conversation.curJid) {
        this.currentUserIsOwner = true;
        break;
      }
    }
    members.sort((a, b) => a.affiliation > b.affiliation);
    return (
      <div className="info-panel">
        <div className="member-management">
          <div className="member-count">{conversation.isGroup ? members.length + "People" : ""}</div>
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
            conversation.isGroup && members && members.map(member => {
              const onClickRemove = () => {
                this.props.removeMember(member);
              };

              return (
                <div className="row item" key={member.jid.bare}>
                  <div id="avatar">
                    <ContactAvatar jid={member.jid.bare} name={member.name}
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
  conversation: PropTypes.shape({
    jid: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    email: PropTypes.string,//.isRequired,
    avatar: PropTypes.string,
    isGroup: PropTypes.bool.isRequired,
    occupants: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
};
