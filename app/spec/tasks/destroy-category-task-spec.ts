import { DestroyCategoryTask } from '../../src/flux/tasks/destroy-category-task';

describe('DestroyCategoryTask', () => {
  describe('onError', () => {
    let showErrorDialog: jasmine.Spy;
    const task = () => new DestroyCategoryTask({ path: 'Work', accountId: 'a1' });

    beforeEach(() => {
      showErrorDialog = spyOn(AppEnv, 'showErrorDialog');
    });

    it('explains a delete refused because a subfolder has a role', () => {
      task().onError({
        key: 'folder-has-role-children',
        debuginfo: "Nothing was deleted: 'Work/Sent' inside 'Work' is your sent folder.",
      });
      const [{ title, message }, { detail }] = showErrorDialog.mostRecentCall.args;
      expect(title).toContain('Work');
      expect(message).toContain('Nothing was deleted');
      expect(detail).toContain('Work/Sent');
    });

    it('says subfolders may be gone when the server refused one partway', () => {
      task().onError({ key: 'ErrorDelete', debuginfo: 'deleteFolder - child Work/Sub' });
      expect(showErrorDialog.mostRecentCall.args[0].message).toContain('subfolders');
    });

    it('does not mention subfolders when the folder itself was refused', () => {
      task().onError({ key: 'ErrorDelete', debuginfo: 'deleteFolder' });
      expect(showErrorDialog.mostRecentCall.args[0].message).not.toContain('subfolders');
    });

    it('uses the shared string for engine error codes', () => {
      task().onError({ key: 'ErrorConnection', debuginfo: 'deleteFolder' });
      expect(showErrorDialog.mostRecentCall.args[0].message).toContain('Connection Error');
    });
  });
});
