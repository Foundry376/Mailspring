import {
    Rx,
    ObservableListDataSource,
    MutableQuerySubscription,
    Message,
} from 'mailspring-exports';

/**
 * MessageListDataSource provides an observable list of individual messages
 * for the non-threaded view mode. Unlike ThreadListDataSource, this doesn't
 * need to join messages to threads - each message is displayed independently.
 * 
 * Note: We don't filter messages by the perspective's thread query because:
 * 1. It creates timing issues where threads haven't loaded yet
 * 2. The messages query already filters by account
 * 3. Users want to see ALL their messages, not filtered by thread categories
 * 
 * If filtering is needed in the future, it should be done at the query level
 * in mailbox-perspective.ts, not here.
 */

class MessageListDataSource extends ObservableListDataSource {
    constructor(subscription: MutableQuerySubscription<Message>) {
        const $resultSetObservable = Rx.Observable.fromNamedQuerySubscription(
            'message-list',
            subscription
        );

        super($resultSetObservable, subscription.replaceRange.bind(subscription));
    }
}

export default MessageListDataSource;
