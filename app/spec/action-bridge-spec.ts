import Actions from '../src/flux/actions';
import Message from '../src/flux/models/message';
import ActionBridge from '../src/flux/action-bridge';

const ipc = {
  on() {},
  send() {},
};

describe('ActionBridge', function() {
  describe('in the main window', function() {
    beforeEach(function() {
      spyOn(AppEnv, 'getWindowType').andReturn('default');
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
      this.bridge = new ActionBridge(ipc);
    });

    it('should have the role Role.MAIN', function() {
      expect(this.bridge.role).toBe(ActionBridge.Role.MAIN);
    });

    it('should rebroadcast global actions', function() {
      spyOn(this.bridge, 'onRebroadcast');
      const testAction = Actions[Actions.globalActions[0]];
      testAction('bla');
      expect(this.bridge.onRebroadcast).toHaveBeenCalled();
    });

    it('should not rebroadcast mainWindow actions since it is the main window', function() {
      spyOn(this.bridge, 'onRebroadcast');
      const testAction = Actions.queueTask;
      testAction('bla');
      expect(this.bridge.onRebroadcast).not.toHaveBeenCalled();
    });

    it('should not rebroadcast window actions', function() {
      spyOn(this.bridge, 'onRebroadcast');
      const testAction = Actions[Actions.windowActions[0]];
      testAction('bla');
      expect(this.bridge.onRebroadcast).not.toHaveBeenCalled();
    });
  });

  describe('in another window', function() {
    beforeEach(function() {
      spyOn(AppEnv, 'getWindowType').andReturn('popout');
      spyOn(AppEnv, 'isMainWindow').andReturn(false);
      this.bridge = new ActionBridge(ipc);
      this.message = new Message({
        id: 'test-id',
        accountId: TEST_ACCOUNT_ID,
      });
    });

    it('should have the role Role.SECONDARY', function() {
      expect(this.bridge.role).toBe(ActionBridge.Role.SECONDARY);
    });

    it('should rebroadcast global actions', function() {
      spyOn(this.bridge, 'onRebroadcast');
      const testAction = Actions[Actions.globalActions[0]];
      testAction('bla');
      expect(this.bridge.onRebroadcast).toHaveBeenCalled();
    });

    it('should rebroadcast mainWindow actions', function() {
      spyOn(this.bridge, 'onRebroadcast');
      const testAction = Actions.queueTask;
      testAction('bla');
      expect(this.bridge.onRebroadcast).toHaveBeenCalled();
    });

    it('should not rebroadcast window actions', function() {
      spyOn(this.bridge, 'onRebroadcast');
      const testAction = Actions[Actions.windowActions[0]];
      testAction('bla');
      expect(this.bridge.onRebroadcast).not.toHaveBeenCalled();
    });
  });

  describe('onRebroadcast', function() {
    beforeEach(function() {
      spyOn(AppEnv, 'getWindowType').andReturn('popout');
      spyOn(AppEnv, 'isMainWindow').andReturn(false);
      this.bridge = new ActionBridge(ipc);
    });

    describe('when called with TargetWindows.ALL', () =>
      it('should broadcast the action over IPC to all windows', function() {
        spyOn(ipc, 'send');
        Actions.openPreferences.firing = false;
        this.bridge.onRebroadcast(ActionBridge.TargetWindows.ALL, 'openPreferences', [
          { oldModel: '1', newModel: 2 },
        ]);
        expect(ipc.send).toHaveBeenCalledWith(
          'action-bridge-rebroadcast-to-all',
          'popout',
          'openPreferences',
          '[{"oldModel":"1","newModel":2}]'
        );
      }));

    describe('when called with TargetWindows.MAIN', () =>
      it('should broadcast the action over IPC to the main window only', function() {
        spyOn(ipc, 'send');
        Actions.openPreferences.firing = false;
        this.bridge.onRebroadcast(ActionBridge.TargetWindows.MAIN, 'openPreferences', [
          { oldModel: '1', newModel: 2 },
        ]);
        expect(ipc.send).toHaveBeenCalledWith(
          'action-bridge-rebroadcast-to-default',
          'popout',
          'openPreferences',
          '[{"oldModel":"1","newModel":2}]'
        );
      }));

    it('should not do anything if the current invocation of the Action was triggered by itself', function() {
      spyOn(ipc, 'send');
      Actions.openPreferences.firing = true;
      this.bridge.onRebroadcast(ActionBridge.TargetWindows.ALL, 'openPreferences', [
        { oldModel: '1', newModel: 2 },
      ]);
      expect(ipc.send).not.toHaveBeenCalled();
    });
  });
});
