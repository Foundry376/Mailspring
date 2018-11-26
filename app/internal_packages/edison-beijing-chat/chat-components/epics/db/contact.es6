import { Observable } from 'rxjs/Observable';
import {
  BEGIN_STORE_E2EES,
  BEGIN_STORE_CONTACTS,
  RETRIEVE_STORED_CONTACTS,
  successfullyStoredContacts,
  successfullyStoredE2ees,
  failedStoringContacts,
  failedRetrievingContacts,
  updateStoredContacts,
} from '../../actions/db/contact';
import getDb from '../../db';

const saveContacts = async contacts => {
  const db = await getDb();
  return Promise.all(
    contacts
      .filter(({ name }) => !!name) // ignore the contact that the name is undefined
      .map((contact) => {
        const { jid: { bare: jid }, curJid, name, email, avatar } = contact;
        return db.contacts
          .upsert({
            jid,
            curJid,
            name,
            email,
            avatar
          })
      })
  );
};
const saveE2ees = async e2ees => {
  const db = await getDb();
  return Promise.all(
    e2ees.filter(({ devices }) => !!devices)
      .map(({ jid, devices }) =>
        db.e2ees
          .upsert({
            jid,
            devices
            //key
          })
      )
  );
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
        .mergeMap(db =>{
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
          //return Observable.of(failedStoringContacts(error, payload))
        })
    );