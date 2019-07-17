import MailspringStore from 'mailspring-store';
import Actions from '../actions';
import Message from '../models/message';
import Thread from '../models/thread';
import DatabaseStore from './database-store';
import ThreadStore from './thread-store';
import AttachmentStore from './attachment-store';
import WorkspaceStore from './workspace-store';
import TaskFactory from '../tasks/task-factory';
import FocusedPerspectiveStore from './focused-perspective-store';
import FocusedContentStore from './focused-content-store';
import * as ExtensionRegistry from '../../registries/extension-registry';
import electron, { ipcRenderer, remote } from 'electron';
import fs from 'fs';

const FolderNamesHiddenByDefault = ['spam', 'trash'];

class MessageStore extends MailspringStore {
  constructor() {
    super();
    this._setStoreDefaults();
    this._registerListeners();
  }

  findAll() {
    return DatabaseStore.findAll(Message)
      .where([Message.attributes.state.in([Message.messageState.normal, Message.messageState.saving, Message.messageState.sending, Message.messageState.pulling])]);
  }

  findAllInDescendingOrder() {
    return this.findAll().order(Message.attributes.date.descending());
  }

  findAllWithBodyInDescendingOrder() {
    return this.findAllInDescendingOrder().include(Message.attributes.body).include(Message.attributes.isPlainText);
  }

  findAllByThreadId({ threadId }) {
    return this.findAll().where({ threadId: threadId });
  }

  findAllByThreadIdWithBody({ threadId }) {
    return this.findAllByThreadId({ threadId }).include(Message.attributes.body).include(Message.attributes.isPlainText);
  }

  findAllByThreadIdWithBodyInDescendingOrder({ threadId }) {
    return this.findAllByThreadIdWithBody({ threadId }).order(Message.attributes.date.descending());
  }

  findByThreadId({ threadId }) {
    return DatabaseStore.findBy(Message, { threadId }).where([Message.attributes.state.in([Message.messageState.normal, Message.messageState.saving, Message.messageState.sending, Message.messageState.pulling])]);
  }

  findByThreadIdAndAccountId({ threadId, accountId }) {
    return this.findByThreadId({ threadId }).where({ accountId: accountId });
  }

  findByThreadIdAndAccountIdInDesecndingOrder({ threadId, accountId }) {
    return this.findByThreadIdAndAccountId({ threadId, accountId }).order(Message.attributes.date.descending());
  }

  findByThreadIdInDescendingOrder({ threadId }) {
    return this.findByThreadId({ threadId }).order(Message.attributes.date.descending());
  }

  findByMessageId({ messageId }) {
    return DatabaseStore.find(Message, messageId).where([Message.attributes.state.in([Message.messageState.normal, Message.messageState.saving, Message.messageState.sending, Message.messageState.pulling])]);
  }

  findByMessageIdWithBody({ messageId }) {
    return this.findByMessageId({ messageId }).include(Message.attributes.body).include(Message.attributes.isPlainText);
  }

  //########## PUBLIC #####################################################

  items() {
    if (this._showingHiddenItems) return this._items;

    const viewing = FocusedPerspectiveStore.current().categoriesSharedRole();
    const viewingHiddenCategory = FolderNamesHiddenByDefault.includes(viewing);

    return this._items.filter(item => {
      const inHidden = FolderNamesHiddenByDefault.includes(item.folder.role) || item.isHidden();
      return viewingHiddenCategory ? inHidden || item.draft : !inHidden;
    });
  }

  getAllItems() {
    return this._items;
  }

  threadId() {
    return this._thread ? this._thread.id : undefined;
  }

  thread() {
    return this._thread;
  }

  lastThreadChangeTimestamp() {
    return this._lastThreadChangeTimestamp;
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

  isPopedOut = () => {
    // We only care for popout in main window
    return AppEnv.isMainWindow() && this._popedOut;
  };


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
    if (AppEnv.isThreadWindow()) {
      // ipcRenderer.removeListener('close-window', this._onPopoutClosed);
      ipcRenderer.removeListener('thread-arp', this._onReceivedThreadARP);
      AppEnv.removeUnloadCallback(this._onWindowClose);
      // ipcRenderer.on('close-window', this._onPopoutClosed);
      ipcRenderer.on('thread-arp', this._onReceivedThreadARP);
      AppEnv.onBeforeUnload(this._onWindowClose);
      // console.log('set listeners in thread window');
    }
    // console.log('set store default');
    this._items = [];
    this._itemsExpanded = {};
    this._itemsLoading = false;
    this._showingHiddenItems = false;
    this._thread = null;
    this._popedOut = false;
    this._lastThreadChangeTimestamp = 0;
    this._missingAttachmentIds = [];
  }

