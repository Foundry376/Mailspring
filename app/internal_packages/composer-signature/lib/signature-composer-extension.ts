import { ComposerExtension, SignatureStore } from 'mailspring-exports';
import { applySignature } from './signature-utils';

export default class SignatureComposerExtension extends ComposerExtension {
  static prepareNewDraft = ({ draft }) => {
    if (draft.plaintext) {
      return;
    }

    const from = draft.from && draft.from[0];
    const signatureObj = from ? SignatureStore.signatureForEmail(from.email) : null;
    if (!signatureObj) {
      return;
    }
    draft.body = applySignature(draft.body, signatureObj);
  };
}
