import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import getDb from '../../../db';
import chatModel from '../../../store/model';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../utils/colors';

const { primaryColor } = theme;


export default class ConversationInfo extends Component {
  constructor(props) {
    super();
    this.state = {
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
    (getDb()).then(db => {
      db.messages
        .find()
        .where('conversationJid')
        .eq(this.props.conversation.jid)
        .remove()
        .catch((error) => {
          console.warn('remove message error', error);
        })
    });
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
    xmpp.leaveRoom(conversation.jid, chatModel.currentUser.jid);
    (getDb()).then(db => {
      db.conversations.findOne(conversation.jid).exec().then(conv => {
        conv.remove()
      }).catch((error) => { })
    });
    this.props.deselectConversation();
  }


  render = () => {
    const { conversation, members } = this.props;
    const { isHiddenNotifi } = this.state;
    for (let member of members) {
      if (member.affiliation === 'owner' && member.jid.bare === chatModel.currentUser.jid) {
        this.currentUserIsOwner = true;
      }
    }
    members.sort((a, b) => a.affiliation > b.affiliation);
    return (
      <div className="info-panel">
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
              <div className="row add-to-group">
                <Button onTouchTap={this.props.toggleInvite}>
                  Add to Group
              </Button>
              </div>
            ) : null
          }
          {
            conversation.isGroup ? (
              !this.currentUserIsOwner && <div className="row add-to-group">
                <Button onTouchTap={this.exitGroup}>
                  Exit from Group
              </Button>
              </div>
            ) : null
          }
          <div className="row">
            <label>
              <input type="checkbox" onChange={this.hiddenNotifi} checked={isHiddenNotifi} />
              Hide notifications
            </label>
          </div>
        </div>
        <div className="clear">
          <Button className="clear-message" onTouchTap={this.clearMessages}>
            Clear Message History
          </Button>
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
