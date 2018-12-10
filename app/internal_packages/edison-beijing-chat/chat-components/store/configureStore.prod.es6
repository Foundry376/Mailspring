import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { createEpicMiddleware } from 'redux-observable';
import { createHashHistory } from 'history';
import { routerMiddleware } from 'react-router-redux';
import Mousetrap from 'mousetrap';
import { createXmppMiddleware } from '../xmpp/redux/createXmppMiddleware';
import { createMousetrapMiddleware } from '../shortcuts/createMousetrapMiddleware';
import eventActions from '../xmpp/redux/eventActions';
import shortcutActions from '../shortcuts/shortcutActions';
import xmpp from '../xmpp';
import rootEpic from '../epics';
import rootReducer from '../reducers';
import chatModel from './model';

const history = createHashHistory();
const router = routerMiddleware(history);
const epics = createEpicMiddleware(rootEpic);
const xmppMiddleware = createXmppMiddleware(xmpp, eventActions);
const mousetrapMiddleware = createMousetrapMiddleware(Mousetrap, shortcutActions);
const enhancer = applyMiddleware(thunk, router, epics, xmppMiddleware, mousetrapMiddleware);

function configureStore() {
  const store = createStore(rootReducer, enhancer);
  chatModel.store = store;
  return store;
}

export default { configureStore, history };
