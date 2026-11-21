import os from 'os';
import _fs from 'fs';
import path from 'path';
import { shell } from 'electron';
import MailspringStore from 'mailspring-store';
import DraftStore from './draft-store';
import * as Actions from '../actions';
import { File } from '../models/file';
import { Message } from '../models/message';
import * as Utils from '../models/utils';
import { localized } from '../../intl';
import {
  generatePreview,
  canPossiblyPreviewExtension,
  displayQuickPreviewWindow,
} from '../../quickpreview';

Promise.promisifyAll(_fs);
const fs = _fs as any;

const fileAccessibleAtPath = async (filePath) => {
  try {
    await fs.accessAsync(filePath, fs.F_OK);
    return true;
  } catch (ex) {
    return false;
  }
};

export type AttachmentDownloadData = null;

class AttachmentStore extends MailspringStore {
  _filePreviewPaths = {};
  _filesDirectory: string = path.join(AppEnv.getConfigDirPath(), 'files');
  _lastDownloadDirectory: string;
  _pendingAddsByDraft: { [headerMessageId: string]: Promise<void> } = {};
  _failedAddCountByDraft: { [headerMessageId: string]: number } = {};

  constructor() {
    super();

    // viewing messages
    this.listenTo(Actions.fetchFile, this._fetch);
    this.listenTo(Actions.fetchAndOpenFile, this._fetchAndOpen);
    this.listenTo(Actions.fetchAndSaveFile, this._fetchAndSave);
    this.listenTo(Actions.fetchAndSaveAllFiles, this._fetchAndSaveAll);
    this.listenTo(Actions.quickPreviewFile, this._quickPreviewFile);

    // sending
    this.listenTo(Actions.addAttachment, this._onAddAttachment);
    this.listenTo(Actions.selectAttachment, this._onSelectAttachment);
    this.listenTo(Actions.removeAttachment, this._onRemoveAttachment);
    this.listenTo(Actions.destroyDraft, (draft: Message) =>
      this.deleteFilesOwnedByDraft(draft.files || [])
    );
    this.listenTo(Actions.draftDeliverySucceeded, ({ files }: { files: File[] }) =>
      this.deleteFilesOwnedByDraft(files || [])
    );

    fs.mkdirSync(this._filesDirectory, { recursive: true });
  }

  // Returns a path on disk for saving the file. Note that we must account
  // for files that don't have a name and avoid returning <downloads/dir/"">
  // which causes operations to happen on the directory (badness!)
  //
  pathForFile(file: File) {
    if (!file) {
      return null;
    }
    const id = file.id.toLowerCase();
    const filePath = path.join(
      this._filesDirectory,
      id.substr(0, 2),
      id.substr(2, 2),
      id,
      file.localFilename || file.safeDisplayName()
    );
    if (!filePath.startsWith(this._filesDirectory + path.sep)) {
      return null;
    }
    return filePath;
  }

  getDownloadDataForFile(fileId: string): AttachmentDownloadData {
    // if we ever support downloads again, put this back
    return null;
  }

  // Returns a hash of download objects keyed by fileId
  getDownloadDataForFiles(fileIds: string[] = []) {
    const downloadData: { [fileId: string]: AttachmentDownloadData } = {};
    fileIds.forEach((fileId) => {
      downloadData[fileId] = this.getDownloadDataForFile(fileId);
    });
    return downloadData;
  }

  previewPathsForFiles(fileIds: string[] = []) {
    const previewPaths: { [fileId: string]: string } = {};
    fileIds.forEach((fileId) => {
      previewPaths[fileId] = this.previewPathForFile(fileId);
    });
    return previewPaths;
  }

  previewPathForFile(fileId: string): string {
    return this._filePreviewPaths[fileId];
  }

  // Public: Resolve a file's on-disk path, falling back to the lone item in the file's
  // directory when the sync engine saved it under a different name.
  resolvePathForFile(file: File): Promise<string> {
    return this._prepareAndResolveFilePath(file);
  }

