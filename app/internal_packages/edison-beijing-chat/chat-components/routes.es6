import React from 'react';
import { Switch, Route } from 'react-router-dom';
import App from './containers/App';
import HomePage from './containers/HomePage';
import ChatPage from './containers/ChatPage';

export default () => (
  <App>
    <Switch>
      <Route exact path="/" component={ChatPage} />
      <Route path="/chat" component={ChatPage} />
    </Switch>
  </App>
);
