import { Thread } from '../../src/flux/models/thread';
import WorkspaceStore from '../../src/flux/stores/workspace-store';

describe('WorkspaceStore', function () {
  describe('the thread sidebar in the split layouts', function () {
    const thread = new Thread({ id: '123', accountId: TEST_ACCOUNT_ID });
    const store = WorkspaceStore as any;

    beforeEach(function () {
      spyOn(store, 'layoutMode').andReturn('split');
      spyOn(store, 'trigger');
      spyOn(AppEnv.config, 'set');
      store._hiddenLocations = {};
      store._threadFocused = false;
    });

    afterEach(function () {
      store._hiddenLocations = {};
      store._threadFocused = false;
    });

    it('stays closed once the user closes it, as threads open and close', function () {
      const sidebar = store.defineLocation('MessageListSidebar');
      store._onSetFocus({ collection: 'thread', item: thread });
      store._onToggleLocationHidden(sidebar);

      store._onSetFocus({ collection: 'thread', item: null });
      store._onSetFocus({ collection: 'thread', item: thread });

      expect(store.isLocationHidden(sidebar)).toBe(true);
      expect((AppEnv.config.set as jasmine.Spy).callCount).toBe(1);
      expect(AppEnv.config.set).toHaveBeenCalledWith('core.workspace.hiddenLocations', {
        [sidebar.id]: sidebar,
      });
    });
  });
});
