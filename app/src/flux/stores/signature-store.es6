import { Actions, AccountStore } from 'mailspring-exports';
import MailspringStore from 'mailspring-store';
import _ from 'underscore';

class SignatureStore extends MailspringStore {
  constructor() {
    super();
    this.activate(); // for specs
  }

  activate() {
    this.signatures = AppEnv.config.get(`signatures`) || {};
    this.defaultSignatures = AppEnv.config.get(`defaultSignatures`) || {};

    // If the user has no signatures (after a clean install or upgrade from 1.0.9),
    // create a default one for them and apply it to all their accounts.
    if (Object.keys(this.signatures).length === 0) {
      this.signatures = {
        initial: {
          id: 'initial',
          title: 'Default',
          body: `<div><div>Sent from Mailspring</div></div>`,
          data: {
            title: 'Sent from Mailspring',
            templateName: 'SignatureB',
          },
        },
      };
      AccountStore.accounts().forEach(a => {
        this.defaultSignatures[a.emailAddress] = 'initial';
      });
    }

    this._autoselectSignatureId();

    if (!this.unsubscribers) {
      this.unsubscribers = [
        Actions.removeSignature.listen(this._onRemoveSignature),
        Actions.upsertSignature.listen(this._onUpsertSignature),
        Actions.selectSignature.listen(this._onSelectSignature),
        Actions.toggleAccount.listen(this._onToggleAccount),
      ];

      AppEnv.config.onDidChange(`signatures`, () => {
        this.signatures = AppEnv.config.get(`signatures`);
        this.trigger();
      });
      AppEnv.config.onDidChange(`defaultSignatures`, () => {
        this.defaultSignatures = AppEnv.config.get(`defaultSignatures`);
        this.trigger();
      });
    }
  }

  deactivate() {
    throw new Error("Unimplemented - core stores shouldn't be deactivated.");
  }

  getSignatures() {
    return this.signatures;
  }

  selectedSignature() {
    return this.signatures[this.selectedSignatureId];
  }

  getDefaults() {
    return this.defaultSignatures;
  }

  signatureForEmail = email => {
    return this.signatures[this.defaultSignatures[email]];
  };

  _saveSignatures() {
    _.debounce(AppEnv.config.set(`signatures`, this.signatures), 500);
  }

  _saveDefaultSignatures() {
    _.debounce(AppEnv.config.set(`defaultSignatures`, this.defaultSignatures), 500);
  }

  _onSelectSignature = id => {
    this.selectedSignatureId = id;
    this.trigger();
  };

  _autoselectSignatureId() {
    const sigIds = Object.keys(this.signatures);
    this.selectedSignatureId = sigIds.length ? sigIds[0] : null;
  }

  _onRemoveSignature = signatureToDelete => {
    this.signatures = Object.assign({}, this.signatures);
    delete this.signatures[signatureToDelete.id];
    this._autoselectSignatureId();
    this.trigger();
    this._saveSignatures();
  };

  _onUpsertSignature = (signature, id) => {
    this.signatures[id] = signature;
    this.trigger();
    this._saveSignatures();
  };

  _onToggleAccount = email => {
    if (this.defaultSignatures[email] === this.selectedSignatureId) {
      this.defaultSignatures[email] = null;
    } else {
      this.defaultSignatures[email] = this.selectedSignatureId;
    }

    this.trigger();
    this._saveDefaultSignatures();
  };
}

export default new SignatureStore();
