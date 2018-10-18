import { createStore, applyMiddleware, compose } from 'redux';
import thunk from 'redux-thunk';
import { createEpicMiddleware } from 'redux-observable';
import { createHashHistory } from 'history';
import { routerMiddleware, routerActions } from 'react-router-redux';
import { createLogger } from 'redux-logger';
import Mousetrap from 'mousetrap';
import { createXmppMiddleware } from '../xmpp/redux/createXmppMiddleware';
import { createMousetrapMiddleware } from '../shortcuts/createMousetrapMiddleware';
import eventActions from '../xmpp/redux/eventActions';
import shortcutActions from '../shortcuts/shortcutActions';
import xmpp from '../xmpp';
import rootEpic from '../epics';
import rootReducer from '../reducers';

const history = createHashHistory();

const configureStore = () => {
  // Redux Configuration
  const middleware = [];
  const enhancers = [];

  // Thunk Middleware
  middleware.push(thunk);

  // Epic Middleware
  middleware.push(createEpicMiddleware(rootEpic));

  // Xmpp Middleware
  middleware.push(createXmppMiddleware(xmpp, eventActions));

  // Mousetrap Middleware
  middleware.push(createMousetrapMiddleware(Mousetrap, shortcutActions));

  // Logging Middleware
  // will show too many messages about redex actions on  develop tools console
  // so comment below out
  const logger = createLogger({
    level: 'info',
    collapsed: true
  });
  middleware.push(logger);

  // Router Middleware
  const router = routerMiddleware(history);
  middleware.push(router);

  // Redux DevTools Configuration
  const actionCreators = {

    ...routerActions,
  };
  // If Redux DevTools Extension is installed use it, otherwise use Redux compose
  /* eslint-disable no-underscore-dangle */
  const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
    ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({
      // Options: http://zalmoxisus.github.io/redux-devtools-extension/API/Arguments.html
      actionCreators,
    })
    : compose;
  /* eslint-enable no-underscore-dangle */

  // Apply Middleware & Compose Enhancers
  enhancers.push(applyMiddleware(...middleware));
  const enhancer = composeEnhancers(...enhancers);

  // Create Store
  const store = createStore(rootReducer, enhancer);

  if (module.hot) {
    module.hot.accept('../reducers', () =>
      store.replaceReducer(require('../reducers')) // eslint-disable-line global-require
    );
  }

  return store;
};

export default { configureStore, history };
