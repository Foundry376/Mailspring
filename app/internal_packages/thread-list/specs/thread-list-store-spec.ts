import {
  Actions,
  Thread,
  QueryResultSet,
  WorkspaceStore,
  FocusedContentStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';
import ThreadListStore from '../lib/thread-list-store';

const thread = (id: string, unread = false) =>
  new Thread({ id, accountId: TEST_ACCOUNT_ID, unread });

// The thread list's result sets, reduced to the three calls the store makes on them.
const resultSet = (threads: Thread[]) =>
  ({
    query: (): null => null,
    count: () => threads.length,
    offsetOfId: (id: string) => threads.findIndex((t) => t.id === id),
    modelAtOffset: (offset: number) => threads[offset],
  }) as unknown as QueryResultSet<Thread>;

describe('ThreadListStore', function () {
  describe('when the open thread leaves the list', function () {
    beforeEach(function () {
      this.newer = thread('newer');
      this.open = thread('open');
      this.older = thread('older');

      spyOn(Actions, 'setFocus');
      spyOn(Actions, 'setCursorPosition');
      spyOn(FocusedPerspectiveStore, 'isShowingMail').andReturn(true);
      spyOn(WorkspaceStore, 'layoutMode').andReturn('split');
      spyOn(FocusedContentStore, 'focused').andReturn(this.open);
      spyOn(FocusedContentStore, 'keyboardCursor').andReturn(null);

      this.remove = () =>
        ThreadListStore._onDataChanged({
          previous: resultSet([this.newer, this.open, this.older]),
          next: resultSet([this.newer, this.older]),
        });
    });

    it('opens the thread below and says the app chose it', function () {
      this.remove();
      expect(Actions.setFocus).toHaveBeenCalledWith({
        collection: 'thread',
        item: this.older,
        automatic: true,
      });
    });

    it('opens the thread above instead when that one is unread', function () {
      this.newer.unread = true;
      this.remove();
      expect(Actions.setFocus).toHaveBeenCalledWith({
        collection: 'thread',
        item: this.newer,
        automatic: true,
      });
    });
  });
});
