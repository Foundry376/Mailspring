import React from 'react';
import { Provider } from 'react-redux';
import Routes from '../routes';

const Root = ({ store, history }) => ( // eslint-disable-line react/prop-types
  <Provider store={store}>
    <Routes />
  </Provider>
);

export default Routes;
