import MailspringStore from 'mailspring-store';
import fs from 'fs';
import path from 'path';
import { Utils, MessageBodyProcessor, CategoryStore } from 'mailspring-exports';
import * as AutoloadImagesActions from './autoload-images-actions';

class AutoloadImagesStore extends MailspringStore {
  _whitelistEmails = {};
  _whitelistMessageIds = {};
  _whitelistEmailsPath = path.join(AppEnv.getConfigDirPath(), 'autoload-images-whitelist.txt');

  constructor() {
    super();

    this._loadWhitelist();

    this.listenTo(AutoloadImagesActions.temporarilyEnableImages, this._onTemporarilyEnableImages);
    this.listenTo(AutoloadImagesActions.permanentlyEnableImages, this._onPermanentlyEnableImages);

    AppEnv.config.onDidChange('core.reading.autoloadImages', () => {
      MessageBodyProcessor.resetCache();
    });
  }

  getImagesRegexp = () => {
    // Matches:
    // - src='....'
    // - background="...."
    // - background: url(....)
    // - background: url(""...."")
    // - @import url(....)
    return /((?:src|background|placeholder|icon|poster|srcset)\s*=\s*['"]?(?=[cid:|\w*://])|(?::|@import)\s*url\(['"]?)+([^"')]*)/gi;
  };

  getLinkTagRegexp = () => {
    return /<link [^>]+>/gi;
  };

  shouldBlockImagesIn = message => {
    const spam = CategoryStore.getSpamCategory(message.accountId);
    const spamFolderId = spam ? spam.id : undefined;

    if (AppEnv.config.get('core.reading.autoloadImages') && message.folder.id !== spamFolderId) {
      return false;
    }
    if (this._whitelistEmails[Utils.toEquivalentEmailForm(message.fromContact().email)]) {
      return false;
    }
    if (this._whitelistMessageIds[message.id]) {
      return false;
    }

    const containsImages = this.getImagesRegexp().test(message.body);
    const containsLinkTags = this.getLinkTagRegexp().test(message.body);
    return containsImages || containsLinkTags;
  };

  _loadWhitelist = () => {
    fs.exists(this._whitelistEmailsPath, exists => {
      if (!exists) {
        return;
      }

      fs.readFile(this._whitelistEmailsPath, (err, body) => {
        if (err || !body) {
          console.log(err);
          return;
        }

        this._whitelistEmails = {};
        body
          .toString()
          .split(/[\n\r]+/)
          .forEach(email => {
            this._whitelistEmails[Utils.toEquivalentEmailForm(email)] = true;
          });
        this.trigger();
      });
    });
  };

  _saveWhitelist = () => {
    const data = Object.keys(this._whitelistEmails).join('\n');
    fs.writeFile(this._whitelistEmailsPath, data, err => {
      if (err) {
        console.error(`AutoloadImagesStore could not save whitelist: ${err.toString()}`);
      }
    });
  };

  _onTemporarilyEnableImages = message => {
    this._whitelistMessageIds[message.id] = true;
    MessageBodyProcessor.resetCache();
    this.trigger();
  };

  _onPermanentlyEnableImages = message => {
    const email = Utils.toEquivalentEmailForm(message.fromContact().email);
    this._whitelistEmails[email] = true;
    MessageBodyProcessor.resetCache();
    setTimeout(this._saveWhitelist, 1);
    this.trigger();
  };
}

export default new AutoloadImagesStore();
