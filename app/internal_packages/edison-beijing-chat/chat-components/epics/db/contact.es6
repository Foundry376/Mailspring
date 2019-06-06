import { Observable } from 'rxjs/Observable';
import {
  BEGIN_STORE_E2EES,
  successfullyStoredE2ees,
  failedStoringE2ees,
} from '../../actions/db/contact';
import getDb from '../../db';
import { safeUpsert } from '../../utils/db-utils';

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
