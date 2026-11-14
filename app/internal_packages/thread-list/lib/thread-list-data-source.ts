import {
  Rx,
  ObservableListDataSource,
  DatabaseStore,
  Thread,
  Message,
  QueryResultSet,
  QuerySubscription,
} from 'mailspring-exports';

const _observableForThreadMessages = (id: string, initialModels: Message[]) => {
  const subscription = new QuerySubscription<Message>(
    DatabaseStore.findAll<Message>(Message, { threadId: id }),
    {
      initialModels: initialModels,
      emitResultSet: true,
    }
  );
  return Rx.Observable.fromNamedQuerySubscription(`message-${id}`, subscription);
};

const _flatMapJoiningMessages = ($threadsResultSet) => {
  // DatabaseView leverages `QuerySubscription` for threads /and/ for the
  // messages on each thread, which are passed to out as `thread.__messages`.
  let $messagesResultSets = {};

  // 2. when we receive a set of threads, we check to see if we have message
  //    observables for each thread. If threads have been added to the result set,
  //    we make a single database query and load /all/ the message metadata for
  //    the new threads at once. (This is a performance optimization -it's about
  //    ~80msec faster than making 100 queries for 100 new thread ids separately.)
  return (
    $threadsResultSet
      .flatMapLatest((threadsResultSet) => {
        const missingIds = threadsResultSet.ids().filter((id) => !$messagesResultSets[id]);
        let promise = null;
        if (missingIds.length === 0) {
          promise = Promise.resolve([threadsResultSet, []]);
        } else {
          promise = DatabaseStore.findAll<Message>(Message, { threadId: missingIds }).then(
            (messages) => {
              return Promise.resolve([threadsResultSet, messages]);
            }
          );
        }
        return Rx.Observable.fromPromise(promise);
      })
      // 3. when that finishes, we group the loaded messsages by threadId and create
      //    the missing observables. Creating a query subscription would normally load
      //    an initial result set. To avoid that, we just hand new subscriptions the
      //    results we loaded in #2.
      .flatMapLatest(([threadsResultSet, messagesForNewThreads]) => {
        const messagesGrouped = {};
        for (const message of messagesForNewThreads) {
          if (messagesGrouped[message.threadId] == null) {
            messagesGrouped[message.threadId] = [];
          }
          messagesGrouped[message.threadId].push(message);
        }

        const oldSets = $messagesResultSets;
        $messagesResultSets = {};

        const sets = threadsResultSet.ids().map((id) => {
          $messagesResultSets[id] =
            oldSets[id] || _observableForThreadMessages(id, messagesGrouped[id]);
          return $messagesResultSets[id];
        });
        sets.unshift(Rx.Observable.from([threadsResultSet]));

        // 4. We use `combineLatest` to merge the message observables into a single
        //    stream (like Promise.all).  When /any/ of them emit a new result set, we
        //    trigger.
        return Rx.Observable.combineLatest(sets);
      })
      .flatMapLatest(([threadsResultSet, ...messagesResultSets]) => {
        const threadsWithMessages = {};
        threadsResultSet.models().forEach((thread, idx) => {
          const clone = new Thread(thread) as any;
          clone.__messages = messagesResultSets[idx] ? messagesResultSets[idx].models() : [];
          clone.__messages = clone.__messages.filter((m) => !m.isHidden());
          threadsWithMessages[clone.id] = clone;
        });

        return Rx.Observable.from([
          QueryResultSet.setByApplyingModels(threadsResultSet, threadsWithMessages),
        ]);
      })
  );
};

// A search subscription provides `searchHighlighter`; other perspectives' subscriptions
// don't. The thread models here are the clones made above, so the match can be set on them.
const _flatMapJoiningSearchMatches = ($threadsResultSet, subscription) => {
  return $threadsResultSet.flatMapLatest((threadsResultSet) => {
    const highlighter = subscription.searchHighlighter();
    if (!highlighter) {
      return Rx.Observable.from([threadsResultSet]);
    }
    const promise = highlighter
      .excerpts(threadsResultSet.ids())
      .catch((err) => {
        console.warn('Could not load search match excerpts', err);
        return {};
      })
      .then((excerpts) => {
        for (const thread of threadsResultSet.models()) {
          thread.__searchMatch = { highlighter, excerpt: excerpts[thread.id] };
        }
        return threadsResultSet;
      });
    return Rx.Observable.fromPromise(promise);
  });
};

class ThreadListDataSource extends ObservableListDataSource {
  constructor(subscription) {
    let $resultSetObservable = Rx.Observable.fromNamedQuerySubscription(
      'thread-list',
      subscription
    );
    $resultSetObservable = _flatMapJoiningMessages($resultSetObservable);
    if (typeof subscription.searchHighlighter === 'function') {
      $resultSetObservable = _flatMapJoiningSearchMatches($resultSetObservable, subscription);
    }
    super($resultSetObservable, subscription.replaceRange.bind(subscription));
  }
}

export default ThreadListDataSource;
