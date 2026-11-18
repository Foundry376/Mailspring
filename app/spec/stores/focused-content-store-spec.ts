import { Thread } from '../../src/flux/models/thread';
import { Contact } from '../../src/flux/models/contact';
import FocusedContentStore from '../../src/flux/stores/focused-content-store';
import FocusedPerspectiveStore from '../../src/flux/stores/focused-perspective-store';
import WorkspaceStore from '../../src/flux/stores/workspace-store';

const testThread = new Thread({ id: '123', accountId: TEST_ACCOUNT_ID });

describe('FocusedContentStore', function () {
  describe('onSetFocus', function () {
    it('should not trigger if the thread is already focused', function () {
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      spyOn(FocusedContentStore, 'triggerAfterAnimationFrame');
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      expect(FocusedContentStore.triggerAfterAnimationFrame).not.toHaveBeenCalled();
    });

    it('should not trigger if the focus is already null', function () {
      FocusedContentStore._onFocus({ collection: 'thread', item: null });
      spyOn(FocusedContentStore, 'triggerAfterAnimationFrame');
      FocusedContentStore._onFocus({ collection: 'thread', item: null });
      expect(FocusedContentStore.triggerAfterAnimationFrame).not.toHaveBeenCalled();
    });

    it('should trigger otherwise', function () {
      FocusedContentStore._onFocus({ collection: 'thread', item: null });
      spyOn(FocusedContentStore, 'triggerAfterAnimationFrame');
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      expect(FocusedContentStore.triggerAfterAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('threadId', () =>
    it('should return the id of the focused thread', function () {
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      expect(FocusedContentStore.focusedId('thread')).toBe(testThread.id);
    }));

  describe('thread', () =>
    it('should return the focused thread object', function () {
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      expect(FocusedContentStore.focused('thread')).toBe(testThread);
    }));

  describe('when the layout changes from list to split', function () {
    const testContact = new Contact({ id: 'c1', accountId: TEST_ACCOUNT_ID, email: 'a@b.com' });
    let layout: string;
    let showingMail: boolean;

    beforeEach(function () {
      layout = 'list';
      spyOn(WorkspaceStore, 'layoutMode').andCallFake(() => layout);
      spyOn(FocusedPerspectiveStore, 'isShowingMail').andCallFake(() => showingMail);
      FocusedContentStore._resetInstanceVars();
      FocusedContentStore._onFocusKeyboard({ collection: 'thread', item: testThread });
      FocusedContentStore._onFocusKeyboard({ collection: 'contact', item: testContact });
      layout = 'split';
    });

    afterEach(function () {
      layout = 'list';
      FocusedContentStore._resetInstanceVars();
    });

    it('leaves the thread under the cursor unopened when another section takes over', function () {
      showingMail = false;
      FocusedContentStore._onWorkspaceChange();
      expect(FocusedContentStore.focused('thread')).toBeUndefined();
      expect(FocusedContentStore.keyboardCursor('thread')).toBe(testThread);
      expect(FocusedContentStore.focused('contact')).toBe(testContact);
    });

    it('opens the thread under the cursor when Mail turns on the reading pane', function () {
      showingMail = true;
      FocusedContentStore._onWorkspaceChange();
      expect(FocusedContentStore.focused('thread')).toBe(testThread);
    });
  });
});
