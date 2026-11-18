import { DatabaseStore, WorkspaceStore } from 'mailspring-exports';
import * as ContactsPlugin from '../lib/main';
import { Store } from '../lib/Store';

describe('Contacts store start', function () {
  let findAll: jasmine.Spy;

  beforeEach(function () {
    spyOn(window, 'requestAnimationFrame').andCallFake((callback) => {
      callback(0);
      return 0;
    });
    findAll = spyOn(DatabaseStore, 'findAll').andCallThrough();
  });

  it('queries nothing when the store is created', function () {
    new (Store.constructor as any)();
    advanceClock(1000);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('subscribes once, however often it is started', function () {
    const store = new (Store.constructor as any)();
    store.start();
    const queries = findAll.calls.length;
    expect(queries).toBeGreaterThan(0);

    store.start();
    expect(findAll.calls.length).toBe(queries);
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
