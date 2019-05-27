import { Observable } from 'rxjs/Observable';
import {
    BEGIN_STORE_CONFIG,
    successfullyStoredConfig,
    failedStoringConfig
} from '../../actions/db/config';
import {
    NEW_MESSAGE,
} from '../../actions/chat';
import getDb from '../../db';
import chatModel from '../../store/model';
import { safeUpsert } from '../../utils/db-utils';
const saveConfig = async config => {
    // console.log("saveLastTs3", config);
    const db = await getDb();
    if (config) {
        // console.log(config)
        if (!config.time) {
            config.time = Date.now();
        }
        await safeUpsert(db.configs, config);
    }
    return {};
};

const saveLastTs = (ts, curJid) => {
    if (ts != lastTs[curJid]) {
        ts = lastTs[curJid];
        window.setTimeout(() => { saveLastTs(ts, curJid); }, 2000);
        // console.log('saveLastTs1', ts, curJid, lastTs);
        return;
    }
    // console.log('saveLastTs2');
    let jidLocal = curJid.split('@')[0];
    Observable.fromPromise(
        saveConfig({ key: jidLocal + '_message_ts', value: ts + '' })
    ).map(config => successfullyStoredConfig(config))
        .catch(error => {
            console.log(error)
            Observable.of(failedStoringConfig(error, payload))
        })
}

export const storeConfigEpic = action$ =>
    action$.ofType(BEGIN_STORE_CONFIG)
        .mergeMap(({ payload }) => {
            return Observable.fromPromise(saveConfig(payload))
                .map(config => successfullyStoredConfig(config))
                .catch(error => {
                    console.log(error)
                    return Observable.of(failedStoringConfig(error, payload))
                })
        }
        );

var lastTs = {};
export const triggerUpdateMessageTsConfigEpic = action$ =>
    action$.ofType(NEW_MESSAGE)
        .filter(({ payload }) => {
            //console.log('lastTs:', payload)
            const { ts, curJid } = payload;
            if (!!ts && parseInt(ts) > 0) {
                if (!lastTs[curJid] || lastTs[curJid] < parseInt(ts)) {
                    lastTs[curJid] = parseInt(ts);
                    return true;
                }
            }
            return false;
        })
        .map(({ payload }) => {
            let { ts, curJid } = payload;
            let jidLocal = curJid.split('@')[0];
            // console.log('_message_ts1', (ts));
            AppEnv.config.set(jidLocal + '_message_ts', parseInt(ts))
            // let jidLocal = curJid.split('@')[0];
            // window.setTimeout(() => { saveLastTs(parseInt(ts), curJid); }, 1000);
            return successfullyStoredConfig(payload);
        })
