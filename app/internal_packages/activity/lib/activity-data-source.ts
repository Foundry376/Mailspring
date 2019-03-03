import { Rx, Message, DatabaseStore } from 'mailspring-exports';
import { OPEN_TRACKING_ID, LINK_TRACKING_ID } from './plugin-helpers';

export default class ActivityDataSource {
  observable: Rx.Observable<Message[]>;

  buildObservable({ messageLimit }) {
    const query = DatabaseStore.findAll<Message>(Message)
      .order(Message.attributes.date.descending())
      .where(Message.attributes.pluginMetadata.containsAny([OPEN_TRACKING_ID, LINK_TRACKING_ID]))
      .distinct()
      .limit(messageLimit);
    this.observable = Rx.Observable.fromQuery(query);
    return this.observable;
  }

  subscribe(callback) {
    return this.observable.subscribe(callback);
  }
}
