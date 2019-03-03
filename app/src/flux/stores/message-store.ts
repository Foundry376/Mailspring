import MailspringStore from 'mailspring-store';
import * as Actions from '../actions';
import { Message } from '../models/message';
import { Thread } from '../models/thread';
import DatabaseStore from './database-store';
import { TaskFactory } from '../tasks/task-factory';
import FocusedPerspectiveStore from './focused-perspective-store';
import FocusedContentStore from './focused-content-store';
import * as ExtensionRegistry from '../../registries/extension-registry';
import electron from 'electron';
import DatabaseChangeRecord from './database-change-record';

const FolderNamesHiddenByDefault = ['spam', 'trash'];

class _MessageStore extends MailspringStore {
  FolderNamesHiddenByDefault = FolderNamesHiddenByDefault;

  _showingHiddenItems: boolean = false;
  _items?: Message[];
  _thread?: Thread;
  _itemsExpanded: { [messageId: string]: 'explicit' | 'default' };
  _itemsLoading: boolean;
  _lastMarkedAsReadThreadId?: string;
  _onFocusChangedTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this._setStoreDefaults();
    this._registerListeners();
  }

  //########## PUBLIC #####################################################

  items() {
    if (this._showingHiddenItems) return this._items;

    const viewing = FocusedPerspectiveStore.current().categoriesSharedRole();
    const viewingHiddenCategory = FolderNamesHiddenByDefault.includes(viewing);

    return this._items.filter(item => {
      const inHidden = FolderNamesHiddenByDefault.includes(item.folder.role);
      return viewingHiddenCategory ? inHidden || item.draft : !inHidden;
    });
  }

  threadId() {
    return this._thread ? this._thread.id : undefined;
  }

  thread() {
    return this._thread;
  }

  itemsExpandedState() {
    // ensure that we're always serving up immutable objects.
    // this.state == nextState is always true if we modify objects in place.
    return Object.assign({}, this._itemsExpanded);
  }

  hasCollapsedItems() {
    return Object.keys(this._itemsExpanded).length < this._items.length;
  }

  numberOfHiddenItems() {
    return this._items.length - this.items().length;
  }

  itemIds() {
    return this._items.map(i => i.id);
  }

  itemsLoading() {
    return this._itemsLoading;
  }

  /*
  Message Store Extensions
  */

  // Public: Returns the extensions registered with the MessageStore.
  extensions() {
    return ExtensionRegistry.MessageView.extensions();
  }

  _onExtensionsChanged(role) {
    const MessageBodyProcessor = require('./message-body-processor').default;
    MessageBodyProcessor.resetCache();
  }

  //########## PRIVATE ####################################################

  _setStoreDefaults() {
    this._items = [];
    this._itemsExpanded = {};
    this._itemsLoading = false;
    this._showingHiddenItems = false;
    this._thread = null;
  }

  _registerListeners() {
    this.listenTo(ExtensionRegistry.MessageView, this._onExtensionsChanged);
    this.listenTo(DatabaseStore, this._onDataChanged);
    this.listenTo(FocusedContentStore, this._onFocusChanged);
    this.listenTo(FocusedPerspectiveStore, this._onPerspectiveChanged);
    this.listenTo(Actions.toggleMessageIdExpanded, this._onToggleMessageIdExpanded);
    this.listenTo(Actions.toggleAllMessagesExpanded, this._onToggleAllMessagesExpanded);
    this.listenTo(Actions.toggleHiddenMessages, this._onToggleHiddenMessages);
    this.listenTo(Actions.popoutThread, this._onPopoutThread);
    return this.listenTo(Actions.focusThreadMainWindow, this._onFocusThreadMainWindow);
  }

  _onPerspectiveChanged() {
    return this.trigger();
  }

  _onDataChanged(change) {
    if (!this._thread) return;

    if (change.objectClass === Message.name) {
      const inDisplayedThread = change.objects.some(obj => obj.threadId === this._thread.id);
      if (!inDisplayedThread) return;

      if (change.objects.length === 1 && change.objects[0].draft === true) {
        const item = change.objects[0];
        const itemIndex = this._items.findIndex(msg => msg.id === item.id);

        if (change.type === 'persist' && itemIndex === -1) {
          this._items = [].concat(this._items, [item]).filter(m => !m.isHidden());
          this._items = this._sortItemsForDisplay(this._items);
          this._expandItemsToDefault();
          this.trigger();
          return;
        }

        if (change.type === 'unpersist' && itemIndex !== -1) {
          this._items = [].concat(this._items).filter(m => !m.isHidden());
          this._items.splice(itemIndex, 1);
          this._expandItemsToDefault();
          this.trigger();
          return;
        }
      }

      this._fetchFromCache();
    }

    if (change.objectClass === Thread.name) {
      const updatedThread = change.objects.find(t => t.id === this._thread.id);
      if (updatedThread) {
        this._thread = updatedThread;
        this._fetchFromCache();
      }
    }
  }

  _onFocusChanged(change: { impactsCollection: (collection: string) => boolean }) {
    if (!change.impactsCollection('thread')) return;

    // This implements a debounce that fires on the leading and trailing edge.
    //
    // If we haven't changed focus in the last 100ms, do it immediately. This means
    // there is no delay when moving to the next thread, deselecting a thread, etc.
    //
    // If we have changed focus in the last 100ms, wait for focus changes to
    // stop arriving for 100msec before applying. This means that flying
    // through threads doesn't cause is to make a zillion queries for messages.
    //
    if (!this._onFocusChangedTimer) {
      this._onApplyFocusChange();
    } else {
      clearTimeout(this._onFocusChangedTimer);
    }

    this._onFocusChangedTimer = setTimeout(() => {
      this._onFocusChangedTimer = null;
      this._onApplyFocusChange();
    }, 100);
  }

  _onApplyFocusChange() {
    const focused = FocusedContentStore.focused('thread');
    if (focused === null) {
      this._lastMarkedAsReadThreadId = null;
    }

    // if we already match the desired state, no need to trigger
    if (this.threadId() === (focused || {}).id) return;

    this._thread = focused;
    this._items = [];
    this._itemsLoading = true;
    this._showingHiddenItems = false;
    this._itemsExpanded = {};
    this.trigger();

    this._setWindowTitle();

    this._fetchFromCache();
  }

  _setWindowTitle() {
    let title = 'Mailspring' + (this._thread ? ' · ' + this._thread.subject : '');
    electron.remote.getCurrentWindow().setTitle(title);
  }

  _markAsRead() {
    // Mark the thread as read if necessary. Make sure it's still the
    // current thread after the timeout.
    //
    // Override canBeUndone to return false so that we don't see undo
    // prompts (since this is a passive action vs. a user-triggered
    // action.)
    if (!this._thread) return;
    if (this._lastMarkedAsReadThreadId === this._thread.id) return;
    this._lastMarkedAsReadThreadId = this._thread.id;

    if (this._thread.unread) {
      const markAsReadDelay = AppEnv.config.get('core.reading.markAsReadDelay');
      const markAsReadId = this._thread.id;
      if (markAsReadDelay < 0) return;

      setTimeout(() => {
        if (markAsReadId !== this.threadId() || !this._thread.unread) return;
        Actions.queueTask(
          TaskFactory.taskForInvertingUnread({
            threads: [this._thread],
            source: 'Thread Selected',
            canBeUndone: false,
          })
        );
      }, markAsReadDelay);
    }
  }

  _onToggleAllMessagesExpanded() {
    if (this.hasCollapsedItems()) {
      this._items.forEach(i => this._expandItem(i));
    } else {
      // Do not collapse the latest message, i.e. the last one
      this._items.slice(0, -1).forEach(i => this._collapseItem(i));
    }
    this.trigger();
  }

  _onToggleHiddenMessages() {
    this._showingHiddenItems = !this._showingHiddenItems;
    this._expandItemsToDefault();
    this._fetchExpandedAttachments(this._items);
    this.trigger();
  }

  _onToggleMessageIdExpanded(id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;

    if (this._itemsExpanded[id]) {
      this._collapseItem(item);
    } else {
      this._expandItem(item);
    }

    this.trigger();
  }

  _expandItem(item) {
    this._itemsExpanded[item.id] = 'explicit';
    this._fetchExpandedAttachments([item]);
  }

  _collapseItem(item) {
    delete this._itemsExpanded[item.id];
  }

  _fetchFromCache(options = null) {
    if (options == null) options = {};
    if (!this._thread) return;

    const loadedThreadId = this._thread.id;

    const query = DatabaseStore.findAll<Message>(Message);
    query.where({ threadId: loadedThreadId });
    query.include(Message.attributes.body);

    return query.then(items => {
      // Check to make sure that our thread is still the thread we were
      // loading items for. Necessary because this takes a while.
      if (loadedThreadId !== this.threadId()) return;

      this._items = items.filter(m => !m.isHidden());
      this._items = this._sortItemsForDisplay(this._items);

      this._expandItemsToDefault();

      if (this._itemsLoading) {
        this._fetchMissingBodies(this._items);
      }

      // Download the attachments on expanded messages.
      this._fetchExpandedAttachments(this._items);

      // Normally, we would trigger often and let the view's
      // shouldComponentUpdate decide whether to re-render, but if we
      // know we're not ready, don't even bother.  Trigger once at start
      // and once when ready. Many third-party stores will observe
      // MessageStore and they'll be stupid and re-render constantly.
      this._itemsLoading = false;
      this._markAsRead();
      this.trigger(this);
    });
  }

  _fetchMissingBodies(items) {
    const missing = items.filter(i => i.body === null);
    if (missing.length > 0) {
      return Actions.fetchBodies(missing);
    }
  }

  _fetchExpandedAttachments(items) {
    for (let item of items) {
      if (!this._itemsExpanded[item.id]) continue;
      item.files.map(file => Actions.fetchFile(file));
    }
  }

  // Expand all unread messages, all drafts, and the last message
  _expandItemsToDefault() {
    const visibleItems = this.items();
    let lastDraftIdx = -1;

    visibleItems.forEach((item, idx) => {
      if (item.draft) {
        lastDraftIdx = idx;
      }
    });

    for (let idx = 0; idx < visibleItems.length; idx++) {
      const item = visibleItems[idx];
      if (item.unread || idx === lastDraftIdx || idx === visibleItems.length - 1) {
        this._itemsExpanded[item.id] = 'default';
      }
    }
  }

  _sortItemsForDisplay(items) {
    // Re-sort items in the list so that drafts appear after the message that
    // they are in reply to, when possible. First, identify all the drafts
    // with a replyToHeaderMessageId and remove them
    let index, item;
    const itemsInReplyTo = [];
    for (index = items.length - 1; index >= 0; index--) {
      item = items[index];
      if (item.draft && item.replyToHeaderMessageId) {
        itemsInReplyTo.push(item);
        items.splice(index, 1);
      }
    }

    // For each item with the reply header, re-inset it into the list after
    // the message which it was in reply to. If we can't find it, put it at the end.
    for (item of itemsInReplyTo) {
      for (index = 0; index < items.length; index++) {
        const other = items[index];
        if (item.replyToHeaderMessageId === other.headerMessageId) {
          items.splice(index + 1, 0, item);
          item = null;
          break;
        }
      }
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  _onPopoutThread(thread) {
    return AppEnv.newWindow({
      title: false, // MessageList already displays the thread subject
      hidden: false,
      windowKey: `thread-${thread.id}`,
      windowType: 'thread-popout',
      windowProps: {
        threadId: thread.id,
        perspectiveJSON: FocusedPerspectiveStore.current().toJSON(),
      },
    });
  }

  _onFocusThreadMainWindow(thread) {
    if (AppEnv.isMainWindow()) {
      Actions.setFocus({ collection: 'thread', item: thread });
      return AppEnv.focus();
    }
  }
}

export const MessageStore = new _MessageStore();
