import { Rx, Message, DatabaseStore } from 'mailspring-exports';
import { OPEN_TRACKING_ID, LINK_TRACKING_ID } from './plugin-helpers';

/**
 * Sent messages carrying open- or link-tracking metadata, newest first.
 * Bounds must be Date objects: the query subscription re-evaluates deltas in
 * memory by comparing `message.date` directly to these values.
 */
export function trackedMessagesQuery({
  limit,
  accountIds,
  after,
  before,
}: {
  limit?: number;
  accountIds?: string[];
  after?: Date;
  before?: Date;
}) {
  let query = DatabaseStore.findAll<Message>(Message)
    .order(Message.attributes.date.descending())
    .where(Message.attributes.pluginMetadata.containsAny([OPEN_TRACKING_ID, LINK_TRACKING_ID]))
    .where(Message.attributes.draft.equal(false))
    .distinct();
  if (limit !== undefined) {
    query = query.limit(limit);
  }
  if (accountIds) {
    query = query.where(Message.attributes.accountId.in(accountIds));
  }
  if (after) {
    query = query.where(Message.attributes.date.greaterThan(after));
  }
  if (before) {
    query = query.where(Message.attributes.date.lessThan(before));
  }
  return query;
}

export default class ActivityDataSource {
  observable: Rx.Observable<Message[]>;

  buildObservable({ messageLimit }: { messageLimit: number }) {
    this.observable = Rx.Observable.fromQuery(trackedMessagesQuery({ limit: messageLimit }));
    return this.observable;
  }

  subscribe(callback) {
    return this.observable.subscribe(callback);
  }
}
