import { Thread } from '../../src/flux/models/thread';
import { Folder } from '../../src/flux/models/folder';
import { Label } from '../../src/flux/models/label';
import { Message } from '../../src/flux/models/message';
import FocusedContentStore from '../../src/flux/stores/focused-content-store';
import FocusedPerspectiveStore from '../../src/flux/stores/focused-perspective-store';
import { MessageStore } from '../../src/flux/stores/message-store';
import DatabaseStore from '../../src/flux/stores/database-store';
import { ChangeUnreadTask } from '../../src/flux/tasks/change-unread-task';
import CategoryStore from '../../src/flux/stores/category-store';
import * as Actions from '../../src/flux/actions';

const testThread = new Thread({ id: '123', accountId: TEST_ACCOUNT_ID });
const testMessage1 = new Message({
  folders: { 'all-id': 0 },
  id: 'a',
  body: '123',
  files: [],
  accountId: TEST_ACCOUNT_ID,
});
const testMessage2 = new Message({
  folders: { 'all-id': 0 },
  id: 'b',
  body: '123',
  files: [],
  accountId: TEST_ACCOUNT_ID,
});
const testMessage3 = new Message({
  folders: { 'all-id': 0 },
  id: 'c',
  body: '123',
  files: [],
  accountId: TEST_ACCOUNT_ID,
});

