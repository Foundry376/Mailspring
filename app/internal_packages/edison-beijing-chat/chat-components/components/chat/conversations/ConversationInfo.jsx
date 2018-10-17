import React from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';

const ConversationInfo = ({ conversation }) => (
  <div className="infoPanel">
    <ContactAvatar jid={conversation.jid} name={conversation.name}
      email={conversation.email} avatar={conversation.avatar} size={100} />
    {/* <img src='https://s3.us-east-2.amazonaws.com/edison-profile-stag/{conversation.avatar}' width="80" height="80"></img> */}
    <div className="name">{conversation.name}</div>
    <div className="email">{conversation.email}</div>
  </div>
);

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

export default ConversationInfo;
