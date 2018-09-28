import { combineReducers } from 'redux';
import { routerReducer as router } from 'react-router-redux';
import auth from './auth';
import chat from './chat';
import contact from './contact';
import time from './time';

const rootReducer = combineReducers({
  auth,
  chat,
  contact,
  time,
  router,
});

export default rootReducer;
