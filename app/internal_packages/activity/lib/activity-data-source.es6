import { Rx, Message, DatabaseStore } from 'mailspring-exports';
import { OPEN_TRACKING_ID, LINK_TRACKING_ID } from './plugin-helpers';

export default class ActivityDataSource {
  buildObservable({ messageLimit }) {
    const query = DatabaseStore.findAll(Message)
      .order(Message.attributes.date.descending())
      .where(Message.attributes.pluginMetadata.contains(OPEN_TRACKING_ID, LINK_TRACKING_ID))
      .limit(messageLimit);
    this.observable = Rx.Observable.fromQuery(query);
    return this.observable;
  }

  subscribe(callback) {
    return this.observable.subscribe(callback);
  }
}
