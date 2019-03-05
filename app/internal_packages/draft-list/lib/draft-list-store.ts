import MailspringStore from 'mailspring-store';
import {
  Rx,
  Message,
  OutboxStore,
  AccountStore,
  MutableQueryResultSet,
  MutableQuerySubscription,
  ObservableListDataSource,
  FocusedPerspectiveStore,
  DatabaseStore,
  QueryResultSet,
} from 'mailspring-exports';
import { ListTabular, ListDataSource } from 'mailspring-component-kit';

class DraftListStore extends MailspringStore {
  constructor() {
    super();
    this.listenTo(FocusedPerspectiveStore, this._onPerspectiveChanged);
    this._createListDataSource();
  }

  _dataSource: ListDataSource;

  dataSource = () => {
    return this._dataSource;
  };

  selectionObservable = () => {
    return Rx.Observable.fromListSelection(this);
  };

  // Inbound Events

  _onPerspectiveChanged = () => {
    this._createListDataSource();
  };

  // Internal

  _createListDataSource = () => {
    const mailboxPerspective = FocusedPerspectiveStore.current();

    if (this._dataSource) {
      this._dataSource.cleanup();
      this._dataSource = null;
    }

    if ((mailboxPerspective as any).drafts) {
      const query = DatabaseStore.findAll<Message>(Message)
        .include(Message.attributes.body)
        .order(Message.attributes.date.descending())
        .where({ draft: true })
        .page(0, 1);

      // Adding a "account_id IN (a,b,c)" clause to our query can result in a full
      // table scan. Don't add the where clause if we know we want results from all.
      if (mailboxPerspective.accountIds.length < AccountStore.accounts().length) {
        query.where({ accountId: mailboxPerspective.accountIds });
      }

      const subscription = new MutableQuerySubscription(query, { emitResultSet: true });
      const $resultSet = Rx.Observable.combineLatest(
        [
          Rx.Observable.fromNamedQuerySubscription('draft-list', subscription),
          Rx.Observable.fromStore(OutboxStore) as any,
        ],
        (resultSet: QueryResultSet<Message>, outbox) => {
          // Generate a new result set that includes additional information on
          // the draft objects. This is similar to what we do in the thread-list,
          // where we set thread.__messages to the message array.
          const resultSetWithTasks = new MutableQueryResultSet(resultSet);

          // TODO BG modelWithId: task.headerMessageId does not work
          mailboxPerspective.accountIds.forEach(aid => {
            OutboxStore.itemsForAccount(aid).forEach(task => {
              let draft = resultSet.modelWithId(task.headerMessageId) as any;
              if (draft) {
                draft = draft.clone();
                draft.uploadTaskId = task.id;
                draft.uploadProgress = task.progress;
                resultSetWithTasks.updateModel(draft);
              }
            });
          });

          return resultSetWithTasks.immutableClone();
        }
      );

      this._dataSource = new ObservableListDataSource($resultSet, subscription.replaceRange);
    } else {
      this._dataSource = new ListTabular.DataSource.Empty();
    }

    this.trigger(this);
  };
}

export default new DraftListStore();
