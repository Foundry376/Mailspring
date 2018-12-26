import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { getavatar } from '../../utils/restjs';
import getDb from '../../db';
import xmpp from '../../xmpp/index';
import { getContactInfo, findGroupChatOwner, getChatMembersFromDb } from '../../utils/contact-utils';
import { groupMessages } from '../../utils/message';
import ContactAvatar from './ContactAvatar'

class GroupChatAvatar extends Component {
  constructor(props) {
    super(props);
    this.state = {
      avatarMembers: []
    }
  }
  componentDidMount() {
    this.refreshAvatar(this.props);
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.conversation.jid !== this.props.conversation.jid) {
      this.refreshAvatar(nextProps);
    }
  }
  shouldComponentUpdate(nextProps, nextState) {
    if (nextProps.conversation.jid === this.props.conversation.jid
      && nextState.avatarMembers === this.state.avatarMembers) {
      return false;
    }
    return true;
  }
  refreshAvatar = async (props) => {
    const { conversation } = props;
    if (!conversation.isGroup) {
      return;
    }
    const db = await getDb();
    const conv = await db.conversations.findOne().where('jid').eq(conversation.jid).exec();
    const avatarMembers = conv.avatarMembers;
    this.setState({ avatarMembers });
  }
  render() {
    const { avatarMembers } = this.state;
    return (
      <div className="groupAvatar">
        {
          avatarMembers.map((item, index) => {
            item = item || {};
            return (<ContactAvatar
              key={(item.jid && item.jid.bare || item.jid || '') + index}
              conversation={this.props.conversation}
              jid={item.jid && item.jid.bare || item.jid || ''}
              name={item && item.name || ''}
              email={item.email || ''}
              size={30}
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
