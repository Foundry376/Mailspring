import 'rxjs/Rx';
import { combineEpics } from 'redux-observable';
import * as authEpics from './auth';
import * as chatEpics from './chat';
import * as timeEpics from './time';
import * as appsEpics from './apps';

export default combineEpics(
  ...Object.values(authEpics),
  ...Object.values(chatEpics),
  ...Object.values(timeEpics),
  ...window.pluginEpics,
  ...Object.values(appsEpics),
);
