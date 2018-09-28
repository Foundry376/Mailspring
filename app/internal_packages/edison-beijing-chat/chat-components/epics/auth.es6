import { Observable } from 'rxjs/Observable';
import { replace } from 'react-router-redux';
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

/**
 * Starts the authentication process by starting session creation
 */
export const submitAuthEpic = action$ => action$.ofType(SUBMIT_AUTH)
  .map(({payload: {jid, password}}) => beginConnectionAuth(jid, password));

/**
 * Creates a XMPP Connection and outputs success or failure
 */
export const createXmppConnectionEpic = action$ => action$.ofType(BEGIN_CONNECTION_AUTH)
  .mergeMap(({payload: {jid, password}}) => {
    xmpp.init({
      jid,
      password,
      transport: 'websocket',
      //wsURL: 'ws://192.168.1.103:5290'
      wsURL: 'ws://tigase.stag.easilydo.cc:5290'
    });
    return Observable.fromPromise(xmpp.connect())
      .map(res => successfulConnectionAuth(res))
      .catch(error => Observable.of(failConnectionAuth(error)));
  });

/**
 * Outputs authentication success when connection auth succeeds
 */
export const successAuthEpic = action$ => action$.ofType(SUCCESS_CONNECTION_AUTH)
  .map(({payload}) => successAuth(payload));

/**
 * Outputs authentication failure when connection fails
 */
export const failAuthEpic = action$ => action$.ofType(FAIL_CONNECTION_AUTH)
  .map(({payload}) => failAuth(payload));

/**
 * Replaces the current page after successful authentication
 */
export const successAuthRedirectEpic = action$ => action$.ofType(SUCCESS_AUTH)
  .mapTo(replace('/chat'));

/**
 * Trigger enabling carbons after connection is established
 */
export const triggerEnableCarbonsEpic = action$ => action$.ofType(CONNECTION_ESTABLISHED)
  .mapTo(beginEnablingCarbons());

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
  .mergeMap(({payload: rooms}) => Observable.fromPromise(xmpp.joinRooms(...rooms))
    .map(res => successfullyJoinedRooms(res))
    .catch(err => Observable.of(failedJoiningRooms(err)))
);
