var http = require("http");
var https = require("https");
var fs = require("fs");

import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import uuid from 'uuid/v4';
import CheckIcon from '../../common/icons/CheckIcon';
import {
  MESSAGE_STATUS_DELIVERED,
  getStatusWeight,
} from '../../../db/schemas/message';
import { colorForString } from '../../../utils/colors';
import { buildTimeDescriptor } from '../../../utils/time';
import RetinaImg from '../../../../../../src/components/retina-img';
import { downloadFile } from '../../../utils/awss3';
const { dialog } = require('electron').remote;
import { isJsonString } from '../../../utils/stringUtils';
import ContactAvatar from '../../common/ContactAvatar';
import chatModel from '../../../store/model';
import { saveGroupMessages } from '../../../utils/db-utils';
import CancelIcon from '../../common/icons/CancelIcon';
import { theme } from '../../../utils/colors';
const { primaryColor } = theme;

let key = 0;

const shouldInlineImg = (msgBody) => {
  return msgBody.path && msgBody.path.match(/(\.bmp|\.png|\.jpg|\.jpeg|\.gif)$/);
}
const shouldDisplayFileIcon = (msgBody) => {
  return msgBody.mediaObjectId && !msgBody.path || // this is received file msgBody.path is added for image file while receiving message
    msgBody.path && !msgBody.path.match(/(\.bmp|\.png|\.jpg|\.jpeg|\.gif)$/) //this is sent file, msgBody.path is msgBody.localFile added while sending
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
        sender: PropTypes.string.isRequired,
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
  }

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

  componentDidUpdate() {
    if (this.state.shouldScrollBottom) {
      this.scrollToMessagesBottom();
    }
  }
  componentWillUnmount()  {
    const {
      currentUserId,
      groupedMessages,
      selectedConversation: { isGroup },
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

  getContactInfoByJid = (jid) => {
    if (this.props.selectedConversation.isGroup) {
      const members = this.props.members;
      if (!members || members.length === 0) {
        return null;
      }
      for (const member of members) {
        if (member.jid.bare === jid) {
          return (
            <ContactAvatar jid={member.jid.bare} name={member.name}
              email={member.email} avatar={member.avatar} size={32} />
          )
        }
      }
    }
    return null;
  }
  onKeyDown = event => {
    let keyCode = event.keyCode;
    if (keyCode === 27) { // ESC
      event.stopPropagation()
      event.preventDefault()
      chatModel.editingMessageId = null;
      key++;
      this.setState(Object.assign({}, this.state, { key }));
    }
  }

  render() {
    const {
      currentUserId,
      groupedMessages,
      referenceTime,
      selectedConversation: { isGroup },
    } = this.props;
    if (groupedMessages.length) {
      chatModel.groupedMessages = groupedMessages;
    }
    const timeDescriptor = buildTimeDescriptor(referenceTime);
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
        onKeyDown = {this.onKeyDown}
        tabIndex="0"
      >
        {groupedMessages.map(group => (
          <div className="messageGroup" key={uuid()}>
            {group.messages.map((msg, idx) => {
              let msgBody = isJsonString(msg.body) ? JSON.parse(msg.body) : msg.body;
              msgBody.path = msgBody.localFile || msgBody.path;
              const color = colorForString(msg.sender);
              let msgFile;

              let startEditMessage = (event) => {
                chatModel.editingMessageId = msg.id;
                event.stopPropagation();
                event.preventDefault();
                key++;
                this.setState(Object.assign({}, this.state, { key }));
              };

              let download = (event) => {
                event.stopPropagation();
                event.preventDefault();
                let path = dialog.showSaveDialog({ title: `download file` });
                if (!path || typeof path !== 'string') {
                  return;
                }
                if (!msgBody.mediaObjectId.match(/^https?:\/\//)) {
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
              let showToolbar = () => {
                msg.showToolbar = true;
                key++;
                this.setState(Object.assign({}, this.state, { key }));
              }
              let hideToolbar = () => {
                msg.showToolbar = false;
                key++;
                this.setState(Object.assign({}, this.state, { key }));
              }
              let onClickImage = () => {
                msg.zoomin = true;
                if (msg.height < 1600) {
                  msg.height *= 2;
                } else {
                  msg.height = 100;
                }
                key++;
                this.setState(Object.assign({}, this.state, { key }));
              }
              const CancelZoomIn = (event) => {
                event.stopPropagation();
                event.preventDefault();
                msg.zoomin = false;
                key++;
                this.setState(Object.assign({}, this.state, { key }));
              }
              let cursor = 'zoom-in';

              if (shouldInlineImg(msgBody)) {
                msg.height = msg.height || 100;
                msgFile = (<div className="messageMeta" onClick={onClickImage} onMouseEnter={showToolbar} onMouseLeave={hideToolbar}>
                  <img
                    src={msgBody.path}
                    title={msgBody.mediaObjectId}
                    style={{ height:'100px', cursor}}
                  />
                    {msg.zoomin && <div style={{position:'fixed', top:'40px', left:'120px', zIndex:999}}>
                    <img
                      src={msgBody.path}
                      style={{ width:(screen.width-240)+'px'}}
                    />
                    <span className="cancel-zoomin-button" onClick={CancelZoomIn}>
                      <CancelIcon color={primaryColor} />
                      <span
                        className="download-img"
                        title={msgBody.path}
                        onClick={download}
                      />
                    </span>
                  </div>}
                  {msg.showToolbar && <div className='message-toolbar' ><span
                    className="download-img"
                    title={msgBody.path}
                    onClick={download}
                  />
                    <span
                      className="inplace-edit-img"
                      onClick={startEditMessage}
                    /></div>}
                </div>)
              } else if (shouldDisplayFileIcon(msgBody)) {
                msgFile = <div className="messageMeta" onMouseEnter={showToolbar} onMouseLeave={hideToolbar}>
                  <RetinaImg
                    name="fileIcon.png"
                    mode={RetinaImg.Mode.ContentPreserve}
                    title={msgBody.mediaObjectId}
                  />
                  {msg.showToolbar && <div className='message-toolbar' onClick={download}><span
                    className="download-img"
                    title={msgBody.path}
                    onClick={download}
                  />
                    <span
                      className="inplace-edit-img"
                      onClick={startEditMessage}
                    /></div>}
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
              if (msg.id === chatModel.editingMessageId) {
                border = 'dashed 2px red';
              } else if (isUnreadUpdatedMessage(msg)) {
                border = 'solid 2px red';
              }

              return (
                <div
                  key={msg.id}
                  className={getMessageClasses(msg)}
                  style={{ borderColor: color, border }}
                  onMouseEnter={showToolbar}
                  onMouseLeave={hideToolbar}

                >
                  {msg.sender !== currentUserId ?
                    <div className="messageSender">
                      {this.getContactInfoByJid(msg.sender)}
                    </div> : null
                  }
                  {msg.sender === currentUserId ?
                    <div className="messageSender">
                      {this.getContactInfoByJid(msg.sender)}
                    </div> : null
                  }
                  <div className="messageContent">
                    <div className="messageBody">{msgBody.content || msgBody}</div>
                    {msgBody.mediaObjectId && <div className="messageMeta">
                      <div style={{ background: "#fff" }}>{msgFile}</div>
                    </div>
                    }
                    <div className="messageMeta">
                      {getStatusWeight(msg.status) >= getStatusWeight(MESSAGE_STATUS_DELIVERED) ?
                        <CheckIcon
                          className="messageStatus"
                          size={8}
                          color="white"
                        /> : null
                      }
                      {timeDescriptor(msg.sentTime, true)}
                    </div>
                  </div>
                  {msg.showToolbar && !msgFile && msg.sender === currentUserId && <div className='message-toolbar' >
                    <span
                      className="inplace-edit-img"
                      onClick={startEditMessage}
                    /></div>}
                </div>
              );
            })}
          </div>
        ))
        }
        <div ref={element => { this.messagePanelEnd = element; }} />
      </div>
    );
  }
}
