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
import registerLoginChat from '../../../../utils/register-login-chat';
import { RetinaImg } from 'mailspring-component-kit';
import { ProgressBarStore, ChatActions, MessageStore, ConversationStore, ContactStore, RoomStore, UserCacheStore, OnlineUserStore, MemberProfileStore } from 'chat-exports';
import MemberProfile from '../conversations/MemberProfile';

import { xmpplogin } from '../../../../utils/restjs';
import fs from "fs";
import https from "https";
import http from "http";
import { MESSAGE_STATUS_TRANSFER_FAILED } from '../../../../model/Message';
import { sendFileMessage } from '../../../../utils/message';
import { getToken } from '../../../../utils/appmgt';
import { log } from '../../../../utils/log-util';
import { LocalStorage } from 'chat-exports';
import { alert } from '../../../../utils/electron';

const { exec } = require('child_process');
const GROUP_CHAT_DOMAIN = '@muc.im.edison.tech';

export default class Online extends Component {
  static propTypes = {
    conversation: PropTypes.object.isRequired,
  }

  apps = []

  constructor(props) {
    super(props);
    this.state = {
      online: true,
      chat_online: true,
      isAuthenticating:false,

    }
    this._listenToStore();
  }

  _listenToStore = () => {
    this._unsubs = [];
    this._unsubs.push(OnlineUserStore.listen(() => this._onDataChanged('online')));
  }

  _onDataChanged = async (changedDataName) => {
    if (changedDataName === 'online') {
      const {conversation} = this.props;
      let chat_online, isAuthenticating;
      if (conversation) {
        const { curJid } = conversation;
        console.log('on chat_online change: curJid, OnlineUserStore.onlineAccounts: ', curJid, OnlineUserStore.onlineAccounts);
        chat_online = !!OnlineUserStore.onlineAccounts[curJid];
        isAuthenticating = !!OnlineUserStore.authingAccounts[curJid];
      } else {
        chat_online = true;
        isAuthenticating = false;
      }
      this.setState({
        chat_online,
        isAuthenticating
      });
    }
  }

  componentDidMount = async () => {
    window.addEventListener("online", this.onLine);
    window.addEventListener("offline", this.offLine);
    const {conversation} = this.props;
    let chat_online, isAuthenticating;
    if (conversation) {
      const { curJid } = conversation;
      chat_online = !!OnlineUserStore.onlineAccounts[curJid];
      isAuthenticating = !!OnlineUserStore.authingAccounts[curJid];
    } else {
      chat_online = true;
      isAuthenticating = false;
    }
    this.setState({
      online: navigator.onLine,
      chat_online,
      isAuthenticating
    });
  }

  componentWillReceiveProps = async (nextProps, nextContext) => {
    const {conversation} = this.props;
    let chat_online, isAuthenticating;
    if (conversation) {
      const { curJid } = conversation;
      chat_online = !!OnlineUserStore.onlineAccounts[curJid];
      isAuthenticating = !!OnlineUserStore.authingAccounts[curJid];
    } else {
      chat_online = true;
      isAuthenticating = false;
    }
    this.setState({
      online: navigator.onLine,
      chat_online,
      isAuthenticating
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
    if (!this.state.chat_online) {
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

  reconnect = () => {
    registerLoginChat();
  }

  render() {
    const isOffLine = !this.state.online || !this.state.chat_online;
    if (!isOffLine) {
      return null;
    }
    return (<div className="network-offline">
            {this.state.online ? (
              this.state.isAuthenticating ? (
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
          </div>)
  }
}
