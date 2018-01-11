import { ComposerExtension } from 'mailspring-exports';

export default class TemplatesComposerExtension extends ComposerExtension {
  static warningsForSending({ draft }) {
    const warnings = [];
    if (draft.body.search(/<code[^>]*empty[^>]*>/i) > 0) {
      warnings.push('with an empty template area');
    }
    return warnings;
  }
}
