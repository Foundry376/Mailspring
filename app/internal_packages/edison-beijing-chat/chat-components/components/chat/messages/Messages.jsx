import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import CheckIcon from '../../common/icons/CheckIcon';
import Divider from '../../common/Divider';
import {
  MESSAGE_STATUS_DELIVERED,
  getStatusWeight,
} from '../../../db/schemas/message';
import { colorForString } from '../../../utils/colors';
import { buildTimeDescriptor, dateFormat } from '../../../utils/time';
import RetinaImg from '../../../../../../src/components/retina-img';
import { downloadFile } from '../../../utils/awss3';

const remote = require('electron').remote;
const { dialog, Menu, MenuItem } = remote;
import { isJsonString } from '../../../utils/stringUtils';
import ContactAvatar from '../../common/ContactAvatar';
import chatModel from '../../../store/model';
import { saveGroupMessages } from '../../../utils/db-utils';
import { NEW_CONVERSATION } from '../../../actions/chat';
import messageModel, { FILE_TYPE } from './messageModel';
import MessageImagePopup from './MessageImagePopup';
import MessageEditBar from './MessageEditBar';

let key = 0;

const shouldInlineImg = (msgBody) => {
  let path = msgBody.path;
  return (msgBody.type === FILE_TYPE.IMAGE || msgBody.type === FILE_TYPE.GIF || msgBody.type === FILE_TYPE.STICKER)
    && ((path && path.match(/^https?:\/\//) || fs.existsSync(path && path.replace('file://', ''))));
}
const shouldDisplayFileIcon = (msgBody) => {
  return msgBody.mediaObjectId && !msgBody.path ||
    msgBody.path && !(msgBody.type === FILE_TYPE.IMAGE || msgBody.type === FILE_TYPE.GIF || msgBody.type === FILE_TYPE.STICKER)
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

  static state = {
    shouldScrollBottom: true,
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
  }
  componentDidUpdate() {
    if (this.state.shouldScrollBottom) {
      this.scrollToMessagesBottom();
    }
  }
  componentWillUnmount() {
    const {
      groupedMessages
    } = this.props;
    saveGroupMessages(groupedMessages);
  }

  messagesPanel = null;
  messagePanelEnd = null;

  scrollToMessagesBottom() {
    if (this.messagePanelEnd) {
      this.messagePanelEnd.scrollIntoView({ behavior: 'smooth' });
      this.setState({ shouldScrollBottom: false });
    }
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
        <ContactAvatar jid={memberJid} name={member.name}
          email={member.email} avatar={member.avatar} size={32} />
      )
    }
    return null
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
  calcTimeLabel = () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const top = this.messagesPanel.scrollTop;
      const messageGroups = this.messagesPanel.children;
      for (const msgGrp of messageGroups) {
        if (msgGrp.className.indexOf('messageGroup') !== -1) {
          if (msgGrp.offsetTop - 50 < top && top < msgGrp.offsetTop + msgGrp.offsetHeight - 70) {
            msgGrp.className = 'messageGroup time-label-fix';
          } else {
            msgGrp.className = 'messageGroup';
          }
        }
      }
    }, 10);
  }

  render() {
    const {
      currentUserId,
      groupedMessages,
      selectedConversation: { isGroup, jid },
    } = this.props;
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


    return (
      <div
        className="messages"
        ref={element => { this.messagesPanel = element; }}
        onKeyDown={this.onKeyDown}
        onScroll={this.calcTimeLabel}
        tabIndex="0"
      >
        {jid !== NEW_CONVERSATION && groupedMessages.map((group, index) => (
          <div className="messageGroup" key={index}>
            <div className="day-label">
              <label>
                <span>{dateFormat(group.time)}</span>
                <Divider type="horizontal" />
              </label>
            </div>
            {group.messages.map((msg, idx) => {
              let msgBody = isJsonString(msg.body) ? JSON.parse(msg.body) : msg.body;
              if (msgBody.deleted) {
                return null;
              }
              if (msg.sender === currentUserId) {
                msgBody.path = msgBody.localFile || msgBody.path;
              } else {
                msgBody.path = msgBody.path || msgBody.localFile;
              }

              const color = colorForString(msg.sender);
              let msgFile;

              let showPopupMenu = (event) => {
                this.activeMsg = msg;
                this.activeMsgBody = msgBody;
                event.stopPropagation();
                event.preventDefault();
                this.menu.popup({ x: event.clientX, y: event.clientY });
              };

              let download = (event) => {
                event.stopPropagation();
                event.preventDefault();
                let path = dialog.showSaveDialog({ title: `download file` });
                if (!path || typeof path !== 'string') {
                  return;
                }
                if (msgBody.path.match(/^file:\/\//)) {
                  let imgpath = msgBody.path.replace('file://', '');
                  fs.copyFileSync(imgpath, path);
                } else if (!msgBody.mediaObjectId.match(/^https?:\/\//)) {
                  // the file is on aws
                  downloadFile(msgBody.aes, msgBody.mediaObjectId, path);
                } else {
                  let request;
                  if (msgBody.mediaObjectId.match(/^https/)) {
                    request = https;
                  } else {
                    request = http;
                  }
                  request.get(msgBody.mediaObjectId, function (res) {
                    var imgData = '';
                    res.setEncoding('binary');
                    res.on('data', function (chunk) {
                      imgData += chunk;
                    });
                    res.on('end', function () {
                      fs.writeFile(path, imgData, 'binary', function (err) {
                        if (err) {
                          console.log('down fail');
                        }
                        console.log('down success');
                      });
                    });
                  });
                }
              };
              let onClickImage = () => {
                msg.zoomin = true;
                if (msg.height < 1600) {
                  msg.height *= 2;
                } else {
                  msg.height = 100;
                }
                messageModel.group = group;
                messageModel.msg = msg;
                messageModel.msgBody = msgBody;
                messageModel.imagePopup.show();
                this.update();
              }
              let cursor = 'zoom-in';

              if (shouldInlineImg(msgBody)) {
                msg.height = msg.height || 220;
                msgFile = (<div className="messageMeta" onClick={onClickImage}>
                  <img
                    src={msgBody.path}
                    title={msgBody.localFile || msgBody.mediaObjectId}
                    style={{ height: '220px', cursor }}
                  />
                  <div className='message-toolbar' >
                    <span
                      className="download-img"
                      title={msgBody.path}
                      onClick={download}
                    />
                    {msg.sender === currentUserId && <span
                      className="inplace-edit-img"
                      onClick={showPopupMenu}
                      onContextMenu={showPopupMenu}
                    />}
                  </div>
                </div>)
              } else if (shouldDisplayFileIcon(msgBody)) {
                const fileName = msgBody.path ? path.basename(msgBody.path) : '';
                msgFile = <div className="messageMeta">
                  <div className="file-name">
                    <h4>{fileName}</h4>
                  </div>
                  <div className='message-toolbar' onClick={download}>
                    <span
                      className="download-img"
                      title={fileName}
                      onClick={download}
                    />
                    {msg.sender === currentUserId && <span
                      className="inplace-edit-img"
                      onClick={showPopupMenu}
                      onContextMenu={showPopupMenu}
                    />}
                  </div>
                </div>
              } else {
                msgFile = null;
              }
              let border = null;
              const isUnreadUpdatedMessage = (msg) => {
                if (!msg.updateTime) {
                  return false;
                } else {
                  const readTime = msg.readTime || 0;
                  return readTime < msg.updateTime;
                }
              }
              let isEditing = false;
              if (msg.id === chatModel.editingMessageId) {
                isEditing = true;
              } else if (isUnreadUpdatedMessage(msg)) {
              }
              const isCurrentUser = msg.sender === currentUserId;
              const member = this.getContactInfoByJid(msg.sender);
              return (
                <div
                  key={msg.id}
                  className={getMessageClasses(msg) + (
                    isEditing ? ' editing' : ''
                  )}
                  style={{ borderColor: color, border }}
                >
                  <div className="messageSender">
                    {this.getContactAvatar(member)}
                  </div>
                  <div className="messageContent">
                    <div>
                      <span className="username">{member.name}</span>
                      <span className="time">{dateFormat(msg.sentTime, 'LT')}</span>
                    </div>
                    {
                      msgBody && msgBody.isUploading ? (
                        <div className="messageBody loading">
                          <RetinaImg
                            name="inline-loading-spinner.gif"
                            mode={RetinaImg.Mode.ContentPreserve}
                          />
                          <div>Uploading {msgBody.localFile && path.basename(msgBody.localFile)}</div>
                        </div>
                      ) : (
                          isEditing ? (
                            <div>
                              <MessageEditBar cancelEdit={this.cancelEdit} value={msgBody.content || msgBody} {...this.props.sendBarProps} />
                            </div>
                          ) : (
                              <div className="messageBody">{msgBody.content || msgBody}</div>
                            )
                        )
                    }

                    {msgBody.mediaObjectId && msgBody.type === FILE_TYPE.OTHER_FILE && (
                      <div className="messageMeta">
                        {msgFile}
                      </div>
                    )}
                    {msgBody.mediaObjectId && msgBody.type !== FILE_TYPE.OTHER_FILE && (
                      <div className="messageMeta">
                        <div style={{ background: "#fff" }}>{msgFile}</div>
                      </div>
                    )}
                    <div className="messageMeta">
                      {
                        getStatusWeight(msg.status) >= getStatusWeight(MESSAGE_STATUS_DELIVERED) ?
                          <CheckIcon
                            className="messageStatus"
                            size={8}
                            color="white"
                          /> : null
                      }
                    </div>
                  </div>
                  {
                    !msgFile && isCurrentUser && !isEditing && <div className='message-toolbar' >
                      <span
                        className="inplace-edit-img"
                        onClick={showPopupMenu}
                        onContextMenu={showPopupMenu}
                      /></div>
                  }
                </div>
              );
            })}
          </div>
        ))
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
