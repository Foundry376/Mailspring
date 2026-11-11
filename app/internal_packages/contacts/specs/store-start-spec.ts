import { DatabaseStore, WorkspaceStore } from 'mailspring-exports';
import * as ContactsPlugin from '../lib/main';
import { Store } from '../lib/Store';

describe('Contacts store start', function () {
  it('queries nothing when the store is created', function () {
    spyOn(DatabaseStore, 'findAll').andCallThrough();
    const store = new (Store.constructor as any)();
    expect(DatabaseStore.findAll).not.toHaveBeenCalled();

    store.start();
    expect(DatabaseStore.findAll).toHaveBeenCalled();
  });

  describe('in the main window', function () {
    let root: { id: string; supportedModes: string[] };

    beforeEach(function () {
      root = { id: 'Threads', supportedModes: ['list'] };
      spyOn(WorkspaceStore, 'rootSheet').andCallFake(() => root);
      spyOn(Store, 'start');
      ContactsPlugin.activate();
    });

    afterEach(function () {
      ContactsPlugin.deactivate();
    });

    it('starts the store when Contacts becomes the root sheet, not at activation', function () {
      WorkspaceStore.trigger();
      expect(Store.start).not.toHaveBeenCalled();

      root = WorkspaceStore.Sheet.Contacts;
      WorkspaceStore.trigger();
      expect(Store.start).toHaveBeenCalled();
    });
  });
});
