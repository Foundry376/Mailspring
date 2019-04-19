import { Observable } from 'rxjs/Observable';
import { SUCCESS_AUTH } from '../actions/auth';
import { iniApps, getToken } from '../utils/appmgt';

export const triggerFetchAppsEpic = action$ =>
    action$.ofType(SUCCESS_AUTH)
        .mergeMap(({ payload }) => {
            return Observable.fromPromise(getToken(payload.local)).map((token) => {
                iniApps(payload.local, token);
                return { type: "SUCCESS_FETCH_APPS" }
            });
        })