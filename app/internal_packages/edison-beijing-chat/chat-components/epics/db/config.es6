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

const saveConfig = async config => {
    console.log("yazz-config4", config);
    const db = await getDb();
    if (config) {
        console.log(config)
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

export const triggerUpdateMessageTsConfigEpic = action$ =>
    action$.ofType(NEW_MESSAGE)
        .filter(({ payload: ts }) => !!ts)
        .mergeMap(({ payload }) => {
            let { ts, curJid } = payload;
            let jidLocal = curJid.split('@')[0];
            return Observable.fromPromise(
                saveConfig({ key: jidLocal + '_message_ts', value: ts + '' })
            ).map(config => successfullyStoredConfig(config))
                .catch(error => {
                    console.log(error)
                    return Observable.of(failedStoringConfig(error, payload))
                })
        }
        )