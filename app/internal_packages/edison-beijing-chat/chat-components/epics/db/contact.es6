import { Observable } from 'rxjs/Observable';
import {
  BEGIN_STORE_CONTACTS,
  RETRIEVE_STORED_CONTACTS,
  successfullyStoredContacts,
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
      .map(({ jid: { bare: jid }, name, email, avatar }) =>
        db.contacts
          .upsert({
            jid,
            name,
            email,
            avatar
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
        .mergeMap(db =>
          db.contacts
            .find()
            .$
            .takeUntil(action$.ofType(RETRIEVE_STORED_CONTACTS))
            .map(contacts => updateStoredContacts(contacts))
        )
        .catch(error => Observable.of(failedRetrievingContacts(error)))
    );
