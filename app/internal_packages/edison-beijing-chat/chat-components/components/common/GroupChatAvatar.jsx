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
    const avatarMembers = [];
    let members = await getChatMembersFromDb(conversation.jid);
    members = members.filter(m => m);
    try {
      const result = await xmpp.getRoomMembers(conversation.jid, null, conversation.curJid);
      members = members.concat(result.mucAdmin.items);
    } catch (e) { }
    console.log('conversationJid members:', members);
    const db = await getDb();
    const messages = await db.messages.find().where('conversationJid').eq(conversation.jid).exec();
    messages.sort((a, b) => a.sentTime - b.sentTime);
    try {
      const groupedMessages = await groupMessages(messages);
      if (groupedMessages.length >= 2) {
        // last two message senders
        let i = groupedMessages.length - 1;
        let sender = groupedMessages[i].sender
        let member = getContactInfo(sender, members);
        avatarMembers.push(member);
        i--;
        sender = groupedMessages[i].sender;
        member = getContactInfo(sender, members);
        avatarMembers.push(member);
      } else if (groupedMessages.length == 1) {
        // last sender + group chat owner
        let i = 0;
        let sender = groupedMessages[i].sender;
        let member = getContactInfo(sender, members);
        avatarMembers.push(member);
        member = findGroupChatOwner(members);
        avatarMembers.push(member);
      } else {
        // group chat owner + anyone other(first or second member)
        let member = findGroupChatOwner(members);
        avatarMembers.push(member);
        if (members[0] !== member) {
          avatarMembers.push(members[0]);
        } else if (members.length > 1) {
          avatarMembers.push(members[1]);
        }
      }
    } catch (err) {
      // group chat owner + anyone other(first or second member)
      let member = findGroupChatOwner(members);
      avatarMembers.push(member);
      if (members[0] !== member) {
        avatarMembers.push(members[0]);
      } else if (members.length > 1) {
        avatarMembers.push(members[1]);
      }
    }
    this.setState({
      avatarMembers
    })
  }
  render() {
    const { avatarMembers } = this.state;
    return (
      <div className="groupAvatar">
        {
          avatarMembers.map(item => {
            item = item || {};
            return (<ContactAvatar
              key={item.jid && item.jid.bare || item.jid || ''}
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
