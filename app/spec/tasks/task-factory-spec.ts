import {
  TaskFactory,
  AccountStore,
  CategoryStore,
  Label,
  Folder,
  Thread,
  ChangeFolderTask,
  ChangeLabelsTask,
} from 'mailspring-exports';

describe('TaskFactory', function taskFactory() {
  beforeEach(() => {
    this.categories = {
      'ac-1': {
        archive: new Folder({ name: 'archive', role: 'archive' } as any),
        inbox: new Folder({ name: 'inbox1', role: 'inbox' } as any),
        trash: new Folder({ name: 'trash1', role: 'trash' } as any),
        spam: new Folder({ name: 'spam1', role: 'spam' } as any),
      },
      'ac-2': {
        archive: new Label({ name: 'all', role: 'all' } as any),
        inbox: new Label({ name: 'inbox2', role: 'inbox' } as any),
        trash: new Label({ name: 'trash2', role: 'trash' } as any),
        spam: new Label({ name: 'spam2', role: 'spam' } as any),
      },
    };
    this.accounts = {
      'ac-1': {
        id: 'ac-1',
        usesFolders: () => true,
        preferredRemovalDestination: () => this.categories['ac-1'].archive,
      },
      'ac-2': {
        id: 'ac-2',
        usesFolders: () => false,
        preferredRemovalDestination: () => this.categories['ac-2'].trash,
      },
    };
    this.threads = [new Thread({ accountId: 'ac-1' }), new Thread({ accountId: 'ac-2' })];

    spyOn(CategoryStore, 'getArchiveCategory').andCallFake((acc) => {
      return this.categories[acc.id].archive;
    });
    spyOn(CategoryStore, 'getInboxCategory').andCallFake((acc) => {
      return this.categories[acc.id].inbox;
    });
    spyOn(CategoryStore, 'getTrashCategory').andCallFake((acc) => {
      return this.categories[acc.id].trash;
    });
    spyOn(CategoryStore, 'getSpamCategory').andCallFake((acc) => {
      return this.categories[acc.id].spam;
    });
    spyOn(AccountStore, 'accountForId').andCallFake((accId) => {
      return this.accounts[accId];
    });
  });

  describe('taskForInvertingUnread', () => {});

  describe('taskForInvertingStarred', () => {});

  describe('tasksForMovingToTrash', () => {
    it('creates a ChangeFolderTask for accounts whose trash category is a Folder', () => {
      const tasks = TaskFactory.tasksForMovingToTrash({
        threads: [this.threads[0]],
        source: 'Test',
      });
      expect(tasks.length).toBe(1);
      expect(tasks[0] instanceof ChangeFolderTask).toBe(true);
      expect((tasks[0] as any).folder).toBe(this.categories['ac-1'].trash);
    });

    it('creates a ChangeLabelsTask for accounts whose trash category is a Label', () => {
      const tasks = TaskFactory.tasksForMovingToTrash({
        threads: [this.threads[1]],
        source: 'Test',
      });
      expect(tasks.length).toBe(1);
      expect(tasks[0] instanceof ChangeLabelsTask).toBe(true);
      expect((tasks[0] as any).labelsToAdd).toEqual([this.categories['ac-2'].trash]);
      expect((tasks[0] as any).labelsToRemove).toEqual([this.categories['ac-2'].inbox]);
    });
  });

  describe('tasksForMarkingAsSpam', () => {
    it('creates a ChangeFolderTask for accounts whose spam category is a Folder', () => {
      const tasks = TaskFactory.tasksForMarkingAsSpam({
        threads: [this.threads[0]],
        source: 'Test',
      });
      expect(tasks.length).toBe(1);
      expect(tasks[0] instanceof ChangeFolderTask).toBe(true);
      expect((tasks[0] as any).folder).toBe(this.categories['ac-1'].spam);
    });

    it('creates a ChangeLabelsTask for accounts whose spam category is a Label', () => {
      const tasks = TaskFactory.tasksForMarkingAsSpam({
        threads: [this.threads[1]],
        source: 'Test',
      });
      expect(tasks.length).toBe(1);
      expect(tasks[0] instanceof ChangeLabelsTask).toBe(true);
      expect((tasks[0] as any).labelsToAdd).toEqual([this.categories['ac-2'].spam]);
      expect((tasks[0] as any).labelsToRemove).toEqual([this.categories['ac-2'].inbox]);
    });
  });
});
