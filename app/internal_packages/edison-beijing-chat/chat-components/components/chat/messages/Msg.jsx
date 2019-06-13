import fs from 'fs';
import path from 'path';
import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import CheckIcon from '../../common/icons/CheckIcon';
import {
  MESSAGE_STATUS_DELIVERED,
  getStatusWeight, MESSAGE_STATUS_UPLOAD_FAILED,
} from '../../../db/schemas/message';
import { colorForString } from '../../../utils/colors';
import { dateFormat } from '../../../utils/time';
import { RetinaImg } from 'mailspring-component-kit';
const { Actions, AttachmentStore } = require('mailspring-exports');

import { remote, shell } from 'electron';
const { dialog, Menu, MenuItem } = remote;
import { isJsonString } from '../../../utils/stringUtils';
import ContactAvatar from '../../common/ContactAvatar';
import { saveGroupMessages } from '../../../utils/db-utils';
import MessageEditBar from './MessageEditBar';
import MessageApp from './MessageApp';
import MessagePrivateApp from './MessagePrivateApp';
import _ from 'underscore';
import {ChatActions} from 'chat-exports';
import { FILE_TYPE } from '../../../utils/filetypes';

let key = 0;

export default class Msg extends PureComponent {
  static propTypes = {
    msg: PropTypes.shape({
      id: PropTypes.string.isRequired,
      conversationJid: PropTypes.string.isRequired,
      sender: PropTypes.string.isRequired,
      body: PropTypes.string.isRequired,
      sentTime: PropTypes.number.isRequired,
      status: PropTypes.string.isRequired,
    }).isRequired,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      isGroup: PropTypes.bool.isRequired,
    }),
  }

  state = {
  }

  constructor(props) {
    super(props);
    this.receiveProps(props)
  }

  receiveProps = (props) => {
    const { msg, conversation } = props;
    const msgBody = isJsonString(msg.body) ? JSON.parse(msg.body) : msg.body;
    this.msgBody = msgBody;
    this.currentUserJid = conversation.curJid;
    if (msg.sender === this.currentUserJid) {
      msgBody.path = msgBody.localFile || msgBody.path;
    } else {
      msgBody.path = msgBody.path || msgBody.localFile;
    }
    const msgImgPath = msgBody.path;
    this.msgImgPath = msgImgPath;
  }

  componentWillReceiveProps = (nextProps) => {
    // console.log('Msg.componentWillReceiveProps: nextProps: ', nextProps);
    this.receiveProps(nextProps);
    // console.log('Msg.componentWillReceiveProps 2: msgBody: ', this.msgBody);
    this.update();
  }

  isImage = (type) => {
    return type === FILE_TYPE.IMAGE || type === FILE_TYPE.GIF || type === FILE_TYPE.STICKER;
  }

  shouldInlineImg = () => {
    const { msgBody } = this;
    let path = msgBody.path;
    return this.isImage(msgBody.type)
      && ((path && path.match(/^https?:\/\//) || fs.existsSync(path && path.replace('file://', ''))));
  }

  shouldDisplayFileIcon = () => {
    const { msgBody } = this;
    return msgBody.mediaObjectId
      && msgBody.type == FILE_TYPE.OTHER_FILE
      && !this.isImage(msgBody.type)
  }

  static timer;

  componentDidMount() {
    this.menu = new Menu()
    let menuItem = new MenuItem({
      label: 'Edit text',
      click: () => {
        const state = Object.assign({}, this.state, {isEditing:true});
        this.setState(state);
        this.menu.closePopup();
      }
    });
    this.menu.append(menuItem);
    menuItem = new MenuItem({
      label: 'Delete message',
      click: () => {
        const { msg, conversation, onMessageSubmitted } = this.props;
        console.log('delete message: msg: ', msg);
        const body = this.msgBody;
        body.updating = true;
        body.deleted = true;
        onMessageSubmitted(conversation, JSON.stringify(body), msg.id, true);
        msg.remove();
        this.menu.closePopup();
      }
    });
    this.menu.append(menuItem);

    this.unlisten = Actions.updateDownloadPorgress.listen(this.update, this);
  }

  componentWillUnmount() {
    this.unlisten();
    const {
      groupedMessages
    } = this.props;
    saveGroupMessages(groupedMessages);
  }

  getContactInfoByJid = jid => {
    return this.props.getContactInfoByJid(jid);
  }

  getContactAvatar = member => {
    const { conversation } = this.props;
    if (member) {
      const memberJid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
      return (
        <ContactAvatar jid={memberJid} name={member.name} conversation={conversation}
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
    key++;
    this.setState(Object.assign({}, this.state, { key }));
  }
  update() {
    key++;
    this.setState(Object.assign({}, this.state, { key }));
  }

  download = () => {
    const msgBody = this.msgBody;
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

  showPopupMenu = () => {
    event.stopPropagation();
    event.preventDefault();
    this.menu.popup({ x: event.clientX, y: event.clientY });
  };

  messageToolbar = (msg, msgBody, isFile) => {
    const { conversation } = this.props;
    const currentUserJid = this.currentUserJid;

    return (
      <div className='message-toolbar' >
        {isFile && (
          <span
            className="download-img"
            title={msgBody.path}
            onClick={() => this.download()}
          >
            <RetinaImg name={'download.svg'}
              style={{ width: 24, height: 24 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </span>
        )}
        {msg.sender === currentUserJid && (
          <span
            className="inplace-edit-img"
            onClick={() => this.showPopupMenu()}
            onContextMenu={() => this.showPopupMenu()}
          >
            <RetinaImg name={'expand-more.svg'}
              style={{ width: 26, height: 26 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask} />
          </span>
        )}
      </div>
    )
  }
  getMessageClasses = () => {
    const currentUserJid = this.currentUserJid;
    const { msg } = this.props;
    const messageStyles = ['message'];
    if (msg.sender === currentUserJid) {
      messageStyles.push('currentUser');
    } else {
      messageStyles.push('otherUser');
    }
    return messageStyles.join(' ');
  };
  isUnreadUpdatedMessage = () => {
    const { msg } = this.props;
    if (!msg.updateTime) {
      return false;
    } else {
      const readTime = msg.readTime || 0;
      return readTime < msg.updateTime;
    }
  }
  onClickImage = () => {
    const { msg } = this.props;
    console.log( 'onClickImage: msg', msg);
    ChatActions.updateImagePopup(msg);
  }
  msgFile = () => {
    const { msg } = this.props;
    const currentUserJid = this.currentUserJid;
    const msgBody = this.msgBody;
    const msgImgPath = this.msgImgPath;

    if (this.shouldInlineImg()) {
      return (
        <div className="message-image">
          <img
            src={msgBody.path}
            title={msgBody.localFile || msgBody.mediaObjectId}
            onClick={this.onClickImage}
          />
          {this.messageToolbar(msg, msgBody, true)}
        </div>
      )
    } else if (this.shouldDisplayFileIcon()) {
      const fileName = msgBody.path ? path.basename(msgBody.path) : '';
      let extName = path.extname(msgBody.path || 'x.doc').slice(1);
      let iconName = '';
      if (msgBody.path) {
        iconName = AttachmentStore.getExtIconName(msgBody.path);
      }
      return (
        <div className="message-file">
          <div className="file-info" onDoubleClick={() => this.openFile(msgBody.path)}>
            <div className="file-icon">
              <RetinaImg name={iconName}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask} />
            </div>
            <div>
              <div className="file-name">{fileName}</div>
              <div className="ext">{extName.toUpperCase()}</div>
            </div>
          </div>
          {this.messageToolbar(msg, msgBody, true)}
        </div>
      )
    } else {
      return null;
    }
  }

  senderContact = () => {
    const { msg } = this.props;
    return this.getContactInfoByJid(msg.sender);
  }

  senderName = () => {
    const { msg } = this.props;
    const member = this.senderContact();
    return msg.senderNickname || member.name;
  }

  onMessageSubmitted = (conversation, body, messageId, uploading) => {
    this.msgBody = JSON.parse(body);
    this.props.onMessageSubmitted(conversation, body, messageId, uploading);
    this.update();
  }

  render() {
    const { msg, conversation } = this.props;
    const { msgBody, currentUserJid } = this;
    let border = null;
    const isCurrentUser = msg.sender === currentUserJid;
    const color = colorForString(msg.sender);
    const member = this.senderContact();
    const senderName = this.senderName();
    const msgFile = this.msgFile();
    const { isEditing } = this.state;
    // console.log('Msg.render: msg, msgBody: ', msg, msgBody);

    if (msgBody.deleted) {
      return null;
    } else if (msgBody.isAppprivateCommand) {
      return <MessagePrivateApp msg={msg}
        userId={currentUserJid}
        conversation={conversation}
        getContactInfoByJid={this.getContactInfoByJid}
        getContactAvatar={this.getContactAvatar}
        key={msg.id} />

    } else if (msgBody.appJid) {
      return <MessageApp msg={msg}
        userId={currentUserJid}
        conversation={conversation}
        getContactInfoByJid={this.getContactInfoByJid}
        getContactAvatar={this.getContactAvatar}
        key={msg.id} />
    } else {
      return (
        <div
          key={msg.id}
          className={this.getMessageClasses() + (
            isEditing ? ' editing' : ''
          )}
          style={{ borderColor: color, border }}
        >
          <div className="messageSender">
            {this.getContactAvatar(member)}
          </div>
          <div className="messageContent">
            <div>
              <span className="username">{senderName}</span>
              <span className="time">{dateFormat(msg.sentTime, 'LT')}</span>
            </div>
            {
              (msgBody && (msgBody.isUploading || msgBody.downloading && !fs.existsSync(this.msgImgPath.replace('file://', '')))) ? (
                <div className="messageBody loading">
                  {msgBody.downloading && (
                    <div> Downloading...
                      <RetinaImg
                        name="inline-loading-spinner.gif"
                        mode={RetinaImg.Mode.ContentPreserve}
                      />
                    </div>
                  )}
                  {msgBody.isUploading && (
                    <div>
                      Uploading {msgBody.localFile && path.basename(msgBody.localFile)}
                      <RetinaImg
                        name="inline-loading-spinner.gif"
                        mode={RetinaImg.Mode.ContentPreserve}
                      />
                      {this.isImage(msgBody.type) && (
                        <div className="message-image">
                          <img
                            src={msgBody.localFile}
                            title={msgBody.isUploading && msgBody.localFile || ''}
                            onClick={onClickImage}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>) : (
                  isEditing ? (
                    <div>
                      <MessageEditBar msg={msg} cancelEdit={this.cancelEdit} value={msgBody.content || msgBody} conversation={conversation} onMessageSubmitted={this.onMessageSubmitted} />
                    </div>
                  ) : (
                      <div className="messageBody">
                        <div className="text-content">
                          {msgBody.path && path.basename(msgBody.path) || msgBody.content || msgBody}
                          {
                            !msgFile && isCurrentUser && !isEditing && (
                              this.messageToolbar(msg, msgBody, false)
                            )}
                        </div>
                      </div>
                    )
                )
            }

            {msgBody.mediaObjectId && (
              <div className="messageMeta">
                <div>{msgFile}</div>
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
            {
              msg.status === MESSAGE_STATUS_UPLOAD_FAILED &&
              <div className="upload-error">
                <span>
                  <RetinaImg name={'close_1.svg'}
                    style={{ width: 20, height: 20 }}
                    isIcon
                    mode={RetinaImg.Mode.ContentIsMask} />
                </span>
                <span> File transfer failed!</span>
              </div>
            }
          </div>
        </div>
      );
    }
  }
}
