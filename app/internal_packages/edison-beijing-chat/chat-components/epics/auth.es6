import uuid from 'uuid/v4';
import { Observable } from 'rxjs/Observable';
import xmpp from '../xmpp';
import {
  SUBMIT_AUTH,
  SUCCESS_AUTH,
  BEGIN_CONNECTION_AUTH,
  SUCCESS_CONNECTION_AUTH,
  FAIL_CONNECTION_AUTH,
  CONNECTION_ESTABLISHED,
  BEGIN_ENABLE_CARBONS,
  BEGIN_JOIN_ROOMS,
  successAuth,
  failAuth,
  beginConnectionAuth,
  successfulConnectionAuth,
  failConnectionAuth,
  beginEnablingCarbons,
  successfullyEnabledCarbons,
  failedEnablingCarbons,
  successfullyJoinedRooms,
  failedJoiningRooms,
} from '../actions/auth';
import { getDeviceId } from '../utils/e2ee';
import { RoomStore, ContactStore, E2eeStore } from 'chat-exports';

/**
 * Starts the authentication process by starting session creation
 */
export const submitAuthEpic = action$ => action$.ofType(SUBMIT_AUTH)
  .map(({ payload: { jid, password } }) => {
    return beginConnectionAuth(jid, password)
  });

/**
 * Creates a XMPP Connection and outputs success or failure
 */
export const createXmppConnectionEpic = action$ => action$.ofType(BEGIN_CONNECTION_AUTH)
  .mergeMap(({ payload }) => {
    return Observable.fromPromise(getDeviceId()).map((deviceId) => {
      return { payload, deviceId };
    });
  })
  .mergeMap(({ payload: { jid, password }, deviceId }) => {
    let sessionId = window.localStorage['sessionId' + jid.split('@')[0]]
    if (!sessionId) {
      sessionId = uuid();
    }
    xmpp.init({
      jid,
      password,
      transport: 'websocket',
      //wsURL: 'ws://192.168.1.103:5290'
      wsURL: 'wss://tigase.stag.easilydo.cc',
      resource: deviceId && deviceId.replace(/-/g, ''),
      deviceId: deviceId,//'2b92e45c-2fde-48e3-9335-421c8c57777f"',
      timestamp: new Date().getTime(),
      deviceType: 'desktop',
      deviceModel: process.platform,
      clientVerCode: '101',
      clientVerName: '1.0.0',
      sessionId
    });

    return Observable.fromPromise(xmpp.connect(jid))
      .map(res => {
        // fetch and saveRoom infomation
        setTimeout(() => {
          xmpp.getRoomList(null, res.bare)
            .then(rooms => RoomStore.saveRooms(rooms));
        }, 200);
        setTimeout(() => {
          xmpp.getRoster(res.bare)
            .then(contacts => {
              if (contacts && contacts.roster && contacts.roster.items) {
                ContactStore.saveContacts(contacts.roster.items, res.bare)
              }
            });
        }, 400);
        setTimeout(() => {
          xmpp.getE2ee('', res.bare)
            .then(e2ees => E2eeStore.saveE2ees(e2ees, res.bare));
        }, 600);
        setTimeout(() => {
          let ts = AppEnv.config.get(res.local + "_message_ts");
          xmpp.pullMessage(ts, res.bare)
            .then(e2ees => E2eeStore.saveE2ees(e2ees, res.bare));
        }, 800);
        return successfulConnectionAuth(res);
      })
      .catch(error => Observable.of(failConnectionAuth(error)));
  });

/**
 * Outputs authentication success when connection auth succeeds
 */
export const successAuthEpic = action$ => action$.ofType(SUCCESS_CONNECTION_AUTH)
  .map(({ jid }) => successAuth(jid));

/**
 * Outputs authentication failure when connection fails
 */
export const failAuthEpic = action$ => action$.ofType(FAIL_CONNECTION_AUTH)
  .map(({ payload }) => failAuth(payload));

/**
 * Trigger enabling carbons after connection is established
 */
// export const triggerEnableCarbonsEpic = action$ => action$.ofType(CONNECTION_ESTABLISHED)
//   .mapTo(beginEnablingCarbons());

/**
 * Enable carbons
 */
export const enableCarbonsEpic = action$ => action$.ofType(BEGIN_ENABLE_CARBONS)
  .mergeMap(() => Observable.fromPromise(xmpp.enableCarbons())
    .map(result => successfullyEnabledCarbons(result))
    .catch(error => Observable.of(failedEnablingCarbons(error)))
  );

/**
 * Joins xmpp rooms
 */
export const joinRoomsEpic = action$ => action$.ofType(BEGIN_JOIN_ROOMS)
  .mergeMap(({ payload: rooms }) => Observable.fromPromise(xmpp.joinRooms('', ...rooms))
    .map(res => successfullyJoinedRooms(res))
    .catch(err => Observable.of(failedJoiningRooms(err)))
  );
