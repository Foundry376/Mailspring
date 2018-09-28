import { Observable } from 'rxjs/Observable';
import moment from 'moment';
import { SET_REFERENCE_TIME, updateReferenceTime } from '../actions/time';

export const referenceTimeEpic = action$ =>
  action$.ofType(SET_REFERENCE_TIME)
    .mergeMap(() => {
      const time = new Date().getTime();
      const intervalStartTime = moment(time)
        .add(1, 'minute')
        .startOf('minute')
        .toDate()
        .getTime();
      return Observable.interval(60000)
        .startWith(0)
        .delay(intervalStartTime - time)
        .startWith(0)
        .map(() => updateReferenceTime(new Date().getTime()))
        .takeUntil(action$.ofType(SET_REFERENCE_TIME));
    });
