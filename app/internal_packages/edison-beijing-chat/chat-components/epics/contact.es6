import { Observable } from 'rxjs/Observable';
import { SUCCESS_AUTH } from '../actions/auth';
import {
  BEGIN_FETCH_ROSTER,
  SUCCESS_FETCH_ROSTER,
  BEGIN_FETCH_E2EE,
  SUCCESS_FETCH_E2EE,
  failedFetchingRoster,
  fetchRoster,
  succesfullyFetchedRoster,
  fetchE2ee,
  succesfullyFetchedE2ee
} from '../actions/contact';
import {
  storeContacts,
  storeE2ees
} from '../actions/db/contact';
import { generateKey } from '../utils/rsa';
import xmpp from '../xmpp';
import { getPriKey, setPriKey, getPubKey, setPubKey } from '../utils/e2ee';
import { SUCCESS_STORE_OCCUPANTS } from '../actions/db/conversation';
export const triggerFetchRosterEpic = action$ =>
  action$.ofType(SUCCESS_AUTH)
    .map(fetchRoster)

export const triggerFetchE2eeEpic = action$ =>
  action$.ofType(SUCCESS_AUTH)
    .map(fetchE2ee);//yazzxx1

export const fetchRosterEpic = action$ =>
  action$.ofType(BEGIN_FETCH_ROSTER)//yazzxx2
    .mergeMap(() =>
      Observable.fromPromise(xmpp.getRoster())
        .map(({ roster }) => succesfullyFetchedRoster(roster))//yazzxx3
        .catch(err => Observable.of(failedFetchingRoster(err)))
    );

export const triggerStoreContactsEpic = action$ =>
  action$.ofType(SUCCESS_FETCH_ROSTER)
    .filter(({ payload: { items } }) => {
      if (items && items.length) {
        items.forEach((item) => {
          if (!item.name) {
            item.name = item.oriName;
          }
        });
        return true;
      } return false;
    })
    .map(({ payload: { items } }) => storeContacts(items));


export const fetchE2eeEpic = action$ =>
  action$.ofType(BEGIN_FETCH_E2EE)//yazzxx2
    .map(() => {
      if (!getPriKey(window.localStorage.jidLocal)) {
        let { pubkey, prikey } = generateKey();
        setPriKey(window.localStorage.jidLocal, prikey);
        setPubKey(window.localStorage.jidLocal, pubkey);
        Observable.fromPromise(xmpp.setE2ee({
          jid: window.localStorage.jid,
          did: window.localStorage.deviceId,
          key: pubkey
        }))
          .catch(err => console.log(err))
      }
    })
    .mergeMap(() =>
      Observable.fromPromise(xmpp.getE2ee())
        .map(({ e2ee }) => { console.log('e2ee', e2ee); return succesfullyFetchedE2ee(e2ee) })//yazzxx3
        .catch(err => console.log(err))
    );

export const fetchE2eeByJidsEpic = action$ =>
  action$.ofType(SUCCESS_STORE_OCCUPANTS)
    .filter(({ payload: payload }) => {
      return payload && payload.length > 0;
    })
    .mergeMap((payload) =>
      Observable.fromPromise(xmpp.getE2ee(payload.payload))
        .map(({ e2ee }) => { console.log('e2ee', e2ee); return succesfullyFetchedE2ee(e2ee) })//yazzxx3
        .catch(err => console.log(err))
    );

export const triggerStoreE2eesEpic = action$ =>
  action$.ofType(SUCCESS_FETCH_E2EE)
    .filter(({ payload: { users } }) => {
      if (users && users.length) {
        users.forEach((user) => {
          if (user.devices && user.devices.length) {
            user.devices = JSON.stringify(user.devices);
          } else {
            user.devices = '';
          }
        });
        return true;
      }
      return false;
    })
    .map(({ payload: { users } }) => storeE2ees(users));
