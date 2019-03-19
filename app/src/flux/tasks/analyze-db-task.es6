import Task from './task';

export default class AnalyzeDBTask extends Task {
  static attributes = Object.assign({}, Task.attributes);
  constructor({ accountId, ...rest } = {}) {
    super(rest);
    this.accountId = accountId || '';
  }

  label() {
    return `Analyzing and optimizing database`;
  }
}
