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
    // whose All Mail, Spam and Trash are folders. ac-3 is Gmail with [Gmail]/Trash and
    // [Gmail]/Spam hidden from IMAP, where the engine gives the roles to labels by name.
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
      'ac-3': {
        all: new Folder({ id: 'h-all', accountId: 'ac-3', role: 'all' } as any),
        inbox: new Label({ id: 'h-inbox', accountId: 'ac-3', role: 'inbox' } as any),
        spam: new Label({ id: 'h-junk', accountId: 'ac-3', role: 'spam' } as any),
        trash: new Label({ id: 'h-trash', accountId: 'ac-3', role: 'trash' } as any),
      },
    };
    this.threads = [
      new Thread({ id: 't1', accountId: 'ac-1' }),
      new Thread({ id: 't2', accountId: 'ac-2' }),
      new Thread({
        id: 't3',
        accountId: 'ac-3',
        labels: [this.categories['ac-3'].inbox],
      } as any),
      new Thread({ id: 't4', accountId: 'ac-3', labels: [] } as any),
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
        threads: this.threads.slice(0, 2),
        source: 'Toolbar Button: Thread List',
      });
      expect(tasks.map((t) => t.folder.id)).toEqual(['f-trash', 'g-trash']);
      expect(tasks.map((t) => t.sourceFolderIds)).toEqual([[], []]);
    });

    it('labels the threads Trash when the trash role belongs to a Gmail label', () => {
      const tasks = TaskFactory.tasksForMovingToTrash({
        threads: this.threads.slice(2),
        source: 'Toolbar Button: Thread List',
      });
      expect(tasks.every((t) => t instanceof ChangeLabelsTask)).toBe(true);
      expect(tasks.map((t) => t.labelsToAdd.map((l) => l.id))).toEqual([['h-trash'], ['h-trash']]);
      expect(tasks.map((t) => t.threadIds)).toEqual([['t3'], ['t4']]);
      expect(tasks.map((t) => t.labelsToRemove.map((l) => l.id))).toEqual([['h-inbox'], []]);
      expect(tasks.map((t) => t.description())).toEqual(['Trashed 2 threads', 'Trashed 2 threads']);
    });

    it('does not put threads outside the Inbox into it on undo', () => {
      const [task] = TaskFactory.tasksForMovingToTrash({
        threads: [this.threads[3]],
        source: 'Toolbar Button: Thread List',
      });
      const undo = task.createUndoTask() as ChangeLabelsTask;
      expect(undo.labelsToAdd).toEqual([]);
      expect(undo.labelsToRemove.map((l) => l.id)).toEqual(['h-trash']);
    });
  });

  describe('tasksForMarkingAsSpam', () => {
    it('moves to the Spam folder when there is one', () => {
      const tasks = TaskFactory.tasksForMarkingAsSpam({
        threads: this.threads.slice(0, 2),
        source: 'Toolbar Button: Thread List',
      });
      expect(tasks.map((t) => t.folder.id)).toEqual(['f-spam', 'g-spam']);
    });

    it('labels the threads Spam when the spam role belongs to a Gmail label', () => {
      const [task] = TaskFactory.tasksForMarkingAsSpam({
        threads: [this.threads[2]],
        source: 'Toolbar Button: Thread List',
      });
      expect(task instanceof ChangeLabelsTask).toBe(true);
      expect(task.labelsToAdd.map((l) => l.id)).toEqual(['h-junk']);
      expect(task.labelsToRemove.map((l) => l.id)).toEqual(['h-inbox']);
    });
  });
});
