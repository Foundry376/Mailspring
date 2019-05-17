import fs from 'fs';
import path from 'path';
import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import CheckIcon from '../../common/icons/CheckIcon';
import Divider from '../../common/Divider';
import {
  MESSAGE_STATUS_DELIVERED,
  getStatusWeight, MESSAGE_STATUS_UPLOAD_FAILED,
} from '../../../db/schemas/message';
import { colorForString } from '../../../utils/colors';
import {
  dateFormat,
  dateFormatDigit,
  weekDayFormat,
  nearDays,
} from '../../../utils/time';
import { RetinaImg } from 'mailspring-component-kit';
const { Actions, AttachmentStore } = require('mailspring-exports');

import { remote, shell } from 'electron';
const { dialog, Menu, MenuItem } = remote;
import { isJsonString } from '../../../utils/stringUtils';
import ContactAvatar from '../../common/ContactAvatar';
import chatModel from '../../../store/model';
import { saveGroupMessages } from '../../../utils/db-utils';
import { NEW_CONVERSATION } from '../../../actions/chat';
import messageModel, { FILE_TYPE } from './messageModel';
import MessageImagePopup from './MessageImagePopup';
import MessageEditBar from './MessageEditBar';
import Group from './Group';
import MessageApp from './MessageApp';
import MessagePrivateApp from './MessagePrivateApp';
import SecurePrivate from './SecurePrivate';
import _ from 'underscore';

let key = 0;

const isImage = (type) => {
  return type === FILE_TYPE.IMAGE || type === FILE_TYPE.GIF || type === FILE_TYPE.STICKER;
}

