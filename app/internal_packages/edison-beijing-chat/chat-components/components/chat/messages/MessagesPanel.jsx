import React, { Component } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';
import MessagesTopBar from './MessagesTopBar';
import NewConversationTopBar from './NewConversationTopBar';
import MessagesSendBar from './MessagesSendBar';
import Messages from './Messages';
import ConversationInfo from '../conversations/ConversationInfo';
import Divider from '../../common/Divider';
import { downloadFile, uploadFile } from '../../../../utils/awss3';
import uuid from 'uuid/v4';
import { NEW_CONVERSATION } from '../../../actions/chat';
import { FILE_TYPE } from '../../../../utils/filetypes';
import registerLoginChatAccounts from '../../../../utils/registerLoginChatAccounts';
import { RetinaImg } from 'mailspring-component-kit';
import { ProgressBarStore, ChatActions, MessageStore, ConversationStore, ContactStore, RoomStore } from 'chat-exports';
import MemberProfile from '../conversations/MemberProfile';

import { xmpplogin } from '../../../../utils/restjs';
import fs from "fs";
import https from "https";
import http from "http";
import { MESSAGE_STATUS_UPLOAD_FAILED } from '../../../../model/Message';
import { beginSendingMessage } from '../../../actions/chat';
import { sendFileMessage } from '../../../../utils/message';
import { getToken, getMyApps } from '../../../../utils/appmgt';
import { log } from '../../../../utils/log-util';

const { exec } = require('child_process');
const GROUP_CHAT_DOMAIN = '@muc.im.edison.tech';

window.registerLoginChatAccounts = registerLoginChatAccounts;

export default class MessagesPanel extends Component {
  static propTypes = {
    sendMessage: PropTypes.func.isRequired,
    currentUserId: PropTypes.string,
    referenceTime: PropTypes.number,
  }

  static defaultProps = {
    availableUsers: [],
    currentUserId: null,
    referenceTime: new Date().getTime(),
  }

  apps = []

  constructor(props) {
    super(props);
    this.state = {
      showConversationInfo: false,
      membersTemp: null,
      online: true,
      connecting: false,
      moreBtnEl: null,
      progress: {
        loadConfig: null
      },
      selectedConversation: null,
      contacts: []
    }
    this._listenToStore();
  }

  _listenToStore = () => {
    this._unsubs = [];
    this._unsubs.push(ConversationStore.listen(() => this._onDataChanged('conversation')));
    this._unsubs.push(ContactStore.listen(() => this._onDataChanged('contact')));
  }

  _onDataChanged = async (changedDataName) => {
    if (changedDataName === 'conversation') {
      const selectedConversation = await ConversationStore.getSelectedConversation();
      if (!selectedConversation.isGroup && !selectedConversation.email) {
        const user = await ContactStore.findContactByJid(selectedConversation.jid);
        selectedConversation.email = user.email;
      }
      this.setState({
        selectedConversation
      });
    }
    else if (changedDataName === 'contact') {
      const contacts = await ContactStore.getContacts();
      this.setState({
        contacts
      });
    }
  }

  componentDidMount = async () => {
    window.addEventListener("online", this.onLine);
    window.addEventListener("offline", this.offLine);
    const contacts = await ContactStore.getContacts();
    const selectedConversation = await ConversationStore.getSelectedConversation();
    this.setState({
      online: navigator.onLine,
      contacts,
      selectedConversation
    });
  }
  componentWillUnmount() {
    window.removeEventListener("online", this.onLine);
    window.removeEventListener("offline", this.offLine);
    for (const unsub of this._unsubs) {
      unsub();
    };
  }

  onLine = () => {
    log(`MessagePanel: chat online`);
    // connect to chat server
    if (!this.props.chat_online) {
      this.reconnect();
    }
    ChatActions.updateProgress({ offline: false });
    this.setState({
      online: true
    })
  };

