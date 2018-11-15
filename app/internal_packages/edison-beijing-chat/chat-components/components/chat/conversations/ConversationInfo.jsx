import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import xmpp from '../../../xmpp';

export default class ConversationInfo extends Component {
  constructor() {
    super()
    this.state = { members: [] };
  }

  componentDidMount() {
    const me = this;
    const { conversation, isGroup } = this.props;
    if (isGroup) {
      xmpp.getRoomMembers(conversation.jid).then((result) => {
        const members = result.mucAdmin.items;
        me.setState({ members });
      });
    }
  }

  render = () => {
    const { conversation } = this.props;
    return (
      <div className="infoPanel" style={{ overflowY: "scroll" }}>
        <ContactAvatar jid={conversation.jid} name={conversation.name}
          email={conversation.email} avatar={conversation.avatar} size={100} />
        <div className="name">{conversation.name}</div>
        <div className="email">{conversation.email}</div>
        {
          this.state.members.map(member => {
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
