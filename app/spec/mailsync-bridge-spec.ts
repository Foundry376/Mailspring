import { ipcRenderer } from 'electron';
import { Actions } from 'mailspring-exports';
import MailsyncBridge from '../src/flux/mailsync-bridge';

describe('MailsyncBridge', function () {
  describe('ProcessSearchResult deltas', function () {
    it('dispatch each result instead of inflating a model', function () {
      const bridge = new MailsyncBridge();
      const received = spyOn(Actions, 'remoteSearchResultReceived');
      spyOn(ipcRenderer, 'send');
      spyOn(AppEnv, 'reportError');
      const first = { id: 's1', accountId: 'a1', done: false, threadIds: ['t1'], errors: [] };
      const second = { id: 's2', accountId: 'a1', done: true, threadIds: [], errors: [] };

      bridge._onIncomingMessages([
        JSON.stringify({
          type: 'persist',
          modelClass: 'ProcessSearchResult',
          modelJSONs: [first, second],
        }),
      ]);

      expect(received.calls.map((c) => c.args[0])).toEqual([first, second]);
      expect(ipcRenderer.send).not.toHaveBeenCalled();
      expect(AppEnv.reportError).not.toHaveBeenCalled();
    });
  });
});
