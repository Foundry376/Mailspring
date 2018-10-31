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
        <div onTouchTap={onTouchTap} style={{ width: '95%' }}>
          < div style={{ display: 'inline-block', height: "48px", width: "48px", fontSize: "24px", borderRadius: "24px",
            background: "rgb(255, 108, 95)", color: "white", overflow: "hidden", textAlign:"center", padding:"5px 0 0 0" }} >
            {conversation.name.slice(0,2).toUpperCase()}
          </div>
          <div className="content" style={{ display: 'inline-block', width:"85%"}}>
            <div className="headerRow" style={{ display: 'inline-block', padding:"0 10px 0 0" }}>
              <span className="headerText">{conversation.name}</span>
            </div>
            <div className="headerRow" style={{ display: 'inline-block' }}>
              <span>{timeDescriptor(conversation.lastMessageTime)}</span>
              <div style={{ display: 'inline-block', color: "blue", marginLeft:"4px"}}>{conversation.unreadMessages}</div>
            </div>
            <div className="subHeader">{conversation.lastMessageText}</div>
           </div>
        </div>
        <span style={{ float: "right" }} onClick={this.onClickRemove}> remove </span>
      </div >
    );
  }
}

<div style="height: 48px; width: 48px; min-width: 48px; min-height: 48px; font-size: 24px; border-radius: 24px; background: rgb(255, 108, 95); color: white; display: flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0;">第</div>