describe('MessageStore', function () {
  describe('when the receiving focus changes from the FocusedContentStore', function () {
    beforeEach(function () {
      if (MessageStore._onFocusChangedTimer) {
        clearTimeout(MessageStore._onFocusChangedTimer);
        MessageStore._onFocusChangedTimer = null;
      }
      spyOn(MessageStore, '_onApplyFocusChange');
    });

    afterEach(function () {
      if (MessageStore._onFocusChangedTimer) {
        clearTimeout(MessageStore._onFocusChangedTimer);
        MessageStore._onFocusChangedTimer = null;
      }
    });

    describe('if no change has happened in the last 100ms', () =>
      it('should apply immediately', function () {
        FocusedContentStore.trigger({
          impactsCollection(c) {
            return true;
          },
        });
        expect(MessageStore._onApplyFocusChange).toHaveBeenCalled();
      }));

    describe('if a change has happened in the last 100ms', function () {
      it('should not apply immediately', function () {
        const noop = () => {};
        MessageStore._onFocusChangedTimer = setTimeout(noop, 100);
        FocusedContentStore.trigger({
          impactsCollection(c) {
            return true;
          },
        });
        expect(MessageStore._onApplyFocusChange).not.toHaveBeenCalled();
      });

      it('should apply 100ms after the last focus change and reset', function () {
        FocusedContentStore.trigger({
          impactsCollection(c) {
            return true;
          },
        });
        expect((MessageStore._onApplyFocusChange as jasmine.Spy).callCount).toBe(1);
        advanceClock(50);
        FocusedContentStore.trigger({
          impactsCollection(c) {
            return true;
          },
        });
        expect((MessageStore._onApplyFocusChange as jasmine.Spy).callCount).toBe(1);
        advanceClock(50);
        FocusedContentStore.trigger({
          impactsCollection(c) {
            return true;
          },
        });
        expect((MessageStore._onApplyFocusChange as jasmine.Spy).callCount).toBe(1);
        advanceClock(150);
        FocusedContentStore.trigger({
          impactsCollection(c) {
            return true;
          },
        });
        expect((MessageStore._onApplyFocusChange as jasmine.Spy).callCount).toBe(3);
        advanceClock(150);
        FocusedContentStore.trigger({
          impactsCollection(c) {
            return true;
          },
        });
        expect((MessageStore._onApplyFocusChange as jasmine.Spy).callCount).toBe(5);
      });
    });
  });

  describe('items', function () {
    beforeEach(function () {
      const folders = {
        'trash-id': new Folder({ id: 'trash-id', role: 'trash', path: 'Trash' }),
        'all-id': new Folder({ id: 'all-id', role: 'all', path: 'All Mail' }),
        'spam-id': new Folder({ id: 'spam-id', role: 'spam', path: 'Spam' }),
        'inbox-id': new Folder({ id: 'inbox-id', role: 'inbox', path: 'INBOX' }),
        'sent-id': new Folder({ id: 'sent-id', role: 'sent', path: 'Sent' }),
      };
      spyOn(CategoryStore, 'byId').andCallFake((aid, id) => folders[id]);

      MessageStore._showingHiddenItems = false;
      MessageStore._items = [
        new Message({
          accountId: TEST_ACCOUNT_ID,
          folders: { 'trash-id': 0 },
          labels: [new Label({ path: 'bla' })],
        } as any),
        new Message({
          accountId: TEST_ACCOUNT_ID,
          folders: { 'all-id': 0 },
          labels: [new Label({ role: 'inbox' })],
        } as any),
        new Message({
          accountId: TEST_ACCOUNT_ID,
          folders: { 'spam-id': 0 },
          labels: [new Label({ path: 'bla' })],
        } as any),
        new Message({ accountId: TEST_ACCOUNT_ID, folders: { 'all-id': 0 }, labels: [] } as any),
        new Message({
          accountId: TEST_ACCOUNT_ID,
          folders: { 'all-id': 0 },
          labels: [],
          draft: true,
        } as any),
        // copies in both Inbox and Trash: visible in both views
        new Message({
          accountId: TEST_ACCOUNT_ID,
          folders: { 'inbox-id': 1, 'trash-id': 0 },
        } as any),
        // copies in Spam and Trash only: hidden outside those views
        new Message({
          accountId: TEST_ACCOUNT_ID,
          folders: { 'spam-id': 0, 'trash-id': 0 },
        } as any),
        // the engine reported a folder the client has not synced yet
        new Message({ accountId: TEST_ACCOUNT_ID, folders: { 'unknown-id': 0 } } as any),
        // in transit between folders (no live copy)
        new Message({ accountId: TEST_ACCOUNT_ID, folders: {} } as any),
      ];
    });

    describe('when showing hidden items', () =>
      it('should return the entire items array', function () {
        MessageStore._showingHiddenItems = true;
        expect(MessageStore.items().length).toBe(9);
      }));

    describe('when in trash or spam', () =>
      it('should show only the messages with a copy in trash or spam, and drafts', function () {
        spyOn(FocusedPerspectiveStore, 'current').andReturn({
          categoriesSharedRole: () => 'trash',
        });
        expect(MessageStore.items()).toEqual([
          MessageStore._items[0],
          MessageStore._items[2],
          MessageStore._items[4],
          MessageStore._items[5],
          MessageStore._items[6],
        ]);
      }));

    describe('when in another folder', () =>
      it('should hide only the messages whose every copy is in trash or spam', function () {
        spyOn(FocusedPerspectiveStore, 'current').andReturn({
          categoriesSharedRole: () => 'inbox',
        });
        expect(MessageStore.items()).toEqual([
          MessageStore._items[1],
          MessageStore._items[3],
          MessageStore._items[4],
          MessageStore._items[5],
          MessageStore._items[7],
          MessageStore._items[8],
        ]);
      }));
  });

  describe('when applying focus changes', function () {
    beforeEach(function () {
      (MessageStore as any)._lastLoadedThreadId = null;

      this.focus = null;
      spyOn(FocusedContentStore, 'focused').andCallFake((collection) => {
        if (collection === 'thread') {
          return this.focus;
        } else {
          return null;
        }
      });

      spyOn(FocusedContentStore, 'focusedId').andCallFake((collection) => {
        if (collection === 'thread') {
          return this.focus != null ? this.focus.id : undefined;
        } else {
          return null;
        }
      });

      spyOn(DatabaseStore, 'findAll').andCallFake(function () {
        return {
          include() {
            return this;
          },
          where() {
            return this;
          },
          then(callback) {
            return callback([testMessage1, testMessage2]);
          },
        };
      });
    });

    it('should retrieve the focused thread', function () {
      this.focus = testThread;
      MessageStore._thread = null;
      MessageStore._onApplyFocusChange();
      expect(DatabaseStore.findAll).toHaveBeenCalled();
      expect((DatabaseStore.findAll as jasmine.Spy).mostRecentCall.args[0]).toBe(Message);
    });

    describe('when the thread is already focused', () =>
      it('should do nothing', function () {
        this.focus = testThread;
        MessageStore._thread = this.focus;
        MessageStore._onApplyFocusChange();
        expect(DatabaseStore.findAll).not.toHaveBeenCalled();
      }));

    describe('when the thread is unread', function () {
      beforeEach(function () {
        this.focus = null;
        MessageStore._onApplyFocusChange();
        testThread.unread = true;
        spyOn(Actions, 'queueTask');
        spyOn(AppEnv.config, 'get').andCallFake((key) => {
          if (key === 'core.reading.markAsReadDelay') {
            return 600;
          }
        });
      });

      it('should queue a task to mark the thread as read', function () {
        this.focus = testThread;
        MessageStore._onApplyFocusChange();
        advanceClock(500);
        expect(Actions.queueTask).not.toHaveBeenCalled();
        advanceClock(500);
        expect(Actions.queueTask).toHaveBeenCalled();
        expect(
          (Actions.queueTask as unknown as jasmine.Spy).mostRecentCall.args[0] instanceof
            ChangeUnreadTask
        ).toBe(true);
      });

      it('should not queue a task to mark the thread as read if the thread is no longer selected 500msec later', function () {
        this.focus = testThread;
        MessageStore._onApplyFocusChange();
        advanceClock(500);
        expect(Actions.queueTask).not.toHaveBeenCalled();
        this.focus = null;
        MessageStore._onApplyFocusChange();
        advanceClock(500);
        expect(Actions.queueTask).not.toHaveBeenCalled();
      });

      it('should not re-mark the thread as read when made unread', function () {
        this.focus = testThread;
        testThread.unread = false;
        MessageStore._onApplyFocusChange();
        advanceClock(500);
        expect(Actions.queueTask).not.toHaveBeenCalled();

        // This simulates a DB change or some attribute changing on the
        // thread.
        testThread.unread = true;
        MessageStore._fetchFromCache();
        advanceClock(500);
        expect(Actions.queueTask).not.toHaveBeenCalled();
      });
    });
  });

  describe('when toggling expansion of all messages', function () {
    beforeEach(function () {
      MessageStore._items = [testMessage1, testMessage2, testMessage3];
      spyOn(MessageStore, '_fetchExpandedAttachments');
    });

    it('should expand all when at default state', function () {
      MessageStore._itemsExpanded = { c: 'default' };
      Actions.toggleAllMessagesExpanded();
      expect(MessageStore._itemsExpanded).toEqual({ a: 'explicit', b: 'explicit', c: 'explicit' });
    });

    it('should expand all when at least one item is collapsed', function () {
      MessageStore._itemsExpanded = { b: 'explicit', c: 'explicit' };
      Actions.toggleAllMessagesExpanded();
      expect(MessageStore._itemsExpanded).toEqual({ a: 'explicit', b: 'explicit', c: 'explicit' });
    });

    it('should collapse all except the latest message when all expanded', function () {
      MessageStore._itemsExpanded = { a: 'explicit', b: 'explicit', c: 'explicit' };
      Actions.toggleAllMessagesExpanded();
      expect(MessageStore._itemsExpanded).toEqual({ c: 'explicit' });
    });
  });
});
