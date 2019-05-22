import { Observable } from 'rxjs/Observable';
import {
  BEGIN_STORE_E2EES,
  BEGIN_STORE_CONTACTS,
  RETRIEVE_STORED_CONTACTS,
  successfullyStoredContacts,
  successfullyStoredE2ees,
  failedStoringContacts,
  failedStoringE2ees,
  failedRetrievingContacts,
  updateStoredContacts,
} from '../../actions/db/contact';
import getDb from '../../db';
import { safeUpsert } from '../../utils/db-utils';

const saveContacts = async contacts => {
  const db = await getDb();
  const dbContacts = [];
  for (const { jid: { bare: jid }, curJid, name, email, avatar } of contacts) {
    if (!!name) {
      const contact = {
        jid,
        curJid,
        name,
        email,
        avatar
      }
      await safeUpsert(db.contacts, contact);
      dbContacts.push(contact);
    }
  }
  return dbContacts;
};
const saveE2ees = async e2ees => {
  const db = await getDb();
  const dbE2ees = [];
  for (const { jid, devices } of e2ees) {
    if (!!devices) {
      const e2ee = {
        jid,
        devices
      }
      await safeUpsert(db.e2ees, e2ee);
      dbE2ees.push(e2ee);
    }
  }
  return dbE2ees;
};

export const storeContactsEpic = action$ =>
  action$.ofType(BEGIN_STORE_CONTACTS)
    .mergeMap(({ payload }) =>
      Observable.fromPromise(saveContacts(payload))
        .map(contacts => successfullyStoredContacts(contacts))
        .catch(error => {
          console.error(error)
          return Observable.of(failedStoringContacts(error, payload))
        })
    );

export const retrieveContactsEpic = action$ =>
  action$.ofType(RETRIEVE_STORED_CONTACTS)
    .mergeMap(() =>
      Observable.fromPromise(getDb())
        .mergeMap(db => {
          return db.contacts
            .find()
            .$
            .takeUntil(action$.ofType(RETRIEVE_STORED_CONTACTS))
            .map(contacts => {
              return updateStoredContacts(contacts)
            })
        }).catch(error => Observable.of(failedRetrievingContacts(error)))
    );

export const storeE2eesEpic = action$ =>
  action$.ofType(BEGIN_STORE_E2EES)
    .mergeMap(({ payload }) =>
      Observable.fromPromise(saveE2ees(payload))
        .map(e2ees => successfullyStoredE2ees(e2ees))
        .catch(error => {
          console.error(error);
          return Observable.of(failedStoringE2ees(error, payload))
        })
    );
