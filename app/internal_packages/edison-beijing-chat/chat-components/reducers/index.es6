import { combineReducers } from 'redux';
import auth from './auth';
import chat from './chat';
import contact from './contact';
import time from './time';
import room from './room';

const rootReducer = combineReducers({
  auth,
  chat,
  contact,
  time,
  room,
});

export default rootReducer;
