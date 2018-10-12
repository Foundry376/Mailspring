/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import Root from '../chat-components/containers/Root';
const { configureStore, history } = require('../chat-components/store/configureStore').default;
import injectTapEventPlugin from 'react-tap-event-plugin';
injectTapEventPlugin();
const store = configureStore();

export default class ChatButton extends React.Component {
  static displayName = 'ChatView';

  render() {
    const { showFlag } = this.props;
    return (
      <div className="chat-view-container" style={{ display: showFlag ? 'block' : 'none' }}>
        <Root store={store} history={history} />
      </div>
    )
  }
}