  _registerListeners() {
    // console.log('register listerners');
    AppEnv.onBeforeUnload(this._onWindowClose);
    if (AppEnv.isMainWindow()) {
      this._currentWindowLevel = 1;
      ipcRenderer.on('thread-close-window', this._onPopoutClosed);
      ipcRenderer.on('thread-arp-reply', this._onThreadARPReply);
    } else if (AppEnv.isThreadWindow()) {
      this._currentWindowLevel = 2;
      ipcRenderer.on('thread-arp', this._onReceivedThreadARP);
    } else if (AppEnv.isComposerWindow()) {
      this._currentWindowLevel = 3;
    }
    this.listenTo(ExtensionRegistry.MessageView, this._onExtensionsChanged);
    this.listenTo(DatabaseStore, this._onDataChanged);
    this.listenTo(FocusedContentStore, this._onFocusChanged);
    this.listenTo(FocusedPerspectiveStore, this._onPerspectiveChanged);
    this.listenTo(Actions.toggleMessageIdExpanded, this._onToggleMessageIdExpanded);
    this.listenTo(Actions.toggleAllMessagesExpanded, this._onToggleAllMessagesExpanded);
    this.listenTo(Actions.toggleHiddenMessages, this._onToggleHiddenMessages);
    this.listenTo(Actions.popoutThread, this._onPopoutThread);
    this.listenTo(Actions.fetchAttachmentsByMessage, this.fetchMissingAttachmentsByMessage);
    this.listenTo(Actions.setCurrentWindowTitle, this.setWindowTitle);
    return this.listenTo(Actions.focusThreadMainWindow, this._onFocusThreadMainWindow);
  }

  _onThreadARPReply = (event, options) => {
    // console.log('received arp reply', options);
    if (
      options.threadId &&
      options.windowLevel &&
      options.windowLevel > this._getCurrentWindowLevel() &&
      this._thread &&
      options.threadId === this._thread.id
    ) {
      this._setPopout(true);
    }
  };
  _onReceivedThreadARP = (event, options) => {
    // console.log('received arp request', options);
    if (
      options.threadId &&
      this._thread &&
      options.windowLevel &&
      options.windowLevel < this._getCurrentWindowLevel() &&
      options.threadId === this._thread.id
    ) {
      options.windowLevel = this._getCurrentWindowLevel();
      ipcRenderer.send('arp-reply', options);
    }
  };
  _getCurrentWindowLevel = () => {
    if (AppEnv.isMainWindow()) {
      return 1;
    } else if (AppEnv.isThreadWindow()) {
      return 2;
    } else if (AppEnv.isComposerWindow()) {
      return 3;
    }
  };
  _onWindowClose = () => {
    // console.log(`on thread window close, thread id: ${this._thread ? this._thread.id : 'null'}, windowLevel: ${this._getCurrentWindowLevel()}`);
    if (this._thread) {
      ipcRenderer.send('close-window', {
        threadId: this._thread.id,
        accountId: this._thread.accountId,
        additionalChannelParam: 'thread',
        windowLevel: this._getCurrentWindowLevel(),
      });
      ipcRenderer.send('close-window', {
        threadId: this._thread.id,
        additionalChannelParam: 'draft',
        windowLevel: this._getCurrentWindowLevel(),
      });
    }
    return true;
  };

  _onPopoutClosed = (event, options) => {
    // console.log(`window ${this._getCurrentWindowLevel()} message store popout closed with thread id ${options.threadId}, from windowLevel: ${options.windowLevel}`);
    if (options.windowLevel && options.windowLevel > this._getCurrentWindowLevel()) {
      if (options.threadId && this._thread && options.threadId === this._thread.id) {
        this._setPopout(false);
      }
    }
  };

  _onPerspectiveChanged() {
    // console.log('on perspective change', arguments);
    return this.trigger();
  }

