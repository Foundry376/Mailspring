import React, { Component } from 'react';
import PropTypes from 'prop-types';
import TopBar from '../../common/TopBar';
import ContactAvatar from '../../common/ContactAvatar';
import xmpp from '../../../xmpp';
import GroupChatAvatar from '../../common/GroupChatAvatar';
import ThreadSearchBar from '../../../../../thread-search/lib/thread-search-bar';

export default class MessagesTopBar extends Component {
  static propTypes = {
    onInfoPressed: PropTypes.func,
    selectedConversation: PropTypes.shape({
      isGroup: PropTypes.bool.isRequired,
      jid: PropTypes.string.isRequired,
      name: PropTypes.string,//.isRequired,
      email: PropTypes.string,//.isRequired,
      avatar: PropTypes.string,
      occupants: PropTypes.arrayOf(PropTypes.string).isRequired,
    }),
  }
  static defaultProps = {
    onInfoPressed: () => { },
    selectedConversation: null,
  }
  constructor(props) {
    super(props);
  }
  _onkeyDown = (e) => {
    if (e.keyCode === 13) {
      e.currentTarget.blur();
      this.saveRoomName(e.currentTarget.innerText);
      e.preventDefault();
    }
  }

  _onBlur = (e) => {
    this.saveRoomName(e.currentTarget.innerText);
  }

  async saveRoomName(name) {
    const { selectedConversation } = this.props;
    if (name && name !== selectedConversation.name) {
      await xmpp.setRoomName(selectedConversation.jid, {
        name
      }, selectedConversation.curJid)
    }
  }

  render() {
    const {
      selectedConversation: conversation,
      onInfoPressed
    } = this.props;

    return (
      <div>
        <TopBar
          className="messages-top-bar"
          left={
            <div className='conv-name'>
              <div
                contentEditable={conversation.isGroup}
                dangerouslySetInnerHTML={{ __html: conversation.name }}
                onKeyDown={this._onkeyDown}
                onBlur={this._onBlur}
                spellCheck="false"
                className="conversationName">
              </div>
              {
                conversation.isGroup && (
                  <span className="dt-icon-pencil conv-pencil"></span>
                )
              }
            </div>
          }
          right={
            <div className="avatar-search">
              <div id="open-info" onClick={() => onInfoPressed()}>
                {conversation.isGroup ?
                  <GroupChatAvatar conversation={conversation} size={35} /> :
                  <ContactAvatar conversation={conversation} jid={conversation.jid} name={conversation.name}
                    email={conversation.email} avatar={conversation.avatar} size={35} />
                }
              </div>
              <ThreadSearchBar />
            </div>
          }
        />
      </div>
    );
  }
}
