import 'rxjs/Rx';
import { combineEpics } from 'redux-observable';
import * as chatEpics from './chat';

export default combineEpics(
  ...Object.values(chatEpics),
);
