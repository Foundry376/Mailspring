import {
  Rx,
  ObservableListDataSource,
  DatabaseStore,
  Thread,
  Message,
  QueryResultSet,
  QuerySubscription,
  Highlighted,
  SearchHighlighter,
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

// The thread models here are the clones made above, so the match can be set on them.
//
// A thread's excerpt doesn't change while the query is the same, so each is loaded once,
// when the thread first appears. Results are emitted without waiting for that query, and
// again with fresh clones once it finishes, so the list rows see a changed item and redraw.
const _flatMapJoiningSearchMatches = ($threadsResultSet, highlighter: SearchHighlighter) => {
  const excerpts = new Map<string, Highlighted | undefined>();
  const loading = new Map<string, Promise<void>>();

  const applyMatches = (threadsResultSet) => {
    for (const thread of threadsResultSet.models()) {
      thread.__searchMatch = { highlighter, excerpt: excerpts.get(thread.id) };
    }
    return threadsResultSet;
  };

  return $threadsResultSet.flatMapLatest((threadsResultSet) => {
    const ids: string[] = threadsResultSet.ids();
    const unrequested = ids.filter((id) => !excerpts.has(id) && !loading.has(id));
    if (unrequested.length) {
      const request = highlighter
        .excerpts(unrequested)
        .catch((err) => {
          console.warn('Could not load search match excerpts', err);
          return {};
        })
        .then((found) => {
          for (const id of unrequested) {
            excerpts.set(id, found[id]);
            loading.delete(id);
          }
        });
      for (const id of unrequested) {
        loading.set(id, request);
      }
    }

    const now = Rx.Observable.from([applyMatches(threadsResultSet)]);
    const pending = [...new Set(ids.filter((id) => loading.has(id)).map((id) => loading.get(id)))];
    if (pending.length === 0) {
      return now;
    }
    const withExcerpts = Promise.all(pending).then(() => {
      const clones = {};
      for (const thread of threadsResultSet.models()) {
        clones[thread.id] = Object.assign(Object.create(Object.getPrototypeOf(thread)), thread);
      }
      return applyMatches(QueryResultSet.setByApplyingModels(threadsResultSet, clones));
    });
    return now.concat(Rx.Observable.fromPromise(withExcerpts));
  });
};

class ThreadListDataSource extends ObservableListDataSource {
  constructor(subscription, highlighter: SearchHighlighter | null) {
    let $resultSetObservable = Rx.Observable.fromNamedQuerySubscription(
      'thread-list',
      subscription
    );
    $resultSetObservable = _flatMapJoiningMessages($resultSetObservable);
    if (highlighter) {
      $resultSetObservable = _flatMapJoiningSearchMatches($resultSetObservable, highlighter);
    }
    super($resultSetObservable, subscription.replaceRange.bind(subscription));
  }
}

export default ThreadListDataSource;
