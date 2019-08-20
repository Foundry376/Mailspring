import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { buildTimeDescriptor } from '../../../utils/time';
import ContactAvatar from '../../common/ContactAvatar';
import GroupChatAvatar from '../../common/GroupChatAvatar';
import Badge from './ConversationBadge';
import { RetinaImg } from 'mailspring-component-kit';
import { getApp, getToken } from '../../../utils/appmgt';
import { ChatActions, MessageStore } from 'chat-exports';

export default class ConversationItem extends PureComponent {

  static propTypes = {
    selected: PropTypes.bool,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string,
      email: PropTypes.string,//.isRequired,
      avatar: PropTypes.string,
      lastMessageText: PropTypes.string.isRequired,
      lastMessageTime: PropTypes.number.isRequired,
    }).isRequired,
    referenceTime: PropTypes.number,
  }

  static defaultProps = {
    selected: false,
    referenceTime: new Date().getTime(),
  }

  state = {}

  componentWillMount = () => {
    const { conversation } = this.props;
    if (!conversation.jid.match(/@app\.im/)) {
      return
    }
    const userId = conversation.curJid.split('@')[0];
    const appId = conversation.jid.split('@')[0];
    getToken(userId).then(token => {
      getApp(userId, appId, token, (err, app) => {
        if (!err && app) {
          const state = Object.assign({}, this.state, { appName: app.name });
          this.setState(state);
        }
      });
    })
  }

  onClickRemove = async (event) => {
    event.stopPropagation();
    event.preventDefault();
    const { conversation } = this.props;
    MessageStore.removeMessagesByConversationJid(conversation.jid);
    ChatActions.deselectConversation();
    ChatActions.removeConversation(conversation.jid);
  }

  render() {
    const { selected, conversation, referenceTime, onClick, ...otherProps } = this.props;
    const timeDescriptor = buildTimeDescriptor(referenceTime);
    const {selectedConversation} = ConversationStore;
    return (
      <div
        onClick={onClick}
        className={'item' + (selected ? ' selected' : '')}
        style={{ width: '100%' }}
        {...otherProps}>
        <div style={{ width: '100%', display: 'flex' }}>
          <div className="avatarWrapper">
            {conversation.isGroup ?
              <GroupChatAvatar conversation={conversation} size={23} /> :
              <ContactAvatar
                conversation={conversation}
                jid={conversation.jid}
                name={conversation.name}
                email={conversation.email} size={23} />
            }
            {/* {!conversation.isHiddenNotification ? <Badge count={conversation.unreadMessages} /> : null} */}
          </div>
          <div className="content">
            <div className="headerRow">
              {(conversation.at && selectedConversation.jid !== conversation.jid)? (<span className='at-me'>[@me]</span>) : null}
              <span className="headerText">{this.state.appName || conversation.name}</span>
              {/* <span className="time">{timeDescriptor(conversation.lastMessageTime)}</span> */}
              <span className="unread-count">
                {!conversation.isHiddenNotification && conversation.unreadMessages ? conversation.unreadMessages : null}
              </span>
            </div>
            <div className="subHeader">
              {
                conversation.isGroup && conversation.lastMessageSenderName && conversation.lastMessageText ?
                  `${conversation.lastMessageSenderName}:` : null
              }
              {conversation.lastMessageText}
            </div>
          </div>
        </div>
        <span className="remove-button" onClick={this.onClickRemove}>
          <RetinaImg name={'close_1.svg'}
            style={{ width: 24, height: 24 }}
            isIcon
            mode={RetinaImg.Mode.ContentIsMask} />
        </span>
      </div >
    );
  }
}
