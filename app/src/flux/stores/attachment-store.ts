import os from 'os';
import fs from 'fs';
import path from 'path';
import { remote, shell } from 'electron';
import mkdirp from 'mkdirp';
import MailspringStore from 'mailspring-store';
import DraftStore from './draft-store';
import Actions from '../actions';
import File from '../models/file';
import * as Utils from '../models/utils';
import { localized } from '../../intl';
import {
  generatePreview,
  canPossiblyPreviewExtension,
  displayQuickPreviewWindow,
} from '../../quickpreview';

Promise.promisifyAll(fs);

const mkdirpAsync = Promise.promisify(mkdirp);

const fileAccessibleAtPath = async filePath => {
  try {
    await fs.accessAsync(filePath, fs.F_OK);
    return true;
  } catch (ex) {
    return false;
  }
};

class AttachmentStore extends MailspringStore {
  constructor() {
    super();

    // viewing messages
    this.listenTo(Actions.fetchFile, this._fetch);
    this.listenTo(Actions.fetchAndOpenFile, this._fetchAndOpen);
    this.listenTo(Actions.fetchAndSaveFile, this._fetchAndSave);
    this.listenTo(Actions.fetchAndSaveAllFiles, this._fetchAndSaveAll);
    this.listenTo(Actions.abortFetchFile, this._abortFetchFile);
    this.listenTo(Actions.quickPreviewFile, this._quickPreviewFile);

    // sending
    this.listenTo(Actions.addAttachment, this._onAddAttachment);
    this.listenTo(Actions.selectAttachment, this._onSelectAttachment);
    this.listenTo(Actions.removeAttachment, this._onRemoveAttachment);

    this._filePreviewPaths = {};
    this._filesDirectory = path.join(AppEnv.getConfigDirPath(), 'files');
    mkdirp(this._filesDirectory);
  }

  // Returns a path on disk for saving the file. Note that we must account
  // for files that don't have a name and avoid returning <downloads/dir/"">
  // which causes operations to happen on the directory (badness!)
  //
  pathForFile(file) {
    if (!file) {
      return null;
    }
    const id = file.id.toLowerCase();
    return path.join(
      this._filesDirectory,
      id.substr(0, 2),
      id.substr(2, 2),
      id,
      file.safeDisplayName()
    );
  }

  getDownloadDataForFile() {
    // fileId
    // if we ever support downloads again, put this back
    return null;
  }

  // Returns a hash of download objects keyed by fileId
  getDownloadDataForFiles(fileIds = []) {
    const downloadData = {};
    fileIds.forEach(fileId => {
      downloadData[fileId] = this.getDownloadDataForFile(fileId);
    });
    return downloadData;
  }

  previewPathsForFiles(fileIds = []) {
    const previewPaths = {};
    fileIds.forEach(fileId => {
      previewPaths[fileId] = this.previewPathForFile(fileId);
    });
    return previewPaths;
  }

  previewPathForFile(fileId) {
    return this._filePreviewPaths[fileId];
  }

  async _prepareAndResolveFilePath(file) {
    let filePath = this.pathForFile(file);

    if (await fileAccessibleAtPath(filePath)) {
      this._ensurePreviewOfFile(file);
    } else {
      // try to find the file in the directory (it should be the only file)
      // this allows us to handle obscure edge cases where the sync engine
      // the file with an altered name.
      const dir = path.dirname(filePath);
      const items = fs.readdirSync(dir).filter(i => i !== '.DS_Store');
      if (items.length === 1) {
        filePath = path.join(dir, items[0]);
      }
    }

    return filePath;
  }

