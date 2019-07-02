import React, { Component } from 'react';
import PropTypes from 'prop-types';
import registerLoginChat from '../../../../utils/register-login-chat';
import { RetinaImg } from 'mailspring-component-kit';
import { ChatActions, OnlineUserStore } from 'chat-exports';
import { log } from '../../../../utils/log-util';

export default class OnlineStatus extends Component {
  static propTypes = {
    conversation: PropTypes.object,
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
    this._unsubs.push(this._onDataChanged);
  }

  _onDataChanged = async () => {
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
    }, () => {
      this.setPanelClassName();
    });
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
    }, () => {
      this.setPanelClassName();
    });
  }

  componentWillReceiveProps = async (nextProps, nextContext) => {
    const {conversation} = nextProps;
    console.log( 'componentWillReceiveProps: ', nextProps, OnlineUserStore.onlineAccounts, OnlineUserStore.authingAccounts);
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
    console.log( 'setPanelClassName: ', this.state, panel);
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
    log(`MessagePanel: chat online`);
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
    log(`MessagePanel: chat offline`);
    ChatActions.updateProgress({ offline: true, failed: true });
    this.setState({
      online: false
    }, () => {
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
