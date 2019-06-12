import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from './ContactAvatar';

class GroupChatAvatar extends Component {
  constructor(props) {
    super(props);
  }
  render() {
    const { conversation: { avatarMembers } } = this.props;
    if (!avatarMembers) {
      return null;
    }
    return (
      <div className="groupAvatar">
        {
          avatarMembers && avatarMembers.map((item, index) => {
            item = item || {};
            return (<ContactAvatar
              key={(item.jid && item.jid.bare || item.jid || '') + index}
              conversation={this.props.conversation}
              jid={item.jid && item.jid.bare || item.jid || ''}
              name={item && item.name || ''}
              email={item.email || ''}
              size={index === 0 ? 35 : 20}
            />)
          })
        }
      </div>
    )
  }
}

GroupChatAvatar.propTypes = {
  conversation: PropTypes.object.isRequired
};

GroupChatAvatar.defaultProps = {
  size: 48,
};

export default GroupChatAvatar;