  offLine = () => {
    log(`MessagePanel: chat offline`);
    ChatActions.updateProgress({ offline: true, failed: true });
    this.setState({
      online: false
    })
  };

  saveRoomMembersForTemp = (members) => {
    this.setState({ membersTemp: members })
  }

  onDragOver = (event) => {
    const state = Object.assign({}, this.state, { dragover: true });
    this.setState(state);
  }

  onDragEnd = (event) => {
    const state = Object.assign({}, this.state, { dragover: false });
    this.setState(state);
  }

  onDrop = (event) => {
    let tranFiles = event.dataTransfer.files,
      files = [];
    for (let i = 0; i < tranFiles.length; i++) {
      files.push(tranFiles[i].path);
    }
    const state = Object.assign({}, this.state, { dragover: false });
    this.setState(state);
    this.sendFile(files);
  }

  sendFile(files) {
    const { selectedConversation } = this.state;
    const onMessageSubmitted = this.props.sendMessage;
    const atIndex = selectedConversation.jid.indexOf('@');

    let jidLocal = selectedConversation.jid.slice(0, atIndex);

    files.map((file, index) => sendFileMessage(file, index, this, ' '));
  }

  createRoom = () => {
    const members = this.state.membersTemp;
    if (members && members.length) {
      if (members.length > 4) {
        const roomId = uuid() + GROUP_CHAT_DOMAIN;
        const names = members.map(item => item.name);
        const chatName = names.slice(0, 3).join(', ') + ' & ' + `${names.length - 3} others`;
        ConversationStore.createGroupConversation({ contacts: members, roomId, name: chatName, curJid: members[0].curJid });
      }
      else if (members.length > 1) {
        if (members.some((member) => member.jid.match(/@app/))) {
          window.alert('plugin app should only create private conversation with single member!');
          return;
        }
        const roomId = uuid() + GROUP_CHAT_DOMAIN;
        const names = members.map(item => item.name);
        const chatName = names.slice(0, names.length - 1).join(', ') + ' & ' + names[names.length - 1];
        ConversationStore.createGroupConversation({ contacts: members, roomId, name: chatName, curJid: members[0].curJid });
      }
      else if (members.length == 1) {
        ConversationStore.createPrivateConversation(members[0]);
      }
    }
  }

  editProfile = member => {
    const { profile } = this;
    profile.clickSame = member && member === profile.state.member;
    setTimeout(() => {
      this.profile.setMember(member);
    }, 10);
  }

  exitProfile = async member => {
    if (!member) {
      return;
    }
    const jid = member.jid.bare || member.jid;
    const nicknames = chatLocalStorage.nicknames;
    if (nicknames[jid] != member.nickname) {
      nicknames[jid] = member.nickname;
      saveToLocalStorage();
    }
    this.profile.setMember(null);
  }

  reconnect = () => {
    registerLoginChatAccounts();
  }

  queueLoadMessage = (loadConfig) => {
    let { progress } = ProgressBarStore;
    progress = Object.assign({}, progress);
    let { loading } = progress;
    if (loading) {
      loadConfig = progress.loadConfig;
      const loadText = loadConfig.type === 'upload' ? 'An upload' : ' A download';
      window.alert(`${loadText} is processing, please wait it to be finished!`);
      return;
    }
    ChatActions.updateProgress({ loadConfig, loading: true, visible: true },
      { onCancel: this.cancelLoadMessage, onRetry: this.retryLoadMessage });
    if (!loading) {
      this.loadMessage();
    }
  };

