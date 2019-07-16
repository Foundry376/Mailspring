import React, { Component } from 'react';
import PropTypes from 'prop-types';
import TopBar from '../../common/TopBar';
import ContactAvatar from '../../common/ContactAvatar';
import xmpp from '../../../xmpp';
import GroupChatAvatar from '../../common/GroupChatAvatar';
import ThreadSearchBar from '../../../../thread-search/lib/thread-search-bar';
import { ConversationStore } from 'chat-exports';
import { remote } from 'electron';
const dialog = remote.dialog;

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
  static inputEl;
  constructor(props) {
    super(props);
    this.state = {
      conversationName: this.props.selectedConversation.name
    }
  }
  componentWillReceiveProps(nextProps) {
    if (!this.props.selectedConversation
      || this.props.selectedConversation.jid !== nextProps.selectedConversation.jid) {
      this.setState({
        conversationName: nextProps.selectedConversation.name
      });
    }
  }

  _onkeyDown = (e) => {
    if (e.keyCode === 13) {
      e.currentTarget.blur();
      // this.saveRoomName(e.currentTarget.innerText);
      e.preventDefault();
    }
    else if (e.keyCode === 27) {
      this.setState({
        conversationName: this.props.selectedConversation.name
      });
      // waiting for rendering over
      setTimeout(() => {
        this.inputEl.blur();
      }, 20);
      e.preventDefault();
    }
  }

  _onBlur = (e) => {
    const { conversationName } = this.state;
    if (conversationName === this.props.selectedConversation.name) {
      return;
    }
    if (!conversationName.trim()) {
      dialog.showMessageBox({
        type: 'warning',
        message: 'Group name should NOT be empty or blank.',
        buttons: ['OK'],
      });
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
                    ref={el => this.inputEl = el}
                    value={conversationName}
                    onChange={this._onChange}
                    onKeyDown={this._onkeyDown}
                    onBlur={this._onBlur}
                    maxLength="32"
                  />
                )}
              </div>
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
