import path from 'path';
import fs from 'fs-plus';
import { BrowserWindow, dialog, app } from 'electron';
import { atomicWriteFileSync } from '../fs-utils';
import { localized } from '../intl';

let _ = require('underscore');
_ = Object.assign(_, require('../config-utils'));

const RETRY_SAVES = 3;

export default class ConfigPersistenceManager {
  userWantsToPreserveErrors = false;
  saveRetries = 0;
  settings = {};
  configDirPath: string;
  configFilePath: string;
  resourcePath: string;
  lastSaveTimestamp?: number;

  constructor({ configDirPath, resourcePath }: { configDirPath: string; resourcePath: string }) {
    this.configDirPath = configDirPath;
    this.resourcePath = resourcePath;

    this.configFilePath = path.join(this.configDirPath, 'config.json');

    this.initializeConfigDirectory();
    this.load();
  }

  initializeConfigDirectory() {
    if (!fs.existsSync(this.configDirPath)) {
      fs.makeTreeSync(this.configDirPath);
      const templateConfigDirPath = path.join(this.resourcePath, 'dot-mailspring');
      fs.copySync(templateConfigDirPath, this.configDirPath);
    }

    try {
      const stat = fs.statSync(this.configDirPath);
      const configDirPathAccessMode = (stat.mode & parseInt('777', 8)).toString(8);
      if (configDirPathAccessMode !== '700') {
        fs.chmodSync(this.configDirPath, '700');
      }
    } catch (err) {
      // ignore
    }

    if (!fs.existsSync(this.configFilePath)) {
      this.writeTemplateConfigFile();
    }
  }

  writeTemplateConfigFile() {
    const templateConfigPath = path.join(this.resourcePath, 'dot-mailspring', 'config.json');
    const templateConfig = fs.readFileSync(templateConfigPath).toString();
    fs.writeFileSync(this.configFilePath, templateConfig);
  }

  _showLoadErrorDialog(error) {
    const message = localized(`Failed to load "%@"`, path.basename(this.configFilePath));
    let detail = error.message;

    if (error instanceof SyntaxError) {
      detail += `\n\nThe file ${this.configFilePath} has incorrect JSON formatting or is empty. Fix the formatting to resolve this error, or reset your settings to continue using N1.`;
    } else {
      detail += `\n\nWe were unable to read the file ${this.configFilePath}. Make sure you have permissions to access this file, and check that the file is not open or being edited and try again.`;
    }

    const clickedIndex = dialog.showMessageBoxSync({
      type: 'error',
      message,
      detail,
      buttons: [localized('Quit'), localized('Try Again'), localized('Reset Configuration')],
    });

    switch (clickedIndex) {
      case 0:
        return 'quit';
      case 1:
        return 'tryagain';
      case 2:
        return 'reset';
      default:
        throw new Error('Unknown button clicked');
    }
  }

  load() {
    this.userWantsToPreserveErrors = false;

    try {
      const json = JSON.parse(fs.readFileSync(this.configFilePath).toString());
      if (!json || !json['*']) {
        throw new Error('config json appears empty');
      }
      this.settings = json['*'];
      this.emitChangeEvent();
    } catch (error) {
      error.message = localized(`Failed to load config.json: %@`, error.message);

      const action = this._showLoadErrorDialog(error);
      if (action === 'quit') {
        this.userWantsToPreserveErrors = true;
        app.quit();
        return;
      }

      if (action === 'tryagain') {
        this.load();
        return;
      }

      if (action !== 'reset') {
        throw new Error(`Unknown action: ${action}`);
      }

      if (fs.existsSync(this.configFilePath)) {
        fs.unlinkSync(this.configFilePath);
      }
      this.writeTemplateConfigFile();
      this.load();
    }
  }

  _showSaveErrorDialog() {
    const clickedIndex = dialog.showMessageBoxSync({
      type: 'error',
      message: localized(`Failed to save "%@"`, path.basename(this.configFilePath)),
      detail: `\n\nWe were unable to save the file ${this.configFilePath}. Make sure you have permissions to access this file, and check that the file is not open or being edited and try again.`,
      buttons: [localized('Okay'), localized('Try Again')],
    });
    return ['ignore', 'retry'][clickedIndex];
  }

  save = () => {
    if (this.userWantsToPreserveErrors) {
      return;
    }
    const allSettings = { '*': this.settings };
    const allSettingsJSON = JSON.stringify(allSettings, null, 2);
    this.lastSaveTimestamp = Date.now();

    try {
      atomicWriteFileSync(this.configFilePath, allSettingsJSON);
      this.saveRetries = 0;
    } catch (error) {
      if (this.saveRetries >= RETRY_SAVES) {
        error.message = localized(`Failed to save config.json: %@`, error.message);
        const action = this._showSaveErrorDialog();
        this.saveRetries = 0;

        if (action === 'retry') {
          this.save();
        }
        return;
      }

      this.saveRetries++;
      this.save();
    }
  };

  getRawValuesString = () => {
    if (!this.settings || _.isEmpty(this.settings)) {
      throw new Error('this.settings is empty');
    }
    return JSON.stringify(this.settings);
  };

  setSettings = (value, sourceWebcontentsId) => {
    this.settings = value;
    this.emitChangeEvent({ sourceWebcontentsId });
    this.save();
  };

  setRawValue = (keyPath, value, sourceWebcontentsId) => {
    if (!keyPath) {
      throw new Error('keyPath must not be false-y!');
    }
    _.setValueForKeyPath(this.settings, keyPath, value);
    this.emitChangeEvent({ sourceWebcontentsId });
    this.save();
  };

  emitChangeEvent = ({ sourceWebcontentsId }: { sourceWebcontentsId?: number } = {}) => {
    global.application.config.updateSettings(this.settings);

    BrowserWindow.getAllWindows().forEach(win => {
      if (win.webContents && win.webContents.id !== sourceWebcontentsId) {
        win.webContents.send('on-config-reloaded', this.settings);
      }
    });
  };
}
