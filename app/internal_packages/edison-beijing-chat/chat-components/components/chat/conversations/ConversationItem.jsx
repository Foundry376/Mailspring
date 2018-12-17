import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { buildTimeDescriptor } from '../../../utils/time';
import ContactAvatar from '../../common/ContactAvatar';
import Badge from './ConversationBadge';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../utils/colors';
import chatModel from '../../../store/model';
import getDb from '../../../db';
import { copyRxdbConversation } from '../../../utils/db-utils';
import { DESELECT_CONVERSATION } from '../../../actions/chat';


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
    chatModel.store.dispatch({ type: 'DESELECT_CONVERSATION' });
  }

  render() {
    const { selected, conversation, referenceTime, onTouchTap, removeConversation, ...otherProps } = this.props;
    const timeDescriptor = buildTimeDescriptor(referenceTime);
    return (
      <div className={'item' + (selected ? ' selected' : '')} {...otherProps} style={{ width: '100%' }}>
        <div style={{ width: '100%', display: 'flex' }} onTouchTap={onTouchTap}>
          <div className="avatarWrapper">
            <ContactAvatar jid={conversation.jid} name={conversation.name}
              email={conversation.email} avatar={conversation.avatar} size={26} />
            <Badge count={conversation.unreadMessages} />
          </div>
          <div className="content">
            <div className="headerRow">
              <span className="headerText">{conversation.name}</span>
              {/* <span className="time">{timeDescriptor(conversation.lastMessageTime)}</span> */}
            </div>
            <div className="subHeader">
              {conversation.at ? (<span style={{ color: 'red' }}>[@me]</span>) : null}
              {/* {conversation.lastMessageText} */}
            </div>
          </div>
        </div>
        <span id="remove-button" onClick={this.onClickRemove}> <CancelIcon color={primaryColor} /> </span>
      </div >
    );
  }
}
