import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from './ContactAvatar';
import chatModel from '../../store/model';

class GroupChatAvatar extends Component {
  constructor(props) {
    super(props);
    this.state = {
      avatarMembers: []
    }
  }
  componentDidMount() {
    this.refreshAvatar(this.props);
    const groupAvatars = chatModel.groupAvatars;
    groupAvatars.push(this);
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.conversation.jid !== this.props.conversation.jid) {
      this.refreshAvatar(nextProps);
    }
  }
  refreshAvatar = (props) => {
    const { conversation } = props;
    if (!conversation.isGroup) {
      return;
    }
    const avatarMembers = conversation.avatarMembers;
    this.setState({ avatarMembers });
  }
  render() {
    const { avatarMembers } = this.state;
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
