import fs from 'fs';
import path from 'path';
import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';

const a11yEmoji = require('a11y-emoji');
import { colorForString } from '../../../utils/colors';
import { dateFormat } from '../../../utils/time';
import { RetinaImg } from 'mailspring-component-kit';

const { AttachmentStore } = require('mailspring-exports');

import { remote, shell } from 'electron';

const { dialog, Menu, MenuItem } = remote;
import { isJsonStr } from '../../../utils/stringUtils';
import ContactAvatar from '../../common/ContactAvatar';
import MessageEditBar from './MessageEditBar';
import MessageApp from './MessageApp';
import MessagePrivateApp from './MessagePrivateApp';
import { ChatActions } from 'chat-exports';
import { FILE_TYPE } from '../../../utils/filetypes';
import { MessageModel, MessageSend, MessageStore } from 'chat-exports';
import { name } from '../../../utils/name';

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
  };

  constructor(props) {
    super(props);
    this.state = this.receiveProps(props);
  }

  receiveProps = props => {
    const { msg, conversation } = props;
    const msgBody = isJsonStr(msg.body) ? JSON.parse(msg.body) : msg.body;
    const currentUserJid = conversation.curJid;
    let msgImgPath;
    if (typeof msgBody !== 'string') {
      msgImgPath = this.getImageFilePath(msgBody);
      if (msgBody.mediaObjectId && !msgImgPath && this.isImage(msgBody.type)) {
        MessageStore.downloadAndTagImageFileInMessage(null, null, msg, 'startOnRender');
      }
    }
    msgBody.path = msgImgPath;
    return {
      msgBody,
      msgImgPath,
      currentUserJid,
    };
  };

  componentWillReceiveProps = nextProps => {
    const newState = this.receiveProps(nextProps);
    this.setState(newState, () => {
      // if has span tag, that's no need to run emoji process
      if (this.contentEl && this.contentEl.innerHTML.indexOf('<span role="img"') === -1) {
        this.contentEl.innerHTML = a11yEmoji(this.contentEl.innerHTML);
      }
    });
  };

  isImage = type => {
    return type === FILE_TYPE.IMAGE || type === FILE_TYPE.GIF || type === FILE_TYPE.STICKER;
  };

  shouldDisplayFileIcon = () => {
    const { msgBody } = this.state;
    return msgBody.mediaObjectId && msgBody.type == FILE_TYPE.OTHER_FILE;
  };

  static timer;

  componentDidMount() {
    this.unlisten = ChatActions.updateDownload.listen(this.update, this);
    if (this.contentEl) {
      this.contentEl.innerHTML = a11yEmoji(this.contentEl.innerHTML);
    }
  }

  deleteMessage = () => {
    const { msg, conversation } = this.props;
    const body = this.state.msgBody;
    body.updating = true;
    body.deleted = true;
    MessageSend.sendMessage(body, conversation, msg.id);
    MessageModel.destroy({ where: { id: msg.id, conversationJid: conversation.jid } });
  };

  componentWillUnmount() {
    this.unlisten();
  }

  getContactInfoByJid = jid => {
    return this.props.getContactInfoByJid(jid);
  };

  getContactAvatar = member => {
    const { conversation } = this.props;
    if (member) {
      const memberJid = typeof member.jid === 'object' ? member.jid.bare : member.jid;
      return (
        <ContactAvatar
          jid={memberJid}
          name={member.name}
          conversation={conversation}
          email={member.email}
          avatar={member.avatar}
          size={32}
        />
      );
    }
    return null;
  };

  openFile(filePath) {
    shell.openItem(filePath);
  }

  onKeyDown = event => {
    let keyCode = event.keyCode;
    if (keyCode === 27) {
      // ESC
      event.stopPropagation();
      event.preventDefault();
      this.cancelEdit();
    }
  };
  cancelEdit = () => {
    this.setState({
      isEditing: false,
    });
  };

  update(imgId) {
    const { msgBody } = this.state;
    const { mediaObjectId, thumbObjectId } = msgBody;
    const msgImgPath = this.getImageFilePath(msgBody);
    if (imgId === mediaObjectId || imgId === thumbObjectId) {
      this.setState({ imgId, msgImgPath });
    }
  }

  download = () => {
    const msgBody = this.state.msgBody;
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
      type: 'download',
    };
    const { queueLoadMessage } = this.props;
    queueLoadMessage(loadConfig);
  };

  showPopupMenu = () => {
    event.stopPropagation();
    event.preventDefault();

    this.menu = new Menu();

    let menuItem;
    menuItem = new MenuItem({
      label: 'Edit text',
      click: () => {
        this.setState({ isEditing: true });
        this.menu.closePopup();
      },
    });
    this.menu.append(menuItem);

    menuItem = new MenuItem({
      label: 'Delete message',
      click: () => {
        this.deleteMessage();
        this.menu.closePopup();
      },
    });
    this.menu.append(menuItem);

    this.menu.popup({ x: event.clientX, y: event.clientY });
  };

  messageToolbar = (msg, msgBody, isFile, isCurrentUser) => {
    const isSystemEvent = ['error403', 'memberschange', 'change-group-name'].includes(msgBody.type);

    return (
      <div className="message-toolbar">
        {isFile && (
          <span className="download-img" title={msgBody.path} onClick={() => this.download()}>
            <RetinaImg
              name={'download.svg'}
              style={{ width: 24, height: 24 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </span>
        )}
        {isCurrentUser && !isSystemEvent && (
          <span
            className="inplace-edit-img"
            onClick={() => this.showPopupMenu()}
            onContextMenu={() => this.showPopupMenu()}
          >
            <RetinaImg
              name={'expand-more.svg'}
              style={{ width: 26, height: 26 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </span>
        )}
      </div>
    );
  };

  getMessageClasses = () => {
    const { currentUserJid } = this.state;
    const { msg } = this.props;
    const messageStyles = ['message'];
    if (msg.sender === currentUserJid) {
      messageStyles.push('currentUser');
    } else {
      messageStyles.push('otherUser');
    }
    return messageStyles.join(' ');
  };

  onClickImage = e => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target.src) {
      this._previewAttachment(decodeURI(e.target.src).replace('file://', ''));
    }
  };

  _previewAttachment(filePath) {
    const currentWin = AppEnv.getCurrentWindow();
    currentWin.previewFile(filePath);
  }


  senderContact = () => {
    const { msg } = this.props;
    return this.getContactInfoByJid(msg.sender);
  };

  senderName = () => {
    const { msg } = this.props;
    const member = this.senderContact();
    return name(msg.sender) || member.name;
  };

  retrySend = () => {
    const { msg, conversation } = this.props;
    const { msgBody } = this.state;
    if (msgBody.localFile && !msgBody.uploadFailed) {
      const loadConfig = {
        conversation,
        messageId: msg.id,
        msgBody,
        filepath: msgBody.localFile,
        type: 'upload',
      };
      const { queueLoadMessage } = this.props;
      queueLoadMessage(loadConfig);
    } else {
      MessageSend.sendMessage(msgBody, conversation, msg.id);
    }
  };

  getImageFilePath = msgBody => {
    const bodyPath = msgBody.path && msgBody.path.replace('file://', '');
    if (bodyPath && (bodyPath.match(/^http/) || fs.existsSync(bodyPath))) {
      return bodyPath;
    }
  };

  renderImage() {
    const { msgBody, msgImgPath } = this.state;
    if (msgImgPath) {
      return (
        <div className="message-image">
          <img src={msgImgPath} onClick={this.onClickImage}/>
        </div>
      );
    } else if (msgBody.downloading) {
      return (
        <div className="loading">
          <div> Downloading...
          </div>
          <RetinaImg
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentPreserve}
          />
        </div>
      );
    } else if (msgBody.isUploading) {
      return (
          <div>
            Uploading {msgBody.localFile && path.basename(msgBody.localFile)}
            <RetinaImg
              name="inline-loading-spinner.gif"
              mode={RetinaImg.Mode.ContentPreserve}
            />
          </div>
      );
    } else {
      return (
        <div>
          <div>
            {msgBody.content}
          </div>
          <RetinaImg
            name="image-not-found.png"
            style={{ width: 24, height: 24 }}
            mode={RetinaImg.Mode.ContentPreserve}
          />
        </div>
      );
    }
  }

  renderFile = () => {
    const { msgBody } = this.state;

    if (!this.shouldDisplayFileIcon()){
      return null;
    }
    const filepath = msgBody.localFile || msgBody.path;
    const fileName = filepath ? path.basename(filepath) : '';
    let extName = path.extname(filepath || 'x.doc').slice(1);
    let iconName;
    if (filepath) {
      iconName = AttachmentStore.getExtIconName(filepath);
    }
    return (
      <div className="message-file">
        <div className="file-info" onDoubleClick={() => this.openFile(msgBody.path)}>
          <div className="file-icon">
            <RetinaImg name={iconName} isIcon mode={RetinaImg.Mode.ContentIsMask}/>
          </div>
          <div>
            <div className="file-name">{fileName}</div>
            <div className="ext">{extName.toUpperCase()}</div>
          </div>
        </div>
      </div>
    );
  };

  renderContent() {
    const { msg, conversation } = this.props;
    const { isEditing, msgBody, currentUserJid } = this.state;
    const textContent = (msgBody.path && path.basename(msgBody.path)) || msgBody.content || msgBody;
    if (isEditing) {
      return (<div onKeyDown={this.onKeyDown}>
          <MessageEditBar
            msg={msg}
            cancelEdit={this.cancelEdit}
            value={msgBody.content || msgBody}
            conversation={conversation}
            deleteMessage={this.deleteMessage}
          />
        </div>
      );
    } else if (msgBody.mediaObjectId) {
      if (this.isImage(msgBody.type)) {
        return this.renderImage();
      } else {
        return this.renderFile();
      }
    } else {
      return (
        <div className="text-content">
          <div className="text" ref={el => (this.contentEl = el)}>
            {textContent}
          </div>
        </div>);
    }
  }


  render() {
    const { msg, conversation } = this.props;
    const { isEditing, msgBody, msgImgPath, currentUserJid } = this.state;
    const isCurrentUser = msg.sender === currentUserJid;
    const color = colorForString(msg.sender);
    const member = this.senderContact();
    const senderName = this.senderName();
    const messageFail = msg.status === 'MESSAGE_STATUS_TRANSFER_FAILED' && isCurrentUser;

    if (msgBody.deleted) {
      return null;
    } else if (msgBody.isAppprivateCommand) {
      return (
        <MessagePrivateApp
          msg={msg}
          userId={currentUserJid}
          conversation={conversation}
          getContactInfoByJid={this.getContactInfoByJid}
          getContactAvatar={this.getContactAvatar}
          key={msg.id}
        />
      );
    } else if (msgBody.appJid) {
      return (
        <MessageApp
          msg={msg}
          userId={currentUserJid}
          conversation={conversation}
          getContactInfoByJid={this.getContactInfoByJid}
          getContactAvatar={this.getContactAvatar}
          key={msg.id}
        />
      );
    } else {
      const isSystemEvent = ['error403', 'memberschange', 'change-group-name'].includes(
        msgBody.type,
      );
      return (
        <div
          key={msg.id}
          className={
            this.getMessageClasses() +
            (isEditing ? ' editing' : '') +
            (isSystemEvent ? ' system-event' : '') +
            (messageFail ? ' message-fail' : '')
          }
          style={{ borderColor: color }}
        >
          {!isSystemEvent ? (
            <div className="messageIcons">
              {messageFail ? <div className="messageFailed" title="Not Delivered"/> : null}
              <div className="messageSender">{this.getContactAvatar(member)}</div>
            </div>
          ) : null}
          <div className="message-content">
            <div className="message-header">
              <span className="username">{senderName}</span>
              <span className="time">{dateFormat(msg.sentTime, 'LT')}</span>
            </div>
            <div className="messageBody">
              {this.renderContent()}
            { this.messageToolbar(msg, msgBody, !!msgBody.mediaObjectId, isCurrentUser) }
            </div>
          </div>
          {messageFail ? (
            <div className="message-retry" onClick={this.retrySend}>
              Try Again
            </div>
          ) : null}
        </div>
      );
    }
  }
}
