import { combineReducers } from 'redux';
import auth from './auth';
import time from './time';

const rootReducer = combineReducers({
  auth,
  time,
});

export default rootReducer;
