import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContactAvatar from './ContactAvatar';
import { ChatActions, ConversationStore } from 'chat-exports';

class GroupChatAvatar extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }
  componentDidMount = () => {
    const { conversation } = this.props;
    const { members, avatarMembers } = conversation;
    this.setState({ members, avatarMembers });
    this.unsub = ChatActions.memberChange.listen(this.onMemberChange);
  }
  UNSAFE_componentWillReceiveProps = (nextProps) => {
    const { conversation } = nextProps;
    if (!conversation) {
      return;
    }
    const { members, avatarMembers } = conversation;
    this.setState({ members, avatarMembers });
  }
  componentWillUnmount = () => {
    this.unsub();
  }
  onMemberChange = (jid) => {
    let { conversation } = this.props;
    if (!conversation || jid != conversation.jid) {
      return;
    }
    conversation = ConversationStore.getConversationByJid(jid);
    let { members } = conversation;
    if (members) {
      members = members.slice();
      this.setState({ members });
    }
  }
  render() {
    const { conversation, size } = this.props;
    const { members, avatarMembers } = this.state;
    if (members && members.length === 1) {
      const member = members[0]
      return (<ContactAvatar
        conversation={conversation}
        jid={member.jid}
        name={member.name}
        email={member.email} size={size} />)
    }
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