  async _prepareAndResolveFilePath(file: File) {
    let filePath = this.pathForFile(file);

    if (await fileAccessibleAtPath(filePath)) {
      this._ensurePreviewOfFile(file);
    } else {
      // try to find the file in the directory (it should be the only file)
      // this allows us to handle obscure edge cases where the sync engine
      // the file with an altered name.
      const dir = path.dirname(filePath);
      const items = fs.readdirSync(dir).filter((i) => i !== '.DS_Store');
      if (items.length === 1) {
        filePath = path.join(dir, items[0]);
      }
    }

    return filePath;
  }

  async _ensurePreviewOfFile(file: File) {
    if (!AppEnv.config.get('core.attachments.displayFilePreview')) {
      return;
    }
    if (!canPossiblyPreviewExtension(file)) {
      return;
    }

    const filePath = this.pathForFile(file);
    const previewPath = `${filePath}.png`;

    if (await fileAccessibleAtPath(previewPath)) {
      // If the preview file already exists, set our state and bail
      this._filePreviewPaths[file.id] = previewPath;
      this.trigger();
      return;
    }

    // If the preview file doesn't exist yet, generate it
    if (await generatePreview({ file, filePath, previewPath })) {
      this._filePreviewPaths[file.id] = previewPath;
      this.trigger();
    }
  }

  // Section: Retrieval of Files

  _quickPreviewFile = (filePath: string) => {
    displayQuickPreviewWindow(filePath);
  };

  _fetch = (file: File) => {
    return (
      this._prepareAndResolveFilePath(file)
        .catch(this._catchFSErrors)
        // Passively ignore
        .catch(() => {})
    );
  };

  _fetchAndOpen = (file: File) => {
    return this._prepareAndResolveFilePath(file)
      .then((filePath) => shell.openPath(filePath))
      .catch(this._catchFSErrors)
      .catch((error) => {
        this._presentError({ file, error });
      });
  };

