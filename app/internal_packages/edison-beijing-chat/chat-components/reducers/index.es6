import { combineReducers } from 'redux';
import auth from './auth';
import chat from './chat';
import time from './time';

const rootReducer = combineReducers({
  auth,
  chat,
  time,
});

export default rootReducer;
