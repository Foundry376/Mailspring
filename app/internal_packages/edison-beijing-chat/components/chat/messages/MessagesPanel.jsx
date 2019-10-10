import React, { Component } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import MessagesTopBar from './MessagesTopBar';
import OnlineStatus from './OnlineStatus';
import MessagesSendBar from './MessagesSendBar';
import Messages from './Messages';
import ConversationInfo from '../conversations/ConversationInfo';
import Divider from '../../common/Divider';
import { downloadFile, uploadFile } from '../../../utils/awss3';
import registerLoginChat from '../../../utils/register-login-chat';
import { RetinaImg } from 'mailspring-component-kit';
import {
  ProgressBarStore,
  ChatActions,
  MessageStore,
  ConversationStore,
  ContactStore,
  UserCacheStore,
  MemberProfileStore,
  MessageSend,
} from 'chat-exports';
import MemberProfile from '../conversations/MemberProfile';

import { xmpplogin } from '../../../utils/restjs';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { MESSAGE_STATUS_TRANSFER_FAILED } from '../../../model/Message';
import { sendFileMessage } from '../../../utils/message';
import { getToken } from '../../../utils/appmgt';
import { LocalStorage } from 'chat-exports';
import { alert } from '../../../utils/electron';
import { log } from '../../../utils/log';

const { exec } = require('child_process');
import { NEW_CONVERSATION } from '../../../utils/constant';

