import { remote } from 'electron';
import LRUCache from 'lru-cache';
import fs from 'fs';
import path from 'path';
import { localized } from './intl';

const { app, MenuItem } = remote;
const customDictFilePath = path.join(AppEnv.getConfigDirPath(), 'custom-dict.json');

class Spellchecker {
  private _customDictLoaded = false;
  private _saveOnLoad = false;
  private _savingCustomDict = false;
  private _saveAgain = false;

  private _customDict = {};

  public handler: import('electron-spellchecker').SpellCheckHandler;

  constructor() {
    this.handler = null;

    // Nobody will notice if spellcheck isn't available for a few seconds and it
    // takes a considerable amount of time to startup (212ms in dev mode on my 2017 MBP)
    const initHandler = () => {
      this._loadCustomDict();

      const initialLanguage = AppEnv.config.get('core.composing.spellcheckDefaultLanguage');
      const { SpellCheckHandler } = require('electron-spellchecker'); //eslint-disable-line
      this.handler = new SpellCheckHandler(initialLanguage);
      this.handler['isMisspelledCache'] = new LRUCache({ max: 5000 });

      // Monitor language setting for changes. Note that as the user types in a draft we
      // change spellcheck to that language.
      AppEnv.config.onDidChange('core.composing.spellcheckDefaultLanguage', value => {
        this._switchToLanguage(value.newValue);
      });
    };

    if (AppEnv.inSpecMode()) {
      initHandler();
    } else {
      setTimeout(initHandler, 5000);
    }
  }

  _switchToLanguage = lang => {
    if (lang === null || lang === undefined || lang === '') {
      lang = app.getLocale() || 'en-US';
    }
    this.handler.switchLanguage(lang);
    this.handler['isMisspelledCache'].reset();
  };

  _loadCustomDict = () => {
    fs.readFile(customDictFilePath, (err, data) => {
      let fileData: any = data;
      if (err) {
        if (err.code === 'ENOENT') {
          // File doesn't exist, we haven't saved any words yet
          fileData = '{}';
        } else {
          AppEnv.reportError(err);
          return;
        }
      }
      const loadedDict = JSON.parse(fileData);
      this._customDict = Object.assign(loadedDict, this._customDict);
      this._customDictLoaded = true;
      if (this._saveOnLoad) {
        this._saveCustomDict();
        this._saveOnLoad = false;
      }
    });
  };

  _saveCustomDict = () => {
    // If we haven't loaded the dict yet, saving could overwrite all the things.
    // Wait until the loaded dict is merged with our working copy before saving
    if (this._customDictLoaded) {
      // Don't perform two writes at the same time, as this results in an overlaid
      // version of the data. (This may or may not happen in practice, but was
      // an issue with the tests)
      if (this._savingCustomDict) {
        this._saveAgain = true;
      } else {
        this._savingCustomDict = true;
        fs.writeFile(customDictFilePath, JSON.stringify(this._customDict), err => {
          if (err) {
            AppEnv.reportError(err);
          }
          this._savingCustomDict = false;
          if (this._saveAgain) {
            this._saveAgain = false;
            this._saveCustomDict();
          }
        });
      }
    } else {
      this._saveOnLoad = true;
    }
  };

  provideHintText = text => {
    if (!this.handler) {
      return false;
    }
    this.handler.provideHintText(text);
  };

  isMisspelled = (word: string) => {
    if (!this.handler) {
      return false;
    }
    if ({}.hasOwnProperty.call(this._customDict, word)) {
      return false;
    }
    return !(this.handler as any).handleElectronSpellCheck([word]);
  };

  learnWord = word => {
    this._customDict[word] = '';
    this._saveCustomDict();
  };

  unlearnWord = word => {
    if (word in this._customDict) {
      delete this._customDict[word];
      this._saveCustomDict();
    }
  };

  appendSpellingItemsToMenu = async ({ menu, word, onCorrect, onDidLearn }) => {
    if (this.isMisspelled(word)) {
      const corrections = await this.handler.currentSpellchecker.getCorrectionsForMisspelling(word);
      if (corrections.length > 0) {
        corrections.forEach(correction => {
          menu.append(
            new MenuItem({
              label: correction,
              click: () => onCorrect(correction),
            })
          );
        });
      } else {
        menu.append(new MenuItem({ label: localized('No Guesses Found'), enabled: false }));
      }
      menu.append(new MenuItem({ type: 'separator' }));

      menu.append(
        new MenuItem({
          label: localized('Learn Spelling'),
          click: () => {
            this.learnWord(word);
            if (onDidLearn) {
              onDidLearn(word);
            }
          },
        })
      );
      menu.append(new MenuItem({ type: 'separator' }));
    }
  };
}

export default new Spellchecker();
