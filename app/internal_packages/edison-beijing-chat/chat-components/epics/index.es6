import 'rxjs/Rx';
import { combineEpics } from 'redux-observable';
import * as authEpics from './auth';
import * as chatEpics from './chat';
import * as contactEpics from './contact';
import * as roomEpics from './room';
import * as timeEpics from './time';
import dbEpics from './db';

export default combineEpics(
  ...Object.values(authEpics),
  ...Object.values(chatEpics),
  ...Object.values(contactEpics),
  ...Object.values(roomEpics),
  ...Object.values(timeEpics),
  ...Object.values(dbEpics)
);
