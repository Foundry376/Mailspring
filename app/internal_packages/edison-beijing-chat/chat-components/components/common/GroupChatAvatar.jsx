import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { gradientColorForString } from '../../utils/colors';
import { getavatar } from '../../utils/restjs';
import getDb from '../../db';
import xmpp from '../../xmpp/index';
import { getContactInfo, findGroupChatOwner } from '../../utils/contact-utils';
import { groupMessages } from '../../utils/message';
import ContactAvatar from './ContactAvatar'

const getInitials = name => {
  const trimmedName = name ? name.trim() : '';
  const nameParts = trimmedName.split(' ');
  if (!nameParts.length) {
    return '';
  }
  let initials = nameParts[0].charAt(0);
  if (nameParts.length > 1) {
    initials += nameParts[nameParts.length - 1].charAt(0);
  }
  return initials;
};



class GroupChatAvatar extends Component {
  constructor(props) {
    super(props);
    this.state = {}
  }
  isOnline = () => {
    const { availableUsers, jid } = this.props;
    return availableUsers && availableUsers.indexOf(jid) >= 0 ? 'online' : 'offline';
  }

  getAvatars = (member, index) => {
    if (member.email && !member.avatar) {
      getavatar(member.email, (error, data, res) => {
        if (!res) {
          return;
        } else if (res.statusCode >= 400) {
          return;
        } else if (res.statusCode === 302) {
          const img = new Image();
          img.src = res.headers.location;
          img.onload = () => {
            this.setState({
              ['avatar' + (index + 1)]: `url("${res.headers.location}") center center / cover`,
              ['isImgExist' + (index + 1)]: true
            })
          }
          img.onerror = () => {
            S
            console.warn(`avatar not exists. jid:${this.props.jid}`);
          }
          return;
        }
        this.setState({
          ['avatar' + (index + 1)]: `url("${res.headers.location}") center center / cover`,
          ['isImgExist' + (index + 1)]: true
        })
      })
    }
  }

  componentWillMount = () => {
    const { conversation } = this.props;
    console.log('ConversationItem componentWillMount 1:', conversation);
    if (!conversation.isGroup) {
      return;
    }
    this.avatarMembers = [];
    console.log('ConversationItem componentWillMount 2:', this.avatarMembers);
    xmpp.getRoomMembers(conversation.jid, null, conversation.curJid).then((result) => {
      const members = result.mucAdmin.items;
      console.log('conversationJid members:', members);
      getDb().then(db => {
        db.messages.find().where('conversationJid').eq(conversation.jid).exec().then(messages => {
          messages.sort((a, b) => a.sentTime - b.sentTime);
          groupMessages(messages).then(groupedMessages => {
            console.log('conversationJid groupedMessages:', groupedMessages, members);
            if (groupedMessages.length >= 2) {
              // last two message senders
              let i = groupedMessages.length - 1;
              let sender = groupedMessages[i].sender
              let member = getContactInfo(sender, members);
              this.avatarMembers.push(member);
              i--;
              sender = groupedMessages[i].sender
              member = getContactInfo(sender, members);
              this.avatarMembers.push(member);
            } else if (groupedMessages.length == 1) {
              // last sender + group chat owner
              let i = 0;
              let sender = groupedMessages[i].sender;
              let member = getContactInfo(sender, members);
              this.avatarMembers.push(member);
              member = findGroupChatOwner(members);
              this.avatarMembers.push(member);
            } else {
              // group chat owner + anyone other(first or second member)
              let member = findGroupChatOwner(members);
              this.avatarMembers.push(member);
              if (members[0] !== member) {
                this.avatarMembers.push(members[0]);
              } else if (members.length > 1) {
                this.avatarMembers.push(members[1]);
              }
            }
            this.getAvatars(this.avatarMembers[0], 0);
            this.getAvatars(this.avatarMembers[1], 1);
          });
        }).catch(() => {
          // group chat owner + anyone other(first or second member)
          console.log('no groupedMessages got catch:', members);
          let member = findGroupChatOwner(members);
          this.avatarMembers.push(member);
          if (members[0] !== member) {
            this.avatarMembers.push(members[0]);
          } else if (members.length > 1) {
            this.avatarMembers.push(members[1]);
          }
          this.getAvatars(this.avatarMembers[0], 0);
          this.getAvatars(this.avatarMembers[1], 1);
        })
      })
    })
  }
  render() {
    const { size = 48, conversation } = this.props;
    console.log('***this.avatarMembers', this.avatarMembers);
    const name1 = this.avatarMembers[0] && this.avatarMembers[0].name;
    const name2 = this.avatarMembers[1] && this.avatarMembers[1].name;
    console.log('GroupChatAvatar.render name:', name);
    const { avatar1, isImgExist1, avatar2, isImgExist2, } = this.state;
    const isGroup = conversation && conversation.isGroup;
    return (
      <div className="groupAvatar">
        {this.avatarMembers && this.avatarMembers.length >= 1 ? (
          <ContactAvatar jid={this.avatarMembers[0].jid.bare} name={name1} email={this.avatarMembers[0].email} size={30} />
        ) : null}
        {this.avatarMembers && this.avatarMembers.length >= 2 ? (
          <ContactAvatar jid={this.avatarMembers[0].jid.bare} name={name2} email={this.avatarMembers[0].email} size={30} />
        ) : null}
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
