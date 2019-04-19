import { Observable } from 'rxjs/Observable';
import { SUCCESS_AUTH } from '../actions/auth';
import xmpp from '../xmpp';
import getDb from '../db';

import {
    BEGIN_FETCH_MESSAGE,
    SUCCESS_FETCH_MESSAGE,
    fetchMessage,
    succesfullyFetchedMessage,
    failedFetchingMessage
} from '../actions/message';
import {
    storeConfig, failedStoringConfig
} from '../actions/db/config';

export const triggerFetchMessagesEpic = action$ =>
    action$.ofType(SUCCESS_AUTH)
        .map(({ payload }) => {
            return fetchMessage(payload);
        });

export const fetchMessagesEpic = action$ =>
    action$.ofType(BEGIN_FETCH_MESSAGE)//yazzxx2
        .mergeMap(
            ({ payload }) => Observable.fromPromise(getDb())
                .map(db => ({ db, jid: payload })),
        )
        .mergeMap(
            ({ db, jid }) => {
                console.log("yazz-config1", db, jid);
                return Observable.fromPromise(db.configs.findOne({ key: jid.local + "_message_ts" }).exec())
                    .map((data) => {
                        console.log("yazz-config1", data)
                        if (data) {
                            return { ts: data.value, jid }
                        } else {
                            return { ts: new Date().getTime(), jid }
                        }
                    }
                    )
            }
        )
        .mergeMap(({ ts, jid }) => {
            console.log("yazz-config2", ts, jid);
            return Observable.fromPromise(xmpp.pullMessage(ts, jid.bare))
                .map(data => {
                    console.log("yazz-config3", data)
                    return succesfullyFetchedMessage(jid)
                })//yazzxx3
                .catch(err => {
                    console.log("yazz-config33", err)
                    return Observable.of(failedFetchingMessage(err)
                    )
                })
        }
        );


// export const triggerStoreMessagesEpic = action$ =>
//     action$.ofType(SUCCESS_FETCH_MESSAGE)
//         .map(({ payload }) => {
//             console.log("yazz-config4", payload);
//             return storeConfig({ key: '100007_message_ts', value: '' })
//         })
//         .catch(err => Observable.of(failedStoringConfig(err)));