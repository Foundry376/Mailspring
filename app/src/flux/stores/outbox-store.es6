import MailspringStore from 'mailspring-store';
import SendDraftTask from '../tasks/send-draft-task';
import SyncbackDraftTask from '../tasks/syncback-draft-task';
import TaskQueue from './task-queue';
import DatabaseStore from './database-store';
import Message from '../models/message';
import FocusedPerspectiveStore from './focused-perspective-store';
import {
  Rx,
  Actions,
  MutableQueryResultSet,
  MutableQuerySubscription,
  ObservableListDataSource,
  FocusedContentStore,
  AccountStore,
} from 'mailspring-exports';

class OutboxStore extends MailspringStore {
  static findAll() {
    return DatabaseStore.findAll(Message, { draft: true }).where([
      Message.attributes.state.in([Message.messageState.failed, Message.messageState.failing]),
    ]);
  }

  static findAllInDescendingOrder() {
    return OutboxStore.findAll().order([
      Message.attributes.state.descending(),
      Message.attributes.date.descending(),
    ]);
  }

  static findAllWithBodyInDescendingOrder() {
    return OutboxStore.findAllInDescendingOrder().include(Message.attributes.body).include(Message.attributes.isPlainText);
  }

  constructor() {
    super();
    this._tasks = [];
    this._dataSource = null;
    this._dataSourceUnlisten = null;
    this._totalInOutbox = 0;
    this._totalFailedDrafts = 0;
    this._selectedDraft = null;
    if (AppEnv.isMainWindow()) {
      this.listenTo(TaskQueue, this._populate);
      this.listenTo(FocusedPerspectiveStore, this._onPerspectiveChanged);
      this.listenTo(FocusedContentStore, this._onFocusedContentChanged);
      this.listenTo(DatabaseStore, this._onDataChanged);
      this.listenTo(Actions.gotoOutbox, this._gotoOutbox);
      this.listenTo(Actions.cancelOutboxDrafts, this._onCancelOutboxDraft);
      this.listenTo(Actions.editOutboxDraft, this._onEditOutboxDraft);
      this._createListDataSource();
    }
  }

  selectedDraft() {
    return this._selectedDraft;
  }

  count() {
    return {
      failed: this._totalFailedDrafts,
      total: this._totalInOutbox,
    };
  }

  dataSource = () => {
    return this._dataSource;
  };

  selectionObservable = () => {
    return Rx.Observable.fromListSelection(this);
  };
  _onEditOutboxDraft = (headerMessageId) =>{
    if(this._selectedDraft && headerMessageId === this._selectedDraft.headerMessageId){
      this._selectedDraft = null;
      console.log('draft edited');
      this.trigger();
    }
  };
  _onCancelOutboxDraft = ({messages = []}) => {
    if(!this._selectedDraft){
      return;
    }
    for(let i = 0; i< messages.length; i++){
      if(messages[i].id === this._selectedDraft.id){
        this._selectedDraft = null;
        console.log('draft deleted');
        this.trigger();
        break;
      }
    }
  };

  _gotoOutbox() {
    console.log('go to outbox');
    if (this.count().total > 0) {
      FocusedPerspectiveStore.gotoOutbox();
    }
  }

  _onDataChanged(change) {
    const currentPerspective = FocusedPerspectiveStore.current();
    if (currentPerspective.outbox) {
      if (change.objectClass === Message.name) {
        let needUpdate = false;
        change.objects.forEach(obj => {
          if (obj.draft && [Message.messageState.failing, Message.messageState.failed].includes(obj.state)) {
            if (this._selectedDraft && this._selectedDraft.id === obj.id) {
              if (change.type === 'persist') {
                this._selectedDraft = obj;
              } else {
                this._selectedDraft = null;
              }
              needUpdate = true;
            }
          }
        });
        if (needUpdate) {
          this.trigger();
        }
      }
    }
  }
  _onFocusedContentChanged = () => {
    const focused = FocusedContentStore.focused('outbox');
    if (!focused) {
      if (this._selectedDraft) {
        this._selectedDraft = null;
        this.trigger();
      }
    } else if (
      focused.draft &&
      [Message.messageState.failed, Message.messageState.failing].includes(focused.state.toString())
    ) {
      if (!this._selectedDraft) {
        this._selectedDraft = focused;
        this.trigger();
      } else if (focused.id !== this._selectedDraft.id) {
        this._selectedDraft = focused;
        this.trigger();
      } else if (
        focused.id === this._selectedDraft.id &&
        focused.state !== this._selectedDraft.state
      ) {
        this._selectedDraft = focused;
        this.trigger();
      }
    }
  };