  loadMessage = () => {
    const { progress } = ProgressBarStore;
    let { loadConfig } = progress;
    ChatActions.updateProgress({ loading: true, percent: 0, finished: false, failed: false, visible: true });
    const { msgBody, filepath } = loadConfig;

    const loadCallback = (...args) => {
      ChatActions.updateProgress({ loading: false, finished: true, visible: true });
      clearInterval(this.loadTimer);
      setTimeout(() => {
        if (!ProgressBarStore.progress.loading) {
          ChatActions.updateProgress({ loading: false, finished: true, visible: false });
        }
      }, 3000);
      if (loadConfig.type === 'upload') {
        const onMessageSubmitted = this.props.sendMessage;
        const [err, _, myKey, size] = args;
        const conversation = loadConfig.conversation;
        const messageId = loadConfig.messageId;
        let body = loadConfig.msgBody;
        body.type = FILE_TYPE.OTHER_FILE;
        body.isUploading = false;
        body.mediaObjectId = myKey;
        body = JSON.stringify(body);
        if (err) {
          console.error(`${conversation.name}:\nfile(${filepath}) transfer failed because error: ${err}`);
          const message = {
            id: messageId,
            conversationJid: conversation.jid,
            body,
            sender: conversation.curJid,
            sentTime: (new Date()).getTime() + edisonChatServerDiffTime,
            status: MESSAGE_STATUS_UPLOAD_FAILED,
          };
          MessageStore.saveMessagesAndRefresh([message]);
          return;
        } else {
          onMessageSubmitted(conversation, body, messageId, false);
        }
      }
    }

    const loadProgressCallback = progress => {
      const { loaded, total } = progress;
      const percent = Math.floor(+loaded * 100.0 / (+total));
      if (loadConfig.type === 'upload' && +loaded === +total) {
        const onMessageSubmitted = this.props.sendMessage;
        const conversation = loadConfig.conversation;
        const messageId = loadConfig.messageId;
        let body = loadConfig.msgBody;
        body.isUploading = false;
        body = JSON.stringify(body);
        ChatActions.updateProgress({ percent, visible: true });
        onMessageSubmitted(conversation, body, messageId, false);
      }
      ChatActions.updateProgress({ percent });
    }
    if (loadConfig.type === 'upload') {
      const conversation = loadConfig.conversation;
      const atIndex = conversation.jid.indexOf('@');
      let jidLocal = conversation.jid.slice(0, atIndex);
      try {
        loadConfig.request = uploadFile(jidLocal, null, loadConfig.filepath, loadCallback, loadProgressCallback);
      } catch (e) {
        console.error('upload file:', e);
        window.alert(`failed to send file: ${loadConfig.filepath}: ${e}`);
        this.cancelLoadMessage();
        ChatActions.updateProgress({ failed: true, loading: false, visible: false });
        return;
      }
    } else if (msgBody.path && !msgBody.path.match(/^((http:)|(https:))/)) {
      // the file is an image and it has been downloaded to local while the message was received
      let imgpath = msgBody.path.replace('file://', '');
      if (imgpath !== filepath) {
        fs.copyFileSync(imgpath, filepath);
      }
      loadCallback();
    } else if (!msgBody.mediaObjectId.match(/^https?:\/\//)) {
      // the file is on aws
      loadConfig.request = downloadFile(msgBody.aes, msgBody.mediaObjectId, filepath, loadCallback, loadProgressCallback);
    } else {
      // the file is a link to the web outside aws
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
          fs.writeFile(filepath, imgData, 'binary', function (err) {
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

    if (this.loadTimer) {
      clearInterval(this.loadTimer);
    }
    this.loadTimer = setInterval(() => {
      if (loadConfig && loadConfig.request && loadConfig.request.failed) {
        ChatActions.updateProgress({ failed: true });
      }
    }, 10000);
  }

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
        console.log('abort loading:', e);
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
      chatReduxStore.dispatch(beginSendingMessage(conversation, body, messageId, false, false));
    }
    ChatActions.updateProgress({ loading: false, failed: true });
    clearInterval(this.loadTimer);
  }

  retryLoadMessage = () => {
    ChatActions.updateProgress({ failed: false });
    setTimeout(() => {
      this.loadMessage();
    })
  };

  installApp = async (e) => {
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
          window.alert('fail to open the app store page');
        }
      }
    })
  }

  render() {
    const { showConversationInfo, selectedConversation, contacts } = this.state;
    const {
      sendMessage,
      availableUsers,
      referenceTime,
    } = this.props;
    const currentUserId = selectedConversation && selectedConversation.curJid ? selectedConversation.curJid : NEW_CONVERSATION;
    const topBarProps = {
      onBackPressed: () => {
        ChatActions.deselectConversation()();
        this.setState({ showConversationInfo: false });
      },
      onInfoPressed: () =>
        this.setState({ showConversationInfo: !this.state.showConversationInfo }),
      availableUsers,
      selectedConversation,
    };
    const messagesProps = {
      currentUserId,
      referenceTime,
      selectedConversation,
      onMessageSubmitted: sendMessage,
      queueLoadMessage: this.queueLoadMessage,
    };
    const sendBarProps = {
      onMessageSubmitted: sendMessage,
      selectedConversation,
      queueLoadMessage: this.queueLoadMessage,
    };
    const newConversationProps = {
      contacts,
      saveRoomMembersForTemp: this.saveRoomMembersForTemp,
      createRoom: this.createRoom
    }
    const infoProps = {
      selectedConversation,
      loadingMembers: this.state.loadingMembers,
      getRoomMembers: this.getRoomMembers,
      editProfile: this.editProfile,
      exitProfile: this.exitProfile,
      contacts,
    };
    let className = '';
    if (selectedConversation && selectedConversation.jid === NEW_CONVERSATION) {
      className = 'new-conversation-popup'
    }

    const isOffLine = !this.state.online || !this.props.chat_online;
    return (
      <div className={`panel ${isOffLine ? 'offline' : ''}`}
        onDragOverCapture={this.onDragOver}
        onDragEnd={this.onDragEnd}
        onMouseLeave={this.onDragEnd}
        onDrop={this.onDrop}
      >
        {selectedConversation ?
          <div className="chat">
            <div className={`split-panel ${className}`}>
              {
                selectedConversation.jid === NEW_CONVERSATION ? (
                  <div className="chatPanel">
                    <NewConversationTopBar {...newConversationProps} />
                  </div>
                ) : (
                    <div className="chatPanel">
                      <MessagesTopBar {...topBarProps} />
                      <Messages {...messagesProps} sendBarProps={sendBarProps} />
                      {this.state.dragover && (
                        <div id="message-dragdrop-override"></div>
                      )}
                      <div>
                        <MessagesSendBar {...sendBarProps} />
                      </div>
                    </div>
                  )
              }
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
          </div> :
          <div className="unselectedHint">
            <span>
              <RetinaImg name={`EmptyChat.png`} mode={RetinaImg.Mode.ContentPreserve} />
            </span>
          </div>
        }
        {isOffLine && (
          <div className="network-offline">
            {this.state.online ? (
              this.props.isAuthenticating ? (
                <div>
                  <RetinaImg name={'no-network.svg'}
                    style={{ width: 16 }}
                    isIcon
                    mode={RetinaImg.Mode.ContentIsMask} />
                  <span>Your computer appears to be disconnected. Edison Mail is trying to reconnect. </span>
                </div>
              ) : (
                  <div>
                    <RetinaImg name={'no-network.svg'}
                      style={{ width: 16 }}
                      isIcon
                      mode={RetinaImg.Mode.ContentIsMask} />
                    <span>There appears to be a problem with your connection. Please click to reconnect: </span>
                    <span className="reconnect" onClick={this.reconnect}>Reconnect Now</span>
                  </div>
                )
            ) : (<div>
              <RetinaImg name={'no-network.svg'}
                style={{ width: 16 }}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask} />
              <span>Your computer appears to be offline. Please check your network connection.</span>
            </div>)}
          </div>
        )}
        <MemberProfile conversation={selectedConversation}
          exitProfile={this.exitProfile}
          panel={this}>
        </MemberProfile>
      </div>
    );
  }
}
