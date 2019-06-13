import path from 'path';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
const { Actions } = require('mailspring-exports');

import { remote } from 'electron';
const { dialog } = remote;
import ContactAvatar from '../../common/ContactAvatar';
import { saveGroupMessages } from '../../../utils/db-utils';
import { NEW_CONVERSATION } from '../../../actions/chat';
import MessageImagePopup from './MessageImagePopup';
import Group from './Group';
import SecurePrivate from './SecurePrivate';
import _ from 'underscore';
import { RoomStore, MessageStore, ConversationStore, OnlineUserStore } from 'chat-exports';

const flattenMsgIds = groupedMessages =>
  groupedMessages
    .map(group => group.messages.map(message => message.id))
    .reduce(
      (acc, curr) => {
        curr.forEach(id => acc.add(id));
        return acc;
      }, new Set()
    );
const MESSAGE_COUNTS_EACH_PAGE = 25;
const MAX_COUNTS = 2000;
export default class Messages extends Component {
  static propTypes = {
    currentUserId: PropTypes.string.isRequired,
    referenceTime: PropTypes.number,
    selectedConversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      isGroup: PropTypes.bool.isRequired,
    }),
  }

  static defaultProps = {
    referenceTime: new Date().getTime(),
    selectedConversation: { isGroup: false },
  };

  state = {
    shouldScrollBottom: true,
    progress: {
      savedFiles: [],
      downQueue: [],
      visible: false,
      percent: 0,
    },
    members: [],
    groupedMessages: [],
    shouldDisplayMessageCounts: MESSAGE_COUNTS_EACH_PAGE
  }

  static timer;

  componentWillReceiveProps = async (nextProps, nextState) => {
    const { selectedConversation: currentConv = {} } = this.props;
    const { selectedConversation: nextConv = {} } = nextProps;
    const { jid: currentJid } = currentConv;
    const { jid: nextJid } = nextConv;

    if (currentJid !== nextJid) {
      this.setState({
        shouldScrollBottom: true,
        shouldDisplayMessageCounts: MESSAGE_COUNTS_EACH_PAGE
      });
      await this.getRoomMembers(nextConv);
      return;
    }
    const { groupedMessages: currentMsgs = [] } = this.state;
    const { groupedMessages: nextMsgs = [] } = nextState;
    const currentIds = flattenMsgIds(currentMsgs);
    const nextIds = flattenMsgIds(nextMsgs);
    const areNewMessages = currentIds.size < nextIds.size;

    this.setState({
      shouldScrollBottom: areNewMessages,
    });
    return true;
  }

  getRoomMembers = async (conv) => {
    if (conv.isGroup) {
      const members = await RoomStore.getRoomMembers(conv.jid, conv.curJid);
      this.setState({ members });
    }
  }

  componentDidMount = async () => {
    this._listenToStore();
    const { selectedConversation: conv = {} } = this.props;
    await this.getRoomMembers(conv);
    this._onDataChanged('message');
  }

  _listenToStore = () => {
    this._unsubs = [];
    this._unsubs.push(MessageStore.listen(() => this._onDataChanged('message')));
  }

  _onDataChanged = async (changedDataName) => {
    if (changedDataName === 'message') {
      let groupedMessages = [];
      const selectedConversation = await ConversationStore.getSelectedConversation();
      if (selectedConversation) {
        groupedMessages = await MessageStore.getGroupedMessages(selectedConversation.jid);
        const { groupedMessages: currentMsgs = [] } = this.state;
        const currentIds = flattenMsgIds(currentMsgs);
        const nextIds = flattenMsgIds(groupedMessages);
        const areNewMessages = currentIds.size < nextIds.size;
        this.setState({
          groupedMessages,
          shouldScrollBottom: areNewMessages,
        });
      }
    }
  }

  componentDidUpdate = async () => {
    if (this.state.shouldScrollBottom) {
      this.scrollToMessagesBottom();
    }
  }
  componentWillUnmount() {
    for (const unsub of this._unsubs) {
      unsub();
    };
    const {
      groupedMessages
    } = this.state;
    saveGroupMessages(groupedMessages);
  }

  messagesTopBar = null;
  messagesPanel = null;
  messagePanelEnd = null;

  scrollToMessagesBottom() {
    if (this.messagePanelEnd) {
      // this.messagePanelEnd.scrollIntoView({ behavior: 'smooth' });
      // dom render spend some time, so add a timeout here.
      setTimeout(() => {
        this.messagePanelEnd.scrollIntoView();
      }, 100)
      this.setState({ shouldScrollBottom: false });
    }
  }

  getContactInfoByJid = jid => {
    const { members } = this.state;
    const { selectedConversation } = this.props;
    if (selectedConversation.isGroup && members && members.length > 0) {
      for (const member of members) {
        const memberJid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
        if (memberJid === jid) {
          return member;
        }
      }
    }

    // get self User info
    const self = OnlineUserStore.getSelfAccountById(jid);
    if (self) {
      return {
        jid,
        name: self['name'],
        email: self['email'],
      }
    }

    const { jid: convJid, name, email } = selectedConversation;
    if (convJid === jid) {
      return { jid, name, email };
    }
    return { jid, name: '', email: '' };
  }

  getContactAvatar = member => {
    if (member) {
      const memberJid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
      return (
        <ContactAvatar jid={memberJid} name={member.name} conversation={this.props.selectedConversation}
          email={member.email} avatar={member.avatar} size={32} />
      )
    }
    return null;
  }
  calcTimeLabel = _.throttle(() => {
    if (!this.messagesPanel) {
      return;
    }
    const scrollTop = this.messagesPanel.scrollTop;
    if (!this.messagesTopBar) {
      this.messagesTopBar = document.querySelector('.messages-top-bar');
    }
    if (this.messagesTopBar) {
      if (scrollTop > 0) {
        if (this.messagesTopBar.className.indexOf('has-shadow') === -1) {
          this.messagesTopBar.className += ' has-shadow';
        }
      } else {
        this.messagesTopBar.className = this.messagesTopBar.className.replace(' has-shadow', '');
      }
    }
    const messageGroups = this.messagesPanel.children;
    for (const msgGrp of messageGroups) {
      if (msgGrp.className.indexOf('message-group') !== -1) {
        if (msgGrp.offsetTop - 50 < scrollTop && scrollTop < msgGrp.offsetTop + msgGrp.offsetHeight - 70) {
          msgGrp.className = 'message-group time-label-fix';
        } else {
          msgGrp.className = 'message-group';
        }
      }
    }
    if (scrollTop < 600) {
      const counts = this.state.shouldDisplayMessageCounts + MESSAGE_COUNTS_EACH_PAGE;
      this.setState({
        shouldDisplayMessageCounts: counts > MAX_COUNTS ? MAX_COUNTS : counts
      });
    }
  }, 30);

  download = (msgBody) => {
    event.stopPropagation();
    event.preventDefault();
    const fileName = msgBody.path ? path.basename(msgBody.path) : '';
    let pathForSave = dialog.showSaveDialog({ title: `download file`, defaultPath: fileName });
    if (!pathForSave || typeof pathForSave !== 'string') {
      return;
    }
    const loadConfig = {
      msgBody,
      filepath: pathForSave,
      type: 'download'
    }
    const { queueLoadMessage } = this.props;
    queueLoadMessage(loadConfig);
  };

  render() {
    const {
      selectedConversation: { jid },
    } = this.props;
    const { groupedMessages, members, shouldDisplayMessageCounts } = this.state;
    groupedMessages.map(group => group.messages.map(message => {
      members.map(member => {
        const jid = member.jid.bare || member.jid;
        if (jid === message.sender) {
          message.senderNickname = member.nickname || message.senderNickname;
        }
      });
    }));
    if (jid === NEW_CONVERSATION) {
      return null;
    }

    return (
      <div
        className="messages"
        ref={element => { this.messagesPanel = element; }}
        onKeyDown={this.onKeyDown}
        onScroll={this.calcTimeLabel}
        tabIndex="0"
      >
        <SecurePrivate />
        {groupedMessages.map((group) => (
          <Group
            conversation={this.props.selectedConversation}
            group={group}
            queueLoadMessage={this.props.queueLoadMessage}
            onMessageSubmitted={this.props.onMessageSubmitted}
            getContactInfoByJid={this.getContactInfoByJid}
            members={this.state.members}
            shouldDisplayMessageCounts={shouldDisplayMessageCounts}
            key={group.time}>
          </Group>
        ))
        }
        <MessageImagePopup
          {...this.props}
          groupedMessages={groupedMessages}
          getContactInfoByJid={this.getContactInfoByJid}
          getContactAvatar={this.getContactAvatar}
        />
        <div ref={element => { this.messagePanelEnd = element; }} />
      </div>
    );
  }
}
