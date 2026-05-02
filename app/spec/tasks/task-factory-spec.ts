import {
  TaskFactory,
  AccountStore,
  CategoryStore,
  Label,
  Thread,
  ChangeFolderTask,
  ChangeLabelsTask,
} from 'mailspring-exports';

describe('TaskFactory', function taskFactory() {
  beforeEach(() => {
    this.categories = {
      'ac-1': {
        archive: new Label({ name: 'archive' } as any),
        inbox: new Label({ name: 'inbox1' } as any),
        trash: new Label({ name: 'trash1' } as any),
      },
      'ac-2': {
        archive: new Label({ name: 'all' } as any),
        inbox: new Label({ name: 'inbox2' } as any),
        trash: new Label({ name: 'trash2' } as any),
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
    spyOn(AccountStore, 'accountForId').andCallFake((accId) => {
      return this.accounts[accId];
    });
  });

  describe('taskForInvertingUnread', () => {});

  describe('taskForInvertingStarred', () => {});
});
