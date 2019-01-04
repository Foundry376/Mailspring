/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import ChatView from './chat-view'
import { RetinaImg } from 'mailspring-component-kit';
import { submitAuth } from '../chat-components/actions/auth';
import {
  Actions,
  WorkspaceStore
} from 'mailspring-exports';
const { configureStore } = require('../chat-components/store/configureStore').default;
const store = configureStore();

export default class ChatButton extends React.Component {
  static displayName = 'ChatButton';
  toggleChatPanel = () => {
    Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
  }

  // componentDidMount() {
  //   Actions.selectRootSheet(WorkspaceStore.Sheet.ChatView);
  // }
  render() {
    return (
      <div className="toolbar-chat">
        <button className="btn btn-toolbar" onClick={this.toggleChatPanel}>
          <RetinaImg name="toolbar-chat.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </div>
    )
  }
}