  _onDataChanged(change) {
    if (!this._thread) return;

    if (change.objectClass === Message.name) {
      const inDisplayedThread = change.objects.some(obj => obj.threadId === this._thread.id);
      if (!inDisplayedThread) return;

      if (change.objects.length === 1 && change.objects[0].draft === true && !change.objects[0].calendarReply) {
        const item = change.objects[0];
        const itemIndex = this._items.findIndex(msg => msg.id === item.id);

        if (change.type === 'persist' && itemIndex === -1) {
          this._items = [].concat(this._items, [item]).filter(m => !m.isHidden()).filter(this.filterOutDuplicateDraftHeaderMessage);
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
        // this._thread = updatedThread;
        ThreadStore.findBy({ threadId: this._thread.id }).then(thread => {
          this._updateThread(thread);
          this._fetchFromCache();
        });
      }
    }
  }

  _updateThread = thread => {
    if (thread) {
      this._thread = thread;
      this._lastThreadChangeTimestamp = Date.now();
      // console.log('sending out thread arp');
      ipcRenderer.send('arp', {
        threadId: thread.id,
        arpType: 'thread',
        windowLevel: this._getCurrentWindowLevel(),
      });
    }
  };

  _onFocusChanged(change) {
    // console.log('onFocus change');
    if (!change.impactsCollection('thread')) return;

    //DC-400 Because the way list mode is
    if (WorkspaceStore.layoutMode() === 'list') {
      this._onApplyFocusChange();
      return;
    }

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
    if (!focused) {
      this._lastMarkedAsReadThreadId = null;
    }

    // if we already match the desired state, no need to trigger
    if (this.threadId() === (focused || {}).id) return;
    this._setStoreDefaults();
    this._updateThread(focused);
    // this._thread = focused;
    // this._items = [];
    this._itemsLoading = true;
    // this._showingHiddenItems = false;
    // this._itemsExpanded = {};
    this.trigger();

    this._setWindowTitle();

    this._fetchFromCache();
  }

  setWindowTitle(title) {
    if (AppEnv.isComposerWindow()) {
      if (title.length > 0) {
        title = `Draft to: ${title.trim()}`;
      } else {
        title = 'New Draft';
      }
    } else {
      title = title.trim();
    }
    electron.remote.getCurrentWindow().setTitle(title);
    // AppEnv.setWindowDisplayTitle(title);
  }

  _setWindowTitle() {
    let title = '';
    if (AppEnv.isComposerWindow()) {
      title = 'New Message';
    } else if (AppEnv.isThreadWindow()) {
      title = 'Thread' + (this._thread ? ' · ' + this._thread.subject : '');
    } else {
      title = 'EdisonMail' + (this._thread ? ' · ' + this._thread.subject : '');
    }
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
            unread: false,
          }),
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
    this._fetchMissingBodies([item]);
  }

  _collapseItem(item) {
    delete this._itemsExpanded[item.id];
  }

  _fetchFromCache(options) {
    if (options == null) options = {};
    if (!this._thread) return;

    const loadedThreadId = this._thread.id;
    const query = this.findAllByThreadIdWithBody({ threadId: loadedThreadId });
    // const query = DatabaseStore.findAll(Message);
    // query.where({ threadId: loadedThreadId, state: 0 });
    // query.include(Message.attributes.body);

    return query.then(items => {
      // Check to make sure that our thread is still the thread we were
      // loading items for. Necessary because this takes a while.
      if (loadedThreadId !== this.threadId()) return;

      this._items = items.filter(m => !m.isHidden()).filter(this.filterOutDuplicateDraftHeaderMessage);
      this._items = this._sortItemsForDisplay(this._items);

      this._expandItemsToDefault();
      this._fetchMissingBodies(this._items);
      this._fetchMissingAttachments(this._items);

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
    const missing = items.filter(i => {
      return (
        (i.body === null || (typeof i.body === 'string' && i.body.length === 0))
      );
    });
    if (missing.length > 0) {
      return Actions.fetchBodies({ messages: missing, source: 'message' });
    }
  }

  fetchMissingAttachmentsByFileIds({ fileIds = [] } = {}) {
    if (
      fileIds.every(id => {
        return this._missingAttachmentIds.includes(id);
      })
    ) {
      Actions.fetchAttachments({ accountId: this._items[0].accountId, missingItems: fileIds });
    }
  }

  fetchMissingAttachmentsByMessage({ messageId } = {}) {
    const missing = [];
    const noLongerMissing = [];
    let change = this._missingAttachmentIds.length === 0;
    let processed = 0;
    for (let i = 0; i < this._items.length; i++) {
      if (this._items[i].id === messageId) {
        let total = this._items[i].files.length * 2;
        this._items[i].files.forEach((f, fileIndex) => {
          const tmpPath = AttachmentStore.pathForFile(f);
          fs.access(tmpPath, fs.constants.R_OK, (err) => {
            if (err) {
              missing.push(f.id);
              if (!this.isAttachmentMissing(f.id)) {
                this._missingAttachmentIds.push(f.id);
                change = true;
              }
              processed++;
              fs.access(`${tmpPath}.part`, fs.constants.R_OK, (err) => {
                if (err) {
                  change = true;
                }
                this._items[i].files[fileIndex].isDownloading = !!err;
                processed++;
                if (processed === total) {
                  if (missing.length > 0) {
                    Actions.fetchAttachments({ accountId: this._items[i].accountId, missingItems: missing });
                  }
                  if (change) {
                    this._missingAttachmentIds = this._missingAttachmentIds.filter(id => {
                      return !noLongerMissing.includes(id);
                    });
                    this.trigger();
                  }
                }
              });
            } else {
              if (this.isAttachmentMissing(f.id)) {
                noLongerMissing.push(f.id);
                change = true;
              }
              processed += 2;
            }
            if (processed === total) {
              if (missing.length > 0) {
                Actions.fetchAttachments({ accountId: this._items[i].accountId, missingItems: missing });
              }
              if (change) {
                this._missingAttachmentIds = this._missingAttachmentIds.filter(id => {
                  return !noLongerMissing.includes(id);
                });
                this.trigger();
              }
            }
          });
        });
        return;
      }
    }
  }


  _fetchMissingAttachments(items) {
    const inLineMissing = [];
    const normalMissing = [];
    let change = this._missingAttachmentIds.length === 0;
    let total = 0;
    let processed = 0;
    items.forEach(i => {
      total += i.files.length;
    });
    total = total * 2;
    items.forEach((i, itemIndex) => {
      i.files.forEach((f, fileIndex) => {
        const tmpPath = AttachmentStore.pathForFile(f);
        fs.access(tmpPath, fs.constants.R_OK, (err) => {
          if (err) {
            if (f.isInline) {
              inLineMissing.push(f.id);
            } else {
              normalMissing.push(f.id);
            }
            if (!this.isAttachmentMissing(f.id)) {
              change = true;
            }
            processed++;
            fs.access(`${tmpPath}.part`, fs.constants.R_OK, (err) => {
              items[itemIndex].files[fileIndex].isDownloading = !err;
              processed++;
              if (processed === total) {
                if (change) {
                  if (inLineMissing.length > 0) {
                    Actions.fetchAttachments({
                      accountId: i.accountId,
                      missingItems: inLineMissing,
                    });
                  } else if (normalMissing.length > 0) {
                    Actions.fetchAttachments({
                      accountId: i.accountId,
                      missingItems: normalMissing,
                    });
                  }
                  this._missingAttachmentIds = [...inLineMissing, ...normalMissing];
                  this.trigger();
                }
              }
            });
          } else {
            if (this.isAttachmentMissing(f.id)) {
              change = true;
            }
            processed += 2;
          }
          if (processed === total) {
            if (change) {
              if (inLineMissing.length > 0) {
                Actions.fetchAttachments({ accountId: i.accountId, missingItems: inLineMissing });
              }
              this._missingAttachmentIds = [...inLineMissing, ...normalMissing];
              this.trigger();
            }
          }
        });
      });
    });
  }

  getMissingFileIds() {
    return this._missingAttachmentIds.slice();
  }

  isMessageMissingAttachment(message) {
    return message.files.some(f => {
      return this.isAttachmentMissing(f.id);
    });
  }

  isAttachmentMissing(fileId) {
    return this._missingAttachmentIds.includes(fileId);
  }

  _isMissingBody(item) {
    return item.body === null || (typeof item.body === 'string' && item.body.length === 0);
  }

  _fetchExpandedAttachments(items) {
    for (let item of items) {
      if (!this._itemsExpanded[item.id]) continue;
      item.files.map(file => Actions.fetchFile(file));
    }
  }

  // Expand all unread messages, drafts that have body, and the last message
  _expandItemsToDefault() {
    const visibleItems = this.items();
    let lastDraftIdx = -1;

    visibleItems.forEach((item, idx) => {
      if (item.draft && item.body) {
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

  _isDraftDuplicateHeaderMessageId(item) {
    if (!item.draft) {
      return false;
    }
    let count = 0;
    for (let i of this._items) {
      if (i.headerMessageId === item.headerMessageId) {
        count++;
      }
      if (count > 1) {
        return true;
      }
    }
    return false;
  }

  filterOutDuplicateDraftHeaderMessage(value, index, array) {
    return array.findIndex((el) => {
      return el.headerMessageId == value.headerMessageId;
    }) === index || !value.draft;
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

  _setPopout(val) {
    if (val !== this._popedOut) {
      this._popedOut = val;
      this.trigger();
    }
  }

  _onPopoutThread(thread) {
    this._setPopout(true);
    return AppEnv.newWindow({
      title: false, // MessageList already displays the thread subject
      hidden: false,
      additionalChannelParam: 'thread',
      windowKey: `thread-${thread.id}`,
      windowType: 'thread-popout',
      threadId: thread.id,
      accountId: thread.accountId,
      windowLevel: this._currentWindowLevel,
      windowProps: {
        threadId: thread.id,
        perspectiveJSON: FocusedPerspectiveStore.current().toJSON(),
      },
    });
  }

  _onFocusThreadMainWindow(thread) {
    if (AppEnv.isMainWindow()) {
      Actions.setFocus({ collection: 'thread', item: thread });
      this._setPopout(false);
      return AppEnv.focus();
    } else {
      this._onWindowClose();
    }
  }
}

const store = new MessageStore();
store.FolderNamesHiddenByDefault = FolderNamesHiddenByDefault;
export default store;
