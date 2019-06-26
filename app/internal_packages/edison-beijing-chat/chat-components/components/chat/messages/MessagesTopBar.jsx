import React, { Component } from 'react';
import PropTypes from 'prop-types';
import TopBar from '../../common/TopBar';
import ContactAvatar from '../../common/ContactAvatar';
import xmpp from '../../../../xmpp';
import GroupChatAvatar from '../../common/GroupChatAvatar';
import ThreadSearchBar from '../../../../../thread-search/lib/thread-search-bar';
import { ConversationStore } from 'chat-exports';

export default class MessagesTopBar extends Component {
  static propTypes = {
    onInfoPressed: PropTypes.func,
    selectedConversation: PropTypes.shape({
      isGroup: PropTypes.bool.isRequired,
      jid: PropTypes.string.isRequired,
      name: PropTypes.string,//.isRequired,
      email: PropTypes.string,//.isRequired,
      avatar: PropTypes.string,
    }),
  }
  static defaultProps = {
    onInfoPressed: () => { },
    selectedConversation: null,
  }
  constructor(props) {
    super(props);
    this.state = {
      conversationName: this.props.selectedConversation.name
    }
  }
  componentWillReceiveProps(nextProps) {
    this.setState({
      conversationName: nextProps.selectedConversation.name
    });
  }

  _onkeyDown = (e) => {
    if (e.keyCode === 13) {
      e.currentTarget.blur();
      // this.saveRoomName(e.currentTarget.innerText);
      e.preventDefault();
    }
  }

  _onBlur = (e) => {
    const { conversationName } = this.state;
    if (!conversationName.trim()) {
      window.alert(' Group name should NOT be empty or blank.');
      // this.forceUpdate();
      const { selectedConversation } = this.props;
      this.setState({
        conversationName: selectedConversation.name
      })
      return
    }
    this.saveRoomName(conversationName);
  }

  async saveRoomName(name) {
    const { selectedConversation } = this.props;
    if (name && name !== selectedConversation.name) {
      ConversationStore.saveConversationName(name);
      await xmpp.setRoomName(selectedConversation.jid, {
        name
      }, selectedConversation.curJid);
    }
  }

  _onChange = (e) => {
    this.setState({
      conversationName: e.target.value
    })
  }

  render() {
    const {
      selectedConversation: conversation,
      onInfoPressed
    } = this.props;
    const { conversationName } = this.state;

    return (
      <div>
        <TopBar
          className="messages-top-bar"
          left={
            <div className='conv-name'>
              <div className="conversation-name">
                {conversationName}
                {conversation.isGroup && (
                  <input
                    type="text"
                    value={conversationName}
                    onChange={this._onChange}
                    onKeyDown={this._onkeyDown}
                    onBlur={this._onBlur}
                    maxLength="32"
                  />
                )}
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