const shouldInlineImg = (msgBody) => {
  let path = msgBody.path;
  return isImage(msgBody.type)
    && ((path && path.match(/^https?:\/\//) || fs.existsSync(path && path.replace('file://', ''))));
}
const shouldDisplayFileIcon = (msgBody) => {
  return msgBody.mediaObjectId
    && msgBody.type == FILE_TYPE.OTHER_FILE
    && !isImage(msgBody.type)
}

// The number of pixels away from the bottom to be considered as being at the bottom
const BOTTOM_TOLERANCE = 32;

const flattenMsgIds = groupedMessages =>
  groupedMessages
    .map(group => group.messages.map(message => message.id))
    .reduce(
      (acc, curr) => {
        curr.forEach(id => acc.add(id));
        return acc;
      }, new Set()
    );

export default class Messages extends PureComponent {
  static propTypes = {
    currentUserId: PropTypes.string.isRequired,
    groupedMessages: PropTypes.arrayOf(
      PropTypes.shape({
        // sender: PropTypes.string.isRequired,
        time: PropTypes.string.isRequired,
        messages: PropTypes.arrayOf(
          PropTypes.shape({
            id: PropTypes.string.isRequired,
            conversationJid: PropTypes.string.isRequired,
            sender: PropTypes.string.isRequired,
            body: PropTypes.string.isRequired,
            sentTime: PropTypes.number.isRequired,
            status: PropTypes.string.isRequired,
          })
        ).isRequired
      })
    ).isRequired,
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
  }

  static timer;

  componentWillReceiveProps(nextProps) {
    const { selectedConversation: currentConv = {} } = this.props;
    const { selectedConversation: nextConv = {} } = nextProps;
    const { jid: currentJid } = currentConv;
    const { jid: nextJid } = nextConv;

    if (currentJid !== nextJid) {
      this.setState({ shouldScrollBottom: true });
      return;
    }

    const msgElem = this.messagesPanel;
    const isAtBottom = (msgElem.scrollHeight - msgElem.scrollTop) <
      (msgElem.clientHeight + BOTTOM_TOLERANCE);
    const { currentUserId } = this.props;
    const { groupedMessages: currentMsgs = [] } = this.props;
    const { groupedMessages: nextMsgs = [] } = nextProps;
    const currentIds = flattenMsgIds(currentMsgs);
    const nextIds = flattenMsgIds(nextMsgs);
    const areNewMessages = currentIds.size !== nextIds.size;
    const isLatestSelf = nextMsgs.length > 0 &&
      nextMsgs[nextMsgs.length - 1].sender === currentUserId;

    this.setState({
      shouldScrollBottom: areNewMessages && (isLatestSelf || isAtBottom),
    });
  }
  componentDidMount() {
    this.menu = new Menu()
    let menuItem = new MenuItem({
      label: 'Edit text',
      click: () => {
        chatModel.editingMessageId = this.activeMsg.id;
        this.update();
        this.menu.closePopup();
      }
    });
    this.menu.append(menuItem);
    menuItem = new MenuItem({
      label: 'Delete message',
      click: () => {
        const { selectedConversation, onMessageSubmitted } = this.props;
        const body = this.activeMsgBody;
        body.updating = true;
        body.deleted = true;
        onMessageSubmitted(selectedConversation, JSON.stringify(body), this.activeMsg.id, true);
        this.menu.closePopup();
      }
    });
    this.menu.append(menuItem);

    this.unlisten = Actions.updateDownloadPorgress.listen(this.onUpdataDownloadProgress, this);
  }

  componentDidUpdate() {
    if (this.state.shouldScrollBottom) {
      this.scrollToMessagesBottom();
    }
  }
  componentWillUnmount() {
    this.unlisten();
    const {
      groupedMessages
    } = this.props;
    saveGroupMessages(groupedMessages);
  }

  messagesTopBar = null;
  messagesPanel = null;
  messagePanelEnd = null;

  scrollToMessagesBottom() {
    if (this.messagePanelEnd) {
      // this.messagePanelEnd.scrollIntoView({ behavior: 'smooth' });
      this.messagePanelEnd.scrollIntoView();
      this.setState({ shouldScrollBottom: false });
    }
  }

  onUpdataDownloadProgress = () => {
    key++
    const state = Object.assign({}, this.state, { key });
    this.setState(state);
  }
  getContactInfoByJid = jid => {
    const members = this.props.selectedConversation.roomMembers;
    if (this.props.selectedConversation.isGroup && members && members.length > 0) {
      for (const member of members) {
        const memberJid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
        if (memberJid === jid) {
          return member;
        }
      }
    }

    // get self User info
    const self = chatModel.allSelfUsers[jid];
    if (self) {
      return {
        jid,
        name: self['name'],
        email: self['email'],
      }
    }

    const { jid: convJid, name, email } = this.props.selectedConversation;
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

  openFile(filePath) {
    shell.openItem(filePath);
  }

  onKeyDown = event => {
    let keyCode = event.keyCode;
    if (keyCode === 27) { // ESC
      event.stopPropagation();
      event.preventDefault();
      this.cancelEdit();
    }
  }
  cancelEdit = () => {
    chatModel.editingMessageId = null;
    key++;
    this.setState(Object.assign({}, this.state, { key }));
  }
  update() {
    key++;
    this.setState(Object.assign({}, this.state, { key }));
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
  }, 50);

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

  showPopupMenu = (msg, msgBody) => {
    this.activeMsg = msg;
    this.activeMsgBody = msgBody;
    event.stopPropagation();
    event.preventDefault();
    this.menu.popup({ x: event.clientX, y: event.clientY });
  };

  render() {
    const {
      currentUserId,
      groupedMessages,
      selectedConversation: { isGroup, jid },
    } = this.props;
    console.log('debugger Messages currentUserId:', currentUserId);
    messageModel.currentUserId = currentUserId;
    if (groupedMessages.length) {
      chatModel.groupedMessages = groupedMessages;
    }
    const getMessageClasses = message => {
      const messageStyles = ['message'];
      if (message.sender === currentUserId) {
        messageStyles.push('currentUser');
      } else {
        messageStyles.push('otherUser');
      }
      return messageStyles.join(' ');
    };

    const messageToolbar = (msg, msgBody, isFile) => (
      <div className='message-toolbar' >
        {isFile && (
          <span
            className="download-img"
            title={msgBody.path}
            onClick={() => this.download(msgBody)}
          >
            <RetinaImg name={'download.svg'}
              style={{ width: 24, height: 24 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </span>
        )}
        {msg.sender === currentUserId && (
          <span
            className="inplace-edit-img"
            onClick={() => this.showPopupMenu(msg, msgBody)}
            onContextMenu={() => this.showPopupMenu(msg, msgBody)}
          >
            <RetinaImg name={'expand-more.svg'}
              style={{ width: 26, height: 26 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </span>
        )}
      </div>
    )

    return (
      <div
        className="messages"
        ref={element => { this.messagesPanel = element; }}
        onKeyDown={this.onKeyDown}
        onScroll={this.calcTimeLabel}
        tabIndex="0"
      >
        <SecurePrivate />
        { jid !== NEW_CONVERSATION && groupedMessages.map((group, idx) => {
          return (
            <Group conversation={this.props.selectedConversation}
                   group={group}
                   queueLoadMessage={this.props.queueLoadMessage}
                   onMessageSubmitted={this.props.onMessageSubmitted}
                   key={idx}>
            </Group>
          );
         })
        }
        <MessageImagePopup
          {...this.props}
          getContactInfoByJid={this.getContactInfoByJid}
          getContactAvatar={this.getContactAvatar}
        />
        <div ref={element => { this.messagePanelEnd = element; }} />
      </div>
    );
  }
}