  _onPerspectiveChanged = () => {
    const current = FocusedPerspectiveStore.current();
    if (!current.outbox) {
      this._selectedDraft = null;
    }
  };

  _createListDataSource = () => {
    if (typeof this._dataSourceUnlisten === 'function') {
      this._dataSourceUnlisten();
    }
    if (this._dataSource) {
      this._dataSource.cleanup();
      this._dataSource = null;
    }
    const query = OutboxStore.findAllWithBodyInDescendingOrder().page(0, 1);
    console.log('query not send');
    const subscription = new MutableQuerySubscription(query, { emitResultSet: true });
    console.log('query send');
    let $resultSet = Rx.Observable.fromNamedQuerySubscription('outbox-list', subscription);
    $resultSet = Rx.Observable.combineLatest(
      [$resultSet],
      (resultSet, outbox) => {
        // Generate a new result set that includes additional information on
        // the draft objects. This is similar to what we do in the thread-list,
        // where we set thread.__messages to the message array.
        console.log('results are in');
        const resultSetWithTasks = new MutableQueryResultSet(resultSet);
        return resultSetWithTasks.immutableClone();
      },
    );

    this._dataSource = new ObservableListDataSource($resultSet, subscription.replaceRange);
    this._dataSourceUnlisten = this._dataSource.listen(this._onDataChanged, this);
    this._dataSource.setRetainedRange({ start: 0, end: 50 });
    this.trigger(this);
  };
  _onDataChanged = ({ previous, next } = {}) => {
    if (next) {
      const total = next.count();
      const failed = this._numberOfFailedDrafts(next.models());
      if (total !== this._totalInOutbox || failed !== this._totalFailedDrafts) {
        this._totalInOutbox = total;
        this._totalFailedDrafts = failed;
        if(total === 0){
          AppEnv.logDebug('Outbox no longer have data');
          Actions.focusDefaultMailboxPerspectiveForAccounts(AccountStore.accounts());
        }
        this.trigger();
      }
    }
    if (previous && next) {
      const focused = FocusedContentStore.focused('thread');
      const keyboard = FocusedContentStore.keyboardCursor('thread');
      const nextQ = next.query();
      const matchers = nextQ && nextQ.matchers();

      const notInSet = function(model) {
        if (matchers) {
          return model.matches(matchers) === false && next.offsetOfId(model.id) === -1;
        } else {
          return next.offsetOfId(model.id) === -1;
        }
      };

      if (focused && notInSet(focused)) {
        Actions.setFocus({ collection: 'outbox', item: null });
      }

      if (keyboard && notInSet(keyboard)) {
        Actions.setCursorPosition({
          collection: 'outbox',
          item: null,
        });
      }
    }
  };
  _numberOfFailedDrafts = drafts => {
    let ret = 0;
    if (Array.isArray(drafts)) {
      drafts.forEach(item => {
        ret += parseInt(item.state) === -1;
      });
    }
    return ret;
  };

  _populate() {
    const nextTasks = TaskQueue.queue().filter(
      task => task instanceof SendDraftTask || task instanceof SyncbackDraftTask,
    );
    if (this._tasks.length === 0 && nextTasks.length === 0) {
      return;
    }
    this._tasks = nextTasks;
    this.trigger();
  }

  itemsForAccount(accountId) {
    return this._tasks.filter(task => task.draftAccountId === accountId);
  }
}

const store = new OutboxStore();
export default store;
