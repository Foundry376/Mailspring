import React, { Component } from 'react';
import PropTypes from 'prop-types';
import registerLoginChat from '../../../utils/register-login-chat';
import { RetinaImg } from 'mailspring-component-kit';
import { ChatActions, OnlineUserStore } from 'chat-exports';
import { log } from '../../../utils/log';
import { NEW_CONVERSATION } from '../../../utils/constant';

export default class OnlineStatus extends Component {
  static propTypes = {
    conversation: PropTypes.object,
  }

  constructor(props) {
    super(props);
    this.state = {
      online: true,
      chat_online: true,
      isAuthenticating: false,
    };
    this._listenToStore();
  }

  _listenToStore = () => {
    this._unsubs = [];
    this._unsubs.push(OnlineUserStore.listen(this._onDataChanged));
  }

  _onDataChanged = async () => {
    const { conversation } = this.props;
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
    const str = JSON.stringify(OnlineUserStore.onlineAccounts);
    const str2 = JSON.stringify(OnlineUserStore.authingAccounts);
    log('connect', `OnlineStatus._onDataChanged, chat_online: ${chat_online}, isAuthenticating: ${isAuthenticating}: onlineAccounts: ${str}, authingAccounts: ${str2}`);
    this.setState({
      chat_online,
      isAuthenticating
    }, () => {
      this.setPanelClassName();
    });
  }

  componentDidMount = async () => {
    window.addEventListener("online", this.onLine);
    window.addEventListener("offline", this.offLine);
    const { conversation } = this.props;
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
    }, () => {
      this.setPanelClassName();
    });
    // set offline notification left position
    this._resetLeftPosition();
  }

  componentDidUpdate = () => {
    // set offline notification left position
    this._resetLeftPosition();
  }

  _resetLeftPosition() {
    // set offline notification left position
    const offlineNotifs = document.querySelectorAll('.network-offline');
    if (offlineNotifs) {
      const columnEl = document.querySelector('.column-RootSidebar');
      for (const notif of offlineNotifs) {
        notif.style.left = `${columnEl.offsetWidth}px`;
      }
    }
  }


  componentWillReceiveProps = async (nextProps, nextContext) => {
    const { conversation } = nextProps;
    let chat_online, isAuthenticating;
    // 新建的聊天没有curJid
    if (conversation && conversation.jid !== NEW_CONVERSATION) {
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
    }, () => {
      this.setPanelClassName();
    });
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.onLine);
    window.removeEventListener("offline", this.offLine);
    for (const unsub of this._unsubs) {
      unsub();
    };
  }

  setPanelClassName = () => {
    const panel = document.querySelector('.panel');
    if (!panel) {
      return;
    }
    if (!this.state.online || !this.state.chat_online) {
      panel.className = 'panel offline';
    } else {
      panel.className = 'panel';
    }
  };

  onLine = () => {
    log('connect', `MessagePanel: chat online`);
    // connect to chat server
    if (!this.state.chat_online) {
      this.reconnect();
    }
    ChatActions.updateProgress({ offline: false });
    this.setPanelClassName();
    this.setState({
      online: true
    }, () => {
      this.setPanelClassName();
    })
  };

  offLine = () => {
    log('connect', `MessagePanel: chat offline`);
    ChatActions.updateProgress({ offline: true, failed: true });
    this.setState({
      online: false
    }, () => {
      // Actions.removeAppMessage(this._offlineBlock);
      this.setPanelClassName();
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
    return (
      <div className="network-offline">
        <RetinaImg name={'no-network.svg'}
          style={{ width: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
        <span>
          Edison Mail is offline. Please check your network connection.
          {this.state.isAuthenticating ? ' Trying to reconnect...' : ''}
        </span>
        {this.state.online ? (
          <span className="reconnect" onClick={this.reconnect}>Reconnect</span>
        ) : null}
      </div>
    )
  }
}
