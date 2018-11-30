/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import Root from '../chat-components/containers/Root';
import chatModel from '../chat-components/store/model';

const { configureStore, history } = require('../chat-components/store/configureStore').default;

export default class ChatView extends React.Component {
  static displayName = 'ChatView';

  render() {
    return (
      <div className="chat-view-container">
        <Root store={chatModel.store} history={history} />
      </div>
    )
  }
}
