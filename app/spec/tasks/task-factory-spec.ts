import {
  TaskFactory,
  CategoryStore,
  Folder,
  Label,
  Thread,
  ChangeFolderTask,
  ChangeLabelsTask,
} from 'mailspring-exports';

describe('TaskFactory', function taskFactory() {
  beforeEach(() => {
    // ac-1 is a folder-based IMAP account; ac-2 is Gmail, whose Inbox is a label and
    // whose All Mail, Spam and Trash are folders.
    this.categories = {
      'ac-1': {
        archive: new Folder({ id: 'f-archive', accountId: 'ac-1', role: 'archive' } as any),
        inbox: new Folder({ id: 'f-inbox', accountId: 'ac-1', role: 'inbox' } as any),
        spam: new Folder({ id: 'f-spam', accountId: 'ac-1', role: 'spam' } as any),
        trash: new Folder({ id: 'f-trash', accountId: 'ac-1', role: 'trash' } as any),
      },
      'ac-2': {
        archive: new Folder({ id: 'g-all', accountId: 'ac-2', role: 'all' } as any),
        all: new Folder({ id: 'g-all', accountId: 'ac-2', role: 'all' } as any),
        inbox: new Label({ id: 'g-inbox', accountId: 'ac-2', role: 'inbox' } as any),
        spam: new Folder({ id: 'g-spam', accountId: 'ac-2', role: 'spam' } as any),
        trash: new Folder({ id: 'g-trash', accountId: 'ac-2', role: 'trash' } as any),
      },
    };
    this.threads = [
      new Thread({ id: 't1', accountId: 'ac-1' }),
      new Thread({ id: 't2', accountId: 'ac-2' }),
    ];

    const byRole = (role) => (accountId) => this.categories[accountId][role];
    spyOn(CategoryStore, 'getArchiveCategory').andCallFake(byRole('archive'));
    spyOn(CategoryStore, 'getAllMailCategory').andCallFake(byRole('all'));
    spyOn(CategoryStore, 'getInboxCategory').andCallFake(byRole('inbox'));
    spyOn(CategoryStore, 'getSpamCategory').andCallFake(byRole('spam'));
    spyOn(CategoryStore, 'getTrashCategory').andCallFake(byRole('trash'));
  });

  describe('tasksForArchiving', () => {
    const perspectiveShowing = (folderIdsByAccount) => ({
      sourceFolderIdsForAccount: (accountId) => folderIdsByAccount[accountId] || [],
    });

    it('scopes a folder move to the folder the perspective shows for that account', () => {
      const perspective = perspectiveShowing({ 'ac-1': ['f-sent'] });
      const [folderTask] = TaskFactory.tasksForArchiving({
        threads: [this.threads[0]],
        source: 'Toolbar Button: Thread List',
        perspective,
      });
      expect(folderTask instanceof ChangeFolderTask).toBe(true);
      expect(folderTask.folder.id).toBe('f-archive');
      expect(folderTask.sourceFolderIds).toEqual(['f-sent']);
    });

    it('leaves the choice of copies to the engine when there is no perspective', () => {
      const [folderTask] = TaskFactory.tasksForArchiving({
        threads: [this.threads[0]],
        source: 'MCP',
      });
      expect(folderTask.sourceFolderIds).toEqual([]);
    });

    it('archives Gmail by removing the Inbox label, whatever the perspective', () => {
      const perspective = perspectiveShowing({ 'ac-1': ['f-inbox'], 'ac-2': ['g-spam'] });
      const [folderTask, labelTask] = TaskFactory.tasksForArchiving({
        threads: this.threads,
        source: 'Toolbar Button: Thread List',
        perspective,
      });
      expect(folderTask.sourceFolderIds).toEqual(['f-inbox']);
      expect(labelTask instanceof ChangeLabelsTask).toBe(true);
      expect(labelTask.labelsToRemove.map((l) => l.id)).toEqual(['g-inbox']);
      expect(labelTask.labelsToAdd).toEqual([]);
    });
  });

  describe('tasksForMarkingNotSpam', () => {
    it('moves only the Spam copies back to the Inbox', () => {
      const [task] = TaskFactory.tasksForMarkingNotSpam({
        threads: [this.threads[0]],
        source: 'Toolbar Button: Thread List',
      });
      expect(task.folder.id).toBe('f-inbox');
      expect(task.sourceFolderIds).toEqual(['f-spam']);
    });

    it('moves Gmail Spam copies to All Mail', () => {
      const [task] = TaskFactory.tasksForMarkingNotSpam({
        threads: [this.threads[1]],
        source: 'Toolbar Button: Thread List',
      });
      expect(task.folder.id).toBe('g-all');
      expect(task.sourceFolderIds).toEqual(['g-spam']);
    });
  });

  describe('tasksForMovingToTrash', () => {
    it('does not scope, since the engine moves every copy to Trash', () => {
      const tasks = TaskFactory.tasksForMovingToTrash({
        threads: this.threads,
        source: 'Toolbar Button: Thread List',
      });
      expect(tasks.map((t) => t.folder.id)).toEqual(['f-trash', 'g-trash']);
      expect(tasks.map((t) => t.sourceFolderIds)).toEqual([[], []]);
    });
  });
});
