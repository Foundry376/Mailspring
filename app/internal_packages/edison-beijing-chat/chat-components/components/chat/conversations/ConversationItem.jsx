import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { buildTimeDescriptor } from '../../../utils/time';
import ContactAvatar from '../../common/ContactAvatar';
import Badge from './ConversationBadge';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../utils/colors';

const { primaryColor } = theme;


export default class ConversationItem extends PureComponent {

  static propTypes = {
    selected: PropTypes.bool,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,//.isRequired,
      avatar: PropTypes.string,
      lastMessageText: PropTypes.string.isRequired,
      lastMessageTime: PropTypes.number.isRequired,
    }).isRequired,
    referenceTime: PropTypes.number,
    removeConversation: PropTypes.func
  }

  static defaultProps = {
    selected: false,
    referenceTime: new Date().getTime(),
  }

  onClickRemove = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const { conversation, removeConversation } = this.props;
    removeConversation(conversation.jid);
  }

  render() {
    const { selected, conversation, referenceTime, onTouchTap, removeConversation, ...otherProps } = this.props;
    const timeDescriptor = buildTimeDescriptor(referenceTime);
    return (
      <div className={'item' + (selected ? ' selected' : '')} {...otherProps} style={{ width: '100%' }}>
        <div onTouchTap={onTouchTap} style={{ width: '95%' }}>
          <div className="avatarWrapper">
            <ContactAvatar jid={conversation.jid} name={conversation.name}
              email={conversation.email} avatar={conversation.avatar} size={48} />
            <Badge count={conversation.unreadMessages} />
          </div>
          <div className="content" style={{ display: 'inline-block', width: "85%" }}>
            <div className="headerRow" style={{ display: 'inline-block', paddingRight: "10px" }}>
              <span className="headerText">{conversation.name}</span>
            </div>
            <div className="headerRow" style={{ display: 'inline-block' }}>
              <span>{timeDescriptor(conversation.lastMessageTime)}</span>
            </div>
            <div className="subHeader">
              {conversation.at ? (<span style={{ color: 'red' }}>[@me]</span>) : null}
              {conversation.lastMessageText}
            </div>
          </div>
        </div>
        <span id="remove-button" onClick={this.onClickRemove}> <CancelIcon color={primaryColor} /> </span>
      </div >
    );
  }
}
