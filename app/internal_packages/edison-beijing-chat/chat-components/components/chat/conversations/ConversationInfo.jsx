import React, {Component} from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from '../../common/ContactAvatar';
import xmpp from '../../../xmpp';

export default class ConversationInfo extends Component {
  constructor() {
    super()
    this.state = { members: []};
  }

  componentDidMount() {
    const me = this;
    const { conversation } = this.props;
    xmpp.getRoomMembers(conversation.jid).then((result) => {
      const members = result.mucAdmin.items;
      me.setState({ members });
    });
  }

  render = () => {
    const { conversation } = this.props;

    return <div className="infoPanel" style={{overflowY:"scroll"}}>
      <ContactAvatar jid={conversation.jid} name={conversation.name}
                     email={conversation.email} avatar={conversation.avatar} size={100}/>
      {/* <img src='https://s3.us-east-2.amazonaws.com/edison-profile-stag/{conversation.avatar}' width="80" height="80"></img> */}
      <div className="name">{conversation.name}</div>
      <div className="email">{conversation.email}</div>
      {
        this.state.members.map(member => {
          return <div  className="email" key={member.jid.bare}> {member.jid.bare}</div>
        })
      }
    </div>

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
