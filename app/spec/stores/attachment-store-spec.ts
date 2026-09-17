import { AttachmentStore, DraftStore, File } from 'mailspring-exports';

describe('AttachmentStore', function () {
  describe('_onAddAttachment', () => {
    beforeEach(() => {
      this.files = [];
      this.session = {
        draft: () => ({ files: this.files }),
        changes: {
          add: ({ files }) => {
            this.files = files;
          },
        },
      };
      spyOn(DraftStore, 'sessionForClientId').andReturn(Promise.resolve(this.session));
      spyOn(AttachmentStore, '_getFileStats').andReturn(
        Promise.resolve({ isDirectory: () => false, size: 10 })
      );
      spyOn(require('fs').promises, 'mkdir').andReturn(Promise.resolve());
      spyOn(AppEnv, 'showErrorDialog');
    });

    it('adds files to the draft in dispatch order even when copies finish out of order', () => {
      // Each copy resolves only when the test releases it, so we can make the
      // first file's copy finish last.
      const copies: { [filePath: string]: () => void } = {};
      spyOn(AttachmentStore, '_copyToInternalPath').andCallFake(
        (originPath: string) =>
          new Promise<void>((resolve) => {
            copies[originPath] = resolve;
          })
      );

      AttachmentStore._onAddAttachment({ headerMessageId: 'draft-1', filePath: '/tmp/a.png' });
      AttachmentStore._onAddAttachment({ headerMessageId: 'draft-1', filePath: '/tmp/b.png' });
      AttachmentStore._onAddAttachment({ headerMessageId: 'draft-1', filePath: '/tmp/c.png' });

      waitsFor(() => !!copies['/tmp/a.png']);
      runs(() => {
        // b and c have not started copying because a is still in flight.
        expect(copies['/tmp/b.png']).toBeUndefined();
        expect(copies['/tmp/c.png']).toBeUndefined();
        copies['/tmp/a.png']();
      });
      waitsFor(() => !!copies['/tmp/b.png']);
      runs(() => copies['/tmp/b.png']());
      waitsFor(() => !!copies['/tmp/c.png']);
      runs(() => copies['/tmp/c.png']());
      waitsFor(() => this.files.length === 3);
      runs(() => {
        expect(this.files.map((f: File) => f.filename)).toEqual(['a.png', 'b.png', 'c.png']);
        expect(AttachmentStore._pendingAddsByDraft['draft-1']).toBeUndefined();
      });
    });

    it('continues the chain after a file fails to attach', () => {
      spyOn(AttachmentStore, '_copyToInternalPath').andCallFake((originPath: string) =>
        originPath.includes('bad')
          ? Promise.reject(new Error('Could not read file'))
          : Promise.resolve()
      );

      AttachmentStore._onAddAttachment({ headerMessageId: 'draft-1', filePath: '/tmp/bad.png' });
      AttachmentStore._onAddAttachment({ headerMessageId: 'draft-1', filePath: '/tmp/good.png' });

      waitsFor(() => this.files.length === 1);
      runs(() => {
        expect(this.files[0].filename).toEqual('good.png');
        expect(AppEnv.showErrorDialog).toHaveBeenCalledWith('Could not read file');
      });
    });

    it('does not serialize adds across different drafts', () => {
      const copies: { [filePath: string]: () => void } = {};
      spyOn(AttachmentStore, '_copyToInternalPath').andCallFake(
        (originPath: string) =>
          new Promise<void>((resolve) => {
            copies[originPath] = resolve;
          })
      );

      AttachmentStore._onAddAttachment({ headerMessageId: 'draft-1', filePath: '/tmp/a.png' });
      AttachmentStore._onAddAttachment({ headerMessageId: 'draft-2', filePath: '/tmp/b.png' });

      waitsFor(() => !!copies['/tmp/a.png'] && !!copies['/tmp/b.png']);
      runs(() => {
        copies['/tmp/a.png']();
        copies['/tmp/b.png']();
      });
      waitsFor(() => this.files.length === 2);
    });
  });
});
