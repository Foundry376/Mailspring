import MailspringStore from 'mailspring-store';

import {
  Rx,
  Actions,
  Thread,
  Message,
  QueryResultSet,
  WorkspaceStore,
  FocusedContentStore,
  FocusedPerspectiveStore,
  MutableQuerySubscription,
} from 'mailspring-exports';
import { ListTabular, ListDataSource } from 'mailspring-component-kit';
import ThreadListDataSource from './thread-list-data-source';
import MessageListDataSource from './message-list-data-source';

class ThreadListStore extends MailspringStore {
  _dataSource?: ListDataSource;
  _dataSourceUnlisten: () => void;

  constructor() {
    super();
    this.listenTo(FocusedPerspectiveStore, this._onPerspectiveChanged);

    // Listen for changes to the threading configuration
    AppEnv.config.onDidChange('core.reading.disableThreading', () => {
      this.createListDataSource();
    });

    this.createListDataSource();
  }

  dataSource = () => {
    return this._dataSource;
  };

  createListDataSource = () => {
    if (typeof this._dataSourceUnlisten === 'function') {
      this._dataSourceUnlisten();
    }

    if (this._dataSource) {
      this._dataSource.cleanup();
      this._dataSource = null;
    }

    const disableThreading = AppEnv.config.get('core.reading.disableThreading');
    const perspective = FocusedPerspectiveStore.current();

    if (disableThreading) {
      // Use message-based data source for non-threaded view
      console.log('[ThreadListStore] Perspective type:', perspective.constructor.name);
      console.log('[ThreadListStore] Has messages method:', typeof perspective.messages);

      const messagesSubscription = perspective.messages?.();
      if (messagesSubscription) {
        console.log('[ThreadListStore] Using MessageListDataSource');
        // Cast to MutableQuerySubscription since the runtime implementation supports it
        this._dataSource = new MessageListDataSource(
          messagesSubscription as any as MutableQuerySubscription<Message>
        );
        this._dataSourceUnlisten = this._dataSource.listen(this._onDataChanged, this);
      } else {
        // Perspective doesn't support message queries yet, fall back to threads
        console.warn(
          'Current perspective does not support non-threaded view, falling back to threaded view'
        );
        const threadsSubscription = perspective.threads();
        if (threadsSubscription) {
          this._dataSource = new ThreadListDataSource(threadsSubscription);
          this._dataSourceUnlisten = this._dataSource.listen(this._onDataChanged, this);
        } else {
          this._dataSource = new ListTabular.DataSource.Empty();
        }
      }
    } else {
      // Use thread-based data source for threaded view (default)
      const threadsSubscription = perspective.threads();
      if (threadsSubscription) {
        this._dataSource = new ThreadListDataSource(threadsSubscription);
        this._dataSourceUnlisten = this._dataSource.listen(this._onDataChanged, this);
      } else {
        this._dataSource = new ListTabular.DataSource.Empty();
      }
    }

    this.trigger(this);
    Actions.setFocus({ collection: 'thread', item: null });
  };

  selectionObservable = () => {
    return Rx.Observable.fromListSelection<Thread>(this);
  };

  // Inbound Events

  _onPerspectiveChanged = () => {
    this.createListDataSource();
  };

  _onDataChanged = ({
    previous,
    next,
  }: { previous?: QueryResultSet<Thread>; next?: QueryResultSet<Thread> } = {}) => {
    // This code keeps the focus and keyboard cursor in sync with the thread list.
    // When the thread list changes, it looks to see if the focused thread is gone,
    // or no longer matches the query criteria and advances the focus to the next
    // thread.

    // This means that removing a thread from view in any way causes selection
    // to advance to the adjacent thread. Nice and declarative.
    if (previous && next) {
      const focused = FocusedContentStore.focused('thread');
      const keyboard = FocusedContentStore.keyboardCursor('thread');
      const viewModeAutofocuses =
        WorkspaceStore.layoutMode() === 'split' || WorkspaceStore.topSheet().root === true;

      const nextQ = next.query();
      const matchers = nextQ && nextQ.matchers();

      const focusedIndex = focused ? previous.offsetOfId(focused.id) : -1;
      const keyboardIndex = keyboard ? previous.offsetOfId(keyboard.id) : -1;

      const nextItemFromIndex = i => {
        let nextIndex;
        if (
          i > 0 &&
          ((next.modelAtOffset(i - 1) && next.modelAtOffset(i - 1).unread) || i >= next.count())
        ) {
          nextIndex = i - 1;
        } else {
          nextIndex = i;
        }

        // May return null if no thread is loaded at the next index
        return next.modelAtOffset(nextIndex);
      };

      const notInSet = function (model) {
        if (matchers) {
          return model.matches(matchers) === false;
        } else {
          return next.offsetOfId(model.id) === -1;
        }
      };

      if (viewModeAutofocuses && focused && notInSet(focused)) {
        Actions.setFocus({ collection: 'thread', item: nextItemFromIndex(focusedIndex) });
      }

      if (keyboard && notInSet(keyboard)) {
        Actions.setCursorPosition({
          collection: 'thread',
          item: nextItemFromIndex(keyboardIndex),
        });
      }
    }
  };
}

export default new ThreadListStore();
