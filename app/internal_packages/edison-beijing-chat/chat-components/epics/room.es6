import { Observable } from 'rxjs/Observable';
import { SUCCESS_AUTH } from '../actions/auth';
import xmpp from '../xmpp';

import {
  BEGIN_FETCH_ROOM,
  SUCCESS_FETCH_ROOM,
  fetchRoom,
  succesfullyFetchedRoom,
  failedFetchingRoom
} from '../actions/room';

import {
  storeRooms
} from '../actions/db/room';

export const triggerFetchRoomrEpic = action$ =>
  action$.ofType(SUCCESS_AUTH)
    .map(fetchRoom)

export const fetchRosterEpic = action$ =>
  action$.ofType(BEGIN_FETCH_ROOM)//yazzxx2
    .mergeMap(() =>
      Observable.fromPromise(xmpp.getRoomList("")) // TODO quanzs pass the version to here
        .map(rooms => succesfullyFetchedRoom(rooms))//yazzxx3
        .catch(err => Observable.of(failedFetchingRoom(err)))
    );

export const triggerStoreRoomsEpic = action$ =>
  action$.ofType(SUCCESS_FETCH_ROOM)
    .filter(({ payload: { discoItems: { items } } }) => {
      if (items && items.length) {
        for (const item of items) {
          if (!item.name) {
            return true;
          }
        }
      }
      return false;
    })
    .map(({ payload: { discoItems: { items } } }) => storeRooms(items));

