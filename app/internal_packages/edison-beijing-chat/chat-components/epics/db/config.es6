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
const saveConfig = async config => {
    // console.log("yazz-config4", config);
    const db = await getDb();
    if (config) {
        // console.log(config)
        if (!config.time) {
            config.time = Date.now();
        }
        await db.configs.upsert(config)
    }
    return {};
};

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

var lastTs = 0;
export const triggerUpdateMessageTsConfigEpic = action$ =>
    action$.ofType(NEW_MESSAGE)
        .filter(({ payload }) => {
            const { ts } = payload;
            if (!!ts && parseInt(ts) > 0) {
                if (lastTs < parseInt(ts)) {
                    if (lastTs == 0) {
                        // console.log("yazz-pull-message3chatModel:", chatModel.serverTimestamp);
                        lastTs = chatModel.serverTimestamp;
                    } else {
                        lastTs = parseInt(ts);
                    }
                    return true;
                }
                // console.log("yazz-pull-message3p:", payload);
                // console.log("yazz-pull-message4:", new Date(parseInt(ts)).toLocaleString().replace(/:\d{1,2}$/, ' '));
            }
            return false;
        })
        .mergeMap(({ payload }) => {
            let { ts, curJid } = payload;
            let jidLocal = curJid.split('@')[0];
            return Observable.fromPromise(
                saveConfig({ key: jidLocal + '_message_ts', value: lastTs + '' })
            ).map(config => successfullyStoredConfig(config))
                .catch(error => {
                    console.log(error)
                    return Observable.of(failedStoringConfig(error, payload))
                })
        }
        )