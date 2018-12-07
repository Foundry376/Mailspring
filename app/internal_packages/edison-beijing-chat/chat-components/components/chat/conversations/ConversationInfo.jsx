import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import Button from '../../common/Button';
import getDb from '../../../db';

export default class ConversationInfo extends Component {
  constructor() {
    super();
  }

  componentDidMount = () => {
    this.props.getRoomMembers();
  }

  componentWillReceiveProps = (nextProps) => {
    if (!this.props.conversation || nextProps.conversation.jid !== this.props.conversation.jid) {
      this.props.getRoomMembers();
    }
  }

  clearMessages = () => {
    (getDb()).then(db => {
      db.messages
        .find()
        .where('conversationJid')
        .eq(this.props.conversation.jid)
        .remove()
        .then(conv => {
          console.log('*****conv', conv);
        }).catch((error) => {
          console.warn('remove message error', error);
        })
    });
  }

  render = () => {
    const { conversation, members } = this.props;
    members.sort((a, b) => a.affiliation > b.affiliation);
    return (
      <div className="info-panel">
        {
          !conversation.isGroup ? (
            <div className="row">
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
            return (
              <div className="row" key={member.jid.bare}>
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
