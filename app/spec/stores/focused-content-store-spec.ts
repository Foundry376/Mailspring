import Thread from '../../src/flux/models/thread';
import FocusedContentStore from '../../src/flux/stores/focused-content-store';

const testThread = new Thread({ id: '123', accountId: TEST_ACCOUNT_ID });

describe('FocusedContentStore', function() {
  describe('onSetFocus', function() {
    it('should not trigger if the thread is already focused', function() {
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      spyOn(FocusedContentStore, 'triggerAfterAnimationFrame');
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      expect(FocusedContentStore.triggerAfterAnimationFrame).not.toHaveBeenCalled();
    });

    it('should not trigger if the focus is already null', function() {
      FocusedContentStore._onFocus({ collection: 'thread', item: null });
      spyOn(FocusedContentStore, 'triggerAfterAnimationFrame');
      FocusedContentStore._onFocus({ collection: 'thread', item: null });
      expect(FocusedContentStore.triggerAfterAnimationFrame).not.toHaveBeenCalled();
    });

    it('should trigger otherwise', function() {
      FocusedContentStore._onFocus({ collection: 'thread', item: null });
      spyOn(FocusedContentStore, 'triggerAfterAnimationFrame');
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      expect(FocusedContentStore.triggerAfterAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('threadId', () =>
    it('should return the id of the focused thread', function() {
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      expect(FocusedContentStore.focusedId('thread')).toBe(testThread.id);
    }));

  describe('thread', () =>
    it('should return the focused thread object', function() {
      FocusedContentStore._onFocus({ collection: 'thread', item: testThread });
      expect(FocusedContentStore.focused('thread')).toBe(testThread);
    }));
});
