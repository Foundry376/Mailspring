/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import ChatPage from '../chat-components/containers/ChatPage';
import chatModel from '../chat-components/store/model';
import { Provider } from 'react-redux';
import { ConnectedRouter } from 'react-router-redux';
import registerLoginChatAccounts from '../chat-components/utils/registerLoginChatAccounts';
const { configureStore, history } = require('../chat-components/store/configureStore').default;

export default class ChatView extends Component {
  static displayName = 'ChatViewLeft';
  onDragStart(e) {
    const startY = e.clientY;
    const leftPanel = document.querySelector('.chat-left-panel-container');
    const height = leftPanel.offsetHeight;
    let distance = 0;
    const onMouseMove = (e) => {
      distance = startY - e.clientY;
      leftPanel.style.height = height + distance + 'px';
    }
    window.onmousemove = onMouseMove;
    window.onmouseup = () => {
      window.onmousemove = null;
      window.onmouseup = null;
      AppEnv.config.set(`chatPanelHeight`, leftPanel.offsetHeight);
    }
  }
  componentDidMount() {
    document.querySelector('.chat-left-panel-container').style.height = AppEnv.config.get(`chatPanelHeight`) + 'px';
    registerLoginChatAccounts();
  }
  resetHeight() {
    const leftPanel = document.querySelector('.chat-left-panel-container');
    leftPanel.style.height = '300px';
  }
  render() {
    return (
      <div className="chat-view-container chat-left-panel-container">
        <Provider store={chatModel.store}>
          <ConnectedRouter history={history}>
            <ChatPage isLeft={true} onDragStart={this.onDragStart} resetHeight={this.resetHeight} />
          </ConnectedRouter>
        </Provider>
      </div>
    )
  }
}
