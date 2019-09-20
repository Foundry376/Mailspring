import MutableQuerySubscription from './mutable-query-subscription';
import DatabaseStore from '../stores/database-store';
import RecentlyReadStore from '../stores/recently-read-store';
import Matcher from '../attributes/matcher';
import Thread from '../models/thread';
import JoinTable from '../models/join-table';

const buildQuery = categoryIds => {
  const unreadMatchers = new Matcher.JoinAnd([
    Thread.attributes.categories.containsAny(categoryIds),
    JoinTable.useAttribute('unread', 'Number').equal(1),
    Thread.attributes.state.equal(0),
  ]);

  const query = DatabaseStore.findAll(Thread).limit(0);

  // The "Unread" view shows all threads which are unread. When you read a thread,
  // it doesn't disappear until you leave the view and come back. This behavior
  // is implemented by keeping track of messages being read and manually
  // whitelisting them in the query.
  if (RecentlyReadStore.ids.length === 0) {
    query.where(unreadMatchers);
  } else {
    query.where(
      new Matcher.JoinAnd([
        Thread.attributes.categories.containsAny(categoryIds),
        new Matcher.JoinOr([
          new Matcher.JoinAnd([
            JoinTable.useAttribute('unread', 'Number').equal(1),
            Thread.attributes.state.equal(0),
          ]),
          new Matcher.JoinAnd([
            JoinTable.useAttribute('id', 'String').in(RecentlyReadStore.ids),
            JoinTable.useAttribute('value', 'String').in(categoryIds),
            JoinTable.useAttribute('state', 'Number').equal(0),
          ]),
        ]),
      ]),
    );
  }

  return query;
};

export default class UnreadQuerySubscription extends MutableQuerySubscription {
  constructor(categoryIds) {
    super(buildQuery(categoryIds), { emitResultSet: true });
    this._categoryIds = categoryIds;
    this._unlisten = RecentlyReadStore.listen(this.onRecentlyReadChanged);
  }

  onRecentlyReadChanged = () => {
    const { limit, offset } = this._query.range();
    this._query = buildQuery(this._categoryIds)
      .limit(limit)
      .offset(offset);
  };

  onLastCallbackRemoved() {
    this._unlisten();
  }
}
