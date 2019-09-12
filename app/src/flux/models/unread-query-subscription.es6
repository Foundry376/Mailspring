import MutableQuerySubscription from './mutable-query-subscription';
import DatabaseStore from '../stores/database-store';
import RecentlyReadStore from '../stores/recently-read-store';
import Matcher from '../attributes/matcher';
import Thread from '../models/thread';
// import JoinTable from '../models/join-table';

const buildQuery = accountIds => {
  const unreadMatchers = new Matcher.And([
    Thread.attributes.unread.equal(true),
    Thread.attributes.inAllMail.equal(true),
    Thread.attributes.state.equal(0),
  ]);

  const query = DatabaseStore.findAll(Thread).limit(0);
  if (accountIds && (!Array.isArray(accountIds) || accountIds.length === 1)) {
    query.where([Thread.attributes.accountId.in(accountIds)]);
  }
  // The "Unread" view shows all threads which are unread. When you read a thread,
  // it doesn't disappear until you leave the view and come back. This behavior
  // is implemented by keeping track of messages being read and manually
  // whitelisting them in the query.
  if (RecentlyReadStore.ids.length === 0) {
    query.where(unreadMatchers);
  } else {
    query.where(
      new Matcher.Or([
          new Matcher.And([
            Thread.attributes.inAllMail.equal(true),
            Thread.attributes.unread.equal(true),
            // JoinTable.useAttribute('unread', 'Number').equal(1),
            Thread.attributes.state.equal(0),
          ]),
          new Matcher.And([
            Thread.attributes.id.in(RecentlyReadStore.ids),
            Thread.attributes.state.equal(0),
          ]),
        ])
    );
  }

  return query;
};

export default class UnreadQuerySubscription extends MutableQuerySubscription {
  constructor(accountIds) {
    super(buildQuery(accountIds), { emitResultSet: true });
    this.accountIds = accountIds;
    this._unlisten = RecentlyReadStore.listen(this.onRecentlyReadChanged);
  }

  onRecentlyReadChanged = () => {
    const { limit, offset } = this._query.range();
    this._query = buildQuery(this.accountIds)
      .limit(limit)
      .offset(offset);
  };

  onLastCallbackRemoved() {
    this._unlisten();
  }
}
