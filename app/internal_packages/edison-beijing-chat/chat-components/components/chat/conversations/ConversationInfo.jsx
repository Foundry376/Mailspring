import React from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';

const ConversationInfo = ({ conversation }) => (
  <div className="infoPanel">
    <ContactAvatar jid={conversation.jid} name={conversation.name} size={100} />
    <div className="name">{conversation.name}</div>
  </div>
);

ConversationInfo.propTypes = {
  conversation: PropTypes.shape({
    jid: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    isGroup: PropTypes.bool.isRequired,
    occupants: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
};

export default ConversationInfo;
