import { localized, Actions, AccountStore } from 'mailspring-exports';
import MailspringStore from 'mailspring-store';
import _ from 'underscore';

export interface IDefaultSignatures {
  [accountId: string]: string;
}

export interface ISignature {
  id: string;
  title: string;
  body: string;
  data: {
    title: string;
    templateName: string;
  };
}

export interface ISignatureSet {
  [key: string]: ISignature;
}

class _SignatureStore extends MailspringStore {
  signatures: ISignatureSet;
  defaultSignatures: IDefaultSignatures;
  selectedSignatureId: string;

  unsubscribers: Array<() => void>;

  constructor() {
    super();
    this.activate(); // for specs
  }

  activate() {
    this.signatures = AppEnv.config.get(`signatures`);
    this.defaultSignatures = AppEnv.config.get(`defaultSignatures`) || {};

    // If the user has no signatures (after a clean install or upgrade from 1.0.9),
    // create a default one for them and apply it to all their accounts.
    if (!this.signatures) {
      const sentFrom = localized('Sent from Mailspring, the best free email app for work');
      this.signatures = {
        initial: {
          id: 'initial',
          title: localized('Default'),
          body: `<div><div>${sentFrom.replace(
            'Mailspring',
            '<a href="https://getmailspring.com/">Mailspring</a>'
          )}</div></div>`,
          data: {
            title: sentFrom,
            templateName: 'SignatureB',
          },
        },
      };
      AccountStore.accounts().forEach(a => {
        this.defaultSignatures[a.emailAddress] = 'initial';
      });
    }

    // migrate signatures that didn't have a `data` property
    Object.values(this.signatures).forEach(
      sig => (sig.data = sig.data || { title: '', templateName: '' })
    );

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
    AppEnv.config.set(`signatures`, this.signatures);
  }

  _saveDefaultSignatures() {
    AppEnv.config.set(`defaultSignatures`, this.defaultSignatures);
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

export const SignatureStore = new _SignatureStore();
