import { Observable } from 'rxjs/Observable';
import { SUCCESS_AUTH } from '../actions/auth';
import {
  BEGIN_FETCH_ROSTER,
  SUCCESS_FETCH_ROSTER,
  failedFetchingRoster,
  fetchRoster,
  succesfullyFetchedRoster,
} from '../actions/contact';
import {
  storeContacts,
} from '../actions/db/contact';
import xmpp from '../xmpp';

export const triggerFetchRosterEpic = action$ =>
  action$.ofType(SUCCESS_AUTH)
    .mapTo(fetchRoster());

export const fetchRosterEpic = action$ =>
  action$.ofType(BEGIN_FETCH_ROSTER)
    .mergeMap(() =>
      Observable.fromPromise(xmpp.getRoster())
        .map(({ roster }) => succesfullyFetchedRoster(roster))
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

