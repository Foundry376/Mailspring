import MailspringStore from 'mailspring-store';
import DatabaseStore from './database-store';
import Message from '../models/message';
import Thread from '../models/thread';
import Sift from '../models/sift';
import FocusedPerspectiveStore from './focused-perspective-store';
import {
  Rx,
  Actions,
  MutableQueryResultSet,
  ObservableListDataSource,
  FocusedContentStore,
  AccountStore,
} from 'mailspring-exports';
import ListTabular from '../../components/list-tabular';
import DatabaseChangeRecord from './database-change-record';

class SiftStore extends MailspringStore {
  constructor() {
    super();
    this._tasks = [];
    this._dataSource = null;
    this._dataSourceUnlisten = null;
    this._totalInOutbox = 0;
    this._totalFailedDrafts = 0;
    this._selectedSift = null;
    this._siftCategory = '';
    if (AppEnv.isMainWindow()) {
      // this.listenTo(TaskQueue, this._populate);
      this.listenTo(FocusedPerspectiveStore, this._onPerspectiveChanged);
      this.listenTo(FocusedContentStore, this._onFocusedContentChanged);
      this.listenTo(DatabaseStore, this._onDataChanged);
      // this.listenTo(Actions.gotoOutbox, this._gotoOutbox);
      // this.listenTo(Actions.cancelOutboxDrafts, this._onCancelOutboxDraft);
      // this.listenTo(Actions.editOutboxDraft, this._onEditOutboxDraft);
      this._createListDataSource();
    }
  }

  siftCategory() {
    return this._siftCategory;
  }

  selectedSift() {
    return this._selectedSift;
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
  _triggerDattasource = model => {
      Actions.forceDatabaseTrigger(
        new DatabaseChangeRecord({
          type: 'unpersist',
          objectClass: 'Message',
          objects: [model],
        }),
      );
  };
  _forceDataSourceTrigger = ({ source = '', index = -1 }) => {
    console.log(`${source} force datasource trigger index: ${index}`);
    if (this._dataSource && !this._dataSource.empty()) {
      const mockMessage = this._dataSource.get(index === -1 ? 0 : index);
      mockMessage.date = Date.now();
      mockMessage.siftData = [];
      this._triggerDattasource(mockMessage);
    }
  };

  _onDataChanged(change) {
    const currentPerspective = FocusedPerspectiveStore.current();
    if (currentPerspective.sift) {
      if (change.objectClass === Message.name) {
        let needUpdate = false;
        change.objects.forEach(obj => {
          if (this._selectedSift && this._selectedSift.id === obj.id) {
            if (change.type === 'persist') {
              this._selectedSift = obj;
            } else {
              this._selectedSift = null;
            }
            needUpdate = true;
          }
        });
        if (needUpdate) {
          this.trigger();
        }
      } else if (change.objectClass === Thread.name) {
        let needUpdate = false;
        let index = -1;
        for (let obj of change.objects) {
          index = this._findThreadInDataSet(obj);
          if (index !== -1) {
            needUpdate = true;
            break;
          }
        }
        if (needUpdate) {
          this._forceDataSourceTrigger({ index, source: 'thread change' });
        }
      } else if (change.objectClass === Sift.name) {
        let needUpdate = false;
        for (let obj of change.objects){
          if (Sift.categoryStringToIntString(this._siftCategory) === obj.category.toString()) {
            needUpdate = true;
            break;
          }
        }
        if (needUpdate) {
          this._forceDataSourceTrigger({ source: 'sift change' });
        }
      }
    }
  }

  _findThreadInDataSet = thread => {
    if (this._dataSource && !this._dataSource.empty()) {
      const ids = this._dataSource._resultSet._ids;
      for (let i = 0; i < ids.length; i++) {
        if (this._dataSource._resultSet._modelsHash[ids[i]].threadId === thread.id) {
          return i;
        }
      }
    }
    return -1;
  };
  _onFocusedContentChanged = () => {
    const focused = FocusedContentStore.focused('sift');
    if (!focused) {
      if (this._selectedSift) {
        this._selectedSift = null;
        this.trigger();
      }
    } else if (
      focused.draft &&
      [Message.messageState.failed, Message.messageState.failing].includes(focused.state.toString())
    ) {
      if (!this._selectedSift) {
        this._selectedSift = focused;
        this.trigger();
      } else if (focused.id !== this._selectedSift.id) {
        this._selectedSift = focused;
        this.trigger();
      } else if (
        focused.id === this._selectedSift.id &&
        focused.state !== this._selectedSift.state
      ) {
        this._selectedSift = focused;
        this.trigger();
      }
    }
  };

  _onPerspectiveChanged = () => {
    const current = FocusedPerspectiveStore.current();
    if (!current.sift) {
      if (this.selectedSift()) {
        Actions.setFocus({ collection: 'sift', item: null });
      }
      this._selectedSift = null;
      this._siftCategory = '';
      // if (typeof this._dataSourceUnlisten === 'function') {
      //   this._dataSourceUnlisten();
      //   this._dataSourceUnlisten = null;
      // }
      // if (this._dataSource) {
      //   this.dataSource().selection.clear();
      //   this._dataSource.cleanup();
      //   this._dataSource = null;
      //   console.log('unlistened to data change for sift');
      // }
      this.trigger();
    } else {
      this._createListDataSource();
    }
  };

  _createListDataSource = () => {
    if (typeof this._dataSourceUnlisten === 'function') {
      this._dataSourceUnlisten();
      this._dataSourceUnlisten = null;
    }
    if (this._dataSource) {
      this._dataSource.cleanup();
      this._dataSource = null;
    }
    const perspective = FocusedPerspectiveStore.current();
    if (!perspective.sift) {
      this._dataSource = new ListTabular.DataSource.Empty();
    } else {
      const subscription = perspective.messages();
      this._siftCategory = perspective.siftCategory;
      let $resultSet = Rx.Observable.fromNamedQuerySubscription('sift-list', subscription);
      $resultSet = Rx.Observable.combineLatest(
        [$resultSet],
        (resultSet, sift) => {
          const resultSetWithTasks = new MutableQueryResultSet(resultSet);
          return resultSetWithTasks.immutableClone();
        },
      );

      this._dataSource = new ObservableListDataSource($resultSet, subscription.replaceRange);
      this._dataSourceUnlisten = this._dataSource.listen(this._onDataSourceChanged, this);
    }
    this._dataSource.setRetainedRange({ start: 0, end: 50 });
    this.trigger(this);
  };
  _onDataSourceChanged = ({ previous, next } = {}) => {
    console.log('on datasource change');
    if (previous && next) {
      const focused = FocusedContentStore.focused('sift');
      const keyboard = FocusedContentStore.keyboardCursor('sift');
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
        Actions.setFocus({ collection: 'sift', item: null });
      }

      if (keyboard && notInSet(keyboard)) {
        Actions.setCursorPosition({
          collection: 'sift',
          item: null,
        });
      }
    }
  };

  // _populate() {
  //   const nextTasks = TaskQueue.queue().filter(
  //     task => task instanceof SendDraftTask || task instanceof SyncbackDraftTask,
  //   );
  //   if (this._tasks.length === 0 && nextTasks.length === 0) {
  //     return;
  //   }
  //   this._tasks = nextTasks;
  //   this.trigger();
  // }
}

const store = new SiftStore();
export default store;