export default class MessagesPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showConversationInfo: false,
      online: true,
      connecting: false,
      moreBtnEl: null,
      progress: {
        loadConfig: null,
      },
      selectedConversation: null,
      contacts: [],
    };
    this._listenToStore();
  }

  _listenToStore = () => {
    this._unsubs = [];
    this._unsubs.push(ConversationStore.listen(() => this._onDataChanged('conversation')));
    this._unsubs.push(ContactStore.listen(() => this._onDataChanged('contact')));
  };

  _onDataChanged = async changedDataName => {
    if (changedDataName === 'conversation') {
      const selectedConversation = await ConversationStore.getSelectedConversation();
      if (
        selectedConversation &&
        !selectedConversation.isGroup &&
        !selectedConversation.email &&
        selectedConversation.jid.indexOf('@app') == -1 &&
        selectedConversation.jid != 'NEW_CONVERSATION'
      ) {
        // let user = await ContactStore.findContactByJid(selectedConversation.jid);
        let user = await UserCacheStore.getUserInfoByJid(selectedConversation.jid);
        if (!user) {
          console.error('****user is null', selectedConversation);
        }
        selectedConversation.email = user && user.email;
      }
      this.setState({
        selectedConversation,
      });
    } else if (changedDataName === 'contact') {
      const contacts = await ContactStore.getContacts();
      this.setState({
        contacts,
      });
    }
  };

  componentDidMount = async () => {
    window.addEventListener('online', this.onLine);
    const contacts = await ContactStore.getContacts();
    const selectedConversation = await ConversationStore.getSelectedConversation();
    document.body.onclick = this._closePreview;
    this.setState({
      online: navigator.onLine,
      contacts,
      selectedConversation,
    });
  };

  onLine = e => {
    const { progress } = ProgressBarStore;
    if (progress.loading && progress.failed) {
      this.retryLoadMessage();
    }
  };

  _closePreview = e => {
    if (e.target.tagName === 'IMG') {
      return;
    }
    const currentWin = AppEnv.getCurrentWindow();
    currentWin.closeFilePreview();
  };

  UNSAFE_componentWillReceiveProps = async (nextProps, nextContext) => {
    const selectedConversation = await ConversationStore.getSelectedConversation();
    const contacts = await ContactStore.getContacts();
    this.setState({
      contacts,
      selectedConversation,
    });
  };

  componentWillUnmount() {
    window.removeEventListener('online', this.onLine);
    for (const unsub of this._unsubs) {
      unsub();
    }
    document.body.onclick = null;
  }

  onDragOver = event => {
    const state = Object.assign({}, this.state, { dragover: true });
    this.setState(state);
  };

  onDragEnd = event => {
    const state = Object.assign({}, this.state, { dragover: false });
    this.setState(state);
  };

  onDrop = event => {
    let tranFiles = event.dataTransfer.files,
      files = [];
    for (let i = 0; i < tranFiles.length; i++) {
      files.push(tranFiles[i].path);
    }
    const state = Object.assign({}, this.state, { dragover: false });
    this.setState(state);
    this.sendFile(files);
  };

  sendFile(files) {
    const { selectedConversation } = this.state;
    files.map((file, index) => sendFileMessage(file, index, this, ' '));
  }

  editProfile = member => {
    setTimeout(() => {
      MemberProfileStore.setMember(member);
    }, 10);
  };

  exitProfile = async member => {
    if (!member) {
      return;
    }
    const jid = member.jid.bare || member.jid;
    const nicknames = chatLocalStorage.nicknames;
    if (nicknames[jid] != member.nickname) {
      nicknames[jid] = member.nickname;
      LocalStorage.saveToLocalStorage();
    }
    MemberProfileStore.setMember(null);
    MessageStore.saveMessagesAndRefresh([]);
    LocalStorage.trigger();
  };

  reconnect = () => {
    registerLoginChat();
  };

  queueLoadMessage = async loadConfig => {
    let { progress } = ProgressBarStore;
    progress = Object.assign({}, progress);
    let { loading } = progress;
    if (loading) {
      loadConfig = progress.loadConfig;
      const loadText = loadConfig.type === 'upload' ? 'An upload' : ' A download';
      alert(`${loadText} is processing, please wait it to be finished!`);
      return;
    }
    ChatActions.updateProgress(
      { loadConfig, loading: true, visible: true },
      { onCancel: this.cancelLoadMessage, onRetry: this.retryLoadMessage }
    );
    if (!loading) {
      await this.loadMessage();
    }
  };

  loadMessage = async () => {
    const { progress } = ProgressBarStore;
    let { loadConfig } = progress;
    ChatActions.updateProgress({
      loading: true,
      percent: 0,
      finished: false,
      failed: false,
      visible: true,
    });
    const { msgBody, filepath } = loadConfig;
    log(
      'load',
      `MessagePanel.loadMessage: type: ${loadConfig.type}, filepath: ${filepath}, mediaObjectId: ${msgBody.mediaObjectId}`
    );
    const loadCallback = (...args) => {
      ChatActions.updateProgress({ loading: false, finished: true, visible: true });
      clearInterval(this.loadTimer);
      setTimeout(() => {
        if (!ProgressBarStore.progress.loading) {
          ChatActions.updateProgress({ loading: false, finished: true, visible: false });
        }
      }, 3000);
      if (loadConfig.type === 'upload') {
        const [err, _, myKey, size] = args;
        const conversation = loadConfig.conversation;
        const messageId = loadConfig.messageId;
        let body = loadConfig.msgBody;
        body.isUploading = false;
        body.aes = loadConfig.aes;
        body.mediaObjectId = myKey;
        log('load', `MessagePanel.loadMessage: mediaObjectId: `, myKey);
        if (err) {
          const str = `${conversation.name}:\nfile(${filepath}) transfer failed because error: ${err}`;
          console.error(str);
          log('load', `MessagePanel.loadMessage: error: ` + str);
          body.uploadFailed = true;
          body = JSON.stringify(body);
          const message = {
            id: messageId,
            conversationJid: conversation.jid,
            body,
            sender: conversation.curJid,
            sentTime: new Date().getTime() + edisonChatServerDiffTime,
            status: MESSAGE_STATUS_TRANSFER_FAILED,
          };
          MessageStore.saveMessagesAndRefresh([message]);
          return;
        } else {
          MessageSend.sendMessage(body, conversation, messageId, false, loadConfig.aes);
        }
      }
    };
    const loadProgressCallback = progress => {
      const { loaded, total } = progress;
      const percent = Math.floor((+loaded * 100.0) / +total);
      if (loadConfig.type === 'upload' && +loaded === +total) {
        let body = loadConfig.msgBody;
        body.isUploading = false;
        body = JSON.stringify(body);
        ChatActions.updateProgress({ percent, visible: true });
      }
      ChatActions.updateProgress({ percent });
    };

    if (loadConfig.type === 'upload') {
      const conversation = loadConfig.conversation;
      const atIndex = conversation.jid.indexOf('@');
      let jidLocal = conversation.jid.slice(0, atIndex);
      let aes = await MessageSend.getAESKey(conversation);
      loadConfig.aes = aes;
      try {
        loadConfig.request = uploadFile(
          jidLocal,
          aes,
          loadConfig.filepath,
          loadCallback,
          loadProgressCallback
        );
      } catch (e) {
        console.error('upload file:', e);
        alert(`failed to send file: ${loadConfig.filepath}: ${e}`);
        this.cancelLoadMessage();
        ChatActions.updateProgress({ failed: true, loading: false, visible: false });
        return;
      }
    } else {
      const tempFilePath = msgBody.path && msgBody.path.replace('file://', '');

      if (tempFilePath && !tempFilePath.match(/^https?:/) && fs.existsSync(tempFilePath)) {
        // the file has been downloaded to local
        if (tempFilePath !== filepath) {
          fs.copyFileSync(tempFilePath, filepath);
        }
        loadCallback();
      } else if (msgBody.mediaObjectId && !msgBody.mediaObjectId.match(/^https?:\/\//)) {
        // the file is on aws
        loadConfig.request = downloadFile(
          msgBody.aes,
          msgBody.mediaObjectId,
          filepath,
          loadCallback,
          loadProgressCallback
        );
      } else {
        // the file is a link to the web outside aws
        let request;
        if (msgBody.mediaObjectId.match(/^https/)) {
          request = https;
        } else {
          request = http;
        }
        request.get(msgBody.mediaObjectId, function(res) {
          var imgData = '';
          res.setEncoding('binary');
          res.on('data', function(chunk) {
            imgData += chunk;
          });
          res.on('end', function() {
            fs.writeFile(filepath, imgData, 'binary', function(err) {
              if (err) {
                console.error('down fail', err);
              } else {
                console.log('down success');
              }
              loadCallback();
            });
          });
        });
      }
    }

    if (this.loadTimer) {
      clearInterval(this.loadTimer);
    }
    this.loadTimer = setInterval(() => {
      if (loadConfig && loadConfig.request && loadConfig.request.failed) {
        ChatActions.updateProgress({ failed: true });
      }
    }, 10000);
    if (!navigator.onLine) {
      ChatActions.updateProgress({ offline: true, failed: true });
    }
  };

  cancelLoadMessage = () => {
    const { progress } = ProgressBarStore;
    let { loadConfig } = progress;
    if (!loadConfig) {
      return;
    }
    if (loadConfig && loadConfig.request && loadConfig.request.abort) {
      try {
        loadConfig.request.abort();
      } catch (e) {
        console.log('error on abort loading:', e);
      }
    }
    if (loadConfig && loadConfig.type === 'upload') {
      const conversation = loadConfig.conversation;
      const messageId = loadConfig.messageId;
      let body = loadConfig.msgBody;
      body.isUploading = false;
      body.path = body.localFile;
      //body.localFile = null;
      body = JSON.stringify(body);
    }
    ChatActions.updateProgress({ loading: false, visible: false });
    clearInterval(this.loadTimer);
  };

  retryLoadMessage = () => {
    ChatActions.updateProgress({ failed: false });
    setTimeout(async () => {
      await this.loadMessage();
    });
  };

  installApp = async e => {
    const conv = this.state.selectedConversation;
    const { curJid } = conv;
    const userId = curJid.split('@')[0];
    let token = await getToken(userId);
    xmpplogin(userId, token, (err, data) => {
      if (data) {
        data = JSON.parse(data);
        if (data.data && data.data.url) {
          exec('open ' + data.data.url);
        } else {
          alert('fail to open the app store page');
        }
      }
    });
  };

  render() {
    const { showConversationInfo, selectedConversation, contacts } = this.state;
    const currentUserId =
      selectedConversation && selectedConversation.curJid
        ? selectedConversation.curJid
        : NEW_CONVERSATION;
    const topBarProps = {
      onBackPressed: () => {
        ChatActions.deselectConversation()();
        this.setState({ showConversationInfo: false });
      },
      onInfoPressed: () =>
        this.setState({ showConversationInfo: !this.state.showConversationInfo }),
      selectedConversation,
    };
    const messagesProps = {
      currentUserId,
      selectedConversation,
      queueLoadMessage: this.queueLoadMessage,
    };
    const sendBarProps = {
      selectedConversation,
      queueLoadMessage: this.queueLoadMessage,
    };
    const infoProps = {
      selectedConversation,
      loadingMembers: this.state.loadingMembers,
      getRoomMembers: this.getRoomMembers,
      editProfile: this.editProfile,
      exitProfile: this.exitProfile,
      contacts,
      onCloseInfoPanel: () => this.setState({ showConversationInfo: false }),
    };
    let className = '';
    if (selectedConversation && selectedConversation.jid === NEW_CONVERSATION) {
      className = 'new-conversation-popup';
    }

    return (
      <div
        className={`panel`}
        onDragOverCapture={this.onDragOver}
        onDragEnd={this.onDragEnd}
        onMouseLeave={this.onDragEnd}
        onDrop={this.onDrop}
      >
        {selectedConversation ? (
          <div className={`split-panel ${className}`}>
            {selectedConversation.jid === NEW_CONVERSATION ? null : (
              <div className="chatPanel">
                <MessagesTopBar {...topBarProps} />
                <Messages {...messagesProps} sendBarProps={sendBarProps} />
                {this.state.dragover && <div id="message-dragdrop-override"></div>}
                <div>
                  <MessagesSendBar {...sendBarProps} />
                </div>
              </div>
            )}
            <Divider type="vertical" />
            <CSSTransitionGroup
              transitionName="transition-slide"
              transitionLeaveTimeout={250}
              transitionEnterTimeout={250}
            >
              {showConversationInfo && selectedConversation.jid !== NEW_CONVERSATION && (
                <div className="infoPanel">
                  <ConversationInfo {...infoProps} />
                </div>
              )}
            </CSSTransitionGroup>
          </div>
        ) : (
          <div className="unselectedHint">
            <span>
              <RetinaImg name={`EmptyChat.png`} mode={RetinaImg.Mode.ContentPreserve} />
            </span>
          </div>
        )}
        <OnlineStatus conversation={selectedConversation}></OnlineStatus>
        <MemberProfile
          conversation={selectedConversation}
          exitProfile={this.exitProfile}
        ></MemberProfile>
      </div>
    );
  }
}