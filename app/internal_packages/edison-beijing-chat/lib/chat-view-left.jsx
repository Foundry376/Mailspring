/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import ChatPage from '../chat-components/containers/ChatPage';
import chatModel from '../chat-components/store/model';
import { Provider } from 'react-redux';
import { ConnectedRouter } from 'react-router-redux';

const { configureStore, history } = require('../chat-components/store/configureStore').default;

export default class ChatView extends Component {
  static displayName = 'ChatViewLeft';

  render() {
    return (
      <div className="chat-view-container chat-left-panel-container">
        <Provider store={chatModel.store}>
          <ConnectedRouter history={history}>
            <ChatPage isLeft={true} />
          </ConnectedRouter>
        </Provider>
      </div>
    )
  }
}
