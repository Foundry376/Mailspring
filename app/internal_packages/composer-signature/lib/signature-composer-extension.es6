import { ComposerExtension, SignatureStore } from 'mailspring-exports';
import { applySignature } from './signature-utils';

export default class SignatureComposerExtension extends ComposerExtension {
  static prepareNewDraft = ({ draft }) => {
    const signatureObj =
      draft.from && draft.from[0] ? SignatureStore.signatureForEmail(draft.from[0].email) : null;
    if (!signatureObj) {
      return;
    }
    draft.body = applySignature(draft.body, signatureObj);
  };
}
