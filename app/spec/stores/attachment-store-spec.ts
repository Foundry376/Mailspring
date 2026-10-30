import fs from 'fs';
import os from 'os';
import path from 'path';
import { Actions, AttachmentStore, DraftStore, File } from 'mailspring-exports';

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

    it('records the name it writes the file under', () => {
      const targets: string[] = [];
      spyOn(AttachmentStore, '_copyToInternalPath').andCallFake((originPath, targetPath) => {
        targets.push(targetPath);
        return Promise.resolve();
      });

      AttachmentStore._onAddAttachment({ headerMessageId: 'draft-1', filePath: '/tmp/CON.txt' });

      waitsFor(() => this.files.length === 1);
      runs(() => {
        const [file] = this.files;
        expect(file.filename).toEqual('CON.txt');
        expect(file.localFilename).toEqual('_CON.txt');
        expect(path.basename(targets[0])).toEqual('_CON.txt');
        expect(file.toJSON().localFilename).toEqual('_CON.txt');
      });
    });
  });

  describe('copyFilesForDraft', () => {
    let originalFilesDirectory: string = null;
    let tmpDir: string = null;
    let inline: File = null;
    let pdf: File = null;

    const writeFile = (filePath: string, contents: string) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents);
    };

    beforeEach(() => {
      originalFilesDirectory = AttachmentStore._filesDirectory;
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailspring-attachment-store-spec-'));
      AttachmentStore._filesDirectory = tmpDir;
      spyOn(AttachmentStore, '_ensurePreviewOfFile');

      inline = new File({
        id: 'inline-file-id',
        accountId: 'account-1',
        messageId: 'message-1',
        filename: 'photo.png',
        size: 5,
        contentType: 'image/png',
        contentId: 'photo@mailspring',
      });
      pdf = new File({
        id: 'pdf-file-id',
        accountId: 'account-1',
        messageId: 'message-1',
        filename: 'report.pdf',
        size: 6,
        contentType: 'application/pdf',
      });
      writeFile(AttachmentStore.pathForFile(inline), 'photo');
      writeFile(AttachmentStore.pathForFile(pdf), 'report');
    });

    afterEach(() => {
      AttachmentStore._filesDirectory = originalFilesDirectory;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('copies each file to a new id, keeping its attributes and bytes', () => {
      waitsForPromise(async () => {
        const [inlineCopy, pdfCopy] = await AttachmentStore.copyFilesForDraft([inline, pdf]);

        expect(inlineCopy instanceof File).toBe(true);
        expect(inlineCopy.id).not.toEqual(inline.id);
        expect(inlineCopy.messageId).toBe(null);
        expect(inlineCopy.accountId).toEqual('account-1');
        expect(inlineCopy.filename).toEqual('photo.png');
        expect(inlineCopy.size).toEqual(5);
        expect(inlineCopy.contentType).toEqual('image/png');
        expect(inlineCopy.contentId).toEqual('photo@mailspring');
        expect(fs.readFileSync(AttachmentStore.pathForFile(inlineCopy), 'utf8')).toEqual('photo');

        expect(pdfCopy.id).not.toEqual(pdf.id);
        expect(pdfCopy.id).not.toEqual(inlineCopy.id);
        expect(pdfCopy.contentId).toBeUndefined();
        expect(fs.readFileSync(AttachmentStore.pathForFile(pdfCopy), 'utf8')).toEqual('report');

        expect(inline.id).toEqual('inline-file-id');
        expect(inline.messageId).toEqual('message-1');
      });
    });

    it('leaves the original in place when the copy is deleted from the draft', () => {
      waitsForPromise(async () => {
        const [copy] = await AttachmentStore.copyFilesForDraft([pdf]);
        await AttachmentStore._deleteFile(copy);
        expect(fs.existsSync(AttachmentStore.pathForFile(copy))).toBe(false);
        expect(fs.readFileSync(AttachmentStore.pathForFile(pdf), 'utf8')).toEqual('report');
      });
    });

    it('copies a file the sync engine saved under a different name', () => {
      const savedPath = AttachmentStore.pathForFile(pdf);
      fs.renameSync(savedPath, path.join(path.dirname(savedPath), 'report (engine).pdf'));

      waitsForPromise(async () => {
        const [copy] = await AttachmentStore.copyFilesForDraft([pdf]);
        expect(copy.id).not.toEqual(pdf.id);
        expect(fs.readFileSync(AttachmentStore.pathForFile(copy), 'utf8')).toEqual('report');
      });
    });

    it('records the name it writes the copy under', () => {
      const spaced = new File({
        id: 'spaced-file-id',
        accountId: 'account-1',
        messageId: 'message-1',
        filename: 'notes.txt ',
        size: 5,
      });
      writeFile(AttachmentStore.pathForFile(spaced), 'notes');

      waitsForPromise(async () => {
        const [copy] = await AttachmentStore.copyFilesForDraft([spaced]);
        expect(copy.filename).toEqual('notes.txt ');
        expect(copy.localFilename).toEqual('notes.txt');
        expect(path.basename(AttachmentStore.pathForFile(copy))).toEqual('notes.txt');
        expect(fs.readFileSync(AttachmentStore.pathForFile(copy), 'utf8')).toEqual('notes');
      });
    });

    it('returns the original file when its bytes are not on disk', () => {
      fs.rmSync(path.dirname(AttachmentStore.pathForFile(pdf)), { recursive: true });

      waitsForPromise(async () => {
        const [inlineCopy, pdfResult] = await AttachmentStore.copyFilesForDraft([inline, pdf]);
        expect(inlineCopy.id).not.toEqual(inline.id);
        expect(pdfResult).toBe(pdf);
      });
    });

    it('returns the original file when the copy fails', () => {
      spyOn(fs.promises, 'copyFile').andCallFake(() => Promise.reject(new Error('EACCES')));
      spyOn(AppEnv, 'showErrorDialog');

      waitsForPromise(async () => {
        const result = await AttachmentStore.copyFilesForDraft([inline, pdf]);
        expect(result[0]).toBe(inline);
        expect(result[1]).toBe(pdf);
        expect(AppEnv.showErrorDialog).not.toHaveBeenCalled();
      });
    });

    describe('deleteFilesOwnedByDraft', () => {
      it("deletes the draft's own copies and leaves files that belong to a message", () => {
        waitsForPromise(async () => {
          const [copy] = await AttachmentStore.copyFilesForDraft([pdf]);
          const copyDir = path.dirname(AttachmentStore.pathForFile(copy));
          fs.writeFileSync(`${AttachmentStore.pathForFile(copy)}.png`, 'preview');

          AttachmentStore.deleteFilesOwnedByDraft([copy, inline]);

          expect(fs.existsSync(copyDir)).toBe(false);
          expect(fs.readFileSync(AttachmentStore.pathForFile(inline), 'utf8')).toEqual('photo');
          expect(fs.readFileSync(AttachmentStore.pathForFile(pdf), 'utf8')).toEqual('report');
        });
      });

      it('ignores a file that is already gone', () => {
        const missing = new File({ id: 'local-0000-0000', filename: 'gone.txt' });
        expect(() => AttachmentStore.deleteFilesOwnedByDraft([missing])).not.toThrow();
      });

      it('runs when a draft is discarded and when it is sent', () => {
        spyOn(Actions, 'queueTask');
        spyOn(AttachmentStore, 'deleteFilesOwnedByDraft');

        Actions.destroyDraft({ id: 'draft-1', headerMessageId: 'h-1', files: [pdf] });
        expect(AttachmentStore.deleteFilesOwnedByDraft).toHaveBeenCalledWith([pdf]);

        Actions.draftDeliverySucceeded({ headerMessageId: 'h-2', files: [inline] });
        expect(AttachmentStore.deleteFilesOwnedByDraft).toHaveBeenCalledWith([inline]);
      });
    });
  });
});
