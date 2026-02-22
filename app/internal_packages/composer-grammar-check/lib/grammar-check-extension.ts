import { localized, ComposerExtension, Message } from 'mailspring-exports';
import { GrammarCheckStore } from './grammar-check-store';

export default class GrammarCheckComposerExtension extends ComposerExtension {
  static warningsForSending({ draft }: { draft: Message }): string[] {
    if (!GrammarCheckStore.isEnabled()) return [];
    if (!GrammarCheckStore.warnOnSend()) return [];

    const errorCount = GrammarCheckStore.errorCount(draft.headerMessageId);
    if (errorCount > 0) {
      return [localized('with %@ uncorrected grammar issue(s)', errorCount)];
    }
    return [];
  }
}
