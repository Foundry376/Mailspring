import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { buildTimeDescriptor } from '../../../utils/time';
import ContactAvatar from '../../common/ContactAvatar';
import GroupChatAvatar from '../../common/GroupChatAvatar';
import Badge from './ConversationBadge';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../utils/colors';
import chatModel from '../../../store/model';
import { DESELECT_CONVERSATION, SELECT_CONVERSATION } from '../../../actions/chat';
import messageModel from '../messages/messageModel';


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

  componentWillMount() {
  }

  onClickRemove = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const { conversation, removeConversation } = this.props;
    removeConversation(conversation.jid);
    if (messageModel.imagePopup) {
      messageModel.imagePopup.hidden = true;
      messageModel.imagePopup.update();
    }
    chatModel.store.dispatch({ type: 'DESELECT_CONVERSATION' });
  }

  render() {
    const { selected, conversation, referenceTime, onTouchTap, removeConversation, ...otherProps } = this.props;
    const timeDescriptor = buildTimeDescriptor(referenceTime);
    return (
      <div className={'item' + (selected ? ' selected' : '')} {...otherProps} style={{ width: '100%' }}>
        <div style={{ width: '100%', display: 'flex' }} onTouchTap={onTouchTap}>
          <div className="avatarWrapper">
            {conversation.isGroup ?
              <GroupChatAvatar conversation={conversation} size={26} /> :
              <ContactAvatar conversation={conversation} jid={conversation.jid} name={conversation.name}
                email={conversation.email} avatar={conversation.avatar} size={26} />
            }
            {!conversation.isHiddenNotification ? <Badge count={conversation.unreadMessages} /> : null}
          </div>
          <div className="content">
            <div className="headerRow">
              <span className="headerText">{conversation.name}</span>
              <span className="time">{timeDescriptor(conversation.lastMessageTime)}</span>
            </div>
            <div className="subHeader">
              {conversation.at ? (<span style={{ color: 'red' }}>[@me]</span>) : null}
              {
                conversation.isGroup && conversation.lastMessageSenderName && conversation.lastMessageText ?
                  `${conversation.lastMessageSenderName}:` : null
              }
              {conversation.lastMessageText}
            </div>
          </div>
        </div>
        <span id="remove-button" onClick={this.onClickRemove}> <CancelIcon color={primaryColor} /> </span>
      </div >
    );
  }
}
