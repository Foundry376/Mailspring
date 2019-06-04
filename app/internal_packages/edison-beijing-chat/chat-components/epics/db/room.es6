// import { Observable } from 'rxjs/Observable';
// import {
//   BEGIN_STORE_ROOMS,
//   successfullyStoredRooms,
//   failedStoringRooms
// } from '../../actions/db/room';
// import getDb from '../../db';
// import { safeUpsert } from '../../utils/db-utils';

// const saveRooms = async rooms => {
//   const db = await getDb();
//   return Promise.all(
//     rooms
//       .filter(({ name }) => !!name) // ignore the contact that the name is undefined
//       .map(({ jid: { bare: jid }, name }) =>
//         safeUpsert(db.rooms, {
//             jid,
//             name
//           })
//       )
//   );
// };

// export const storeRoomsEpic = action$ =>
//   action$.ofType(BEGIN_STORE_ROOMS)
//     .mergeMap(({ payload }) =>
//       Observable.fromPromise(saveRooms(payload))
//         .map(rooms => successfullyStoredRooms(rooms))
//         .catch(error => {
//           console.error(error)
//           return Observable.of(failedStoringRooms(error, payload))
//         })
//     );
