import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { buildTimeDescriptor } from '../../../utils/time';
import ContactAvatar from '../../common/ContactAvatar';

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
        <div onTouchTap={onTouchTap} style={{ width: '85%' }}>
          < ContactAvatar name={conversation.name} jid={conversation.jid} style={{ display: 'inline-block' }} />
          <div className="content" style={{ display: 'inline-block' }}>
            <div className="headerRow" style={{ display: 'inline-block' }}>
              <span className="headerText">{conversation.name}</span>
            </div>
            <div className="headerRow" style={{ display: 'inline-block' }}>
              {timeDescriptor(conversation.lastMessageTime)}
            </div>
            <div className="subHeader">{conversation.lastMessageText}</div>
            <span>{conversation.unreadMessages}</span>
          </div>
        </div>
        <span style={{ float: "right" }} onClick={this.onClickRemove}> remove </span>
      </div >
    );
  }
}
