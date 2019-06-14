import React, { Component } from 'react';
import ContactAvatar from '../../common/ContactAvatar';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../../utils/colors';

const { primaryColor } = theme;


export default class InfoMember extends Component {
  currentUserIsOwner = false;
  constructor(props) {
    super();
    this.state = {
      visible: false,
      isHiddenNotifi: props.selectedConversation && !!props.selectedConversation.isHiddenNotification
    }
  }

  onClickRemove = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const {member} = this.props;
    this.props.removeMember(member);
  };

  editProfile = () => {
    const {member} = this.props;
    this.props.editProfile(member);
  };

  render = () => {
    const { conversation, member } = this.props;
    let name = member.name;
    const email = member.email || member.jid.unescapedLocal.replace('^at^', '@');
    if (!name) {
      name = email.split('@')[0];
    }

    const jid = typeof member.jid === 'object' ? member.jid.bare : member.jid;

    return (<div className="row" key={jid} onClick={this.editProfile}>
        <div className="avatar">
          <ContactAvatar conversation={conversation} jid={jid} name={name}
            email={ email } avatar={member.avatar} size={30} />
        </div>
        <div className="info">
          <div className="name">
            { name }
            {member.affiliation === 'owner' ? <span> (owner)</span> : null}
          </div>
          <div className="email">{email}</div>
        </div>
        {this.props.currentUserIsOwner && member.affiliation !== 'owner' &&
          <span className="remove-member" onClick={this.onClickRemove}>
            <CancelIcon color={primaryColor} />
          </span>
        }
      </div>)
   };
}
