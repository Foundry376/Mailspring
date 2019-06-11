/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import { Actions } from 'mailspring-exports';
import ConversationsPanel from '../chat-components/components/chat/conversations/ConversationsPanel';
import registerLoginChatAccounts from '../chat-components/utils/registerLoginChatAccounts';
const BOTTOM_OFFSET = 0;
export default class ChatViewLeft extends Component {
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
      // accSidebar.style.height = panelNewHeight - BOTTOM_OFFSET + 'px';
      leftPanel.style.height = height + distance + 'px';
      Actions.updateChatPanelHeight(leftPanel.getBoundingClientRect().top);
    }
    window.onmousemove = onMouseMove;
    window.onmouseup = () => {
      window.onmousemove = null;
      window.onmouseup = null;
      AppEnv.config.set(`chatPanelHeight`, leftPanel.offsetHeight);
    }
  }
  calcPanel(h) {
    const leftPanel = document.querySelector('.chat-left-panel-container');
    const { devMode } = AppEnv.getLoadSettings();
    if (devMode) {
      leftPanel.style.bottom = '115px';
    }

    const accSidebar = document.querySelector('.account-sidebar');
    if (accSidebar) {
      const sidebarPanelHeight = accSidebar.parentNode.offsetHeight;
      // accSidebar.style.height = sidebarPanelHeight - h - BOTTOM_OFFSET + 'px';
      leftPanel.style.height = h + 'px';
      Actions.updateChatPanelHeight(leftPanel.getBoundingClientRect().top);
    }
  }
  componentDidMount() {
    const h = AppEnv.config.get(`chatPanelHeight`);
    // bug fix: the height calculation goes wrong if not wait some time
    setTimeout(() => {
      this.calcPanel(h);
    }, 500);
    registerLoginChatAccounts();
  }
  resetHeight = () => {
    this.calcPanel(300);
  }
  render() {
    return (
      <div className="chat-view-container chat-left-panel-container">
        <div className="chatPageContainer">
          <div className="leftPanel">
            <div onDoubleClick={this.resetHeight} onMouseDown={this.onDragStart} className="resizeBar"></div>
            <ConversationsPanel />
          </div>
        </div>
      </div>
    )
  }
}