  _writeToExternalPath = (filePath, savePath) => {
    return new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.pipe(fs.createWriteStream(savePath));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve());
    });
  };

  _fetchAndSave = (file: File) => {
    const defaultPath = this._defaultSavePath(file);
    const defaultExtension = path.extname(defaultPath);

    AppEnv.showSaveDialog({ defaultPath }, (savePath) => {
      if (!savePath) {
        return;
      }

      const saveExtension = path.extname(savePath);
      const newDownloadDirectory = path.dirname(savePath);
      const didLoseExtension = defaultExtension !== '' && saveExtension === '';
      let actualSavePath = savePath;
      if (didLoseExtension) {
        actualSavePath += defaultExtension;
      }

      this._prepareAndResolveFilePath(file)
        .then((filePath) => this._writeToExternalPath(filePath, actualSavePath))
        .then(() => {
          if (AppEnv.savedState.lastDownloadDirectory !== newDownloadDirectory) {
            AppEnv.savedState.lastDownloadDirectory = newDownloadDirectory;

            if (
              this._lastDownloadDirectory !== newDownloadDirectory &&
              AppEnv.config.get('core.attachments.openFolderAfterDownload')
            ) {
              this._lastDownloadDirectory = newDownloadDirectory;
              require('@electron/remote').shell.showItemInFolder(actualSavePath);
            }
          }
        })
        .catch(this._catchFSErrors)
        .catch((error) => {
          this._presentError({ file, error });
        });
    });
  };

  _fetchAndSaveAll = (files: File[]) => {
    const defaultPath = this._defaultSaveDir();

    return new Promise((resolve) => {
      AppEnv.showOpenDialog(
        {
          defaultPath,
          title: localized('Save Into...'),
          buttonLabel: localized('Download All'),
          properties: ['openDirectory', 'createDirectory'],
        },
        (selected) => {
          if (!selected) {
            return;
          }
          const dirPath = selected[0];
          if (!dirPath) {
            return;
          }
          this._lastDownloadDirectory = dirPath;
          AppEnv.savedState.lastDownloadDirectory = dirPath;

          const seenPaths = new Set();
          const lastSavePaths = [];
          const savePromises = files.map((file) => {
            let externalPath = path.join(dirPath, file.safeDisplayName());
            while (seenPaths.has(externalPath) || fs.existsSync(externalPath)) {
              externalPath = this._incrementPathToAvoidCollision(externalPath);
            }
            seenPaths.add(externalPath);

            return this._prepareAndResolveFilePath(file)
              .then((filePath) => this._writeToExternalPath(filePath, externalPath))
              .then(() => lastSavePaths.push(externalPath));
          });

          Promise.all(savePromises)
            .then(() => {
              if (
                lastSavePaths.length > 0 &&
                AppEnv.config.get('core.attachments.openFolderAfterDownload')
              ) {
                require('@electron/remote').shell.showItemInFolder(lastSavePaths[0]);
              }
              return resolve(lastSavePaths);
            })
            .catch(this._catchFSErrors)
            .catch((error) => {
              this._presentError({ error });
            });
        }
      );
    });
  };

  _incrementPathToAvoidCollision(attemptedPath: string) {
    const ext = path.extname(attemptedPath);
    const dir = path.dirname(attemptedPath);
    let name = path.basename(attemptedPath, ext);
    // Use " (N)" format for collision counters to avoid conflicts with filenames
    // that end with hyphen-number patterns (like dates: "report-2023.pdf")
    const match = / \((\d+)\)$/.exec(name);
    let counter = 0;
    if (match) {
      counter = Number(match[1]);
      name = name.substr(0, match.index);
    }
    return path.join(dir, `${name} (${counter + 1})${ext}`);
  }

  _defaultSaveDir() {
    let home = '';
    if (process.platform === 'win32') {
      home = process.env.USERPROFILE;
    } else {
      home = process.env.HOME;
    }

    let downloadDir = path.join(home, 'Downloads');
    if (!fs.existsSync(downloadDir)) {
      downloadDir = os.tmpdir();
    }

    if (AppEnv.savedState.lastDownloadDirectory) {
      if (fs.existsSync(AppEnv.savedState.lastDownloadDirectory)) {
        downloadDir = AppEnv.savedState.lastDownloadDirectory;
      }
    }

    return downloadDir;
  }

  _defaultSavePath(file: File) {
    const downloadDir = this._defaultSaveDir();
    return path.join(downloadDir, file.safeDisplayName());
  }

  _presentError({ file, error }: { file?: File; error?: Error } = {}) {
    const name = file ? file.displayName() : localized('one or more files');
    const errorString = error ? error.toString() : '';

    require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      message: localized('Download Failed'),
      detail: localized(
        `Unable to download %@. Check your network connection and try again. %@`,
        name,
        errorString
      ),
      buttons: ['OK'],
    });
  }

  _catchFSErrors(error) {
    let message = null;
    if (['EPERM', 'EROFS', 'EPIPE', 'EBUSY', 'EMFILE', 'EACCES', 'UNKNOWN'].includes(error.code)) {
      message = localized(
        'Mailspring could not save an attachment. Check that permissions are set correctly and try restarting Mailspring if the issue persists.'
      );
    }
    if (['ENOSPC'].includes(error.code)) {
      message = localized(
        'Mailspring could not save an attachment because you have run out of disk space.'
      );
    }

    if (message) {
      require('@electron/remote').dialog.showMessageBoxSync({
        type: 'warning',
        message: localized('Download Failed'),
        detail: `${message}\n\n${error.message}`,
        buttons: [localized('OK')],
      });
      return Promise.resolve();
    }
    return Promise.reject(error);
  }

  // Section: Adding Files

  _assertIdPresent(headerMessageId: string) {
    if (!headerMessageId) {
      throw new Error('You need to pass the headerID of the message (draft) this Action refers to');
    }
  }

  _getFileStats(filepath: string) {
    return fs
      .statAsync(filepath)
      .catch(() =>
        Promise.reject(
          new Error(`${filepath} could not be found, or has invalid file permissions.`)
        )
      );
  }

  async _copyToInternalPath(originPath: string, targetPath: string) {
    try {
      // Copy-on-write clone on APFS, btrfs and ReFS; a plain copy elsewhere.
      await _fs.promises.copyFile(originPath, targetPath, _fs.constants.COPYFILE_FICLONE);
    } catch (err) {
      const readable = await _fs.promises.access(originPath, _fs.constants.R_OK).then(
        () => true,
        () => false
      );
      throw new Error(
        readable
          ? `Could not write ${path.basename(targetPath)} to files directory.`
          : `Could not read file at path: ${originPath}`
      );
    }
  }

  // Synchronous so a closing composer window finishes it: a draft holds only a few files.
  _deleteFileSync(file: File) {
    // Delete the file, it's preview if present and it's containing folder. We don't
    // delete other arbitrary files in case for some reason other files are saved here.
    const filePath = this.pathForFile(file);
    fs.unlinkSync(filePath);
    if (fs.existsSync(`${filePath}.png`)) {
      fs.unlinkSync(`${filePath}.png`);
    }
    fs.rmdirSync(path.dirname(filePath));
  }

  async _deleteFile(file: File) {
    try {
      this._deleteFileSync(file);
    } catch (err) {
      throw new Error(`Error deleting file file ${file.filename}:\n\n${err.message}`);
    }
  }

  // Public: Deletes the files a draft created for itself, once the draft is discarded or sent.
  // Only those have temporary ids: a file with a synced id belongs to a message, which a draft
  // made before copyFilesForDraft may still share.
  deleteFilesOwnedByDraft(files: File[]) {
    for (const file of files) {
      if (!Utils.isTempId(file.id)) {
        continue;
      }
      try {
        this._deleteFileSync(file);
      } catch (err) {
        // Already gone, or never written because the attach failed.
      }
    }
  }

  async _applySessionChanges(headerMessageId: string, changeFunction: (files: File[]) => File[]) {
    const session = await DraftStore.sessionForClientId(headerMessageId);
    const files = changeFunction(session.draft().files);
    session.changes.add({ files });
  }

  // Handlers

  _onSelectAttachment = ({ headerMessageId }) => {
    this._assertIdPresent(headerMessageId);

    // When the dialog closes, it triggers `Actions.addAttachment`
    return AppEnv.showOpenDialog({ properties: ['openFile', 'multiSelections'] }, (paths) => {
      if (paths == null) {
        return;
      }
      let pathsToOpen = paths;
      if (typeof pathsToOpen === 'string') {
        pathsToOpen = [pathsToOpen];
      }

      pathsToOpen.forEach((filePath) => Actions.addAttachment({ headerMessageId, filePath }));
    });
  };

  // Adds are serialized per draft so files land on the draft in dispatch
  // order rather than the order their copies happen to finish. `filePath` may
  // be a promise for a file that is still being written, such as a pasted image.
  _onAddAttachment = ({
    headerMessageId,
    filePath,
    inline = false,
    onCreated = (file: File) => {},
  }: {
    headerMessageId: string;
    filePath: string | Promise<string>;
    inline?: boolean;
    onCreated?: (file: File) => void;
  }) => {
    this._assertIdPresent(headerMessageId);

    // A Send waits only for the adds queued before it, so a later one would land mid-send. The
    // composer refuses files from Send onward; this covers any other caller.
    if (
      DraftStore.isAwaitingAddsToSend(headerMessageId) ||
      DraftStore.isSendingDraft(headerMessageId)
    ) {
      return Promise.resolve();
    }

    // The path is awaited only when this add's turn comes; until then, keep a rejection
    // from being reported as unhandled.
    Promise.resolve(filePath).catch(() => {});

    // Chain links swallow rejections so a single failed add can't poison the
    // rest of the chain for this draft.
    const previous = this._pendingAddsByDraft[headerMessageId] || Promise.resolve();
    const current = previous
      .then(() => this._addAttachmentNow({ headerMessageId, filePath, inline, onCreated }))
      .catch((err) => {
        AppEnv.reportError(err);
        return false;
      })
      .then((attached) => {
        if (!attached) {
          this._failedAddCountByDraft[headerMessageId] =
            (this._failedAddCountByDraft[headerMessageId] || 0) + 1;
        }
      });
    this._pendingAddsByDraft[headerMessageId] = current;
    current.then(() => {
      if (this._pendingAddsByDraft[headerMessageId] === current) {
        delete this._pendingAddsByDraft[headerMessageId];
      }
    });
    return current;
  };

  // Public: Whether files are still being added to the draft.
  hasPendingAdds(headerMessageId: string) {
    return !!this._pendingAddsByDraft[headerMessageId];
  }

  // Public: Resolves once every add queued for the draft has settled, or after `timeoutMs` if one
  // is still running (say, a copy from an unresponsive network volume): 'failed' if any of them
  // failed while waiting (the user has been shown why).
  async waitForPendingAdds(
    headerMessageId: string,
    timeoutMs: number
  ): Promise<'attached' | 'failed' | 'timed-out'> {
    const failedBefore = this._failedAddCountByDraft[headerMessageId] || 0;
    let timer: ReturnType<typeof setTimeout>;
    const timedOut = await Promise.race([
      Promise.resolve(this._pendingAddsByDraft[headerMessageId]).then(() => false),
      new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(true), timeoutMs))),
    ]);
    clearTimeout(timer);
    if (timedOut) {
      return 'timed-out';
    }
    const failedAfter = this._failedAddCountByDraft[headerMessageId] || 0;
    return failedAfter === failedBefore ? 'attached' : 'failed';
  }

  // Errors are surfaced in a dialog rather than rejected so one failed file
  // never blocks the rest of the chain for the same draft.
  async _addAttachmentNow({
    headerMessageId,
    filePath: filePathOrPromise,
    inline,
    onCreated,
  }: {
    headerMessageId: string;
    filePath: string | Promise<string>;
    inline: boolean;
    onCreated: (file: File) => void;
  }): Promise<boolean> {
    try {
      const filePath = await filePathOrPromise;
      const filename = path.basename(filePath);
      const stats = await this._getFileStats(filePath);
      if (stats.isDirectory()) {
        throw new Error(
          localized(`%@ is a directory. Try compressing it and attaching it again.`, filename)
        );
      } else if (stats.size > 25 * 1000000) {
        throw new Error(
          localized(`%@ cannot be attached because it is larger than 25MB.`, filename)
        );
      }

      const file = new File({
        id: Utils.generateTempId(),
        filename: filename,
        size: stats.size,
        contentType: null,
        messageId: null,
        contentId: inline ? Utils.generateContentId() : null,
      });
      file.localFilename = file.safeDisplayName();

      await _fs.promises.mkdir(path.dirname(this.pathForFile(file)), { recursive: true });
      await this._copyToInternalPath(filePath, this.pathForFile(file));

      await this._applySessionChanges(headerMessageId, (files) => {
        if (files.reduce((c, f) => c + f.size, 0) >= 25 * 1000000) {
          throw new Error(localized(`Sorry, you can't attach more than 25MB of attachments`));
        }
        return files.concat([file]);
      });
      // The add (and a Send waiting for it) settles after this, so the composer's inline image
      // is in the editor when the Send goes on.
      onCreated(file);
      return true;
    } catch (err) {
      AppEnv.showErrorDialog(err.message);
      return false;
    }
  }

  // Public: Gives a new draft (forward, send again) its own copy of each file, under a new id,
  // so removing an attachment from the draft or purging the original message's files leaves
  // the other intact. A file that is not on disk, or fails to copy, is returned unchanged.
  async copyFilesForDraft(files: File[]): Promise<File[]> {
    return Promise.all(
      files.map(async (original) => {
        const copy = original.clone();
        copy.id = Utils.generateTempId();
        copy.messageId = null;
        copy.localFilename = copy.safeDisplayName();
        try {
          const sourcePath = await this.resolvePathForFile(original);
          if (!(await fileAccessibleAtPath(sourcePath))) {
            return original;
          }
          const targetPath = this.pathForFile(copy);
          await _fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
          // Copy-on-write clone on APFS, btrfs and ReFS; a plain copy elsewhere.
          await _fs.promises.copyFile(sourcePath, targetPath, _fs.constants.COPYFILE_FICLONE);
          return copy;
        } catch (err) {
          return original;
        }
      })
    );
  }

  _onRemoveAttachment = async (headerMessageId: string, fileToRemove: File) => {
    if (!fileToRemove) {
      return;
    }

    await this._applySessionChanges(headerMessageId, (files) =>
      files.filter(({ id }) => id !== fileToRemove.id)
    );

    try {
      await this._deleteFile(fileToRemove);
    } catch (err) {
      AppEnv.showErrorDialog(err.message);
    }
  };
}

export default new AttachmentStore();
