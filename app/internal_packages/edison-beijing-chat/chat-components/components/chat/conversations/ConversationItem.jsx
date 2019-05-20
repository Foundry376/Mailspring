import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { buildTimeDescriptor } from '../../../utils/time';
import ContactAvatar from '../../common/ContactAvatar';
import GroupChatAvatar from '../../common/GroupChatAvatar';
import Badge from './ConversationBadge';
import chatModel from '../../../store/model';
import messageModel from '../messages/messageModel';
import { clearMessages } from '../../../utils/message';
import { RetinaImg } from 'mailspring-component-kit';
import { getApp, getToken } from '../../../utils/appmgt';

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

  state = {}

  componentWillMount = () => {
    const { conversation } = this.props;
    if (!conversation.jid.match(/@app\.im/)) {
      return
    }
    const userId = conversation.curJid.split('@')[0];
    const appId = conversation.jid.split('@')[0];
    getToken(userId).then (token => {
      getApp(userId, appId, token, (err, app ) => {
        if (!err){
          const state = Object.assign({}, this.state, {appName: app.name});
          this.setState(state);
        }
      });
    })
  }

  onClickRemove = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const { conversation, removeConversation } = this.props;
    clearMessages(conversation).then(() => {
      setTimeout((() => {
        // cxm: it's so weird, it's necessary to add th delay to make the messages history not to come back!
        // but it really works, tested.
        chatModel.store.dispatch({ type: 'DESELECT_CONVERSATION' });
        removeConversation(conversation.jid);
        if (messageModel.imagePopup) {
          messageModel.imagePopup.hide();
        }
      }), 1000)
    })
  }

  render() {
    const { selected, conversation, referenceTime, onClick, removeConversation, ...otherProps } = this.props;
    const timeDescriptor = buildTimeDescriptor(referenceTime);
    return (
      <div className={'item' + (selected ? ' selected' : '')} {...otherProps} style={{ width: '100%' }}>
        <div style={{ width: '100%', display: 'flex' }} onClick={onClick}>
          <div className="avatarWrapper">
            {conversation.isGroup ?
              <GroupChatAvatar conversation={conversation} size={23} /> :
              <ContactAvatar conversation={conversation} jid={conversation.jid} name={conversation.name}
                email={conversation.email} avatar={conversation.avatar} size={23} />
            }
            {!conversation.isHiddenNotification ? <Badge count={conversation.unreadMessages} /> : null}
          </div>
          <div className="content">
            <div className="headerRow">
              <span className="headerText">{this.state.appName || conversation.name}</span>
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