  async _ensurePreviewOfFile(file) {
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
      console.log('got preview for ' + previewPath);
      this.trigger();
    }
  }

  // Section: Retrieval of Files

  _quickPreviewFile = filePath => {
    displayQuickPreviewWindow(filePath);
  };

  _fetch = file => {
    return (
      this._prepareAndResolveFilePath(file)
        .catch(this._catchFSErrors)
        // Passively ignore
        .catch(() => {})
    );
  };

  _fetchAndOpen = file => {
    return this._prepareAndResolveFilePath(file)
      .then(filePath => shell.openItem(filePath))
      .catch(this._catchFSErrors)
      .catch(error => {
        return this._presentError({ file, error });
      });
  };

  _writeToExternalPath = (filePath, savePath) => {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.pipe(fs.createWriteStream(savePath));
      stream.on('error', err => reject(err));
      stream.on('end', () => resolve());
    });
  };

  _fetchAndSave = file => {
    const defaultPath = this._defaultSavePath(file);
    const defaultExtension = path.extname(defaultPath);

    AppEnv.showSaveDialog({ defaultPath }, savePath => {
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
        .then(filePath => this._writeToExternalPath(filePath, actualSavePath))
        .then(() => {
          if (AppEnv.savedState.lastDownloadDirectory !== newDownloadDirectory) {
            AppEnv.savedState.lastDownloadDirectory = newDownloadDirectory;

            if (
              this._lastDownloadDirectory !== newDownloadDirectory &&
              AppEnv.config.get('core.attachments.openFolderAfterDownload')
            ) {
              this._lastDownloadDirectory = newDownloadDirectory;
              shell.showItemInFolder(actualSavePath);
            }
          }
        })
        .catch(this._catchFSErrors)
        .catch(error => {
          this._presentError({ file, error });
        });
    });
  };

  _fetchAndSaveAll = files => {
    const defaultPath = this._defaultSaveDir();
    const options = {
      defaultPath,
      title: localized('Save Into...'),
      buttonLabel: localized('Download All'),
      properties: ['openDirectory', 'createDirectory'],
    };

    return new Promise(resolve => {
      AppEnv.showOpenDialog(options, selected => {
        if (!selected) {
          return;
        }
        const dirPath = selected[0];
        if (!dirPath) {
          return;
        }
        this._lastDownloadDirectory = dirPath;
        AppEnv.savedState.lastDownloadDirectory = dirPath;

        const lastSavePaths = [];
        const savePromises = files.map(file => {
          const savePath = path.join(dirPath, file.safeDisplayName());
          return this._prepareAndResolveFilePath(file)
            .then(filePath => this._writeToExternalPath(filePath, savePath))
            .then(() => lastSavePaths.push(savePath));
        });

        Promise.all(savePromises)
          .then(() => {
            if (
              lastSavePaths.length > 0 &&
              AppEnv.config.get('core.attachments.openFolderAfterDownload')
            ) {
              shell.showItemInFolder(lastSavePaths[0]);
            }
            return resolve(lastSavePaths);
          })
          .catch(this._catchFSErrors)
          .catch(error => {
            return this._presentError({ error });
          });
      });
    });
  };

  _abortFetchFile = () => {
    // file
    // put this back if we ever support downloading individual files again
    return;
  };

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

  _defaultSavePath(file) {
    const downloadDir = this._defaultSaveDir();
    return path.join(downloadDir, file.safeDisplayName());
  }

  _presentError({ file, error } = {}) {
    const name = file ? file.displayName() : localized('one or more files');
    const errorString = error ? error.toString() : '';

    return remote.dialog.showMessageBox({
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
    if (['EPERM', 'EMFILE', 'EACCES'].includes(error.code)) {
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
      remote.dialog.showMessageBox({
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

  _assertIdPresent(headerMessageId) {
    if (!headerMessageId) {
      throw new Error('You need to pass the headerID of the message (draft) this Action refers to');
    }
  }

  _getFileStats(filepath) {
    return fs
      .statAsync(filepath)
      .catch(() =>
        Promise.reject(
          new Error(`${filepath} could not be found, or has invalid file permissions.`)
        )
      );
  }

  _copyToInternalPath(originPath, targetPath) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(originPath);
      const writeStream = fs.createWriteStream(targetPath);

      readStream.on('error', () => reject(new Error(`Could not read file at path: ${originPath}`)));
      writeStream.on('error', () =>
        reject(new Error(`Could not write ${path.basename(targetPath)} to files directory.`))
      );
      readStream.on('end', () => resolve());
      readStream.pipe(writeStream);
    });
  }

  async _deleteFile(file) {
    try {
      // Delete the file and it's containing folder. Todo: possibly other empty dirs?
      await fs.unlinkAsync(this.pathForFile(file));
      await fs.rmdirAsync(path.dirname(this.pathForFile(file)));
    } catch (err) {
      throw new Error(`Error deleting file file ${file.filename}:\n\n${err.message}`);
    }
  }

  async _applySessionChanges(headerMessageId, changeFunction) {
    const session = await DraftStore.sessionForClientId(headerMessageId);
    const files = changeFunction(session.draft().files);
    session.changes.add({ files });
  }

  // Handlers

  _onSelectAttachment = ({ headerMessageId }) => {
    this._assertIdPresent(headerMessageId);

    // When the dialog closes, it triggers `Actions.addAttachment`
    return AppEnv.showOpenDialog({ properties: ['openFile', 'multiSelections'] }, paths => {
      if (paths == null) {
        return;
      }
      let pathsToOpen = paths;
      if (typeof pathsToOpen === 'string') {
        pathsToOpen = [pathsToOpen];
      }

      pathsToOpen.forEach(filePath => Actions.addAttachment({ headerMessageId, filePath }));
    });
  };

  _onAddAttachment = async ({
    headerMessageId,
    filePath,
    inline = false,
    onCreated = () => {},
  }) => {
    this._assertIdPresent(headerMessageId);

    try {
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

      await mkdirpAsync(path.dirname(this.pathForFile(file)));
      await this._copyToInternalPath(filePath, this.pathForFile(file));

      await this._applySessionChanges(headerMessageId, files => {
        if (files.reduce((c, f) => c + f.size, 0) >= 25 * 1000000) {
          throw new Error(localized(`Sorry, you can't attach more than 25MB of attachments`));
        }
        return files.concat([file]);
      });
      onCreated(file);
    } catch (err) {
      AppEnv.showErrorDialog(err.message);
    }
  };

  _onRemoveAttachment = async (headerMessageId, fileToRemove) => {
    if (!fileToRemove) {
      return;
    }

    await this._applySessionChanges(headerMessageId, files =>
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
