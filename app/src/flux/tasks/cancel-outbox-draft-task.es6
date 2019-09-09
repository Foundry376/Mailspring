import Task from './task';
import Attributes from '../attributes';

export default class CancelOutboxDraftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    headerMessageIds: Attributes.Collection({
      modelKey: 'headerMessageIds',
    }),
    refOldDraftHeaderMessageIds: Attributes.Collection({
      modelKey: 'refOldDraftHeaderMessageIds',
    }),
    canBeUndone: Attributes.Boolean({
      modelKey: 'canBeUndone',
    })
  });

  constructor({ headerMessageIds = [], refOldDraftHeaderMessageIds = [], ...rest } = {}) {
    super(rest);
    this.headerMessageIds = Array.isArray(headerMessageIds) ? headerMessageIds : [headerMessageIds];
    this.refOldDraftHeaderMessageIds = Array.isArray(refOldDraftHeaderMessageIds)
      ? refOldDraftHeaderMessageIds
      : [refOldDraftHeaderMessageIds];
    if (this.headerMessageIds.length !== this.refOldDraftHeaderMessageIds.length) {
      AppEnv.reportError(
        new Error(
          `CancelOutboxDraftTask have unequal length headerMessageIds and refOldDraftHeaderMessageIds`
        )
      );
    }
    if (this.canBeUndone === undefined) {
      this.canBeUndone = true;
    }
  }

  label() {
    if (this.headerMessageIds.length > 1) {
      return `Canceling ${this.headerMessageIds.length} drafts`;
    }
    return 'Canceling draft';
  }
  description() {
    return this.label();
  }

  onError({ key, debuginfo, retryable }) {
    if (retryable) {
      AppEnv.reportError(new Error(`Canceling draft failed because ${debuginfo}`));
      return;
    }
  }
}
