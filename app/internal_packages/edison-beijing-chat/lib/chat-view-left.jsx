/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import ChatPage from '../chat-components/containers/ChatPage';
import chatModel from '../chat-components/store/model';
import { Provider } from 'react-redux';
import registerLoginChatAccounts from '../chat-components/utils/registerLoginChatAccounts';
const { history } = require('../chat-components/store/configureStore').default;
const BOTTOM_OFFSET = 5;
export default class ChatView extends Component {
  static displayName = 'ChatViewLeft';
  onDragStart(e) {
    const startY = e.clientY;
    const leftPanel = document.querySelector('.chat-left-panel-container');
    const height = leftPanel.offsetHeight;
    let distance = 0;
    const accSidebar = document.querySelector('.account-sidebar');
    const sidebarPanelHeight = accSidebar.parentNode.offsetHeight;
    const onMouseMove = (e) => {
      distance = startY - e.clientY;
      const panelNewHeight = sidebarPanelHeight - (height + distance);
      if (panelNewHeight < 10) {
        return;
      }
      accSidebar.style.height = panelNewHeight - BOTTOM_OFFSET + 'px';
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
    const height = AppEnv.config.get(`chatPanelHeight`);
    const accSidebar = document.querySelector('.account-sidebar');
    const sidebarPanelHeight = accSidebar.parentNode.offsetHeight;
    accSidebar.style.height = sidebarPanelHeight - height - BOTTOM_OFFSET + 'px';
    document.querySelector('.chat-left-panel-container').style.height = height + 'px';
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
          <ChatPage isLeft={true} onDragStart={this.onDragStart} resetHeight={this.resetHeight} />
        </Provider>
      </div>
    )
  }
}
