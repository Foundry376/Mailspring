import { remote, webFrame } from 'electron';
import fs from 'fs';
import path from 'path';
import { localized } from './intl';

const { app, MenuItem } = remote;
const customDictFilePath = path.join(AppEnv.getConfigDirPath(), 'custom-dict.json');

class Spellchecker {
  constructor() {
    // Nobody will notice if spellcheck isn't available for a few seconds and it
    // takes a considerable amount of time to startup (212ms in dev mode on my 2017 MBP)
    const initHandler = () => {
      this._migrateFromCustomDict();

      const initialLanguage = AppEnv.config.get('core.composing.spellcheckDefaultLanguage');
      const session = remote.getCurrentWebContents().session;
      session.setSpellCheckerEnabled(true);
      if (initialLanguage) {
        console.log(`spellcheck language: ${initialLanguage}`);
        session.setSpellCheckerLanguages([initialLanguage]);
      }
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

  _switchToLanguage = (lang: string | undefined | null) => {
    if (lang === null || lang === undefined || lang === '') {
      lang = app.getLocale() || 'en-US';
    }
    const session = remote.getCurrentWebContents().session;
    session.setSpellCheckerLanguages([lang]);
  };

  _migrateFromCustomDict = () => {
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
      const session = remote.getCurrentWebContents().session;
      Object.keys(loadedDict).forEach(word => session.addWordToSpellCheckerDictionary(word));
      fs.unlink(customDictFilePath, () => {});
    });
  };

  isMisspelled = (word: string) => {
    return webFrame.isWordMisspelled(word);
  };

  learnWord = word => {
    remote.getCurrentWebContents().session.addWordToSpellCheckerDictionary(word);
  };

  unlearnWord = word => {
    remote.getCurrentWebContents().session.removeWordFromSpellCheckerDictionary(word);
  };

  appendSpellingItemsToMenu = async ({ menu, word, onCorrect, onDidLearn }) => {
    if (this.isMisspelled(word)) {
      const corrections = webFrame.getWordSuggestions(word);
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
