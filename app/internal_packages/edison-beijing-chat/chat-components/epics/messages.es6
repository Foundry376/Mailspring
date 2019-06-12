import { Observable } from 'rxjs/Observable';
import { SUCCESS_AUTH } from '../actions/auth';
import xmpp from '../xmpp';
import getDb from '../db';

import {
    BEGIN_FETCH_MESSAGE,
    FETCH_NEXT_MESSAGE,
    SUCCESS_FETCH_MESSAGE,
    fetchMessage,
    fetchNextMessage,
    succesfullyFetchedMessage,
    failedFetchingMessage
} from '../actions/message';
import {
    storeConfig, failedStoringConfig
} from '../actions/db/config';

// export const triggerFetchMessagesEpic = action$ =>
//     action$.ofType(SUCCESS_AUTH)
//         .map(({ payload }) => {
//             return fetchMessage(payload);
//         });

export const fetchMessagesEpic = action$ =>
    action$.ofType(BEGIN_FETCH_MESSAGE)//yazzxx2
        .map(
            ({ payload }) => {
                const db = getDb();
                return { db, jid: payload }
            })
        // .mergeMap(
        //     ({ db, jid }) => {
        //         // console.log("yazz-config1", db, jid);
        //         return Observable.fromPromise(db.configs.findOne({ key: jid.local + "_message_ts" }).exec())
        //             .map((data) => {
        //                 // console.log("yazz-config1", data)
        //                 if (data) {
        //                     return { ts: data.value, jid }
        //                 } else {
        //                     return { ts: new Date().getTime(), jid }
        //                 }
        //             }
        //             )
        //     }
        // )
        .mergeMap(({ jid }) => {
            let ts = AppEnv.config.get(jid.local + "_message_ts");

            // console.log('_message_ts2', ts);
            return pullMessage(ts, jid);
            // console.log("yazz-config2", ts, jid);
            // return Observable.fromPromise(xmpp.pullMessage(ts, jid.bare))
            //     .map(data => {
            //         console.log("saveLastTs4", data)
            //         if (data.more == "true") {
            //             Observable.fromPromise(xmpp.pullMessage(data.since, jid.bare))
            //         }
            //         return succesfullyFetchedMessage(jid)
            //     })//yazzxx3
            //     .catch(err => {
            //         // console.log("yazz-config33", err)
            //         return Observable.of(failedFetchingMessage(err)
            //         )
            //     })
        }
        );
export const fetchNextMessagesEpic = action$ =>
    action$.ofType(FETCH_NEXT_MESSAGE)//yazzxx2
        .mergeMap(({ payload: { ts, jid } }) => {
            return pullMessage(ts, jid);
        });
const pullMessage = (ts, jid) => {
    return Observable.fromPromise(xmpp.pullMessage(ts, jid.bare))
        .map(data => {
            if (data.edipull && data.edipull.more == "true") {
                return fetchNextMessage({ ts: data.edipull.since, jid })
            }
            return succesfullyFetchedMessage(jid)
        })//yazzxx3
        .catch(err => {
            // console.log("yazz-config33", err)
            return Observable.of(failedFetchingMessage(err)
            )
        })
}

// export const triggerStoreMessagesEpic = action$ =>
//     action$.ofType(SUCCESS_FETCH_MESSAGE)
//         .map(({ payload }) => {
//             console.log("yazz-config4", payload);
//             return storeConfig({ key: '100007_message_ts', value: '' })
//         })
//         .catch(err => Observable.of(failedStoringConfig(err)));
