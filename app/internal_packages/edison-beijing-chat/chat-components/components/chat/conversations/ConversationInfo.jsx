import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import xmpp from '../../../xmpp';

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

  render = () => {
    const { conversation, members } = this.props;
    return (
      <div className="info-panel">
        <ContactAvatar jid={conversation.jid} name={conversation.name}
          email={conversation.email} avatar={conversation.avatar} size={100} />
        <div className="name">{conversation.name}</div>
        <div className="email">{conversation.email}</div>
        {
          conversation.isGroup && members && members.map(member => {
            return (
              <div className="email" key={member.jid.bare}>
                {member.name}:{member.email}
                {member.affiliation === 'owner' ? <span>⭐️</span> : null}
              </div>
            )
          })
        }
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
