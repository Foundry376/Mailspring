import { Observable } from 'rxjs/Observable';
import { SUCCESS_AUTH } from '../actions/auth';
import {
  BEGIN_FETCH_E2EE,
  SUCCESS_FETCH_E2EE,
  failedFetchingE2ee,
  fetchE2ee,
  succesfullyFetchedE2ee
} from '../actions/contact';
import {
  storeE2ees
} from '../actions/db/contact';
import xmpp from '../xmpp';
import { SUCCESS_STORE_OCCUPANTS } from '../actions/db/conversation';
// import { getE2ees, setE2eeJid } from '../utils/e2ee';

// export const triggerFetchE2eeEpic = action$ =>
//   action$.ofType(SUCCESS_AUTH)
//     .mergeMap(({ payload }) => {
//       return Observable.fromPromise(getE2ees(payload.local)).map((data) => {
//         if (data.needUpload) {
//           Observable.fromPromise(xmpp.setE2ee({
//             jid: payload.bare,
//             did: data.deviceId,
//             key: data.e2ee_pubkey
//           }, payload.bare)).map(() => {
//             setE2eeJid(payload.local, data['e2ee_' + payload.local]);
//           }).catch(err => { console.log(err) });
//         }
//         return payload;
//       });
//     })
//     .map((payload) => {
//       return fetchE2ee(payload);
//     });

// export const fetchE2eeEpic = action$ =>
//   action$.ofType(BEGIN_FETCH_E2EE)//yazzxx2
//     .mergeMap(({ payload }) => {
//       return Observable.fromPromise(xmpp.getE2ee('', payload.bare))
//         .map((result) => {
//           if (!result) {
//             console.warn('xmpp fail to getE2ee jid: ', payload.bare);
//           }
//           const { e2ee } = result;
//           return succesfullyFetchedE2ee(e2ee)
//         })//yazzxx3
//         .catch(err => Observable.of(failedFetchingE2ee(err)))
//     });

export const fetchE2eeByJidsEpic = action$ =>
  action$.ofType(SUCCESS_STORE_OCCUPANTS)
    .filter(({ payload: payload }) => {
      return payload && payload.length > 0;
    })
    .mergeMap((payload) =>
      Observable.fromPromise(xmpp.getE2ee(payload))
        .map(({ e2ee }) => { return succesfullyFetchedE2ee(e2ee) })//yazzxx3
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
